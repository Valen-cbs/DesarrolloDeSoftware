import { app } from './app';
import { config } from './config/env';

app.listen(config.port, () => {
  console.log(`M9 Reservas escuchando en http://localhost:${config.port}`);
  console.log(`Salud: http://localhost:${config.port}/health`);
  console.log(`Docs:  http://localhost:${config.port}/docs`);
});