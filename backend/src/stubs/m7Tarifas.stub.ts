import { TipoVehiculo } from '../models/reserva';

export async function estimarTarifa(tipo: TipoVehiculo, distanciaKm: number): Promise<number> {
  return Math.round((1000 + distanciaKm * (tipo === 'AUTO' ? 300 : 200)) * 100) / 100;
}
