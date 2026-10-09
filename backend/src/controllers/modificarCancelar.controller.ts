// PROVISORIO. Valentino reemplaza este archivo completo con su versión.
import { Request, Response } from 'express';

const pendiente = (_req: Request, res: Response) => {
  res.status(501).json({ codigo: 'NO_IMPLEMENTADO', mensaje: 'Lo está programando NOMBRE' });
};

export const modificarReservaCtrl = pendiente;
export const cancelarReservaCtrl = pendiente;
export const historialReservaCtrl = pendiente;