import { errores } from '../errors/AppError';
import { EstadoReserva, Reserva } from '../models/reserva';

export const ESTADOS_EDITABLES: readonly EstadoReserva[] = ['PENDIENTE', 'CONFIRMADA'];
export const esEditable = (estado: EstadoReserva): boolean => ESTADOS_EDITABLES.includes(estado);

export function asegurarEditable(reserva: Reserva, accion: 'modificar' | 'cancelar'): void {
  if (!esEditable(reserva.estado) || reserva.solicitudDespachoId !== null) {
    throw errores.conflicto(`No se puede ${accion} una reserva en estado ${reserva.estado}`, {
      estadoActual: reserva.estado,
    });
  }
}
