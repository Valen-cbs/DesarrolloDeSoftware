import { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/AppError';

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
