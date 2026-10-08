import { app } from './app';
import { config } from './config/env';
import { pool } from './db/pool';

const servidor = app.listen(config.puerto, () => console.log(`M9 escuchando en el puerto ${config.puerto}`));
for (const señal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(señal, () => {
    servidor.close(() => { void pool.end().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
