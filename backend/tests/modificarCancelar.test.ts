import express, { ErrorRequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  crearServicioPersona3, crearRutasPersona3, Dependencias, Reserva, EntradaHistorial,
} from '../src/modificarCancelar';

const ID = '12345678-1234-1234-1234-123456789abc';
const AUSENTE = '00000000-0000-0000-0000-000000000000';
const AHORA = new Date('2026-10-08T12:00:00Z');
const enMinutos = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000);
type Conexion = { reserva: Reserva | null; historial: EntradaHistorial[] };
type Fallo = Error & { status: number; codigo: string; detalle: unknown };

// Dobles locales de Personas 1 y 2: no conexión, SQL, servicios ni servidor de producción.
function preparar(cambios: Partial<Reserva> = {}) {
  const pool: Conexion = {
    reserva: {
      id: ID, origen: 'Plaza', destino: 'Terminal', tipoVehiculo: 'AUTO', fechaHora: enMinutos(120),
      zonaHoraria: 'America/Argentina/Buenos_Aires', estado: 'CONFIRMADA', tarifaEstimada: 4750,
      motivoCancelacion: null, solicitudDespachoId: null, ...cambios,
    },
    historial: [],
  };
  const error = (status: number, codigo: string, mensaje: string, detalle: unknown = null): Fallo =>
    Object.assign(new Error(mensaje), { status, codigo, detalle });
  let cola = Promise.resolve();
  const d: Dependencias<Conexion> = {
    pool,
    // Serializar y trabajar sobre una copia simula el contrato transaccional esperado de P1.
    async transaccion<T>(operacion: (db: Conexion) => Promise<T>): Promise<T> {
      const anterior = cola;
      let liberar!: () => void;
      cola = new Promise<void>(resolve => { liberar = resolve; });
      await anterior;
      const db = structuredClone(pool);
      try {
        const resultado = await operacion(db);
        Object.assign(pool, db);
        return resultado;
      } finally { liberar(); }
    },
    buscarReservaPorId: vi.fn(async (db: Conexion, id: string, _bloquear?: boolean) =>
      db.reserva?.id === id ? structuredClone(db.reserva) : null),
    actualizarDatosReserva: vi.fn(async (db: Conexion, _id: string, cambiosReserva) => {
      if (!db.reserva || !['PENDIENTE', 'CONFIRMADA'].includes(db.reserva.estado)) return null;
      Object.assign(db.reserva, cambiosReserva);
      return structuredClone(db.reserva);
    }),
    cancelarReservaEnBase: vi.fn(async (db: Conexion, _id: string, motivo: string) => {
      if (!db.reserva || !['PENDIENTE', 'CONFIRMADA'].includes(db.reserva.estado)) return null;
      Object.assign(db.reserva, { estado: 'CANCELADA', motivoCancelacion: motivo });
      return structuredClone(db.reserva);
    }),
    registrarHistorial: vi.fn(async (db: Conexion, evento) => {
      db.historial.push({ ...structuredClone(evento), id: String(db.historial.length + 1), fecha: AHORA });
    }),
    listarHistorial: vi.fn(async (db: Conexion, id: string) =>
      structuredClone(db.historial.filter(h => h.reservaId === id))),
    errores: {
      datosInvalidos: detalle => error(400, 'DATOS_INVALIDOS', 'Datos inválidos', detalle),
      noEncontrada: id => error(404, 'NO_ENCONTRADA', 'La reserva no existe', { id }),
      conflicto: mensaje => error(409, 'CONFLICTO', mensaje),
      reglaIncumplida: mensaje => error(422, 'REGLA_INCUMPLIDA', mensaje),
      servicioNoDisponible: mensaje => error(503, 'SERVICIO_NO_DISPONIBLE', mensaje),
    },
    config: { anticipacionMinimaMinutos: 60, anticipacionMaximaDias: 30 },
    validaciones: {
      esTextoConContenido: (valor): valor is string => typeof valor === 'string' && !!valor.trim(),
      esTipoVehiculoValido: (valor): valor is Reserva['tipoVehiculo'] => valor === 'AUTO' || valor === 'MOTO',
      esZonaHorariaValida: (valor): valor is string =>
        typeof valor === 'string' && ['UTC', 'America/Argentina/Buenos_Aires'].includes(valor),
      convertirFecha: vi.fn(valor => {
        if (typeof valor !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(valor)) return null;
        const fecha = new Date(valor);
        return Number.isFinite(fecha.getTime()) ? fecha : null;
      }),
      validarVentana: vi.fn((fecha, ahora, minimo, maximo) => {
        const diferencia = fecha.getTime() - ahora.getTime();
        return diferencia < minimo * 60_000 || diferencia > maximo * 86_400_000 ? 'Fuera de ventana' : null;
      }),
    },
    consultarRuta: vi.fn(async () => ({ cubierta: true, distanciaKm: 12.5 })),
    estimarTarifa: vi.fn(async () => 3500),
    reloj: () => AHORA,
  };
  const servicio = crearServicioPersona3(d);
  const app = express();
  app.use(express.json());
  app.use('/reservas', crearRutasPersona3(servicio, req => req.header('X-Actor') ?? 'cliente'));
  // Solo el arnés de prueba representa el middleware común que aportará Persona 1.
  const manejarErrores: ErrorRequestHandler = (fallo: Fallo, _req, res, _next) => {
    res.status(fallo.status ?? 500).json({
      codigo: fallo.codigo ?? 'ERROR_INTERNO', mensaje: fallo.message, detalle: fallo.detalle ?? null,
    });
  };
  app.use(manejarErrores);
  return { app, servicio, d, pool };
}

