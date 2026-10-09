// Repositorio de reservas: el ÚNICO lugar donde se escribe SQL sobre la tabla reserva.
import { Ejecutor } from '../db/pool';
import { CambiosReserva, DatosNuevaReserva, EstadoReserva, Reserva } from '../models/reserva';

// Convierte una fila de la base (snake_case) en un objeto de TypeScript (camelCase).
export function filaAReserva(fila: any): Reserva {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    origen: fila.origen,
    destino: fila.destino,
    tipoVehiculo: fila.tipo_vehiculo,
    fechaHora: fila.fecha_hora,
    zonaHoraria: fila.zona_horaria,
    estado: fila.estado,
    tarifaEstimada: fila.tarifa_estimada === null ? null : Number(fila.tarifa_estimada),
    solicitudDespachoId: fila.solicitud_despacho_id,
    claveIdempotencia: fila.clave_idempotencia,
    creadaEn: fila.creada_en,
    modificadaEn: fila.modificada_en,
  };
}

export async function insertarReserva(
  db: Ejecutor,
  datos: DatosNuevaReserva & {
    estado: EstadoReserva;
    tarifaEstimada: number | null;
    claveIdempotencia: string;
  },
): Promise<Reserva> {
  const { rows } = await db.query(
    `INSERT INTO reserva
       (cliente_id, origen, destino, tipo_vehiculo, fecha_hora, zona_horaria,
        estado, tarifa_estimada, clave_idempotencia)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      datos.clienteId,
      datos.origen,
      datos.destino,
      datos.tipoVehiculo,
      datos.fechaHora,
      datos.zonaHoraria,
      datos.estado,
      datos.tarifaEstimada,
      datos.claveIdempotencia,
    ],
  );
  return filaAReserva(rows[0]);
}

export async function buscarReservaPorId(db: Ejecutor, id: string): Promise<Reserva | null> {
  const { rows } = await db.query('SELECT * FROM reserva WHERE id = $1', [id]);
  return rows[0] ? filaAReserva(rows[0]) : null;
}

// Sirve para detectar reintentos: si ya existe, no se crea otra reserva igual.
export async function buscarReservaPorClave(
  db: Ejecutor,
  claveIdempotencia: string,
): Promise<Reserva | null> {
  const { rows } = await db.query('SELECT * FROM reserva WHERE clave_idempotencia = $1', [
    claveIdempotencia,
  ]);
  return rows[0] ? filaAReserva(rows[0]) : null;
}

export async function listarReservasPorCliente(
  db: Ejecutor,
  clienteId: string,
): Promise<Reserva[]> {
  const { rows } = await db.query(
    'SELECT * FROM reserva WHERE cliente_id = $1 ORDER BY fecha_hora',
    [clienteId],
  );
  return rows.map(filaAReserva);
}

// Actualiza SOLO si la reserva sigue en un estado editable.
// Si otro proceso la canceló o activó un instante antes, devuelve null.
export async function actualizarDatosReserva(
  db: Ejecutor,
  id: string,
  cambios: CambiosReserva,
): Promise<Reserva | null> {
  const columnas: Record<string, string> = {
    origen: 'origen',
    destino: 'destino',
    tipoVehiculo: 'tipo_vehiculo',
    fechaHora: 'fecha_hora',
    zonaHoraria: 'zona_horaria',
    tarifaEstimada: 'tarifa_estimada',
  };
  const sets: string[] = [];
  const valores: unknown[] = [id];
  for (const [campo, valor] of Object.entries(cambios)) {
    if (valor === undefined || !columnas[campo]) continue;
    valores.push(valor);
    sets.push(`${columnas[campo]} = $${valores.length}`);
  }
  const { rows } = await db.query(
    `UPDATE reserva SET ${[...sets, 'modificada_en = now()'].join(', ')}
     WHERE id = $1 AND estado IN ('PENDIENTE', 'CONFIRMADA')
     RETURNING *`,
    valores,
  );
  return rows[0] ? filaAReserva(rows[0]) : null;
}

// Cancela SOLO si la reserva sigue en un estado editable (si no, devuelve null).
// El motivo NO se guarda acá: va al historial.
export async function cancelarReservaEnBase(db: Ejecutor, id: string): Promise<Reserva | null> {
  const { rows } = await db.query(
    `UPDATE reserva SET estado = 'CANCELADA', modificada_en = now()
     WHERE id = $1 AND estado IN ('PENDIENTE', 'CONFIRMADA')
     RETURNING *`,
    [id],
  );
  return rows[0] ? filaAReserva(rows[0]) : null;
}