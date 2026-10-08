import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { config } from '../src/config/env';
import { pool } from '../src/db/pool';
import * as m5 from '../src/stubs/m5Despacho.stub';
import * as historial from '../src/repositories/historial.repository';
import { compuerta, crearReservaDePrueba, esperarBloqueos } from './helpers';

describe('Interacción con activación: concurrencia e idempotencia', () => {
  it('diez solicitudes concurrentes producen una llamada y una solicitud M5', async () => {
    const r = await crearReservaDePrueba();
    const respuestas = await Promise.all(Array.from({ length: 10 }, () => request(app).post(`/reservas/${r.id}/activar`).send({})));
    expect(respuestas.filter(x => x.status === 200)).toHaveLength(1);
    expect(respuestas.filter(x => x.status === 409)).toHaveLength(9);
    expect(m5.metricasDespacho()).toEqual({ intentos: 1, solicitudes: 1 });
    expect((await request(app).get(`/reservas/${r.id}/historial`)).body).toHaveLength(1);
  });
  it('cancelar frente a activar tiene un solo ganador y no crea solicitud para una cancelada', async () => {
    const r = await crearReservaDePrueba();
    const db = await pool.connect();
    await db.query('BEGIN');
    await db.query('SELECT id FROM reservas WHERE id=$1 FOR UPDATE', [r.id]);
    const cancelar = request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Cambio de planes' }).then(x => x);
    const activar = request(app).post(`/reservas/${r.id}/activar`).send({}).then(x => x);
    try { await esperarBloqueos(2); } finally { await db.query('ROLLBACK'); db.release(); }
    const respuestas = await Promise.all([cancelar, activar]);
    expect(respuestas.map(x => x.status).sort()).toEqual([200, 409]);
    const final = (await request(app).get(`/reservas/${r.id}`)).body;
    if (final.estado === 'CANCELADA') {
      expect(final.solicitudDespachoId).toBeNull();
      expect(m5.metricasDespacho().solicitudes).toBe(0);
    } else {
      expect(final.estado).toBe('ACTIVADA');
      expect(final.solicitudDespachoId).toMatch(/^sol-/);
      expect(m5.metricasDespacho().solicitudes).toBe(1);
    }
  });
  it('un efecto M5 con respuesta perdida bloquea cambios y puede recuperarse sin duplicar', async () => {
    const r = await crearReservaDePrueba();
    const original = m5.crearSolicitudDespacho;
    vi.spyOn(m5, 'crearSolicitudDespacho').mockImplementationOnce(async (reserva, clave) => {
      await original(reserva, clave);
      throw new Error('Respuesta perdida después de crear la solicitud');
    });
    expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(503);
    expect((await request(app).patch(`/reservas/${r.id}`).send({ destino: 'Otro destino' })).status).toBe(409);
    expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Otro plan' })).status).toBe(409);
    const recuperada = await request(app).post(`/reservas/${r.id}/activar`).send({});
    expect(recuperada.status).toBe(200);
    expect(m5.metricasDespacho()).toEqual({ intentos: 2, solicitudes: 1 });
    expect((await request(app).get(`/reservas/${r.id}/historial`)).body).toHaveLength(1);
  });
  it('recupera una intención persistida antes de contactar M5 (simula reinicio del backend)', async () => {
    const r = await crearReservaDePrueba();
    await pool.query('UPDATE reservas SET activacion_iniciada=true WHERE id=$1', [r.id]);
    expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Otro plan' })).status).toBe(409);
    expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(200);
    expect(m5.metricasDespacho()).toEqual({ intentos: 1, solicitudes: 1 });
  });
  it('un timeout real después del efecto M5 no libera la reserva para cancelarla', async () => {
    const r = await crearReservaDePrueba();
    const original = m5.crearSolicitudDespacho;
    vi.spyOn(m5, 'crearSolicitudDespacho').mockImplementationOnce(async (reserva, clave) => {
      await original(reserva, clave);
      return new Promise<never>(() => {});
    });
    const limiteOriginal = config.integracionTimeoutMs;
    config.integracionTimeoutMs = 20;
    try {
      expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(503);
      expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Otro plan' })).status).toBe(409);
      expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(200);
      expect(m5.metricasDespacho()).toEqual({ intentos: 2, solicitudes: 1 });
    } finally { config.integracionTimeoutMs = limiteOriginal; }
  });
  it('si falla el historial después de M5, el reintento reutiliza la misma solicitud', async () => {
    const r = await crearReservaDePrueba();
    vi.spyOn(historial, 'registrarHistorial').mockRejectedValueOnce(new Error('Falla de persistencia'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(500);
    const intermedia = (await request(app).get(`/reservas/${r.id}`)).body;
    expect(intermedia).toMatchObject({ estado: 'CONFIRMADA', solicitudDespachoId: null });
    expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(200);
    expect(m5.metricasDespacho()).toEqual({ intentos: 2, solicitudes: 1 });
  });
  it('no permite cancelar mientras M5 está atendiendo la activación', async () => {
    const r = await crearReservaDePrueba();
    const entrada = compuerta();
    const salida = compuerta();
    const original = m5.crearSolicitudDespacho;
    vi.spyOn(m5, 'crearSolicitudDespacho').mockImplementationOnce(async (reserva, clave) => {
      entrada.abrir(); await salida.promesa;
      return original(reserva, clave);
    });
    const activar = request(app).post(`/reservas/${r.id}/activar`).send({}).then(x => x);
    await entrada.promesa;
    const cancelar = request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Cambio de planes' }).then(x => x);
    try { await esperarBloqueos(); } finally { salida.abrir(); }
    expect((await activar).status).toBe(200);
    expect((await cancelar).status).toBe(409);
  });
});
