import { Router } from 'express';
import { pool } from '../db/pool';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      estado: 'OK',
      servicio: 'M9 Reservas',
      baseDeDatos: 'conectada',
      fecha: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ estado: 'ERROR', servicio: 'M9 Reservas', baseDeDatos: 'sin conexión' });
  }
});