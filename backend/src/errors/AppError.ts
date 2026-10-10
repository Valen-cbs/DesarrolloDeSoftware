export class AppError extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensaje: string,
    public detalle?: unknown,
  ) {
    super(mensaje);
  }
}

export const errores = {
  datosInvalidos: (detalle: string[]) =>
    new AppError(400, 'DATOS_INVALIDOS', 'Los datos enviados no son válidos', detalle),
  noEncontrada: (id: string) =>
    new AppError(404, 'NO_ENCONTRADA', `No existe la reserva ${id}`),
  conflicto: (mensaje: string, detalle?: unknown) =>
    new AppError(409, 'CONFLICTO', mensaje, detalle),
  reglaIncumplida: (mensaje: string, detalle?: unknown) =>
    new AppError(422, 'REGLA_INCUMPLIDA', mensaje, detalle),
  servicioNoDisponible: (mensaje: string) =>
    new AppError(503, 'SERVICIO_NO_DISPONIBLE', mensaje),
};