import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from './config/env';
import { pool } from './db/pool';
import { manejarErrores } from './middlewares/errores';
import { reservasRouter } from './routes/reservas.routes';

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
app.use('/reservas', reservasRouter);
app.get('/openapi.json', (_req, res) => { res.json(contrato); });
app.use('/docs', swaggerUi.serve, swaggerUi.setup(contrato));
app.use((_req, res) => { res.status(404).json({ codigo: 'NO_ENCONTRADA', mensaje: 'Ruta no encontrada', detalle: null }); });
app.use(manejarErrores);
