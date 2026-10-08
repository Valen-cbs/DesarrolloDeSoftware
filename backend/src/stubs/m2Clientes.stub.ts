export async function clienteHabilitado(clienteId: string): Promise<boolean> {
  return !clienteId.toLowerCase().startsWith('bloqueado');
}
