CREATE TABLE reserva (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            varchar     NOT NULL,
  origen                text        NOT NULL,
  destino               text        NOT NULL,
  tipo_vehiculo         varchar     NOT NULL CHECK (tipo_vehiculo IN ('AUTO','MOTO')),
  fecha_hora            timestamptz NOT NULL,
  zona_horaria          text        NOT NULL,
  estado                varchar     NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado IN ('PENDIENTE','CONFIRMADA','CANCELADA','ACTIVADA','VENCIDA')),
  tarifa_estimada       numeric,
  solicitud_despacho_id varchar     UNIQUE,
  clave_idempotencia    uuid        NOT NULL UNIQUE,
  creada_en             timestamptz NOT NULL DEFAULT now(),
  modificada_en         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE historial_reserva (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id       uuid        NOT NULL REFERENCES reserva(id),
  tipo_cambio      varchar     NOT NULL,
  campo_modificado varchar,
  valor_anterior   text,
  valor_nuevo      text,
  actor_id         varchar     NOT NULL,
  rol_actor        varchar     NOT NULL,
  motivo           text,
  fecha_cambio     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historial_reserva_id ON historial_reserva (reserva_id, fecha_cambio);

CREATE FUNCTION impedir_modificar_historial() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El historial no se puede modificar ni borrar';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER historial_inmutable
BEFORE UPDATE OR DELETE ON historial_reserva
FOR EACH ROW EXECUTE FUNCTION impedir_modificar_historial();