describe('Persona 3: modificar (RF-9.6)', () => {
  it('modifica recorrido y vehículo, recalcula tarifa y audita valores/actor', async () => {
    const { app, d, pool } = preparar();
    const respuesta = await request(app).patch(`/reservas/${ID}`).set('X-Actor', 'Valentino')
      .send({ destino: ' Aeropuerto ', tipoVehiculo: 'MOTO' });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ destino: 'Aeropuerto', tipoVehiculo: 'MOTO', tarifaEstimada: 3500 });
    expect(d.consultarRuta).toHaveBeenCalledWith('Plaza', 'Aeropuerto');
    expect(d.estimarTarifa).toHaveBeenCalledWith('MOTO', 12.5);
    expect(pool.historial).toEqual([expect.objectContaining({
      accion: 'MODIFICADA', actor: 'Valentino', estadoAnterior: 'CONFIRMADA', estadoNuevo: 'CONFIRMADA',
      detalle: { cambios: {
        destino: { anterior: 'Terminal', nuevo: 'Aeropuerto' },
        tipoVehiculo: { anterior: 'AUTO', nuevo: 'MOTO' },
        tarifaEstimada: { anterior: 4750, nuevo: 3500 },
      } },
    })]);
    const conexion = vi.mocked(d.actualizarDatosReserva).mock.calls[0][0];
    expect(d.buscarReservaPorId).toHaveBeenCalledWith(conexion, ID, true);
    expect(vi.mocked(d.registrarHistorial).mock.calls[0][0]).toBe(conexion);
    expect(conexion).not.toBe(d.pool);
  });

  it('reprograma conservando la tarifa y reutilizando la validación de Persona 2', async () => {
    const { app, d, pool } = preparar();
    const fecha = enMinutos(240);
    const r = await request(app).patch(`/reservas/${ID}`).send({ fechaHora: fecha.toISOString() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ fechaHora: fecha.toISOString(), tarifaEstimada: 4750 });
    expect(d.validaciones.validarVentana).toHaveBeenCalledWith(fecha, AHORA, 60, 30);
    expect(d.consultarRuta).not.toHaveBeenCalled();
    expect(d.estimarTarifa).not.toHaveBeenCalled();
    expect(pool.historial).toHaveLength(1);
  });

  it('cambia solo la zona horaria sin recalcular tarifa', async () => {
    const { app, d } = preparar();
    const r = await request(app).patch(`/reservas/${ID}`).send({ zonaHoraria: 'UTC' });
    expect(r.status).toBe(200);
    expect(r.body.zonaHoraria).toBe('UTC');
    expect(d.estimarTarifa).not.toHaveBeenCalled();
  });

  it('un pedido sin cambios reales no escribe ni duplica historial', async () => {
    const { app, d, pool } = preparar();
    const r = await request(app).patch(`/reservas/${ID}`)
      .send({ origen: ' Plaza ', fechaHora: enMinutos(120).toISOString() });
    expect(r.status).toBe(200);
    expect(d.actualizarDatosReserva).not.toHaveBeenCalled();
    expect(d.consultarRuta).not.toHaveBeenCalled();
    expect(pool.historial).toEqual([]);
  });

  it.each([
    {}, [], { estado: 'CONFIRMADA' }, { clienteId: 'otro' }, { tarifaEstimada: 1 },
    { origen: '' }, { destino: 42 }, { tipoVehiculo: 'BICI' },
    { fechaHora: 'incorrecta' }, { zonaHoraria: 'incorrecta' },
  ])('rechaza PATCH inválido con 400: %j', async cuerpo => {
    const { app, d, pool } = preparar();
    const r = await request(app).patch(`/reservas/${ID}`).send(cuerpo);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ codigo: 'DATOS_INVALIDOS', mensaje: 'Datos inválidos', detalle: expect.any(Array) });
    expect(d.actualizarDatosReserva).not.toHaveBeenCalled();
    expect(pool.historial).toEqual([]);
  });

  it('rechaza modificaciones si quedan menos de 60 minutos', async () => {
    const { app, pool } = preparar({ fechaHora: enMinutos(59) });
    const r = await request(app).patch(`/reservas/${ID}`).send({ destino: 'Otro' });
    expect(r.status).toBe(422);
    expect(pool.reserva?.destino).toBe('Terminal');
  });

  it('acepta exactamente 60 minutos para la reserva original', async () => {
    const { app } = preparar({ fechaHora: enMinutos(60) });
    expect((await request(app).patch(`/reservas/${ID}`).send({ destino: 'Otro' })).status).toBe(200);
  });

  it.each([59, 30 * 24 * 60 + 1])('rechaza nueva fecha fuera de ventana: %i minutos', async minutos => {
    const { app, pool } = preparar();
    const r = await request(app).patch(`/reservas/${ID}`).send({ fechaHora: enMinutos(minutos).toISOString() });
    expect(r.status).toBe(422);
    expect(pool.historial).toEqual([]);
  });

  it.each([60, 30 * 24 * 60])('acepta nueva fecha en el límite: %i minutos', async minutos => {
    const { app } = preparar();
    const r = await request(app).patch(`/reservas/${ID}`).send({ fechaHora: enMinutos(minutos).toISOString() });
    expect(r.status).toBe(200);
  });

  it('rechaza cobertura insuficiente sin guardar datos ni historial', async () => {
    const { app, d, pool } = preparar();
    vi.mocked(d.consultarRuta).mockResolvedValueOnce({ cubierta: false, distanciaKm: 0 });
    const r = await request(app).patch(`/reservas/${ID}`).send({ origen: 'Lejos' });
    expect(r.status).toBe(422);
    expect(d.estimarTarifa).not.toHaveBeenCalled();
    expect(pool.reserva?.origen).toBe('Plaza');
    expect(pool.historial).toEqual([]);
  });

  it.each(['consultarRuta', 'estimarTarifa'] as const)('falla de %s devuelve 503 y no escribe', async dependencia => {
    const { app, d, pool } = preparar();
    vi.mocked(d[dependencia]).mockRejectedValueOnce(new Error('Sin conexión'));
    const r = await request(app).patch(`/reservas/${ID}`).send({ destino: 'Otro' });
    expect(r.status).toBe(503);
    expect(r.body.codigo).toBe('SERVICIO_NO_DISPONIBLE');
    expect(d.actualizarDatosReserva).not.toHaveBeenCalled();
    expect(pool.historial).toEqual([]);
  });

  it('vuelve a controlar la hora después de esperar a M4/M7', async () => {
    const { app, d, pool } = preparar({ fechaHora: enMinutos(61) });
    let ahora = AHORA;
    d.reloj = () => ahora;
    const servicio = crearServicioPersona3(d);
    vi.mocked(d.consultarRuta).mockImplementationOnce(async () => {
      ahora = enMinutos(2);
      return { cubierta: true, distanciaKm: 12.5 };
    });
    await expect(servicio.modificarReserva(ID, { destino: 'Otro' }, 'cliente')).rejects.toMatchObject({ status: 422 });
    expect(d.actualizarDatosReserva).not.toHaveBeenCalled();
    expect(pool.historial).toEqual([]);
  });
});

