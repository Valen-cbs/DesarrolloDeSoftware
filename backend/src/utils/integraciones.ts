import { config } from '../config/env';
import { errores } from '../errors/AppError';

export async function conTimeout<T>(nombre: string, operacion: () => Promise<T>): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operacion),
      new Promise<never>((_, reject) => {
        temporizador = setTimeout(() => reject(new Error('timeout')), config.integracionTimeoutMs);
      }),
    ]);
  } catch {
    throw errores.servicioNoDisponible(`${nombre} no pudo completar la operación`);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}
