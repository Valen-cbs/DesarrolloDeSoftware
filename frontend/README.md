# Frontend — M9 Reservas de Viajes

Pantalla en React para crear, listar y cancelar reservas de viajes.
Forma parte del módulo **M9** del TPI de Desarrollo de Software 2026 (Grupo 9).

**Responsable:** Lara Wolman (Bloque 4)

## Tecnologías

- React + TypeScript
- Vite (servidor de desarrollo y build)
- ESLint

## Cómo ejecutarlo

Requisitos: Node.js LTS.

```bash
cd frontend
npm install
copy .env.example .env      # en Mac/Linux: cp .env.example .env
npm run dev
```

Abrir http://localhost:5173

## Variables de entorno

| Variable | Ejemplo | Para qué sirve |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | Dirección del backend de M9 |
| `VITE_USE_MOCK` | `true` | `true`: usa datos simulados. `false`: usa el backend real |

El archivo `.env` no se sube al repositorio; se crea copiando `.env.example`.

## Modo demo y modo real

- **Modo demo** (`VITE_USE_MOCK=true`): no necesita backend ni Docker. Las reservas se guardan en memoria y se borran al recargar la página. Simula la validación de anticipación mínima (60 minutos) y los errores 404 y 409.
- **Modo real** (`VITE_USE_MOCK=false`): llama al backend de M9. Requiere que el backend esté corriendo (`docker compose up` en la raíz) y tenga CORS habilitado para `http://localhost:5173`.

## Qué hace la pantalla

- Formulario de nueva reserva: origen, destino, tipo de vehículo (AUTO/MOTO), fecha y hora. La zona horaria se toma del navegador.
- Lista de reservas del cliente con su estado (PENDIENTE, CONFIRMADA, CANCELADA, ACTIVADA, VENCIDA).
- Cancelación con motivo. No se permite cancelar reservas ACTIVADAS, CANCELADAS o VENCIDAS.
- Mensajes claros de "Guardando…", "Reserva creada" y error con el motivo que devuelve la API (RNF-15).

Requerimientos que cubre desde la interfaz: RF-9.1 (crear reserva), RF-9.5 (consultar reservas) y RF-9.7 (cancelar con motivo).

## Endpoints que usa

| Método y ruta | Uso |
|---|---|
| `GET /reservas?clienteId=` | Listar las reservas del cliente |
| `POST /reservas` | Crear una reserva |
| `POST /reservas/{id}/cancelar` | Cancelar con `{ "motivo": "..." }` |

Formato de error esperado: `{ "codigo", "mensaje", "detalle" }`. La pantalla muestra el `mensaje`.

## Campos de la reserva

Acordados con el Bloque 1. Están definidos en `src/types.ts`.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | número | |
| `clienteId` | texto | Por ahora fijo (`c-1`) hasta que exista el login (M1) |
| `origen`, `destino` | texto | |
| `tipoVehiculo` | `AUTO` \| `MOTO` | |
| `fechaHora` | texto ISO en UTC | Ej: `2026-10-23T09:00:00.000Z`. El usuario elige la hora local y se convierte a UTC al enviar |
| `zonaHoraria` | texto | Ej: `America/Argentina/Buenos_Aires` |
| `estado` | texto | Ver estados arriba |
| `tarifaEstimada` | número o vacío | Viene de M7 |
| `motivoCancelacion` | texto o vacío | |
| `solicitudDespachoId` | texto o vacío | Se completa cuando M5 crea la solicitud |
| `creadaEn` | fecha | |

## Estructura

```
src/
├── api/reservas.ts            # Única capa que habla con el backend (real o simulado)
├── components/
│   ├── FormReserva.tsx        # Formulario de nueva reserva
│   └── ListaReservas.tsx      # Lista de reservas y cancelación
├── types.ts                   # Tipos de datos (Reserva, estados, errores)
├── App.tsx                    # Pantalla principal
└── index.css                  # Estilos
```

Los componentes nunca llaman al backend directamente: todo pasa por `src/api/reservas.ts`. Para cambiar de modo demo a real alcanza con cambiar `VITE_USE_MOCK` en el `.env`.

## Pendiente

- Conectar y probar contra el backend real cuando esté disponible.
- Reemplazar el `clienteId` fijo por el usuario autenticado (cuando exista M1).