describe('Persona 3: cancelar (RF-9.7)', () => {
  it('cancela con motivo y actor, incluso dentro de la última hora', async () => {
    const { app, d, pool } = preparar({ fechaHora: enMinutos(10) });
    const r = await request(app).post(`/reservas/${ID}/cancelar`).set('X-Actor', 'Valentino')
      .send({ motivo: ' Cambio de planes ' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'CANCELADA', motivoCancelacion: 'Cambio de planes', tarifaEstimada: 4750 });
    expect(pool.historial).toEqual([expect.objectContaining({
      accion: 'CANCELADA', estadoAnterior: 'CONFIRMADA', estadoNuevo: 'CANCELADA',
      actor: 'Valentino', motivo: 'Cambio de planes',
    })]);
    expect(d.consultarRuta).not.toHaveBeenCalled();
    const conexion = vi.mocked(d.cancelarReservaEnBase).mock.calls[0][0];
    expect(d.buscarReservaPorId).toHaveBeenCalledWith(conexion, ID, true);
    expect(vi.mocked(d.registrarHistorial).mock.calls[0][0]).toBe(conexion);
  });

  it.each([{}, { motivo: '' }, { motivo: 'ab' }, { motivo: 12 }, { motivo: 'abc', estado: 'CANCELADA' }])
    ('rechaza cancelación inválida con 400: %j', async cuerpo => {
      const { app, pool } = preparar();
      const r = await request(app).post(`/reservas/${ID}/cancelar`).send(cuerpo);
      expect(r.status).toBe(400);
      expect(r.body.codigo).toBe('DATOS_INVALIDOS');
      expect(pool.reserva?.estado).toBe('CONFIRMADA');
      expect(pool.historial).toEqual([]);
    });

  it('permite cancelar una reserva PENDIENTE', async () => {
    const { app } = preparar({ estado: 'PENDIENTE' });
    expect((await request(app).post(`/reservas/${ID}/cancelar`).send({ motivo: 'Cambio' })).status).toBe(200);
  });
});

