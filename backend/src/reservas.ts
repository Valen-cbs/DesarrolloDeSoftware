import { randomUUID } from 'node:crypto';
import * as db from './db';
import { config } from './db';
import { CambiosReserva, Reserva, TipoVehiculo, errores, asegurarEditable, validarId, validarModificacion, validarMotivo, validarVentana, validarCreacion, validarFiltros } from './types';

async function clienteHabilitado(clienteId: string): Promise<boolean> {
  return !clienteId.toLowerCase().startsWith('bloqueado');
}

async function consultarRuta(origen: string, destino: string) {
  return {
    cubierta: !`${origen} ${destino}`.toUpperCase().includes('FUERA DE ZONA'),
    distanciaKm: 12.5,
    duracionMinutos: 25,
  };
}

async function estimarTarifa(tipo: TipoVehiculo, distanciaKm: number): Promise<number> {
  return Math.round((1000 + distanciaKm * (tipo === 'AUTO' ? 300 : 200)) * 100) / 100;
}

// Contrato de demostración. M5 real deberá persistir la clave de idempotencia.
const solicitudes = new Map<string, { solicitudId: string; payload: string }>();
let intentos = 0;

async function crearSolicitudDespacho(reserva: Reserva, claveIdempotencia: string): Promise<{ solicitudId: string }> {
  intentos++;
  const payload = JSON.stringify({
    reservaId: reserva.id, clienteId: reserva.clienteId, origen: reserva.origen,
    destino: reserva.destino, tipoVehiculo: reserva.tipoVehiculo, fechaHora: reserva.fechaHora,
  });
  const existente = solicitudes.get(claveIdempotencia);
  if (existente) {
    if (existente.payload !== payload) throw new Error('Misma clave de idempotencia con datos diferentes');
    return { solicitudId: existente.solicitudId };
  }
  const solicitudId = `sol-${randomUUID()}`;
  solicitudes.set(claveIdempotencia, { solicitudId, payload });
  return { solicitudId };
}

function metricasDespacho() { return { intentos, solicitudes: solicitudes.size }; }
function reiniciarDespachoParaPruebas() { solicitudes.clear(); intentos = 0; }

// Stubs temporales: Persona 2 (M2/M4/M7) y Persona 4 (M5).
export const stubs = { clienteHabilitado, consultarRuta, estimarTarifa, crearSolicitudDespacho, metricasDespacho, reiniciarDespachoParaPruebas };

