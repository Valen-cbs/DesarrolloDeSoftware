import { config } from '../config/env';
import { pool, transaccion } from '../db/pool';
import { errores } from '../errors/AppError';
import { CambiosReserva, Reserva } from '../models/reserva';
import { registrarHistorial, listarHistorial } from '../repositories/historial.repository';
import { actualizarDatosReserva, buscarReservaPorId, cancelarReservaEnBase, hayActivacionIniciada } from '../repositories/reserva.repository';
import { asegurarEditable } from '../reglas/estados';
import { consultarRuta } from '../stubs/m4Ubicacion.stub';
import { estimarTarifa } from '../stubs/m7Tarifas.stub';
import { conTimeout } from '../utils/integraciones';
import { validarId, validarModificacion, validarMotivo, validarVentana } from '../validaciones/reserva.validaciones';

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
  return transaccion(async db => {
    // Leer, validar, calcular y guardar sobre la misma fila bloqueada evita el PATCH/PATCH obsoleto.
    const actual = await buscarReservaPorId(db, id, true);
    if (!actual) throw errores.noEncontrada(id);
    asegurarEditable(actual, 'modificar');
    if (await hayActivacionIniciada(db, id)) throw errores.conflicto('Hay una activación iniciada; debe resolverse antes de modificar');
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
      const ruta = await conTimeout('M4', () => consultarRuta(cambios.origen ?? actual.origen, cambios.destino ?? actual.destino));
      if (!ruta.cubierta) throw errores.reglaIncumplida('El origen o el destino está fuera de la zona de cobertura');
      cambios.tarifaEstimada = await conTimeout('M7', () => estimarTarifa(cambios.tipoVehiculo ?? actual.tipoVehiculo, ruta.distanciaKm));
    }
    const actualizada = await actualizarDatosReserva(db, id, cambios);
    if (!actualizada) throw errores.conflicto('La reserva dejó de ser editable');
    await registrarHistorial(db, {
      reservaId: id, accion: 'MODIFICADA', estadoAnterior: actual.estado, estadoNuevo: actualizada.estado, actor,
      detalle: { cambios: diferencia(actual, cambios) },
    });
    return actualizada;
  });
}

export async function cancelarReserva(id: string, cuerpo: unknown, actor: string): Promise<Reserva> {
  validarId(id);
  const motivo = validarMotivo(cuerpo);
  return transaccion(async db => {
    const actual = await buscarReservaPorId(db, id, true);
    if (!actual) throw errores.noEncontrada(id);
    asegurarEditable(actual, 'cancelar');
    if (await hayActivacionIniciada(db, id)) throw errores.conflicto('Hay una activación iniciada; debe resolverse antes de cancelar');
    const cancelada = await cancelarReservaEnBase(db, id, motivo);
    if (!cancelada) throw errores.conflicto('La reserva dejó de ser editable');
    await registrarHistorial(db, {
      reservaId: id, accion: 'CANCELADA', estadoAnterior: actual.estado, estadoNuevo: cancelada.estado, actor, motivo,
    });
    return cancelada;
  });
}

export async function obtenerHistorial(id: string) {
  validarId(id);
  if (!await buscarReservaPorId(pool, id)) throw errores.noEncontrada(id);
  return listarHistorial(pool, id);
}
