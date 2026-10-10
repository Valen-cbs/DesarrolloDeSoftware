// PROVISORIO. ORIANA reemplaza este archivo completo con su versión.
import { Request, Response } from 'express';

const pendiente = (_req: Request, res: Response) => {
  res.status(501).json({ codigo: 'NO_IMPLEMENTADO', mensaje: 'Lo está programando Persona 2' });
};

export const crearReservaCtrl = pendiente;
export const consultarReservaCtrl = pendiente;
export const listarReservasCtrl = pendiente;