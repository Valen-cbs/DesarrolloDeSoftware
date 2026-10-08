import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

function entero(nombre: string, defecto: number, minimo: number): number {
  const valor = Number(process.env[nombre] ?? defecto);
  if (!Number.isSafeInteger(valor) || valor < minimo) throw new Error(`Configuración inválida: ${nombre}`);
  return valor;
}

export const config = {
  entorno: process.env.NODE_ENV ?? 'development',
  puerto: entero('PORT', 3000, 1),
  databaseUrl: process.env.NODE_ENV === 'test' ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV !== 'test' && process.env.DB_SSL === 'true',
  corsOrigenes: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(x => x.trim()),
  anticipacionMinimaMinutos: entero('ANTICIPACION_MINIMA_MINUTOS', 60, 0),
  anticipacionMaximaDias: entero('ANTICIPACION_MAXIMA_DIAS', 30, 1),
  integracionTimeoutMs: entero('INTEGRACION_TIMEOUT_MS', 2000, 1),
};

if (config.puerto > 65535 || config.anticipacionMinimaMinutos > config.anticipacionMaximaDias * 1440) {
  throw new Error('Configuración de puerto o ventana temporal inválida');
}
