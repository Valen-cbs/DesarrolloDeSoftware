import { Request, Response } from 'express';
import { activarReserva } from '../services/activarReserva.service';
import { actorDe } from '../utils/actor';

export async function activarReservaCtrl(req: Request<{ id: string }>, res: Response) {
  res.json(await activarReserva(req.params.id, actorDe(req)));
}
