export const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'ACTIVADA', 'VENCIDA'] as const;
export type EstadoReserva = typeof ESTADOS[number];
export type TipoVehiculo = 'AUTO' | 'MOTO';

export interface Reserva {
  id: string;
  clienteId: string;
  origen: string;
  destino: string;
  tipoVehiculo: TipoVehiculo;
  fechaHora: Date;
  zonaHoraria: string;
  estado: EstadoReserva;
  tarifaEstimada: number | null;
  motivoCancelacion: string | null;
  solicitudDespachoId: string | null;
  creadoEn: Date;
  modificadoEn: Date;
}

export type DatosReserva = Pick<Reserva,
  'clienteId' | 'origen' | 'destino' | 'tipoVehiculo' | 'fechaHora' | 'zonaHoraria'>;
export type CambiosReserva = Partial<Pick<Reserva,
  'origen' | 'destino' | 'tipoVehiculo' | 'fechaHora' | 'zonaHoraria' | 'tarifaEstimada'>>;
export type AccionHistorial = 'CREADA' | 'MODIFICADA' | 'CANCELADA' | 'ACTIVADA';

export interface EventoHistorial {
  reservaId: string;
  accion: AccionHistorial;
  estadoAnterior: EstadoReserva | null;
  estadoNuevo: EstadoReserva;
  actor: string;
  motivo?: string | null;
  detalle?: Record<string, unknown> | null;
}

export interface EntradaHistorial extends EventoHistorial {
  id: string;
  fecha: Date;
}
