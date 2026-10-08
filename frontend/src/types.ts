export type TipoVehiculo = 'AUTO' | 'MOTO';

export type EstadoReserva =
    | 'PENDIENTE'
    | 'CONFIRMADA'
    | 'CANCELADA'
    | 'ACTIVADA'
    | 'VENCIDA';

export interface Reserva {
    id: string;
    clienteId: string;
    origen: string;
    destino: string;
    tipoVehiculo: TipoVehiculo;
    fechaHora: string;   // ej: "2026-10-17T06:00"
    zonaHoraria: string; // ej: "America/Buenos_Aires"
    estado: EstadoReserva;
    tarifaEstimada?: number;
    motivoCancelacion?: string;
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