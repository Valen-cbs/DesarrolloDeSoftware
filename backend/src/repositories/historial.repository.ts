// Repositorio del historial: solo INSERT y SELECT. Nunca se borra ni se modifica (RF-9.12).
import { Ejecutor } from '../db/pool';
import { EntradaHistorial } from '../models/reserva';

export interface NuevaEntradaHistorial {
  reservaId: string;
  tipoCambio: string;
  campoModificado?: string | null;
  valorAnterior?: string | null;
  valorNuevo?: string | null;
  actorId: string;
  rolActor: string;
  motivo?: string | null;
}

export async function registrarHistorial(db: Ejecutor, e: NuevaEntradaHistorial): Promise<void> {
  await db.query(
    `INSERT INTO historial_reserva
       (reserva_id, tipo_cambio, campo_modificado, valor_anterior, valor_nuevo,
        actor_id, rol_actor, motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      e.reservaId,
      e.tipoCambio,
      e.campoModificado ?? null,
      e.valorAnterior ?? null,
      e.valorNuevo ?? null,
      e.actorId,
      e.rolActor,
      e.motivo ?? null,
    ],
  );
}

export async function listarHistorial(
  db: Ejecutor,
  reservaId: string,
): Promise<EntradaHistorial[]> {
  const { rows } = await db.query(
    'SELECT * FROM historial_reserva WHERE reserva_id = $1 ORDER BY fecha_cambio, id',
    [reservaId],
  );
  return rows.map((f: any) => ({
    id: f.id,
    reservaId: f.reserva_id,
    tipoCambio: f.tipo_cambio,
    campoModificado: f.campo_modificado,
    valorAnterior: f.valor_anterior,
    valorNuevo: f.valor_nuevo,
    actorId: f.actor_id,
    rolActor: f.rol_actor,
    motivo: f.motivo,
    fechaCambio: f.fecha_cambio,
  }));
}