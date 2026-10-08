-- Esquema M9 basado en anexo C. Revisar con Bloque 2 antes de aplicar a Supabase.
-- No se ejecuta automáticamente al iniciar el backend.
CREATE TABLE reservas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id TEXT NOT NULL,
  origen TEXT NOT NULL,
  destino TEXT NOT NULL,
  tipo_vehiculo TEXT NOT NULL CHECK (tipo_vehiculo IN ('AUTO', 'MOTO')),
  fecha_hora TIMESTAMPTZ NOT NULL,
  zona_horaria TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'ACTIVADA', 'VENCIDA')),
  tarifa_estimada NUMERIC(12,2) CHECK (tarifa_estimada >= 0),
  motivo_cancelacion TEXT,
  solicitud_despacho_id TEXT UNIQUE,
  -- Intención persistente: bloquea cambios/cancelaciones mientras se recupera una activación incierta.
  activacion_iniciada BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (estado <> 'CANCELADA' OR length(btrim(motivo_cancelacion)) >= 3 AND motivo_cancelacion IS NOT NULL),
  CHECK ((estado = 'ACTIVADA') = (solicitud_despacho_id IS NOT NULL)),
  CHECK (NOT activacion_iniciada OR estado = 'CONFIRMADA')
);

CREATE TABLE historial_reservas (
  id BIGSERIAL PRIMARY KEY,
  reserva_id UUID NOT NULL REFERENCES reservas(id) ON DELETE RESTRICT,
  accion TEXT NOT NULL,
  estado_anterior TEXT,
  estado_nuevo TEXT NOT NULL,
  actor TEXT NOT NULL,
  motivo TEXT,
  detalle JSONB,
  fecha TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_reservas_cliente_fecha ON reservas (cliente_id, fecha_hora, id);
CREATE INDEX idx_historial_reserva_fecha ON historial_reservas (reserva_id, fecha, id);
