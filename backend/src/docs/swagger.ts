import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

export function montarSwagger(app: Express) {
  const candidatos = [
    path.resolve(process.cwd(), '../api/openapi.yaml'), // corriendo desde backend/
    path.resolve(process.cwd(), 'api/openapi.yaml'), // corriendo dentro de Docker
  ];
  const archivo = candidatos.find((ruta) => fs.existsSync(ruta));

  if (!archivo) {
    app.get('/docs', (_req, res) => {
      res.status(503).send('Todavía no existe api/openapi.yaml (lo sube el Bloque 1).');
    });
    return;
  }

  const documento = YAML.parse(fs.readFileSync(archivo, 'utf8'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(documento));
}