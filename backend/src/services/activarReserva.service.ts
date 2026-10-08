import { transaccion } from '../db/pool';
import { errores } from '../errors/AppError';
import { registrarHistorial } from '../repositories/historial.repository';
import { activarReservaEnBase, buscarReservaPorId, registrarIntencionActivacion } from '../repositories/reserva.repository';
import { crearSolicitudDespacho } from '../stubs/m5Despacho.stub';
import { conTimeout } from '../utils/integraciones';
import { validarId } from '../validaciones/reserva.validaciones';

// Activación manual TP1. Persona 4 puede sustituir este adaptador respetando el bloqueo compartido.
export async function activarReserva(id: string, actor: string) {
  validarId(id);
  // Se confirma esta intención ANTES de contactar M5. Si hay timeout o caída del proceso,
  // Persona 3 no podrá cancelar/modificar una reserva cuyo efecto externo es incierto.
  await transaccion(async db => {
    const actual = await buscarReservaPorId(db, id, true);
    if (!actual) throw errores.noEncontrada(id);
    if (actual.estado !== 'CONFIRMADA' || actual.solicitudDespachoId) {
      throw errores.conflicto(`No se puede activar una reserva en estado ${actual.estado}`, {
        estadoActual: actual.estado, solicitudDespachoId: actual.solicitudDespachoId,
      });
    }
    await registrarIntencionActivacion(db, id);
  });
  return transaccion(async db => {
    const actual = await buscarReservaPorId(db, id, true);
    if (!actual) throw errores.noEncontrada(id);
    if (actual.estado !== 'CONFIRMADA' || actual.solicitudDespachoId) {
      throw errores.conflicto(`No se puede activar una reserva en estado ${actual.estado}`, {
        estadoActual: actual.estado, solicitudDespachoId: actual.solicitudDespachoId,
      });
    }
    // La clave permanece igual aunque falle la respuesta o se revierta esta transacción.
    const { solicitudId } = await conTimeout('M5', () => crearSolicitudDespacho(actual, `reserva:${actual.id}`));
    const activada = await activarReservaEnBase(db, id, solicitudId);
    if (!activada) throw errores.conflicto('La reserva dejó de estar confirmada');
    await registrarHistorial(db, {
      reservaId: id, accion: 'ACTIVADA', estadoAnterior: actual.estado, estadoNuevo: activada.estado, actor,
      detalle: { solicitudDespachoId: solicitudId },
    });
    return activada;
  });
}
