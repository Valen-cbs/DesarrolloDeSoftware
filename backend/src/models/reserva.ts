// Tipos de datos del módulo (nombres según las tablas de Supabase).
export const TIPOS_VEHICULO = ['AUTO', 'MOTO'] as const;
export type TipoVehiculo = (typeof TIPOS_VEHICULO)[number];

export const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'ACTIVADA', 'VENCIDA'] as const;
export type EstadoReserva = (typeof ESTADOS)[number];

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
  solicitudDespachoId: string | null;
  claveIdempotencia: string | null;
  creadaEn: Date;
  modificadaEn: Date;
}

// Lo que hace falta para crear una reserva nueva.
export interface DatosNuevaReserva {
  clienteId: string;
  origen: string;
  destino: string;
  tipoVehiculo: TipoVehiculo;
  fechaHora: Date;
  zonaHoraria: string;
}

// Lo que se puede cambiar al modificar (todo opcional).
export type CambiosReserva = Partial<
  Pick<Reserva, 'origen' | 'destino' | 'tipoVehiculo' | 'fechaHora' | 'zonaHoraria' | 'tarifaEstimada'>
>;

export interface EntradaHistorial {
  id: string;
  reservaId: string;
  tipoCambio: string;
  campoModificado: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
  actorId: string;
  rolActor: string;
  motivo: string | null;
  fechaCambio: Date;
}