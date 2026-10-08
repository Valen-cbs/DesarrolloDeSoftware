import { config } from '../config/env';
import { pool, transaccion } from '../db/pool';
import { errores } from '../errors/AppError';
import { registrarHistorial } from '../repositories/historial.repository';
import { buscarReservaPorId, crearReservaEnBase, listarReservas } from '../repositories/reserva.repository';
import { clienteHabilitado } from '../stubs/m2Clientes.stub';
import { consultarRuta } from '../stubs/m4Ubicacion.stub';
import { estimarTarifa } from '../stubs/m7Tarifas.stub';
import { conTimeout } from '../utils/integraciones';
import { validarCreacion, validarFiltros, validarId, validarVentana } from '../validaciones/reserva.validaciones';

// Base de referencia para integrar Persona 2, ausente en el repositorio al crear esta rama.
export async function crearReserva(cuerpo: unknown, actor: string) {
  const datos = validarCreacion(cuerpo);
  const fuera = validarVentana(datos.fechaHora, new Date(), config.anticipacionMinimaMinutos, config.anticipacionMaximaDias);
  if (fuera) throw errores.reglaIncumplida(fuera);
  if (!await conTimeout('M2', () => clienteHabilitado(datos.clienteId))) throw errores.reglaIncumplida('Cliente no habilitado');
  const ruta = await conTimeout('M4', () => consultarRuta(datos.origen, datos.destino));
  if (!ruta.cubierta) throw errores.reglaIncumplida('El origen o el destino está fuera de la zona de cobertura');
  const tarifa = await conTimeout('M7', () => estimarTarifa(datos.tipoVehiculo, ruta.distanciaKm));
  return transaccion(async db => {
    const fueraAlGuardar = validarVentana(datos.fechaHora, new Date(), config.anticipacionMinimaMinutos, config.anticipacionMaximaDias);
    if (fueraAlGuardar) throw errores.reglaIncumplida(fueraAlGuardar);
    const reserva = await crearReservaEnBase(db, datos, tarifa);
    await registrarHistorial(db, { reservaId: reserva.id, accion: 'CREADA', estadoAnterior: null, estadoNuevo: reserva.estado, actor });
    return reserva;
  });
}

export async function consultarReserva(id: string) {
  validarId(id);
  const reserva = await buscarReservaPorId(pool, id);
  if (!reserva) throw errores.noEncontrada(id);
  return reserva;
}

export async function obtenerReservas(query: Record<string, unknown>) {
  return listarReservas(pool, validarFiltros(query));
}
