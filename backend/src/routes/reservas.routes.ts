import { Router } from 'express';
import { crearReservaCtrl, consultarReservaCtrl, listarReservasCtrl } from '../controllers/crearConsultar.controller';
import { modificarReservaCtrl, cancelarReservaCtrl, historialReservaCtrl } from '../controllers/modificarCancelar.controller';
import { activarReservaCtrl } from '../controllers/activar.controller';

export const reservasRouter = Router();
reservasRouter.get('/', listarReservasCtrl);
reservasRouter.post('/', crearReservaCtrl);
reservasRouter.get('/:id', consultarReservaCtrl);
reservasRouter.patch('/:id', modificarReservaCtrl);
reservasRouter.post('/:id/cancelar', cancelarReservaCtrl);
reservasRouter.get('/:id/historial', historialReservaCtrl);
reservasRouter.post('/:id/activar', activarReservaCtrl);
