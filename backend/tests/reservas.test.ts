import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { app } from '../src/server';
import * as db from '../src/db';
import { config, pool, buscarReservaPorId } from '../src/db';
import { EstadoReserva, Reserva, ESTADOS, esEditable, convertirFecha, esZonaHorariaValida, validarModificacion, validarMotivo, validarVentana } from '../src/types';
import { modificarReserva, stubs } from '../src/reservas';


describe('Validaciones de Persona 3', () => {
  it.each(ESTADOS)('editabilidad de %s', estado => {
    expect(esEditable(estado)).toBe(['PENDIENTE', 'CONFIRMADA'].includes(estado));
  });
  it('acepta el instante UTC usado por el frontend y una zona IANA independiente', () => {
    expect(convertirFecha('2026-10-23T09:00:00.000Z')?.toISOString()).toBe('2026-10-23T09:00:00.000Z');
    expect(esZonaHorariaValida('America/Argentina/Buenos_Aires')).toBe(true);
  });
  it.each(['2026-02-30T09:00:00Z', '2026-10-23', '2026-10-23T09:00:00', 'mañana', '2026-13-01T09:00:00Z'])('rechaza fecha inválida %s', fecha => {
    expect(convertirFecha(fecha)).toBeNull();
  });
  it('normaliza un offset explícito al mismo instante UTC', () => {
    expect(convertirFecha('2026-10-23T06:00:00-03:00')?.toISOString()).toBe('2026-10-23T09:00:00.000Z');
  });
  it('respeta ambos extremos inclusivos de la ventana', () => {
    const ahora = new Date('2026-10-08T12:00:00Z');
    expect(validarVentana(new Date(ahora.getTime() + 60 * 60_000), ahora)).toBeNull();
    expect(validarVentana(new Date(ahora.getTime() + 60 * 60_000 - 1), ahora)).not.toBeNull();
    expect(validarVentana(new Date(ahora.getTime() + 30 * 86_400_000), ahora)).toBeNull();
    expect(validarVentana(new Date(ahora.getTime() + 30 * 86_400_000 + 1), ahora)).not.toBeNull();
  });
  it.each([null, [], {}, { estado: 'ACTIVADA' }, { clienteId: 'otro' }, { tarifaEstimada: 0 }, { origen: ' ' }])('rechaza PATCH inválido %j', cuerpo => {
    expect(() => validarModificacion(cuerpo)).toThrow();
  });
  it('permite cambiar la zona manteniendo el instante de la fecha', () => {
    expect(validarModificacion({ zonaHoraria: 'UTC' })).toEqual({ zonaHoraria: 'UTC' });
  });
  it.each(['', 'a', 'ab', '  ab  '])('rechaza motivo corto %j', motivo => {
    expect(() => validarMotivo({ motivo })).toThrow();
  });
  it('acepta tres caracteres y elimina espacios exteriores', () => {
    expect(validarMotivo({ motivo: '  abc  ' })).toBe('abc');
  });
});

it('OpenAPI: contrato válido', async () => {
  await SwaggerParser.validate(path.resolve(process.cwd(), '../api/openapi.yaml'));
});

const enHoras = (horas: number) => new Date(Date.now() + horas * 3_600_000).toISOString();
const datosValidos = () => ({
  clienteId: 'cliente-1', origen: 'Plaza 25 de Mayo', destino: 'Terminal de Resistencia',
  tipoVehiculo: 'AUTO', fechaHora: enHoras(24), zonaHoraria: 'America/Argentina/Buenos_Aires',
});

async function crearReservaDePrueba(estado: EstadoReserva = 'CONFIRMADA', cambios: Partial<Reserva> = {}): Promise<Reserva> {
  const datos = { ...datosValidos(), ...cambios };
  const resultado = await pool.query(`INSERT INTO reservas
    (cliente_id, origen, destino, tipo_vehiculo, fecha_hora, zona_horaria, estado, tarifa_estimada, motivo_cancelacion, solicitud_despacho_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,4750,$8,$9) RETURNING id`,
    [datos.clienteId, datos.origen, datos.destino, datos.tipoVehiculo, datos.fechaHora, datos.zonaHoraria, estado,
      estado === 'CANCELADA' ? 'Cambio de planes' : null, estado === 'ACTIVADA' ? `sol-${crypto.randomUUID()}` : null]);
  return (await buscarReservaPorId(pool, resultado.rows[0].id))!;
}

function compuerta() {
  let abrir!: () => void;
  const promesa = new Promise<void>(resolve => { abrir = resolve; });
  return { promesa, abrir };
}

