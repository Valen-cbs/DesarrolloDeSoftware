# Backend M9 — versión compacta

Este backend está escrito en **TypeScript** y agrupa la implementación en **cuatro archivos fuente**. Tu parte como Persona 3 permite modificar, cancelar y consultar el historial. Se conserva una base de referencia para crear, consultar, listar y activar, para poder probar el flujo completo mientras se integran los aportes del equipo.

## 1. Descargar y preparar

Necesitás Git, **Node 24 o superior**, npm y Docker con Compose para PostgreSQL local.

```bash
git clone --branch back/persona3 --single-branch https://github.com/Valen-cbs/DesarrolloDeSoftware.git
cd DesarrolloDeSoftware/backend
node --version
cp .env.example .env
npm ci
```

Si ya tenés el repositorio, entrá en él y ejecutá `git fetch origin`, `git switch back/persona3`, `git pull --ff-only` y después `cd backend`. No hace falta cambiar a main.

Todos los comandos siguientes se ejecutan desde **backend**. `.env` contiene tu configuración local y no se sube a Git; `.env.example` es la plantilla.

## 2. Levantar PostgreSQL local

```bash
docker compose --profile test up -d --wait db-test
```

Inicia PostgreSQL en el puerto **5433** de tu computadora e inicializa las dos tablas de `schema.sql` cuando la base es nueva. No se conecta a Supabase.

La configuración de ejemplo ya coincide con esta base:

```dotenv
DATABASE_URL=postgresql://m9:m9_local@localhost:5433/m9_test
TEST_DATABASE_URL=postgresql://m9:m9_local@localhost:5433/m9_test
DB_SSL=false
```

`DATABASE_URL` la usa la aplicación; `TEST_DATABASE_URL`, las pruebas. Los valores de ejemplo son para desarrollo local. **m9_test es una base descartable**: las pruebas limpian sus reservas e historial. El archivo SQL se ejecuta al inicializar una base nueva, no al arrancar Express.

## 3. Ejecutar el servidor

```bash
npm run dev
```

Dejá la terminal abierta. `tsx watch` ejecuta `src/server.ts` y reinicia el servidor cuando guardás cambios.

Abrí:

- http://localhost:3000/health — comprueba la conexión a PostgreSQL.
- http://localhost:3000/docs — muestra Swagger y permite probar endpoints.
- http://localhost:3000/openapi.json — devuelve el contrato de la API.

Si `/health` responde 200 con `persistencia: "ok"`, la conexión funciona. Si responde 503, revisá que `db-test` esté iniciado y que `.env` use el host y puerto correctos.

Para detener Express: **Ctrl+C**. Para detener la base: `docker compose --profile test stop db-test`.

## 4. Probar tu trabajo

En VS Code, instalá REST Client y abrí `requests.http`. Ejecutá **Send Request** en el orden numerado. Los ejemplos generan fechas futuras y capturan automáticamente el UUID de las reservas creadas.

La demo crea una reserva, la consulta, modifica vehículo y fecha, muestra el historial, la activa y comprueba los rechazos posteriores. Después crea otra reserva para demostrar una cancelación exitosa.

| Tus endpoints — Persona 3 | Función |
|---|---|
| `PATCH /reservas/{id}` | Modificar campos permitidos o reprogramar. |
| `POST /reservas/{id}/cancelar` | Cancelar con motivo de al menos tres caracteres. |
| `GET /reservas/{id}/historial` | Consultar eventos ordenados, sin borrarlos. |

Copiá el UUID real devuelto al crear: el id no es un número. Con Swagger, ejecutá primero `POST /reservas`, copiá `id` y usalo en las otras operaciones.

## 5. Cómo está dividido el código

Las cuatro personas trabajan dentro de **un mismo servicio M9**, con un mismo Express y su persistencia. El reparto asigna responsabilidades; no crea cuatro servidores ni cuatro bases.

| Archivo | Contenido |
|---|---|
| `src/server.ts` | Express, rutas, controladores HTTP, CORS y manejo de errores. |
| `src/types.ts` | Interfaz Reserva, tipos, validaciones y reglas de estado. |
| `src/db.ts` | Configuración, pool, transacciones y consultas SQL. |
| `src/reservas.ts` | Casos de uso y stubs temporales, señalados por persona. |

Una petición entra por `server.ts`, que obtiene sus datos y llama a una función de `reservas.ts`. Esa función aplica reglas de `types.ts` y usa `db.ts` para leer o guardar. Las responsabilidades siguen separadas, aunque se agrupan las funciones pequeñas en menos archivos.

### División entre las personas

| Persona | Responsabilidad | Ubicación en esta versión |
|---|---|---|
| 1 | Estructura, conexión, Docker, errores y SQL del historial. | `db.ts`, infraestructura de `server.ts`, `schema.sql`, Dockerfile y Compose. |
| 2 | Crear, consultar, listar; validaciones y stubs M2/M4/M7. | Sección Persona 2 de `reservas.ts`, validaciones de `types.ts` y objeto `stubs`. |
| **3 — vos** | **Modificar, cancelar, consultar historial y probar esas operaciones.** | **Sección Persona 3 de `reservas.ts`, reglas de estado y las tres rutas correspondientes.** |
| 4 | Activación sin duplicados, stub M5 y base de pruebas. | Sección Persona 4 de `reservas.ts`, stub M5 y preparación de integración en las pruebas. |

Para empezar con tu parte, buscá **`// Persona 3` en `src/reservas.ts`**. Tus funciones son `modificarReserva`, `cancelarReserva` y `obtenerHistorial`; sus controladores están agrupados en `server.ts`.

