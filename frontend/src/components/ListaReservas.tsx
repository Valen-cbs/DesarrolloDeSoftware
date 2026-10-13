import { useState } from 'react';
import { reservasApi, ApiError } from '../api/reservas';
import type { Reserva } from '../types';

interface Props {
  reservas: Reserva[];
  onCambio: () => void;
}

export function ListaReservas({ reservas, onCambio }: Props) {
  const [error, setError] = useState('');
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  function abrir(id: number) {
    setCancelandoId(id);
    setMotivo('');
    setError('');
  }

  function cerrar() {
    setCancelandoId(null);
    setMotivo('');
  }

  async function confirmar(id: number) {
    if (!motivo.trim()) {
      setError('Escribí un motivo para cancelar');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await reservasApi.cancelar(id, motivo.trim());
      cerrar();
      onCambio();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'error inesperado';
      setError(`No se pudo cancelar: ${msg}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="card">
      <h2>Mis reservas</h2>
      {error && <p className="mensaje error">{error}</p>}

      {reservas.length === 0 ? (
        <p>No tenés reservas todavía.</p>
      ) : (
        <ul className="lista">
          {reservas.map((r) => {
            const noCancelable =
              r.estado === 'CANCELADA' || r.estado === 'ACTIVADA' || r.estado === 'VENCIDA';
            return (
              <li key={r.id}>
                <div>
                  <strong>
                    {r.origen} → {r.destino}
                  </strong>
                  <span>
                    {r.tipoVehiculo} · {new Date(r.fechaHora).toLocaleString('es-AR')}
                  </span>
                  {r.tarifaEstimada != null && (
                    <span>Tarifa estimada: ${r.tarifaEstimada}</span>
                  )}
                  {r.motivoCancelacion && <span>Motivo: {r.motivoCancelacion}</span>}
                </div>
                <span className={`estado ${r.estado.toLowerCase()}`}>{r.estado}</span>

                {cancelandoId === r.id ? (
                  <div className="cancelar">
                    <input
                      placeholder="Motivo de la cancelación"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      autoFocus
                    />
                    <button onClick={() => confirmar(r.id)} disabled={enviando}>
                      {enviando ? 'Cancelando…' : 'Confirmar'}
                    </button>
                    <button className="secundario" onClick={cerrar} disabled={enviando}>
                      Volver
                    </button>
                  </div>
                ) : (
                  <button onClick={() => abrir(r.id)} disabled={noCancelable}>
                    Cancelar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}