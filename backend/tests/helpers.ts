import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { config } from '../src/config/env';
import { pool } from '../src/db/pool';
import { EstadoReserva, Reserva } from '../src/models/reserva';
import { buscarReservaPorId } from '../src/repositories/reserva.repository';
import { reiniciarDespachoParaPruebas } from '../src/stubs/m5Despacho.stub';

// Solo una base local dedicada. No basta con que la URL no contenga "supabase".
const destino = new URL(config.databaseUrl!);
if (!['localhost', '127.0.0.1', '[::1]', 'db-test'].includes(destino.hostname)
  || decodeURIComponent(destino.pathname.slice(1)) !== 'm9_test') {
  throw new Error('TEST_DATABASE_URL debe apuntar a la base local m9_test. No se ejecutará TRUNCATE.');
}

beforeAll(async () => {
  const nombre = await pool.query('SELECT current_database() AS nombre');
  if (nombre.rows[0].nombre !== 'm9_test') throw new Error('Base de pruebas incorrecta');
  const tabla = await pool.query("SELECT to_regclass('public.reservas') AS tabla");
  if (!tabla.rows[0].tabla) {
    await pool.query(readFileSync(path.resolve(process.cwd(), '../db/schema.sql'), 'utf8'));
  }
});

beforeEach(async () => {
  vi.restoreAllMocks();
  reiniciarDespachoParaPruebas();
  await pool.query('TRUNCATE historial_reservas, reservas RESTART IDENTITY');
});

afterAll(async () => { await pool.end(); });

export const enHoras = (horas: number) => new Date(Date.now() + horas * 3_600_000).toISOString();
export const datosValidos = () => ({
  clienteId: 'cliente-1', origen: 'Plaza 25 de Mayo', destino: 'Terminal de Resistencia',
  tipoVehiculo: 'AUTO', fechaHora: enHoras(24), zonaHoraria: 'America/Argentina/Buenos_Aires',
});

export async function crearReservaDePrueba(estado: EstadoReserva = 'CONFIRMADA', cambios: Partial<Reserva> = {}): Promise<Reserva> {
  const datos = { ...datosValidos(), ...cambios };
  const resultado = await pool.query(`INSERT INTO reservas
    (cliente_id, origen, destino, tipo_vehiculo, fecha_hora, zona_horaria, estado, tarifa_estimada, motivo_cancelacion, solicitud_despacho_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,4750,$8,$9) RETURNING id`,
    [datos.clienteId, datos.origen, datos.destino, datos.tipoVehiculo, datos.fechaHora, datos.zonaHoraria, estado,
      estado === 'CANCELADA' ? 'Cambio de planes' : null, estado === 'ACTIVADA' ? `sol-${crypto.randomUUID()}` : null]);
  return (await buscarReservaPorId(pool, resultado.rows[0].id))!;
}

export function compuerta() {
  let abrir!: () => void;
  const promesa = new Promise<void>(resolve => { abrir = resolve; });
  return { promesa, abrir };
}

export async function esperarBloqueos(cantidad = 1): Promise<void> {
  const limite = Date.now() + 3000;
  while (Date.now() < limite) {
    const resultado = await pool.query(`SELECT count(*)::integer AS cantidad FROM pg_stat_activity
      WHERE application_name='m9-backend' AND wait_event_type='Lock'`);
    if (resultado.rows[0].cantidad >= cantidad) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('No se observó el bloqueo concurrente esperado en PostgreSQL');
}
