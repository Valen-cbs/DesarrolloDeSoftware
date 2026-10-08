import { Db } from '../db/pool';
import { CambiosReserva, DatosReserva, Reserva } from '../models/reserva';
import { FiltrosReservas } from '../validaciones/reserva.validaciones';

function mapear(fila: Record<string, any>): Reserva {
  return {
    id: fila.id, clienteId: fila.cliente_id, origen: fila.origen, destino: fila.destino,
    tipoVehiculo: fila.tipo_vehiculo, fechaHora: fila.fecha_hora, zonaHoraria: fila.zona_horaria,
    estado: fila.estado, tarifaEstimada: fila.tarifa_estimada === null ? null : Number(fila.tarifa_estimada),
    motivoCancelacion: fila.motivo_cancelacion, solicitudDespachoId: fila.solicitud_despacho_id,
    creadoEn: fila.creado_en, modificadoEn: fila.modificado_en,
  };
}

// bloquear=true se usa ÚNICAMENTE dentro de transaccion y con su misma conexión.
export async function buscarReservaPorId(db: Db, id: string, bloquear = false): Promise<Reserva | null> {
  const resultado = await db.query(`SELECT * FROM reservas WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
  return resultado.rows[0] ? mapear(resultado.rows[0]) : null;
}

export async function crearReservaEnBase(db: Db, datos: DatosReserva, tarifa: number): Promise<Reserva> {
  const resultado = await db.query(`
    INSERT INTO reservas (cliente_id, origen, destino, tipo_vehiculo, fecha_hora, zona_horaria, estado, tarifa_estimada)
    VALUES ($1,$2,$3,$4,$5,$6,'CONFIRMADA',$7) RETURNING *`,
    [datos.clienteId, datos.origen, datos.destino, datos.tipoVehiculo, datos.fechaHora, datos.zonaHoraria, tarifa]);
  return mapear(resultado.rows[0]);
}

export async function listarReservas(db: Db, filtros: FiltrosReservas): Promise<Reserva[]> {
  const resultado = await db.query(`SELECT * FROM reservas
    WHERE ($1::text IS NULL OR cliente_id=$1) AND ($2::text IS NULL OR estado=$2)
    ORDER BY fecha_hora, id LIMIT $3 OFFSET $4`,
    [filtros.clienteId ?? null, filtros.estado ?? null, filtros.limite, filtros.offset]);
  return resultado.rows.map(mapear);
}

const COLUMNAS: Record<keyof CambiosReserva, string> = {
  origen: 'origen', destino: 'destino', tipoVehiculo: 'tipo_vehiculo', fechaHora: 'fecha_hora',
  zonaHoraria: 'zona_horaria', tarifaEstimada: 'tarifa_estimada',
};

export async function actualizarDatosReserva(db: Db, id: string, cambios: CambiosReserva): Promise<Reserva | null> {
  const claves = Object.keys(cambios) as (keyof CambiosReserva)[];
  const asignaciones = claves.map((c, i) => `${COLUMNAS[c]}=$${i + 2}`).join(', ');
  const resultado = await db.query(`UPDATE reservas SET ${asignaciones}, modificado_en=now()
    WHERE id=$1 AND estado IN ('PENDIENTE','CONFIRMADA') AND solicitud_despacho_id IS NULL AND NOT activacion_iniciada RETURNING *`,
    [id, ...claves.map(c => cambios[c])]);
  return resultado.rows[0] ? mapear(resultado.rows[0]) : null;
}

export async function cancelarReservaEnBase(db: Db, id: string, motivo: string): Promise<Reserva | null> {
  const resultado = await db.query(`UPDATE reservas SET estado='CANCELADA', motivo_cancelacion=$2, modificado_en=now()
    WHERE id=$1 AND estado IN ('PENDIENTE','CONFIRMADA') AND solicitud_despacho_id IS NULL AND NOT activacion_iniciada RETURNING *`, [id, motivo]);
  return resultado.rows[0] ? mapear(resultado.rows[0]) : null;
}

export async function activarReservaEnBase(db: Db, id: string, solicitudId: string): Promise<Reserva | null> {
  const resultado = await db.query(`UPDATE reservas SET estado='ACTIVADA', solicitud_despacho_id=$2, activacion_iniciada=false, modificado_en=now()
    WHERE id=$1 AND estado='CONFIRMADA' AND solicitud_despacho_id IS NULL RETURNING *`, [id, solicitudId]);
  return resultado.rows[0] ? mapear(resultado.rows[0]) : null;
}

export async function hayActivacionIniciada(db: Db, id: string): Promise<boolean> {
  const resultado = await db.query('SELECT activacion_iniciada FROM reservas WHERE id=$1', [id]);
  return resultado.rows[0]?.activacion_iniciada === true;
}

export async function registrarIntencionActivacion(db: Db, id: string): Promise<void> {
  await db.query(`UPDATE reservas SET activacion_iniciada=true, modificado_en=now()
    WHERE id=$1 AND NOT activacion_iniciada`, [id]);
}
