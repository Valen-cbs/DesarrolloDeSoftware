import express, { Request, ErrorRequestHandler } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config, pool } from './db';
import { AppError, errores } from './types';
import { crearReserva, consultarReserva, obtenerReservas, modificarReserva, cancelarReserva, obtenerHistorial, activarReserva } from './reservas';

// TP1: etiqueta de auditoría, no identidad autenticada ni autorización.
export function actorDe(req: Request): string {
  const actor = (req.header('X-Actor') ?? 'cliente').trim();
  if (!actor || actor.length > 120) throw errores.datosInvalidos(['X-Actor debe contener entre 1 y 120 caracteres']);
  return actor;
}

export const manejarErrores: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({ codigo: error.codigo, mensaje: error.message, detalle: error.detalle });
    return;
  }
  const fallo = error as { code?: string; type?: string } | null;
  if (fallo?.type === 'entity.parse.failed' || fallo?.code === '22P02') {
    res.status(400).json({ codigo: 'DATOS_INVALIDOS', mensaje: 'JSON o identificador inválido', detalle: null });
  } else if (fallo?.type === 'entity.too.large') {
    res.status(413).json({ codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'El cuerpo supera el límite permitido', detalle: null });
  } else if (fallo?.code === '55P03' || fallo?.code === '40001' || fallo?.code === '23505') {
    res.status(409).json({ codigo: 'CONFLICTO', mensaje: 'Conflicto con otra operación', detalle: null });
  } else if (['ECONNREFUSED', 'ETIMEDOUT', '57P01', '57014'].includes(fallo?.code ?? '')) {
    res.status(503).json({ codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'Persistencia no disponible', detalle: null });
  } else {
    console.error('Error interno de M9', error);
    res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor', detalle: null });
  }
};

const contrato = JSON.parse(readFileSync(path.resolve(__dirname, '../../api/openapi.yaml'), 'utf8'));
export const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: config.corsOrigenes.includes('*') ? '*' : config.corsOrigenes,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Actor'],
}));
app.use(express.json({ limit: '32kb' }));
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', servicio: 'M9', persistencia: 'ok' });
  } catch {
    res.status(503).json({ codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'Persistencia no disponible', detalle: null });
  }
});
// Controladores HTTP: reciben datos y delegan en los casos de uso.
app.get('/reservas', async (req, res) => { res.json(await obtenerReservas(req.query)); });
app.post('/reservas', async (req, res) => {
  const reserva = await crearReserva(req.body, actorDe(req));
  res.location(`/reservas/${reserva.id}`).status(201).json(reserva);
});
app.get('/reservas/:id', async (req, res) => { res.json(await consultarReserva(req.params.id)); });
app.patch('/reservas/:id', async (req, res) => { res.json(await modificarReserva(req.params.id, req.body, actorDe(req))); });
app.post('/reservas/:id/cancelar', async (req, res) => { res.json(await cancelarReserva(req.params.id, req.body, actorDe(req))); });
app.get('/reservas/:id/historial', async (req, res) => { res.json(await obtenerHistorial(req.params.id)); });
app.post('/reservas/:id/activar', async (req, res) => { res.json(await activarReserva(req.params.id, actorDe(req))); });
app.get('/openapi.json', (_req, res) => { res.json(contrato); });
app.use('/docs', swaggerUi.serve, swaggerUi.setup(contrato));
app.use((_req, res) => { res.status(404).json({ codigo: 'NO_ENCONTRADA', mensaje: 'Ruta no encontrada', detalle: null }); });
app.use(manejarErrores);

if (require.main === module) {
  if (!config.databaseUrl) throw new Error('Falta DATABASE_URL en backend/.env');
  const servidor = app.listen(config.puerto, () => console.log(`M9 escuchando en el puerto ${config.puerto}`));
  for (const señal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(señal, () => {
      servidor.close(() => { void pool.end().then(() => process.exit(0)); });
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  }
}
