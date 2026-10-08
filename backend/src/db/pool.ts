import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config/env';

export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, valores?: unknown[]): Promise<QueryResult<T>>;
}

if (!config.databaseUrl) {
  throw new Error('Falta DATABASE_URL (o TEST_DATABASE_URL para las pruebas)');
}

export const pool = new Pool({
  connectionString: config.databaseUrl,
  application_name: 'm9-backend',
  ssl: config.ssl ? { rejectUnauthorized: true } : false,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30_000,
});

export async function transaccion<T>(operacion: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query("SET LOCAL statement_timeout = '15s'");
    const resultado = await operacion(db);
    await db.query('COMMIT');
    return resultado;
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch { /* Se conserva el error original. */ }
    throw error;
  } finally {
    db.release();
  }
}
