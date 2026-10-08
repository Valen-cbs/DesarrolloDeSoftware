export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalle: unknown = null,
  ) {
    super(mensaje);
  }
}

export const errores = {
  datosInvalidos: (detalle: string[]) => new AppError(400, 'DATOS_INVALIDOS', 'Datos inválidos', detalle),
  noEncontrada: (id: string) => new AppError(404, 'NO_ENCONTRADA', 'La reserva no existe', { id }),
  conflicto: (mensaje: string, detalle: unknown = null) => new AppError(409, 'CONFLICTO', mensaje, detalle),
  reglaIncumplida: (mensaje: string) => new AppError(422, 'REGLA_INCUMPLIDA', mensaje),
  servicioNoDisponible: (mensaje: string) => new AppError(503, 'SERVICIO_NO_DISPONIBLE', mensaje),
};
