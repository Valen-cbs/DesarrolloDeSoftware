import { DateTime } from 'luxon';
import { errores } from '../errors/AppError';
import { CambiosReserva, DatosReserva, ESTADOS, EstadoReserva, TipoVehiculo } from '../models/reserva';

const CAMPOS = ['origen', 'destino', 'tipoVehiculo', 'fechaHora', 'zonaHoraria'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function esTextoConContenido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

export function esTipoVehiculoValido(valor: unknown): valor is TipoVehiculo {
  return valor === 'AUTO' || valor === 'MOTO';
}

export function esZonaHorariaValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || valor.length > 100) return false;
  try { new Intl.DateTimeFormat('es-AR', { timeZone: valor }); return true; } catch { return false; }
}

// El offset expresa un instante; la zona se conserva para presentación.
// UTC + America/Argentina/Buenos_Aires es un par válido.
export function convertirFecha(valor: unknown): Date | null {
  if (typeof valor !== 'string' || !ISO.test(valor)) return null;
  const fecha = DateTime.fromISO(valor, { setZone: true });
  return fecha.isValid ? fecha.toJSDate() : null;
}

export function validarVentana(
  fecha: Date, ahora: Date, minimoMinutos = 60, maximoDias = 30,
): string | null {
  const diferencia = fecha.getTime() - ahora.getTime();
  if (diferencia < minimoMinutos * 60_000) return `La reserva requiere al menos ${minimoMinutos} minutos de anticipación`;
  if (diferencia > maximoDias * 86_400_000) return `La fecha supera los ${maximoDias} días de anticipación máxima`;
  return null;
}

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw errores.datosInvalidos(['El cuerpo debe ser un objeto JSON']);
  }
  return valor as Record<string, unknown>;
}

function campos(datos: Record<string, unknown>): CambiosReserva {
  const cambios: CambiosReserva = {};
  const problemas: string[] = [];
  for (const campo of ['origen', 'destino'] as const) {
    if (campo in datos) {
      const valor = datos[campo];
      if (esTextoConContenido(valor) && valor.trim().length <= 500) cambios[campo] = valor.trim();
      else problemas.push(`${campo} debe contener entre 1 y 500 caracteres`);
    }
  }
  if ('tipoVehiculo' in datos) {
    if (esTipoVehiculoValido(datos.tipoVehiculo)) cambios.tipoVehiculo = datos.tipoVehiculo;
    else problemas.push('tipoVehiculo debe ser AUTO o MOTO');
  }
  if ('zonaHoraria' in datos) {
    if (esZonaHorariaValida(datos.zonaHoraria)) cambios.zonaHoraria = datos.zonaHoraria;
    else problemas.push('zonaHoraria debe ser una zona IANA válida');
  }
  if ('fechaHora' in datos) {
    const fecha = convertirFecha(datos.fechaHora);
    if (fecha) cambios.fechaHora = fecha;
    else problemas.push('fechaHora debe ser una fecha ISO 8601 válida con Z u offset');
  }
  if (problemas.length) throw errores.datosInvalidos(problemas);
  return cambios;
}

export function validarModificacion(cuerpo: unknown): CambiosReserva {
  const datos = objeto(cuerpo);
  const recibidos = Object.keys(datos);
  const noPermitidos = recibidos.filter(c => !CAMPOS.includes(c));
  if (!recibidos.length || noPermitidos.length) {
    throw errores.datosInvalidos(noPermitidos.length
      ? [`No se pueden modificar: ${noPermitidos.join(', ')}`]
      : ['Mandá al menos un campo modificable']);
  }
  return campos(datos);
}

export function validarCreacion(cuerpo: unknown): DatosReserva {
  const datos = objeto(cuerpo);
  const permitidos = ['clienteId', ...CAMPOS];
  const faltantes = permitidos.filter(c => !(c in datos));
  const desconocidos = Object.keys(datos).filter(c => !permitidos.includes(c));
  if (faltantes.length || desconocidos.length) {
    throw errores.datosInvalidos([
      ...faltantes.map(c => `Falta ${c}`), ...desconocidos.map(c => `Campo no permitido: ${c}`),
    ]);
  }
  if (!esTextoConContenido(datos.clienteId) || datos.clienteId.trim().length > 120) {
    throw errores.datosInvalidos(['clienteId debe contener entre 1 y 120 caracteres']);
  }
  return { clienteId: datos.clienteId.trim(), ...campos(datos) } as DatosReserva;
}

export function validarMotivo(cuerpo: unknown): string {
  const datos = objeto(cuerpo);
  if (Object.keys(datos).some(c => c !== 'motivo')) throw errores.datosInvalidos(['Solo se acepta motivo']);
  if (!esTextoConContenido(datos.motivo) || datos.motivo.trim().length < 3 || datos.motivo.trim().length > 1000) {
    throw errores.datosInvalidos(['motivo es obligatorio (entre 3 y 1000 caracteres)']);
  }
  return datos.motivo.trim();
}

export function validarId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw errores.datosInvalidos(['id debe ser un UUID']);
  }
}

export interface FiltrosReservas { clienteId?: string; estado?: EstadoReserva; limite: number; offset: number }

export function validarFiltros(query: Record<string, unknown>): FiltrosReservas {
  const problemas: string[] = [];
  if (Object.keys(query).some(c => !['clienteId', 'estado', 'limite', 'offset'].includes(c))) problemas.push('Filtro no permitido');
  if (query.clienteId !== undefined && (!esTextoConContenido(query.clienteId) || query.clienteId.length > 120)) problemas.push('clienteId inválido');
  if (query.estado !== undefined && (typeof query.estado !== 'string' || !ESTADOS.includes(query.estado as EstadoReserva))) problemas.push('estado inválido');
  const limite = Number(query.limite ?? 50);
  const offset = Number(query.offset ?? 0);
  if (query.limite !== undefined && (typeof query.limite !== 'string' || !/^\d+$/.test(query.limite))) problemas.push('limite inválido');
  if (query.offset !== undefined && (typeof query.offset !== 'string' || !/^\d+$/.test(query.offset))) problemas.push('offset inválido');
  if (!Number.isSafeInteger(limite) || limite < 1 || limite > 100) problemas.push('limite debe estar entre 1 y 100');
  if (!Number.isSafeInteger(offset) || offset < 0) problemas.push('offset debe ser un entero no negativo');
  if (problemas.length) throw errores.datosInvalidos(problemas);
  return { clienteId: query.clienteId as string | undefined, estado: query.estado as EstadoReserva | undefined, limite, offset };
}
