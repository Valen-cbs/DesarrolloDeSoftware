import { Db } from '../db/pool';
import { EntradaHistorial, EventoHistorial } from '../models/reserva';

export async function registrarHistorial(db: Db, evento: EventoHistorial): Promise<void> {
  await db.query(`INSERT INTO historial_reservas
    (reserva_id, accion, estado_anterior, estado_nuevo, actor, motivo, detalle)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [evento.reservaId, evento.accion, evento.estadoAnterior, evento.estadoNuevo, evento.actor,
      evento.motivo ?? null, evento.detalle ? JSON.stringify(evento.detalle) : null]);
}

export async function listarHistorial(db: Db, id: string): Promise<EntradaHistorial[]> {
  const resultado = await db.query('SELECT * FROM historial_reservas WHERE reserva_id=$1 ORDER BY fecha, id', [id]);
  return resultado.rows.map(fila => ({
    id: fila.id, reservaId: fila.reserva_id, accion: fila.accion, estadoAnterior: fila.estado_anterior,
    estadoNuevo: fila.estado_nuevo, actor: fila.actor, motivo: fila.motivo,
    detalle: fila.detalle, fecha: fila.fecha,
  }));
}
