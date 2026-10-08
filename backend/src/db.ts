import dotenv from 'dotenv';
import path from 'node:path';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { CambiosReserva, DatosReserva, Reserva, FiltrosReservas, EntradaHistorial, EventoHistorial } from './types';

// Infraestructura compartida — Persona 1
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

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

export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, valores?: unknown[]): Promise<QueryResult<T>>;
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

// Repositorios SQL — Persona 1
function mapear(fila: Record<string, any>): Reserva {
  return {
    id: fila.id, clienteId: fila.cliente_id, origen: fila.origen, destino: fila.destino,
    tipoVehiculo: fila.tipo_vehiculo, fechaHora: fila.fecha_hora, zonaHoraria: fila.zona_horaria,
    estado: fila.estado, tarifaEstimada: fila.tarifa_estimada === null ? null : Number(fila.tarifa_estimada),
    motivoCancelacion: fila.motivo_cancelacion, solicitudDespachoId: fila.solicitud_despacho_id,
    creadoEn: fila.creado_en, modificadoEn: fila.modificado_en,
  };
}

// bloquear=true se usa ÚNICAMENTE dentro de transaccion y con su misma conexión.
export async function buscarReservaPorId(db: Db, id: string, bloquear = false): Promise<Reserva | null> {
  const resultado = await db.query(`SELECT * FROM reservas WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
  return resultado.rows[0] ? mapear(resultado.rows[0]) : null;
}

export async function crearReservaEnBase(db: Db, datos: DatosReserva, tarifa: number): Promise<Reserva> {
  const resultado = await db.query(`
    INSERT INTO reservas (cliente_id, origen, destino, tipo_vehiculo, fecha_hora, zona_horaria, estado, tarifa_estimada)
    VALUES ($1,$2,$3,$4,$5,$6,'CONFIRMADA',$7) RETURNING *`,
    [datos.clienteId, datos.origen, datos.destino, datos.tipoVehiculo, datos.fechaHora, datos.zonaHoraria, tarifa]);
  return mapear(resultado.rows[0]);
}

export async function listarReservas(db: Db, filtros: FiltrosReservas): Promise<Reserva[]> {
  const resultado = await db.query(`SELECT * FROM reservas
    WHERE ($1::text IS NULL OR cliente_id=$1) AND ($2::text IS NULL OR estado=$2)
    ORDER BY fecha_hora, id LIMIT $3 OFFSET $4`,
    [filtros.clienteId ?? null, filtros.estado ?? null, filtros.limite, filtros.offset]);
  return resultado.rows.map(mapear);
}

const COLUMNAS: Record<keyof CambiosReserva, string> = {
  origen: 'origen', destino: 'destino', tipoVehiculo: 'tipo_vehiculo', fechaHora: 'fecha_hora',
  zonaHoraria: 'zona_horaria', tarifaEstimada: 'tarifa_estimada',
};

export async function actualizarDatosReserva(db: Db, id: string, cambios: CambiosReserva): Promise<Reserva | null> {
  const claves = Object.keys(cambios) as (keyof CambiosReserva)[];
  const asignaciones = claves.map((c, i) => `${COLUMNAS[c]}=$${i + 2}`).join(', ');
  const resultado = await db.query(`UPDATE reservas SET ${asignaciones}, modificado_en=now()
    WHERE id=$1 AND estado IN ('PENDIENTE','CONFIRMADA') AND solicitud_despacho_id IS NULL AND NOT activacion_iniciada RETURNING *`,
    [id, ...claves.map(c => cambios[c])]);
  return resultado.rows[0] ? mapear(resultado.rows[0]) : null;
}

export async function cancelarReservaEnBase(db: Db, id: string, motivo: string): Promise<Reserva | null> {
  const resultado = await db.query(`UPDATE reservas SET estado='CANCELADA', motivo_cancelacion=$2, modificado_en=now()
    WHERE id=$1 AND estado IN ('PENDIENTE','CONFIRMADA') AND solicitud_despacho_id IS NULL AND NOT activacion_iniciada RETURNING *`, [id, motivo]);
  return resultado.rows[0] ? mapear(resultado.rows[0]) : null;
}

export async function activarReservaEnBase(db: Db, id: string, solicitudId: string): Promise<Reserva | null> {
  const resultado = await db.query(`UPDATE reservas SET estado='ACTIVADA', solicitud_despacho_id=$2, activacion_iniciada=false, modificado_en=now()
    WHERE id=$1 AND estado='CONFIRMADA' AND solicitud_despacho_id IS NULL RETURNING *`, [id, solicitudId]);
  return resultado.rows[0] ? mapear(resultado.rows[0]) : null;
}

export async function hayActivacionIniciada(db: Db, id: string): Promise<boolean> {
  const resultado = await db.query('SELECT activacion_iniciada FROM reservas WHERE id=$1', [id]);
  return resultado.rows[0]?.activacion_iniciada === true;
}

export async function registrarIntencionActivacion(db: Db, id: string): Promise<void> {
  await db.query(`UPDATE reservas SET activacion_iniciada=true, modificado_en=now()
    WHERE id=$1 AND NOT activacion_iniciada`, [id]);
}

export async function registrarHistorial(db: Db, evento: EventoHistorial): Promise<void> {
  await db.query(`INSERT INTO historial_reservas
    (reserva_id, accion, estado_anterior, estado_nuevo, actor, motivo, detalle)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [evento.reservaId, evento.accion, evento.estadoAnterior, evento.estadoNuevo, evento.actor,
      evento.motivo ?? null, evento.detalle ? JSON.stringify(evento.detalle) : null]);
}

export async function listarHistorial(db: Db, id: string): Promise<EntradaHistorial[]> {
  const resultado = await db.query('SELECT * FROM historial_reservas WHERE reserva_id=$1 ORDER BY fecha, id', [id]);
  return resultado.rows.map(fila => ({
    id: fila.id, reservaId: fila.reserva_id, accion: fila.accion, estadoAnterior: fila.estado_anterior,
    estadoNuevo: fila.estado_nuevo, actor: fila.actor, motivo: fila.motivo,
    detalle: fila.detalle, fecha: fila.fecha,
  }));
}
