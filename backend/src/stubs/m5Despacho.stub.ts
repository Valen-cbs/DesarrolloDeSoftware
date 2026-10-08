import { randomUUID } from 'node:crypto';
import { Reserva } from '../models/reserva';

// Contrato de demostración. M5 real deberá persistir la clave de idempotencia.
const solicitudes = new Map<string, { solicitudId: string; payload: string }>();
let intentos = 0;

export async function crearSolicitudDespacho(reserva: Reserva, claveIdempotencia: string): Promise<{ solicitudId: string }> {
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

export function metricasDespacho() { return { intentos, solicitudes: solicitudes.size }; }
export function reiniciarDespachoParaPruebas() { solicitudes.clear(); intentos = 0; }
