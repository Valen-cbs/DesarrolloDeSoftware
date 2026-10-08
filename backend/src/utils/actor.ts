import { Request } from 'express';
import { errores } from '../errors/AppError';

// TP1: etiqueta de auditoría, no identidad autenticada ni autorización.
export function actorDe(req: Request): string {
  const actor = (req.header('X-Actor') ?? 'cliente').trim();
  if (!actor || actor.length > 120) throw errores.datosInvalidos(['X-Actor debe contener entre 1 y 120 caracteres']);
  return actor;
}
