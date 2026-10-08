import { describe, expect, it } from 'vitest';
import { ESTADOS } from '../src/models/reserva';
import { esEditable } from '../src/reglas/estados';
import { convertirFecha, esZonaHorariaValida, validarModificacion, validarMotivo, validarVentana } from '../src/validaciones/reserva.validaciones';

describe('Reglas y fechas de Persona 3', () => {
  it.each(ESTADOS)('editabilidad de %s', estado => {
    expect(esEditable(estado)).toBe(['PENDIENTE', 'CONFIRMADA'].includes(estado));
  });
  it('acepta el instante UTC usado por el frontend y una zona IANA independiente', () => {
    expect(convertirFecha('2026-10-23T09:00:00.000Z')?.toISOString()).toBe('2026-10-23T09:00:00.000Z');
    expect(esZonaHorariaValida('America/Argentina/Buenos_Aires')).toBe(true);
  });
  it.each(['2026-02-30T09:00:00Z', '2026-10-23', '2026-10-23T09:00:00', 'mañana', '2026-13-01T09:00:00Z'])('rechaza fecha inválida %s', fecha => {
    expect(convertirFecha(fecha)).toBeNull();
  });
  it('normaliza un offset explícito al mismo instante UTC', () => {
    expect(convertirFecha('2026-10-23T06:00:00-03:00')?.toISOString()).toBe('2026-10-23T09:00:00.000Z');
  });
  it('respeta ambos extremos inclusivos de la ventana', () => {
    const ahora = new Date('2026-10-08T12:00:00Z');
    expect(validarVentana(new Date(ahora.getTime() + 60 * 60_000), ahora)).toBeNull();
    expect(validarVentana(new Date(ahora.getTime() + 60 * 60_000 - 1), ahora)).not.toBeNull();
    expect(validarVentana(new Date(ahora.getTime() + 30 * 86_400_000), ahora)).toBeNull();
    expect(validarVentana(new Date(ahora.getTime() + 30 * 86_400_000 + 1), ahora)).not.toBeNull();
  });
  it.each([null, [], {}, { estado: 'ACTIVADA' }, { clienteId: 'otro' }, { tarifaEstimada: 0 }, { origen: ' ' }])('rechaza PATCH inválido %j', cuerpo => {
    expect(() => validarModificacion(cuerpo)).toThrow();
  });
  it('permite cambiar la zona manteniendo el instante de la fecha', () => {
    expect(validarModificacion({ zonaHoraria: 'UTC' })).toEqual({ zonaHoraria: 'UTC' });
  });
  it.each(['', 'a', 'ab', '  ab  '])('rechaza motivo corto %j', motivo => {
    expect(() => validarMotivo({ motivo })).toThrow();
  });
  it('acepta tres caracteres y elimina espacios exteriores', () => {
    expect(validarMotivo({ motivo: '  abc  ' })).toBe('abc');
  });
});
