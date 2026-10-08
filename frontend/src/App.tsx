import { useEffect, useState } from 'react';
import { FormReserva } from './components/FormReserva';
import { ListaReservas } from './components/ListaReservas';
import { reservasApi, USE_MOCK } from './api/reservas';
import type { Reserva } from './types';

// Provisorio hasta que exista el login (M1).
// Cuando el Bloque 2 suba db/seed.sql, poné acá un clienteId que exista ahí.
const CLIENTE_ID = 'c-1';

export default function App() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    reservasApi
      .listar(CLIENTE_ID)
      .then((lista) => {
        setReservas(lista);
        setError('');
      })
      .catch(() => setError('No se pudieron cargar las reservas'))
      .finally(() => setCargando(false));
  }, [version]);

  const recargar = () => setVersion((v) => v + 1);

  return (
    <main className="contenedor">
      <h1>Reservas de viajes</h1>

      {USE_MOCK && (
        <p className="aviso">Modo demo: los datos son simulados y se borran al recargar.</p>
      )}

      <FormReserva clienteId={CLIENTE_ID} onCreada={recargar} />

      {cargando ? (
        <p>Cargando reservas…</p>
      ) : error ? (
        <p className="mensaje error">{error}</p>
      ) : (
        <ListaReservas reservas={reservas} onCambio={recargar} />
      )}
    </main>
  );
}