describe('Persona 3: estado, contrato y atomicidad (RNF-03/07/08)', () => {
  it.each(['ACTIVADA', 'CANCELADA', 'VENCIDA'])('no modifica ni cancela el estado %s', async estado => {
    const { app, pool } = preparar({ estado });
    for (const r of [
      await request(app).patch(`/reservas/${ID}`).send({ destino: 'Otro' }),
      await request(app).post(`/reservas/${ID}/cancelar`).send({ motivo: 'Cambio' }),
    ]) {
      expect(r.status).toBe(409);
      expect(r.body).toEqual({ codigo: 'CONFLICTO', mensaje: expect.any(String), detalle: null });
    }
    expect(pool.historial).toEqual([]);
  });

  it('no modifica ni cancela una reserva con solicitud de despacho asociada', async () => {
    const { servicio, pool } = preparar({ solicitudDespachoId: 'sol-1' });
    await expect(servicio.modificarReserva(ID, { destino: 'Otro' }, 'cliente')).rejects.toMatchObject({ status: 409 });
    await expect(servicio.cancelarReserva(ID, { motivo: 'Cambio' }, 'cliente')).rejects.toMatchObject({ status: 409 });
    expect(pool.historial).toEqual([]);
  });

  it('responde 404 en las tres operaciones para una reserva inexistente', async () => {
    const { app } = preparar();
    const respuestas = [
      await request(app).patch(`/reservas/${AUSENTE}`).send({ destino: 'Otro' }),
      await request(app).post(`/reservas/${AUSENTE}/cancelar`).send({ motivo: 'Cambio' }),
      await request(app).get(`/reservas/${AUSENTE}/historial`),
    ];
    for (const r of respuestas) {
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ codigo: 'NO_ENCONTRADA', mensaje: 'La reserva no existe', detalle: { id: AUSENTE } });
    }
  });

  it('responde 400 en las tres operaciones para un UUID inválido', async () => {
    const { servicio, d } = preparar();
    await expect(servicio.modificarReserva('otro', { destino: 'Otro' }, 'cliente')).rejects.toMatchObject({ status: 400 });
    await expect(servicio.cancelarReserva('otro', { motivo: 'Cambio' }, 'cliente')).rejects.toMatchObject({ status: 400 });
    await expect(servicio.obtenerHistorial('otro')).rejects.toMatchObject({ status: 400 });
    expect(d.buscarReservaPorId).not.toHaveBeenCalled();
  });

  it.each(['modificar', 'cancelar'])('si falla el historial, revierte %s', async operacion => {
    const { servicio, d, pool } = preparar();
    const antes = structuredClone(pool);
    vi.mocked(d.registrarHistorial).mockRejectedValueOnce(new Error('Falló historial'));
    const promesa = operacion === 'modificar'
      ? servicio.modificarReserva(ID, { destino: 'Otro' }, 'cliente')
      : servicio.cancelarReserva(ID, { motivo: 'Cambio' }, 'cliente');
    await expect(promesa).rejects.toThrow('Falló historial');
    expect(pool).toEqual(antes);
  });

  it.each(['modificar', 'cancelar'])('UPDATE sin fila devuelve 409 en %s sin historial', async operacion => {
    const { servicio, d, pool } = preparar();
    vi.mocked(d.actualizarDatosReserva).mockResolvedValueOnce(null);
    vi.mocked(d.cancelarReservaEnBase).mockResolvedValueOnce(null);
    const promesa = operacion === 'modificar'
      ? servicio.modificarReserva(ID, { destino: 'Otro' }, 'cliente')
      : servicio.cancelarReserva(ID, { motivo: 'Cambio' }, 'cliente');
    await expect(promesa).rejects.toMatchObject({ status: 409 });
    expect(d.registrarHistorial).not.toHaveBeenCalled();
    expect(pool.historial).toEqual([]);
  });

  it('dos modificaciones usan la última versión bajo el contrato de bloqueo de P1', async () => {
    const { servicio, d, pool } = preparar();
    await Promise.all([
      servicio.modificarReserva(ID, { origen: 'Origen nuevo' }, 'primero'),
      servicio.modificarReserva(ID, { destino: 'Destino nuevo' }, 'segundo'),
    ]);
    expect(pool.reserva).toMatchObject({ origen: 'Origen nuevo', destino: 'Destino nuevo' });
    expect(d.consultarRuta).toHaveBeenNthCalledWith(2, 'Origen nuevo', 'Destino nuevo');
    expect(pool.historial.map(h => h.actor)).toEqual(['primero', 'segundo']);
  });

  it('dos cancelaciones concurrentes dejan una sola cancelación y un 409', async () => {
    const { servicio, pool } = preparar();
    const resultados = await Promise.allSettled([
      servicio.cancelarReserva(ID, { motivo: 'Primera' }, 'primero'),
      servicio.cancelarReserva(ID, { motivo: 'Segunda' }, 'segundo'),
    ]);
    expect(resultados[0].status).toBe('fulfilled');
    expect(resultados[1]).toMatchObject({ status: 'rejected', reason: { status: 409 } });
    expect(pool.historial).toHaveLength(1);
    expect(pool.reserva?.motivoCancelacion).toBe('Primera');
  });

  it('modificar y cancelar concurrentemente conservan ambos eventos en orden', async () => {
    const { servicio, pool } = preparar();
    await Promise.all([
      servicio.modificarReserva(ID, { destino: 'Otro' }, 'cliente'),
      servicio.cancelarReserva(ID, { motivo: 'Cambio' }, 'cliente'),
    ]);
    expect(pool.reserva).toMatchObject({ destino: 'Otro', estado: 'CANCELADA' });
    expect(pool.historial.map(h => h.accion)).toEqual(['MODIFICADA', 'CANCELADA']);
  });
});

