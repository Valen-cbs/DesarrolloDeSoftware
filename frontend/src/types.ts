export type TipoVehiculo = 'AUTO' | 'MOTO';

export type EstadoReserva =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'CANCELADA'
  | 'ACTIVADA'
  | 'VENCIDA';

export interface Reserva {
  id: number;
  clienteId: string;
  origen: string;
  destino: string;
  tipoVehiculo: TipoVehiculo;
  fechaHora: string;   // en UTC, ej: "2026-10-23T09:00:00.000Z"
  zonaHoraria: string; // ej: "America/Argentina/Buenos_Aires"
  estado: EstadoReserva;
  tarifaEstimada: number | null;
  motivoCancelacion: string | null;
  solicitudDespachoId: string | null; // vacío hasta que M5 crea la solicitud
  creadaEn: string;
  modificadaEn: string;
}

export interface NuevaReserva {
  clienteId: string;
  origen: string;
  destino: string;
  tipoVehiculo: TipoVehiculo;
  fechaHora: string;
  zonaHoraria: string;
}

// Formato de error acordado: código, mensaje y detalle
export interface ErrorApi {
  codigo: string;
  mensaje: string;
  detalle?: string;
}