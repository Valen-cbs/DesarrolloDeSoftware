import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { healthRouter } from './routes/health.routes';
import { reservasRouter } from './routes/reservas.routes';
import { montarSwagger } from './docs/swagger';
import { manejadorDeErrores, rutaNoEncontrada } from './middlewares/errores';

export const app = express();

app.use(cors({ origin: config.corsOrigin })); // deja que la pantalla de React nos llame
app.use(express.json()); // entiende cuerpos en formato JSON
app.use(healthRouter);
app.use('/reservas', reservasRouter);
montarSwagger(app);
app.use(rutaNoEncontrada); // siempre al final
app.use(manejadorDeErrores); // siempre el último de todos