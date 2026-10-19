# Frontend — M9 Reservas de Viajes

Pantalla en React para crear, listar y cancelar reservas de viajes.
Forma parte del módulo **M9** del TPI de Desarrollo de Software 2026 (Grupo 9).

**Responsable:** Lara Wolman (Bloque 4)

## Tecnologías

- React + TypeScript
- Vite (servidor de desarrollo y build)
- ESLint

## Cómo ejecutarlo

Requisitos: Node.js LTS. No hace falta Docker ni levantar el backend.

```bash
cd frontend
npm install
npm run dev
```

Abrir http://localhost:5173

Por defecto la pantalla se conecta al **backend de M9 publicado en Render** (`https://m9-reservas.onrender.com`). Si el backend estuvo un rato sin uso, la primera carga puede tardar hasta un minuto mientras el servidor se despierta: si aparece "No se pudieron cargar las reservas", esperar y recargar.

## Configuración

La dirección del backend se lee de variables de entorno (nunca está escrita en el código). Vite elige el archivo según cómo se ejecute:

| Archivo | Se sube al repo | Cuándo se usa |
|---|---|---|
| `.env.development` | Sí | `npm run dev`. Apunta al backend de Render |
| `.env.production` | Sí | `npm run build`. Apunta al backend de Render |
| `.env.development.local` | **No** | Opcional, para cambiar la configuración en tu compu. Tiene prioridad sobre los anteriores |

Variables:

| Variable | Ejemplo | Para qué sirve |
|---|---|---|
| `VITE_API_URL` | `https://m9-reservas.onrender.com` | Dirección del backend de M9 |
| `VITE_USE_MOCK` | `false` | `true`: usa datos simulados. `false`: usa el backend |

La URL del backend no es secreta. Las claves de la base de datos las maneja solo el backend y el front nunca las necesita.

### Usar otro backend o el modo demo

Crear `frontend/.env.development.local` (no se sube al repositorio):

- **Backend local** (si alguien lo levanta con `docker compose up` en la raíz):
  ```
  VITE_API_URL=http://localhost:3000
  VITE_USE_MOCK=false
  ```
- **Modo demo**, sin backend:
  ```
  VITE_USE_MOCK=true
  ```

Después de crear o cambiar ese archivo, reiniciar `npm run dev`. Para volver a Render, borrarlo.

## Modo real y modo demo

- **Modo real** (por defecto): crea, lista y cancela reservas en el backend de M9, que las guarda en la base de datos.
- **Modo demo**: no necesita backend. Las reservas se guardan en memoria y se borran al recargar. Muestra un cartel amarillo que lo indica. Simula la validación de anticipación mínima (60 minutos) y los errores 404 y 409.

## Qué hace la pantalla

- Formulario de nueva reserva: origen, destino, tipo de vehículo (AUTO/MOTO), fecha y hora. La zona horaria se toma del navegador y la fecha se envía en UTC.
- Lista de reservas del cliente con su estado (PENDIENTE, CONFIRMADA, CANCELADA, ACTIVADA, VENCIDA). La hora se muestra en formato 24 horas.
- Cancelación con motivo. No se permite cancelar reservas ACTIVADAS, CANCELADAS o VENCIDAS.
- Mensajes claros de "Guardando…", "Reserva creada" y error con el motivo que devuelve la API (RNF-15).

Requerimientos que cubre desde la interfaz: RF-9.1 (crear reserva), RF-9.5 (consultar reservas) y RF-9.7 (cancelar con motivo).

## Datos para probar

Mientras M2 (Clientes) y M4 (Ubicación) no existan, el backend usa respuestas simuladas:

- **Origen y destino:** solo se reconocen `UTN`, `Aeropuerto` y `Terminal de Ómnibus`, y tienen que ser distintos. El formulario los sugiere al escribir. Otra dirección da "No se pudieron obtener las coordenadas".
- **Fecha:** entre 1 hora y 30 días hacia adelante.
- **Cliente:** la pantalla usa `cliente_001`, que tiene reservas de prueba en la base. `CLIENTE_BLOQUEADO` se rechaza.
- **Tarifa estimada:** AUTO $5000, MOTO $3000.

## Endpoints que usa

| Método y ruta | Uso |
|---|---|
| `GET /reservas?clienteId=` | Listar las reservas del cliente |
| `POST /reservas` | Crear una reserva. Responde `{ mensaje, reserva, condiciones }` |
| `POST /reservas/{id}/cancelar` | Cancelar con `{ "motivo": "..." }` (mínimo 3 caracteres) |

Al crear, el front agrega una `claveIdempotencia` (UUID) para que, si el pedido se repite, no se cree la misma reserva dos veces.

Formato de error: `{ "codigo", "mensaje", "detalle" }`. La pantalla muestra el `mensaje`.

## Campos de la reserva

Definidos en `src/types.ts`, según lo que devuelve el backend.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | texto (UUID) | |
| `clienteId` | texto | Por ahora fijo (`cliente_001`) hasta que exista el login (M1) |
| `origen`, `destino` | objeto | `{ direccion, latitud, longitud }` y opcionales `alias`, `piso`, `indicaciones`. Al crear se envían como texto |
| `tipoVehiculo` | `AUTO` \| `MOTO` | |
| `fechaHora` | texto ISO en UTC | Ej: `2026-10-23T09:00:00.000Z` |
| `zonaHoraria` | texto | Ej: `America/Argentina/Buenos_Aires` |
| `estado` | texto | Ver estados arriba |
| `tarifaEstimada` | número o vacío | Viene de M7 |
| `motivoCancelacion` | texto o vacío | |
| `solicitudDespachoId` | texto o vacío | Se completa cuando M5 crea la solicitud |
| `creadaEn`, `modificadaEn` | fecha | |

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

Los componentes nunca llaman al backend directamente: todo pasa por `src/api/reservas.ts`.

## Pendiente

- Reemplazar el `clienteId` fijo por el usuario autenticado (cuando exista M1).
- Usar direcciones reales cuando esté la geocodificación de M4.