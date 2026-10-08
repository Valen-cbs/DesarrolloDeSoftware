import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/pool';
import * as historial from '../src/repositories/historial.repository';
import * as m4 from '../src/stubs/m4Ubicacion.stub';
import * as m7 from '../src/stubs/m7Tarifas.stub';
import { modificarReserva } from '../src/services/modificarCancelar.service';
import { compuerta, crearReservaDePrueba, enHoras, esperarBloqueos } from './helpers';

describe('Persona 3: modificar, cancelar e historial', () => {
  it('modifica y registra valores anteriores/nuevos, actor y fecha', async () => {
    const r = await crearReservaDePrueba();
    const respuesta = await request(app).patch(`/reservas/${r.id}`).set('X-Actor', 'Valentino').send({ tipoVehiculo: 'MOTO' });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ tipoVehiculo: 'MOTO', tarifaEstimada: 3500 });
    const eventos = await request(app).get(`/reservas/${r.id}/historial`);
    expect(eventos.status).toBe(200);
    expect(eventos.body).toHaveLength(1);
    expect(eventos.body[0]).toMatchObject({ accion: 'MODIFICADA', actor: 'Valentino', detalle: { cambios: {
      tipoVehiculo: { anterior: 'AUTO', nuevo: 'MOTO' }, tarifaEstimada: { anterior: 4750, nuevo: 3500 },
    } } });
    expect(new Date(eventos.body[0].fecha).getTime()).toBeGreaterThan(0);
  });
  it('reprograma UTC con zona Buenos Aires sin recalcular tarifa', async () => {
    const r = await crearReservaDePrueba();
    const tarifa = vi.spyOn(m7, 'estimarTarifa');
    const nuevaFecha = enHoras(48);
    const respuesta = await request(app).patch(`/reservas/${r.id}`).send({ fechaHora: nuevaFecha });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ fechaHora: nuevaFecha, tarifaEstimada: 4750 });
    expect(tarifa).not.toHaveBeenCalled();
  });
  it('no genera historial cuando no hay cambios reales', async () => {
    const r = await crearReservaDePrueba();
    const respuesta = await request(app).patch(`/reservas/${r.id}`).send({ origen: r.origen });
    expect(respuesta.status).toBe(200);
    expect((await request(app).get(`/reservas/${r.id}/historial`)).body).toEqual([]);
  });
  it.each(['ACTIVADA', 'CANCELADA', 'VENCIDA'] as const)('rechaza modificar/cancelar %s y no registra eventos', async estado => {
    const r = await crearReservaDePrueba(estado);
    expect((await request(app).patch(`/reservas/${r.id}`).send({ destino: 'Otro destino' })).status).toBe(409);
    expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Cambio de planes' })).status).toBe(409);
    expect((await request(app).get(`/reservas/${r.id}/historial`)).body).toEqual([]);
  });
  it('permite modificar y cancelar PENDIENTE', async () => {
    const r = await crearReservaDePrueba('PENDIENTE');
    expect((await request(app).patch(`/reservas/${r.id}`).send({ destino: 'Otro destino' })).status).toBe(200);
    expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Cambio de planes' })).status).toBe(200);
  });
  it('rechaza modificar cuando la fecha original ya está dentro del límite', async () => {
    const r = await crearReservaDePrueba('CONFIRMADA', { fechaHora: new Date(enHoras(0.5)) });
    expect((await request(app).patch(`/reservas/${r.id}`).send({ fechaHora: enHoras(48) })).status).toBe(422);
  });
  it('acepta exactamente el límite de modificación y rechaza un milisegundo menos', async () => {
    const ahora = new Date();
    const r = await crearReservaDePrueba('CONFIRMADA', { fechaHora: new Date(ahora.getTime() + 3_600_000) });
    await expect(modificarReserva(r.id, { destino: 'Otro destino' }, 'prueba', () => ahora)).resolves.toMatchObject({ destino: 'Otro destino' });
    await expect(modificarReserva(r.id, { destino: 'Tercero' }, 'prueba', () => new Date(ahora.getTime() + 1))).rejects.toMatchObject({ status: 422 });
  });
  it.each([0.5, 31 * 24])('rechaza una nueva fecha fuera de ventana (%s horas)', async horas => {
    const r = await crearReservaDePrueba();
    expect((await request(app).patch(`/reservas/${r.id}`).send({ fechaHora: enHoras(horas) })).status).toBe(422);
  });
  it('rechaza cobertura sin cambiar datos ni historial', async () => {
    const r = await crearReservaDePrueba();
    expect((await request(app).patch(`/reservas/${r.id}`).send({ destino: 'FUERA DE ZONA' })).status).toBe(422);
    expect((await request(app).get(`/reservas/${r.id}`)).body.destino).toBe(r.destino);
    expect((await request(app).get(`/reservas/${r.id}/historial`)).body).toEqual([]);
  });
  it('devuelve 503 por falla de M7 y conserva la reserva', async () => {
    const r = await crearReservaDePrueba();
    vi.spyOn(m7, 'estimarTarifa').mockRejectedValueOnce(new Error('M7 caído'));
    expect((await request(app).patch(`/reservas/${r.id}`).send({ tipoVehiculo: 'MOTO' })).status).toBe(503);
    expect((await request(app).get(`/reservas/${r.id}`)).body.tipoVehiculo).toBe('AUTO');
  });
  it.each(['patch', 'cancelar'] as const)('revierte %s si falla el historial', async operacion => {
    const r = await crearReservaDePrueba();
    vi.spyOn(historial, 'registrarHistorial').mockRejectedValueOnce(new Error('Falla de prueba'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const respuesta = operacion === 'patch'
      ? await request(app).patch(`/reservas/${r.id}`).send({ destino: 'Otro destino' })
      : await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Cambio de planes' });
    expect(respuesta.status).toBe(500);
    expect((await request(app).get(`/reservas/${r.id}`)).body).toMatchObject({ estado: 'CONFIRMADA', destino: r.destino, motivoCancelacion: null });
    expect((await request(app).get(`/reservas/${r.id}/historial`)).body).toEqual([]);
  });
  it('cancela con motivo y conserva un solo evento frente al reintento', async () => {
    const r = await crearReservaDePrueba();
    const respuesta = await request(app).post(`/reservas/${r.id}/cancelar`).set('X-Actor', 'operador-demo').send({ motivo: '  Cambio de planes  ' });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ estado: 'CANCELADA', motivoCancelacion: 'Cambio de planes' });
    expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Cambio de planes' })).status).toBe(409);
    const eventos = (await request(app).get(`/reservas/${r.id}/historial`)).body;
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ accion: 'CANCELADA', actor: 'operador-demo', motivo: 'Cambio de planes' });
  });
  it('no agrega un límite temporal de cancelación que la guía no define', async () => {
    const r = await crearReservaDePrueba('CONFIRMADA', { fechaHora: new Date(enHoras(0.5)) });
    expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Cambio de planes' })).status).toBe(200);
  });
  it.each(['', 'a', 'ab'])('rechaza motivo %j', async motivo => {
    const r = await crearReservaDePrueba();
    expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo })).status).toBe(400);
  });
  it.each(['patch', 'cancelar', 'historial'] as const)('responde 404 en %s para UUID inexistente', async operacion => {
    const ruta = `/reservas/${randomUUID()}`;
    const respuesta = operacion === 'patch' ? await request(app).patch(ruta).send({ destino: 'Otro' })
      : operacion === 'cancelar' ? await request(app).post(`${ruta}/cancelar`).send({ motivo: 'Otro' })
      : await request(app).get(`${ruta}/historial`);
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toHaveProperty('detalle');
  });
  it('serializa dos modificaciones y recalcula con el vehículo vigente', async () => {
    const r = await crearReservaDePrueba();
    const entrada = compuerta();
    const salida = compuerta();
    const original = m4.consultarRuta;
    let primera = true;
    vi.spyOn(m4, 'consultarRuta').mockImplementation(async (origen, destino) => {
      if (primera) { primera = false; entrada.abrir(); await salida.promesa; }
      return original(origen, destino);
    });
    const a = request(app).patch(`/reservas/${r.id}`).send({ tipoVehiculo: 'MOTO' }).then(x => x);
    await entrada.promesa;
    const b = request(app).patch(`/reservas/${r.id}`).send({ destino: 'Nuevo destino' }).then(x => x);
    try { await esperarBloqueos(); } finally { salida.abrir(); }
    expect((await Promise.all([a, b])).map(x => x.status)).toEqual([200, 200]);
    expect((await request(app).get(`/reservas/${r.id}`)).body).toMatchObject({ tipoVehiculo: 'MOTO', destino: 'Nuevo destino', tarifaEstimada: 3500 });
    const eventos = (await request(app).get(`/reservas/${r.id}/historial`)).body;
    expect(eventos).toHaveLength(2);
    expect(eventos[1].detalle.cambios.destino.anterior).toBe(r.destino);
  });
  it('no modifica una reserva cancelada mientras esperaba el bloqueo', async () => {
    const r = await crearReservaDePrueba();
    const db = await pool.connect();
    await db.query('BEGIN');
    await db.query('SELECT id FROM reservas WHERE id=$1 FOR UPDATE', [r.id]);
    const pendiente = request(app).patch(`/reservas/${r.id}`).send({ destino: 'Nuevo' }).then(x => x);
    try {
      await esperarBloqueos();
      await db.query("UPDATE reservas SET estado='CANCELADA', motivo_cancelacion='Otro pedido' WHERE id=$1", [r.id]);
      await db.query('COMMIT');
    } finally { await db.query('ROLLBACK'); db.release(); }
    expect((await pendiente).status).toBe(409);
    expect((await request(app).get(`/reservas/${r.id}/historial`)).body).toEqual([]);
  });
});
