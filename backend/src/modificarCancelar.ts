import { Router, Request } from 'express';

// Contratos mínimos para recibir el trabajo compartido, sin implementar su infraestructura.
export interface Reserva {
  id: string;
  origen: string;
  destino: string;
  tipoVehiculo: 'AUTO' | 'MOTO';
  fechaHora: Date;
  zonaHoraria: string;
  estado: string;
  tarifaEstimada: number | null;
  motivoCancelacion: string | null;
  solicitudDespachoId: string | null;
}
export type CambiosReserva = Partial<Pick<Reserva,
  'origen' | 'destino' | 'tipoVehiculo' | 'fechaHora' | 'zonaHoraria' | 'tarifaEstimada'>>;
export interface EventoHistorial {
  reservaId: string;
  accion: string;
  estadoAnterior: string | null;
  estadoNuevo: string;
  actor: string;
  motivo?: string | null;
  detalle?: Record<string, unknown> | null;
}
export interface EntradaHistorial extends EventoHistorial { id: string; fecha: Date }

export interface Dependencias<Conexion, Lectura = Conexion> {
  // Persona 1: la lectura bloqueante y todas las escrituras usan la misma transacción.
  pool: Lectura;
  transaccion<T>(operacion: (db: Conexion) => Promise<T>): Promise<T>;
  buscarReservaPorId(db: Conexion | Lectura, id: string, bloquear?: boolean): Promise<Reserva | null>;
  actualizarDatosReserva(db: Conexion, id: string, cambios: CambiosReserva): Promise<Reserva | null>;
  cancelarReservaEnBase(db: Conexion, id: string, motivo: string): Promise<Reserva | null>;
  registrarHistorial(db: Conexion, evento: EventoHistorial): Promise<void>;
  listarHistorial(db: Lectura, id: string): Promise<EntradaHistorial[]>;
  errores: {
    datosInvalidos(detalle: string[]): Error;
    noEncontrada(id: string): Error;
    conflicto(mensaje: string): Error;
    reglaIncumplida(mensaje: string): Error;
    servicioNoDisponible(mensaje: string): Error;
  };
  config: { anticipacionMinimaMinutos: number; anticipacionMaximaDias: number };
  // Persona 2: reutilizar las validaciones y los adaptadores M4/M7 existentes.
  validaciones: {
    esTextoConContenido(valor: unknown): valor is string;
    esTipoVehiculoValido(valor: unknown): valor is Reserva['tipoVehiculo'];
    esZonaHorariaValida(valor: unknown): valor is string;
    convertirFecha(valor: unknown): Date | null;
    validarVentana(fecha: Date, ahora: Date, minimoMinutos: number, maximoDias: number): string | null;
  };
  consultarRuta(origen: string, destino: string): Promise<{ cubierta: boolean; distanciaKm: number }>;
  estimarTarifa(tipo: Reserva['tipoVehiculo'], distanciaKm: number): Promise<number>;
  reloj?: () => Date;
}

const CAMPOS = ['origen', 'destino', 'tipoVehiculo', 'fechaHora', 'zonaHoraria'] as const;
const iguales = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

