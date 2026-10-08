import { Request, Response } from 'express';
import { cancelarReserva, modificarReserva, obtenerHistorial } from '../services/modificarCancelar.service';
import { actorDe } from '../utils/actor';

export async function modificarReservaCtrl(req: Request<{ id: string }>, res: Response) {
  res.json(await modificarReserva(req.params.id, req.body, actorDe(req)));
}
export async function cancelarReservaCtrl(req: Request<{ id: string }>, res: Response) {
  res.json(await cancelarReserva(req.params.id, req.body, actorDe(req)));
}
export async function historialReservaCtrl(req: Request<{ id: string }>, res: Response) {
  res.json(await obtenerHistorial(req.params.id));
}