Persona 1 prepara las tablas y consultas del historial. Vos las utilizás: registrás modificación/cancelación y exponés su consulta. Persona 2 registra la creación y Persona 4 la activación. También te corresponde controlar con Bloque 1 que OpenAPI coincida con tus operaciones.

Las partes de Personas 1/2/4 son una base de referencia, porque no existía backend al crear esta rama. Cuando entren sus PR, hay que conciliar los archivos compartidos. Esta estructura compacta mantiene el reparto de la guía.

## 6. Cómo funcionan tus operaciones

- Modificar y cancelar solo admiten PENDIENTE o CONFIRMADA, sin activación iniciada. Los otros estados responden 409.
- Se modifica cuando faltan al menos los minutos configurados para el viaje: 60 por defecto. La nueva fecha debe respetar la ventana máxima: 30 días por defecto.
- Cambiar recorrido o vehículo recalcula cobertura y tarifa. Cambiar solo fecha o zona no recalcula tarifa.
- Fecha UTC y zona IANA de Buenos Aires pueden combinarse. Las fechas inexistentes se rechazan.
- Cancelar exige motivo; esta entrega no agrega un límite temporal de cancelación ni calcula cargos.
- Cambio e historial se guardan en una misma transacción: si falla el historial, se revierte el cambio.
- Cada modificación registra valores anteriores y nuevos. Si no hay cambios reales, no se agrega un evento.

Se lee con **SELECT FOR UPDATE dentro de la transacción**. Otro pedido que quiera cambiar la misma reserva espera y después verifica sus datos y estado actualizados. Esto evita calcular una tarifa con datos viejos cuando llegan dos modificaciones simultáneas.

La activación usa una intención persistente (`activacion_iniciada`) y una clave M5 estable. Ante una respuesta incierta, modificar y cancelar siguen bloqueados; repetir activar permite recuperar la operación. Esa columna interna debe conciliarse con Bloque 2 antes de aplicar el esquema a Supabase.

## 7. Ejecutar las pruebas

```bash
npm run typecheck
npm run test:unit
npm run validate:api
npm test
```

`typecheck` verifica tipos; `test:unit` verifica validaciones sin conexión a la base; `validate:api` valida OpenAPI. Para `npm test`, PostgreSQL debe estar encendido y `TEST_DATABASE_URL` configurada.

Todo está agrupado en **`tests/reservas.test.ts`**, con secciones de validación, contrato, modificación/cancelación y activación. La integración usa PostgreSQL real y verifica bloqueos, rollback, errores e historial. Antes de limpiar tablas, restringe el destino a una base local llamada `m9_test`.

Esta versión se verificó con **65 pruebas aprobadas** y compilación TypeScript. El contenedor Docker debe verificarse en un equipo con Docker disponible.

## 8. Compilar

```bash
npm run build
npm start
```

Detené antes `npm run dev` para liberar el puerto 3000. TypeScript genera JavaScript en `dist/` para que Node lo ejecute. **Se edita el código `.ts`; `dist/` no se sube a Git.** No hay scripts fuente `.js` o `.cjs` en esta versión.

## 9. Supabase y contenedor del backend

Para Supabase, reemplazá `DATABASE_URL` por la conexión acordada y configurá `DB_SSL=true`. Conservá `TEST_DATABASE_URL` apuntando a la base local. El backend no aplica SQL al arrancar: Persona 1/Bloque 2 deben revisar y preparar las tablas con el esquema acordado.

Para ejecutar también Express en un contenedor, usá una URL accesible **desde ese contenedor**. Para `db-test`, el host es `db-test` y el puerto **5432**, en lugar de localhost:5433:

```dotenv
DATABASE_URL=postgresql://m9:m9_local@db-test:5432/m9_test
DB_SSL=false
```

Después:

```bash
docker compose --profile test up -d --wait db-test
docker compose up --build -d backend
docker compose logs -f backend
```

Para volver a `npm run dev` en tu computadora, restaurá `DATABASE_URL` a localhost:5433. Las pruebas ejecutadas desde tu terminal siguen usando localhost:5433 en `TEST_DATABASE_URL`.

## 10. Simulaciones, integración y errores comunes

Un **stub** imita otro módulo para poder trabajar sin su API real. El objeto `stubs` en `reservas.ts` simula clientes, cobertura, tarifas y despacho. El recorrido es fijo: AUTO estima 4750 y MOTO 3500. No se consultan tablas de otros módulos.

M5 deduplica solicitudes por clave en memoria y cuenta intentos por separado para detectar llamadas duplicadas. El servicio real deberá persistir las claves y resultados para mantener la garantía entre reinicios. La activación de esta entrega es manual; no hay recuperación automática.

`X-Actor` es una etiqueta de auditoría, no autenticación. Login, permisos reales, recordatorios, vencimiento automático, scheduler, mensajería y cargos quedan fuera de esta base.

El frontend de `front/pantalla` debe alinear `id` a string UUID, `creadaEn` a `creadoEn` y agregar `modificadoEn`. Sus URLs de crear/listar/cancelar y las fechas enviadas son compatibles. Esta corrección no modifica esa rama ni main.

| Problema | Qué revisar |
|---|---|
| Conexión rechazada o health 503 | Base iniciada, URL y puerto de `.env`. |
| Tabla inexistente | Inicialización de `schema.sql` en la base utilizada. |
| Puerto 3000 ocupado | Otra instancia de Express; detenela antes de arrancar. |
| 400 | Formato de datos, UUID o JSON. |
| 409 | Estado incompatible, activación pendiente o conflicto concurrente. |
| 422 | Regla de negocio: anticipación, cobertura o cliente habilitado. |
| 503 | Dependencia no disponible o timeout. |
