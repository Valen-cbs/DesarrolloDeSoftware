import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { crearReservaDePrueba, datosValidos } from './helpers';

describe('Contrato compartido y base ejecutable', () => {
  it('crear, listar por cliente y consultar respetan nombres y tipos de la guía', async () => {
    const creada = await request(app).post('/reservas').set('X-Actor', 'cliente-demo').send(datosValidos());
    expect(creada.status).toBe(201);
    expect(creada.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(creada.body).toMatchObject({ estado: 'CONFIRMADA', tarifaEstimada: 4750, motivoCancelacion: null, solicitudDespachoId: null });
    expect(creada.body).toHaveProperty('creadoEn');
    expect(creada.body).toHaveProperty('modificadoEn');
    expect(creada.body).not.toHaveProperty('activacionIniciada');
    expect(creada.headers.location).toBe(`/reservas/${creada.body.id}`);
    expect((await request(app).get('/reservas?clienteId=cliente-1')).body).toHaveLength(1);
    expect((await request(app).get('/reservas?clienteId=otro')).body).toEqual([]);
    expect((await request(app).get(`/reservas/${creada.body.id}`)).body).toEqual(creada.body);
    expect((await request(app).get(`/reservas/${creada.body.id}/historial`)).body[0]).toMatchObject({ accion: 'CREADA', actor: 'cliente-demo' });
  });
  it('health verifica la persistencia y docs publica el mismo contrato', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/docs/')).status).toBe(200);
    expect((await request(app).get('/openapi.json')).body.paths).toHaveProperty('/reservas/{id}/historial');
  });
  it('CORS permite PATCH y X-Actor para el frontend', async () => {
    const preflight = await request(app).options('/reservas/uuid').set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PATCH').set('Access-Control-Request-Headers', 'content-type,x-actor');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(preflight.headers['access-control-allow-headers'].toLowerCase()).toContain('x-actor');
  });
  it('errores 400, 404, 409 y 422 siempre incluyen codigo, mensaje y detalle', async () => {
    const r = await crearReservaDePrueba('CANCELADA');
    const respuestas = [
      await request(app).patch(`/reservas/${r.id}`).send({ estado: 'CONFIRMADA' }),
      await request(app).get('/ruta-inexistente'),
      await request(app).patch(`/reservas/${r.id}`).send({ destino: 'Otro' }),
      await request(app).post('/reservas').send({ ...datosValidos(), clienteId: 'bloqueado-1' }),
    ];
    expect(respuestas.map(x => x.status)).toEqual([400, 404, 409, 422]);
    for (const respuesta of respuestas) expect(Object.keys(respuesta.body).sort()).toEqual(['codigo', 'detalle', 'mensaje']);
  });
  it('rechaza JSON roto e identificadores que no sean UUID', async () => {
    const r = await crearReservaDePrueba();
    expect((await request(app).patch(`/reservas/${r.id}`).set('Content-Type', 'application/json').send('{')).status).toBe(400);
    expect((await request(app).get('/reservas/1')).status).toBe(400);
  });
  it('rechaza filtros inválidos antes de consultar la base', async () => {
    expect((await request(app).get('/reservas?limite=0')).status).toBe(400);
    expect((await request(app).get('/reservas?estado=COMPLETADA')).status).toBe(400);
  });
});
