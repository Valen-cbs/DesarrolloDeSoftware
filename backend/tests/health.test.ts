// Prueba: el servicio responde y llega a la base.
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/pool';

afterAll(() => pool.end()); // cerramos la conexión al terminar

describe('GET /health', () => {
  it('responde 200 y dice que la base está conectada', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('OK');
    expect(res.body.baseDeDatos).toBe('conectada');
  });

  it('una ruta que no existe devuelve 404 con el formato de error común', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('codigo');
    expect(res.body).toHaveProperty('mensaje');
  });
});