async function esperarBloqueos(cantidad = 1): Promise<void> {
  const limite = Date.now() + 3000;
  while (Date.now() < limite) {
    const resultado = await pool.query(`SELECT count(*)::integer AS cantidad FROM pg_stat_activity
      WHERE application_name='m9-backend' AND wait_event_type='Lock'`);
    if (resultado.rows[0].cantidad >= cantidad) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('No se observó el bloqueo concurrente esperado en PostgreSQL');
}

describe('Integración PostgreSQL', () => {
  beforeAll(async () => {
  // Solo una base local dedicada. No basta con que la URL no contenga "supabase".
  if (!config.databaseUrl) throw new Error('Falta TEST_DATABASE_URL en backend/.env');
  const destino = new URL(config.databaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]', 'db-test'].includes(destino.hostname)
    || decodeURIComponent(destino.pathname.slice(1)) !== 'm9_test') {
    throw new Error('TEST_DATABASE_URL debe apuntar a la base local m9_test. No se ejecutará TRUNCATE.');
  }


    const nombre = await pool.query('SELECT current_database() AS nombre');
    if (nombre.rows[0].nombre !== 'm9_test') throw new Error('Base de pruebas incorrecta');
    const tabla = await pool.query("SELECT to_regclass('public.reservas') AS tabla");
    if (!tabla.rows[0].tabla) {
      await pool.query(readFileSync(path.resolve(process.cwd(), 'schema.sql'), 'utf8'));
    }
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    stubs.reiniciarDespachoParaPruebas();
    await pool.query('TRUNCATE historial_reservas, reservas RESTART IDENTITY');
  });

  afterAll(async () => { await pool.end(); });



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
      const tarifa = vi.spyOn(stubs, 'estimarTarifa');
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
      vi.spyOn(stubs, 'estimarTarifa').mockRejectedValueOnce(new Error('M7 caído'));
      expect((await request(app).patch(`/reservas/${r.id}`).send({ tipoVehiculo: 'MOTO' })).status).toBe(503);
      expect((await request(app).get(`/reservas/${r.id}`)).body.tipoVehiculo).toBe('AUTO');
    });
    it.each(['patch', 'cancelar'] as const)('revierte %s si falla el historial', async operacion => {
      const r = await crearReservaDePrueba();
      vi.spyOn(db, 'registrarHistorial').mockRejectedValueOnce(new Error('Falla de prueba'));
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
      const original = stubs.consultarRuta;
      let primera = true;
      vi.spyOn(stubs, 'consultarRuta').mockImplementation(async (origen, destino) => {
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


  describe('Interacción con activación: concurrencia e idempotencia', () => {
    it('diez solicitudes concurrentes producen una llamada y una solicitud M5', async () => {
      const r = await crearReservaDePrueba();
      const respuestas = await Promise.all(Array.from({ length: 10 }, () => request(app).post(`/reservas/${r.id}/activar`).send({})));
      expect(respuestas.filter(x => x.status === 200)).toHaveLength(1);
      expect(respuestas.filter(x => x.status === 409)).toHaveLength(9);
      expect(stubs.metricasDespacho()).toEqual({ intentos: 1, solicitudes: 1 });
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
        expect(stubs.metricasDespacho().solicitudes).toBe(0);
      } else {
        expect(final.estado).toBe('ACTIVADA');
        expect(final.solicitudDespachoId).toMatch(/^sol-/);
        expect(stubs.metricasDespacho().solicitudes).toBe(1);
      }
    });
    it('un efecto M5 con respuesta perdida bloquea cambios y puede recuperarse sin duplicar', async () => {
      const r = await crearReservaDePrueba();
      const original = stubs.crearSolicitudDespacho;
      vi.spyOn(stubs, 'crearSolicitudDespacho').mockImplementationOnce(async (reserva, clave) => {
        await original(reserva, clave);
        throw new Error('Respuesta perdida después de crear la solicitud');
      });
      expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(503);
      expect((await request(app).patch(`/reservas/${r.id}`).send({ destino: 'Otro destino' })).status).toBe(409);
      expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Otro plan' })).status).toBe(409);
      const recuperada = await request(app).post(`/reservas/${r.id}/activar`).send({});
      expect(recuperada.status).toBe(200);
      expect(stubs.metricasDespacho()).toEqual({ intentos: 2, solicitudes: 1 });
      expect((await request(app).get(`/reservas/${r.id}/historial`)).body).toHaveLength(1);
    });
    it('recupera una intención persistida antes de contactar M5 (simula reinicio del backend)', async () => {
      const r = await crearReservaDePrueba();
      await pool.query('UPDATE reservas SET activacion_iniciada=true WHERE id=$1', [r.id]);
      expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Otro plan' })).status).toBe(409);
      expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(200);
      expect(stubs.metricasDespacho()).toEqual({ intentos: 1, solicitudes: 1 });
    });
    it('un timeout real después del efecto M5 no libera la reserva para cancelarla', async () => {
      const r = await crearReservaDePrueba();
      const original = stubs.crearSolicitudDespacho;
      vi.spyOn(stubs, 'crearSolicitudDespacho').mockImplementationOnce(async (reserva, clave) => {
        await original(reserva, clave);
        return new Promise<never>(() => {});
      });
      const limiteOriginal = config.integracionTimeoutMs;
      config.integracionTimeoutMs = 20;
      try {
        expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(503);
        expect((await request(app).post(`/reservas/${r.id}/cancelar`).send({ motivo: 'Otro plan' })).status).toBe(409);
        expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(200);
        expect(stubs.metricasDespacho()).toEqual({ intentos: 2, solicitudes: 1 });
      } finally { config.integracionTimeoutMs = limiteOriginal; }
    });
    it('si falla el historial después de M5, el reintento reutiliza la misma solicitud', async () => {
      const r = await crearReservaDePrueba();
      vi.spyOn(db, 'registrarHistorial').mockRejectedValueOnce(new Error('Falla de persistencia'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(500);
      const intermedia = (await request(app).get(`/reservas/${r.id}`)).body;
      expect(intermedia).toMatchObject({ estado: 'CONFIRMADA', solicitudDespachoId: null });
      expect((await request(app).post(`/reservas/${r.id}/activar`).send({})).status).toBe(200);
      expect(stubs.metricasDespacho()).toEqual({ intentos: 2, solicitudes: 1 });
    });
    it('no permite cancelar mientras M5 está atendiendo la activación', async () => {
      const r = await crearReservaDePrueba();
      const entrada = compuerta();
      const salida = compuerta();
      const original = stubs.crearSolicitudDespacho;
      vi.spyOn(stubs, 'crearSolicitudDespacho').mockImplementationOnce(async (reserva, clave) => {
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
});