export function crearServicioPersona3<Conexion, Lectura = Conexion>(d: Dependencias<Conexion, Lectura>) {
  const { errores: e, validaciones: v, config } = d;
  const reloj = d.reloj ?? (() => new Date());

  function validarId(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw e.datosInvalidos(['id debe ser un UUID']);
    }
  }
  function objeto(cuerpo: unknown): Record<string, unknown> {
    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
      throw e.datosInvalidos(['El cuerpo debe ser un objeto JSON']);
    }
    return cuerpo as Record<string, unknown>;
  }
  function validarCambios(cuerpo: unknown): CambiosReserva {
    const datos = objeto(cuerpo);
    const recibidos = Object.keys(datos);
    const problemas: string[] = [];
    if (!recibidos.length) problemas.push('Mandá al menos un campo modificable');
    const desconocidos = recibidos.filter(c => !CAMPOS.includes(c as typeof CAMPOS[number]));
    if (desconocidos.length) problemas.push(`No se pueden modificar: ${desconocidos.join(', ')}`);
    const cambios: CambiosReserva = {};
    for (const campo of ['origen', 'destino'] as const) {
      const valor = datos[campo];
      if (!(campo in datos)) continue;
      if (v.esTextoConContenido(valor) && valor.trim().length <= 500) cambios[campo] = valor.trim();
      else problemas.push(`${campo} debe contener entre 1 y 500 caracteres`);
    }
    if ('tipoVehiculo' in datos) {
      if (v.esTipoVehiculoValido(datos.tipoVehiculo)) cambios.tipoVehiculo = datos.tipoVehiculo;
      else problemas.push('tipoVehiculo debe ser AUTO o MOTO');
    }
    if ('zonaHoraria' in datos) {
      if (v.esZonaHorariaValida(datos.zonaHoraria)) cambios.zonaHoraria = datos.zonaHoraria;
      else problemas.push('zonaHoraria debe ser una zona IANA válida');
    }
    if ('fechaHora' in datos) {
      const fecha = v.convertirFecha(datos.fechaHora);
      if (fecha) cambios.fechaHora = fecha;
      else problemas.push('fechaHora debe ser ISO 8601 válido con Z u offset');
    }
    if (problemas.length) throw e.datosInvalidos(problemas);
    return cambios;
  }
  async function buscar(db: Conexion | Lectura, id: string, bloquear = false) {
    const reserva = await d.buscarReservaPorId(db, id, bloquear);
    if (!reserva) throw e.noEncontrada(id);
    return reserva;
  }
  function asegurarEditable(reserva: Reserva) {
    if (!['PENDIENTE', 'CONFIRMADA'].includes(reserva.estado) || reserva.solicitudDespachoId) {
      throw e.conflicto(`La reserva en estado ${reserva.estado} no se puede modificar ni cancelar`);
    }
  }
  function controlarFechas(actual: Reserva, nueva?: Date) {
    const ahora = reloj();
    if (actual.fechaHora.getTime() - ahora.getTime() < config.anticipacionMinimaMinutos * 60_000) {
      throw e.reglaIncumplida(`Ya no se puede modificar: faltan menos de ${config.anticipacionMinimaMinutos} minutos`);
    }
    if (nueva) {
      const fuera = v.validarVentana(nueva, ahora, config.anticipacionMinimaMinutos, config.anticipacionMaximaDias);
      if (fuera) throw e.reglaIncumplida(fuera);
    }
  }

  async function modificarReserva(id: string, cuerpo: unknown, actor: string): Promise<Reserva> {
    validarId(id);
    const cambios = validarCambios(cuerpo);
    return d.transaccion(async db => {
      const actual = await buscar(db, id, true);
      asegurarEditable(actual);
      controlarFechas(actual, cambios.fechaHora);
      for (const campo of CAMPOS) if (iguales(actual[campo], cambios[campo])) delete cambios[campo];
      if (!Object.keys(cambios).length) return actual;
      if (cambios.origen !== undefined || cambios.destino !== undefined || cambios.tipoVehiculo !== undefined) {
        let ruta: { cubierta: boolean; distanciaKm: number };
        try { ruta = await d.consultarRuta(cambios.origen ?? actual.origen, cambios.destino ?? actual.destino); }
        catch { throw e.servicioNoDisponible('M4 no pudo completar la operación'); }
        if (!ruta.cubierta) throw e.reglaIncumplida('El origen o el destino está fuera de la zona de cobertura');
        try { cambios.tarifaEstimada = await d.estimarTarifa(cambios.tipoVehiculo ?? actual.tipoVehiculo, ruta.distanciaKm); }
        catch { throw e.servicioNoDisponible('M7 no pudo completar la operación'); }
      }
      controlarFechas(actual, cambios.fechaHora);
      const detalle: Record<string, unknown> = {};
      for (const campo of Object.keys(cambios) as (keyof CambiosReserva)[]) {
        if (!iguales(actual[campo], cambios[campo])) detalle[campo] = { anterior: actual[campo], nuevo: cambios[campo] };
      }
      const actualizada = await d.actualizarDatosReserva(db, id, cambios);
      if (!actualizada) throw e.conflicto('La reserva dejó de ser editable');
      await d.registrarHistorial(db, {
        reservaId: id, accion: 'MODIFICADA', estadoAnterior: actual.estado, estadoNuevo: actualizada.estado,
        actor, detalle: { cambios: detalle },
      });
      return actualizada;
    });
  }
  async function cancelarReserva(id: string, cuerpo: unknown, actor: string): Promise<Reserva> {
    validarId(id);
    const datos = objeto(cuerpo);
    const motivo = datos.motivo;
    if (Object.keys(datos).some(c => c !== 'motivo') || !v.esTextoConContenido(motivo)
      || motivo.trim().length < 3 || motivo.trim().length > 1000) {
      throw e.datosInvalidos(['Solo se acepta motivo, obligatorio entre 3 y 1000 caracteres']);
    }
    return d.transaccion(async db => {
      const actual = await buscar(db, id, true);
      asegurarEditable(actual);
      const cancelada = await d.cancelarReservaEnBase(db, id, motivo.trim());
      if (!cancelada) throw e.conflicto('La reserva dejó de ser editable');
      await d.registrarHistorial(db, {
        reservaId: id, accion: 'CANCELADA', estadoAnterior: actual.estado, estadoNuevo: cancelada.estado,
        actor, motivo: motivo.trim(),
      });
      return cancelada;
    });
  }
  async function obtenerHistorial(id: string): Promise<EntradaHistorial[]> {
    validarId(id);
    await buscar(d.pool, id);
    return d.listarHistorial(d.pool, id);
  }
  return { modificarReserva, cancelarReserva, obtenerHistorial };
}

// Se monta en /reservas desde el servidor de Persona 1. Express 5 delega rechazos al middleware común.
export function crearRutasPersona3(
  servicio: ReturnType<typeof crearServicioPersona3>, actorDe: (req: Request) => string,
) {
  const rutas = Router();
  rutas.patch('/:id', async (req, res) => {
    res.json(await servicio.modificarReserva(req.params.id, req.body, actorDe(req)));
  });
  rutas.post('/:id/cancelar', async (req, res) => {
    res.json(await servicio.cancelarReserva(req.params.id, req.body, actorDe(req)));
  });
  rutas.get('/:id/historial', async (req, res) => {
    res.json(await servicio.obtenerHistorial(req.params.id));
  });
  return rutas;
}
