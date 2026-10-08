export async function consultarRuta(origen: string, destino: string) {
  return {
    cubierta: !`${origen} ${destino}`.toUpperCase().includes('FUERA DE ZONA'),
    distanciaKm: 12.5,
    duracionMinutos: 25,
  };
}
