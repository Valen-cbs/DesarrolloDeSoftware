import { Router } from 'express';
import {
  crearReservaCtrl,
  consultarReservaCtrl,
  listarReservasCtrl,
} from '../controllers/crearConsultar.controller';
import {
  modificarReservaCtrl,
  cancelarReservaCtrl,
  historialReservaCtrl,
} from '../controllers/modificarCancelar.controller';
import { activarReservaCtrl } from '../controllers/activar.controller';

export const reservasRouter = Router();

reservasRouter.post('/', crearReservaCtrl); // Oriana
reservasRouter.get('/', listarReservasCtrl); // Oriana (?clienteId=...)
reservasRouter.get('/:id', consultarReservaCtrl); // Oriana
reservasRouter.patch('/:id', modificarReservaCtrl); // Valentino
reservasRouter.post('/:id/cancelar', cancelarReservaCtrl); // Valentino
reservasRouter.get('/:id/historial', historialReservaCtrl); // Valentino
reservasRouter.post('/:id/activar', activarReservaCtrl); // Bianca