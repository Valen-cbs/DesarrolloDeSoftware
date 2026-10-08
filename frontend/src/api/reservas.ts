import type { Reserva, NuevaReserva, ErrorApi } from '../types';

const API_URL = import.meta.env.VITE_API_URL;
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export class ApiError extends Error {
    status: number;
    constructor(status: number, mensaje: string) {
        super(mensaje);
        this.status = status;
    }
}

interface ReservasApi {
    listar(clienteId: string): Promise<Reserva[]>;
    crear(datos: NuevaReserva): Promise<Reserva>;
    cancelar(id: string, motivo: string): Promise<Reserva>;
}

// ---------- Backend real ----------
async function pedir<T>(ruta: string, opciones?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${API_URL}${ruta}`, {
            headers: { 'Content-Type': 'application/json' },
            ...opciones,
        });
    } catch {
        throw new ApiError(0, 'No se pudo conectar con el servidor');
    }

    if (!res.ok) {
        let mensaje = `Error ${res.status}`;
        try {
            const err: ErrorApi = await res.json();
            if (err.mensaje) mensaje = err.mensaje;
        } catch {
            // la respuesta no trajo JSON
        }
        throw new ApiError(res.status, mensaje);
    }
    return res.json() as Promise<T>;
}

const real: ReservasApi = {
    listar: (clienteId) =>
        pedir<Reserva[]>(`/reservas?clienteId=${encodeURIComponent(clienteId)}`),
    crear: (datos) =>
        pedir<Reserva>('/reservas', { method: 'POST', body: JSON.stringify(datos) }),
    cancelar: (id, motivo) =>
        pedir<Reserva>(`/reservas/${id}/cancelar`, {
            method: 'POST',
            body: JSON.stringify({ motivo }),
        }),
};

// ---------- Simulación (mientras no hay backend) ----------
let reservasMock: Reserva[] = [];
const esperar = () => new Promise((r) => setTimeout(r, 500));

const mock: ReservasApi = {
    async listar(clienteId) {
        await esperar();
        return reservasMock.filter((r) => r.clienteId === clienteId);
    },
    async crear(datos) {
        await esperar();
        const minimo = Date.now() + 60 * 60 * 1000; // 60 minutos de anticipación
        if (new Date(datos.fechaHora).getTime() < minimo) {
            throw new ApiError(422, 'La reserva debe hacerse con al menos 60 minutos de anticipación');
        }
        const nueva: Reserva = {
            ...datos,
            id: crypto.randomUUID(),
            estado: 'CONFIRMADA',
            tarifaEstimada: 4500,
        };
        reservasMock = [nueva, ...reservasMock];
        return nueva;
    },
    async cancelar(id, motivo) {
        await esperar();
        const r = reservasMock.find((x) => x.id === id);
        if (!r) throw new ApiError(404, 'La reserva no existe');
        if (r.estado === 'CANCELADA' || r.estado === 'ACTIVADA') {
            throw new ApiError(409, `No se puede cancelar una reserva ${r.estado}`);
        }
        const cancelada: Reserva = { ...r, estado: 'CANCELADA', motivoCancelacion: motivo };
        reservasMock = reservasMock.map((x) => (x.id === id ? cancelada : x));
        return cancelada;
    },
};

export const reservasApi: ReservasApi = USE_MOCK ? mock : real;