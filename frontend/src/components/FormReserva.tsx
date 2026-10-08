import { useState } from 'react';
import type { FormEvent } from 'react';
import { reservasApi, ApiError } from '../api/reservas';
import type { TipoVehiculo } from '../types';

interface Props {
    clienteId: string;
    onCreada: () => void;
}

type Estado = 'idle' | 'guardando' | 'ok' | 'error';

export function FormReserva({ clienteId, onCreada }: Props) {
    const [origen, setOrigen] = useState('');
    const [destino, setDestino] = useState('');
    const [tipoVehiculo, setTipoVehiculo] = useState<TipoVehiculo>('AUTO');
    const [fechaHora, setFechaHora] = useState('');
    const [estado, setEstado] = useState<Estado>('idle');
    const [mensaje, setMensaje] = useState('');

    async function enviar(e: FormEvent) {
        e.preventDefault();
        setEstado('guardando');
        setMensaje('Guardando…');
        try {
            await reservasApi.crear({
                clienteId,
                origen,
                destino,
                tipoVehiculo,
                fechaHora: new Date(fechaHora).toISOString(),
                zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
            setEstado('ok');
            setMensaje('Reserva creada');
            setOrigen('');
            setDestino('');
            setFechaHora('');
            onCreada();
        } catch (err) {
            setEstado('error');
            const motivo = err instanceof ApiError ? err.message : 'error inesperado';
            setMensaje(`No se pudo crear: ${motivo}`);
        }
    }

    return (
        <form onSubmit={enviar} className="card">
            <h2>Nueva reserva</h2>

            <label>
                Origen
                <input value={origen} onChange={(e) => setOrigen(e.target.value)} required />
            </label>

            <label>
                Destino
                <input value={destino} onChange={(e) => setDestino(e.target.value)} required />
            </label>

            <label>
                Tipo de vehículo
                <select
                    value={tipoVehiculo}
                    onChange={(e) => setTipoVehiculo(e.target.value as TipoVehiculo)}
                >
                    <option value="AUTO">Auto</option>
                    <option value="MOTO">Moto</option>
                </select>
            </label>

            <label>
                Fecha y hora
                <input
                    type="datetime-local"
                    value={fechaHora}
                    onChange={(e) => setFechaHora(e.target.value)}
                    required
                />
            </label>

            <button type="submit" disabled={estado === 'guardando'}>
                {estado === 'guardando' ? 'Guardando…' : 'Reservar'}
            </button>

            {mensaje && <p className={`mensaje ${estado}`}>{mensaje}</p>}
        </form>
    );
}