export async function conTimeout<T>(nombre: string, operacion: () => Promise<T>): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operacion),
      new Promise<never>((_, reject) => {
        temporizador = setTimeout(() => reject(new Error('timeout')), config.integracionTimeoutMs);
      }),
    ]);
  } catch {
    throw errores.servicioNoDisponible(`${nombre} no pudo completar la operación`);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

// Persona 2 — crear, consultar y listar
// Base de referencia para integrar Persona 2, ausente en el repositorio al crear esta rama.
export async function crearReserva(cuerpo: unknown, actor: string) {
  const datos = validarCreacion(cuerpo);
  const fuera = validarVentana(datos.fechaHora, new Date(), config.anticipacionMinimaMinutos, config.anticipacionMaximaDias);
  if (fuera) throw errores.reglaIncumplida(fuera);
  if (!await conTimeout('M2', () => stubs.clienteHabilitado(datos.clienteId))) throw errores.reglaIncumplida('Cliente no habilitado');
  const ruta = await conTimeout('M4', () => stubs.consultarRuta(datos.origen, datos.destino));
  if (!ruta.cubierta) throw errores.reglaIncumplida('El origen o el destino está fuera de la zona de cobertura');
  const tarifa = await conTimeout('M7', () => stubs.estimarTarifa(datos.tipoVehiculo, ruta.distanciaKm));
  return db.transaccion(async conexion => {
    const fueraAlGuardar = validarVentana(datos.fechaHora, new Date(), config.anticipacionMinimaMinutos, config.anticipacionMaximaDias);
    if (fueraAlGuardar) throw errores.reglaIncumplida(fueraAlGuardar);
    const reserva = await db.crearReservaEnBase(conexion, datos, tarifa);
    await db.registrarHistorial(conexion, { reservaId: reserva.id, accion: 'CREADA', estadoAnterior: null, estadoNuevo: reserva.estado, actor });
    return reserva;
  });
}

export async function consultarReserva(id: string) {
  validarId(id);
  const reserva = await db.buscarReservaPorId(db.pool, id);
  if (!reserva) throw errores.noEncontrada(id);
  return reserva;
}

export async function obtenerReservas(query: Record<string, unknown>) {
  return db.listarReservas(db.pool, validarFiltros(query));
}

// Persona 3 — modificar, cancelar e historial
type Reloj = () => Date;
const ahoraReal: Reloj = () => new Date();

function iguales(a: unknown, b: unknown): boolean {
  return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
}

function diferencia(actual: Reserva, cambios: CambiosReserva): Record<string, unknown> {
  const detalle: Record<string, unknown> = {};
  for (const campo of Object.keys(cambios) as (keyof CambiosReserva)[]) {
    if (!iguales(actual[campo], cambios[campo])) detalle[campo] = { anterior: actual[campo], nuevo: cambios[campo] };
  }
  return detalle;
}

export async function modificarReserva(id: string, cuerpo: unknown, actor: string, reloj: Reloj = ahoraReal): Promise<Reserva> {
  validarId(id);
  const cambios = validarModificacion(cuerpo);
  return db.transaccion(async conexion => {
    // Leer, validar, calcular y guardar sobre la misma fila bloqueada evita el PATCH/PATCH obsoleto.
    const actual = await db.buscarReservaPorId(conexion, id, true);
    if (!actual) throw errores.noEncontrada(id);
    asegurarEditable(actual, 'modificar');
    if (await db.hayActivacionIniciada(conexion, id)) throw errores.conflicto('Hay una activación iniciada; debe resolverse antes de modificar');
    const ahora = reloj();
    if (actual.fechaHora.getTime() - ahora.getTime() < config.anticipacionMinimaMinutos * 60_000) {
      throw errores.reglaIncumplida(`Ya no se puede modificar: faltan menos de ${config.anticipacionMinimaMinutos} minutos`);
    }
    if (cambios.fechaHora) {
      const fuera = validarVentana(cambios.fechaHora, ahora, config.anticipacionMinimaMinutos, config.anticipacionMaximaDias);
      if (fuera) throw errores.reglaIncumplida(fuera);
    }
    for (const campo of Object.keys(cambios) as (keyof CambiosReserva)[]) {
      if (iguales(actual[campo], cambios[campo])) delete cambios[campo];
    }
    if (!Object.keys(cambios).length) return actual;
    if (cambios.origen !== undefined || cambios.destino !== undefined || cambios.tipoVehiculo !== undefined) {
      const ruta = await conTimeout('M4', () => stubs.consultarRuta(cambios.origen ?? actual.origen, cambios.destino ?? actual.destino));
      if (!ruta.cubierta) throw errores.reglaIncumplida('El origen o el destino está fuera de la zona de cobertura');
      cambios.tarifaEstimada = await conTimeout('M7', () => stubs.estimarTarifa(cambios.tipoVehiculo ?? actual.tipoVehiculo, ruta.distanciaKm));
    }
    const actualizada = await db.actualizarDatosReserva(conexion, id, cambios);
    if (!actualizada) throw errores.conflicto('La reserva dejó de ser editable');
    await db.registrarHistorial(conexion, {
      reservaId: id, accion: 'MODIFICADA', estadoAnterior: actual.estado, estadoNuevo: actualizada.estado, actor,
      detalle: { cambios: diferencia(actual, cambios) },
    });
    return actualizada;
  });
}

export async function cancelarReserva(id: string, cuerpo: unknown, actor: string): Promise<Reserva> {
  validarId(id);
  const motivo = validarMotivo(cuerpo);
  return db.transaccion(async conexion => {
    const actual = await db.buscarReservaPorId(conexion, id, true);
    if (!actual) throw errores.noEncontrada(id);
    asegurarEditable(actual, 'cancelar');
    if (await db.hayActivacionIniciada(conexion, id)) throw errores.conflicto('Hay una activación iniciada; debe resolverse antes de cancelar');
    const cancelada = await db.cancelarReservaEnBase(conexion, id, motivo);
    if (!cancelada) throw errores.conflicto('La reserva dejó de ser editable');
    await db.registrarHistorial(conexion, {
      reservaId: id, accion: 'CANCELADA', estadoAnterior: actual.estado, estadoNuevo: cancelada.estado, actor, motivo,
    });
    return cancelada;
  });
}

export async function obtenerHistorial(id: string) {
  validarId(id);
  if (!await db.buscarReservaPorId(db.pool, id)) throw errores.noEncontrada(id);
  return db.listarHistorial(db.pool, id);
}

// Persona 4 — activación manual
// Activación manual TP1. Persona 4 puede sustituir este adaptador respetando el bloqueo compartido.
export async function activarReserva(id: string, actor: string) {
  validarId(id);
  // Se confirma esta intención ANTES de contactar M5. Si hay timeout o caída del proceso,
  // Persona 3 no podrá cancelar/modificar una reserva cuyo efecto externo es incierto.
  await db.transaccion(async conexion => {
    const actual = await db.buscarReservaPorId(conexion, id, true);
    if (!actual) throw errores.noEncontrada(id);
    if (actual.estado !== 'CONFIRMADA' || actual.solicitudDespachoId) {
      throw errores.conflicto(`No se puede activar una reserva en estado ${actual.estado}`, {
        estadoActual: actual.estado, solicitudDespachoId: actual.solicitudDespachoId,
      });
    }
    await db.registrarIntencionActivacion(conexion, id);
  });
  return db.transaccion(async conexion => {
    const actual = await db.buscarReservaPorId(conexion, id, true);
    if (!actual) throw errores.noEncontrada(id);
    if (actual.estado !== 'CONFIRMADA' || actual.solicitudDespachoId) {
      throw errores.conflicto(`No se puede activar una reserva en estado ${actual.estado}`, {
        estadoActual: actual.estado, solicitudDespachoId: actual.solicitudDespachoId,
      });
    }
    // La clave permanece igual aunque falle la respuesta o se revierta esta transacción.
    const { solicitudId } = await conTimeout('M5', () => stubs.crearSolicitudDespacho(actual, `reserva:${actual.id}`));
    const activada = await db.activarReservaEnBase(conexion, id, solicitudId);
    if (!activada) throw errores.conflicto('La reserva dejó de estar confirmada');
    await db.registrarHistorial(conexion, {
      reservaId: id, accion: 'ACTIVADA', estadoAnterior: actual.estado, estadoNuevo: activada.estado, actor,
      detalle: { solicitudDespachoId: solicitudId },
    });
    return activada;
  });
}
