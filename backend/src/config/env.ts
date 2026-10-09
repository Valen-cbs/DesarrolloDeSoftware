// Lee la configuración del archivo .env (que NUNCA se sube a GitHub).
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../.env'), quiet: true });
dotenv.config({ quiet: true });

const esPrueba = process.env.NODE_ENV === 'test';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: esPrueba ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  dbSsl: !esPrueba && process.env.DB_SSL === 'true',
  anticipacionMinimaMinutos: Number(process.env.ANTICIPACION_MINIMA_MINUTOS ?? 60),
  anticipacionMaximaDias: Number(process.env.ANTICIPACION_MAXIMA_DIAS ?? 30),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
};

if (!config.databaseUrl) {
  const variable = esPrueba ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  throw new Error(`Falta la variable ${variable} en el archivo .env`);
}