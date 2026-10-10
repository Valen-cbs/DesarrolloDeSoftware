import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

function responderError(
  res: Response,
  status: number,
  codigo: string,
  mensaje: string,
  detalle: unknown = null,
) {
  return res.status(status).json({ codigo, mensaje, detalle });
}

export function rutaNoEncontrada(req: Request, res: Response) {
  responderError(res, 404, 'RUTA_NO_ENCONTRADA', `No existe ${req.method} ${req.path}`);
}

export function manejadorDeErrores(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return responderError(res, err.status, err.codigo, err.message, err.detalle ?? null);
  }
  if (err?.type === 'entity.parse.failed') {
    return responderError(res, 400, 'JSON_INVALIDO', 'El cuerpo no es un JSON válido');
  }
  if (err?.code === '22P02') {
    return responderError(res, 400, 'ID_INVALIDO', 'El identificador no tiene un formato válido');
  }
  console.error('Error inesperado:', err);
  return responderError(res, 500, 'ERROR_INTERNO', 'Ocurrió un error inesperado');
}