describe('Persona 3: historial (RF-9.12, endpoint)', () => {
  it('devuelve el historial completo y en el orden recibido del repositorio compartido', async () => {
    const { app, d, pool } = preparar({ estado: 'CANCELADA' });
    pool.historial.push(
      { id: '1', reservaId: ID, accion: 'CREADA', estadoAnterior: null, estadoNuevo: 'CONFIRMADA', actor: 'cliente', fecha: AHORA },
      { id: '2', reservaId: ID, accion: 'CANCELADA', estadoAnterior: 'CONFIRMADA', estadoNuevo: 'CANCELADA', actor: 'cliente', motivo: 'Cambio', fecha: enMinutos(1) },
    );
    const r = await request(app).get(`/reservas/${ID}/historial`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual(JSON.parse(JSON.stringify(pool.historial)));
    expect(d.listarHistorial).toHaveBeenCalledWith(d.pool, ID);
  });

  it('devuelve un arreglo vacío si la reserva existe sin eventos', async () => {
    const { app } = preparar();
    const r = await request(app).get(`/reservas/${ID}/historial`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('no consulta eventos cuando la reserva no existe', async () => {
    const { servicio, d } = preparar();
    await expect(servicio.obtenerHistorial(AUSENTE)).rejects.toMatchObject({ status: 404 });
    expect(d.listarHistorial).not.toHaveBeenCalled();
  });
});
