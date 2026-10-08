import { Request, Response } from 'express';
import { consultarReserva, crearReserva, obtenerReservas } from '../services/crearConsultar.service';
import { actorDe } from '../utils/actor';

export async function crearReservaCtrl(req: Request, res: Response) {
  const reserva = await crearReserva(req.body, actorDe(req));
  res.location(`/reservas/${reserva.id}`).status(201).json(reserva);
}
export async function consultarReservaCtrl(req: Request<{ id: string }>, res: Response) {
  res.json(await consultarReserva(req.params.id));
}
export async function listarReservasCtrl(req: Request, res: Response) {
  res.json(await obtenerReservas(req.query));
}
