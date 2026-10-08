# Backend M9 — aporte de Persona 3

Tu parte implementa **RF-9.6 (modificar), RF-9.7 (cancelar) y RF-9.12 (endpoint del historial)**. Sus pruebas controlan el contrato de esas rutas (RNF-03), las reglas propias (RNF-07) y su uso de transacciones y bloqueo (RNF-08).

## Cómo probar tu parte

Necesitás Node.js 24 o superior y npm. Desde la carpeta del repositorio:

```bash
cd backend
npm ci
npm run typecheck
npm test
```

`typecheck` verifica los tipos del código y de las pruebas; `test` ejecuta únicamente las pruebas de Persona 3. No necesitás Docker, una base de datos, un `.env` ni credenciales para correrlas.

Los repositorios, las validaciones comunes y M4/M7 están simulados **solo dentro del test**. Se prueban las rutas HTTP con Express/Supertest, sus respuestas, las reglas del servicio, la auditoría y el comportamiento ante fallos y pedidos concurrentes. Esto no verifica el SQL ni los bloqueos reales de PostgreSQL; esa comprobación se hace al integrar la infraestructura de Persona 1.

## Los archivos

| Archivo | Para qué sirve |
| --- | --- |
| `src/modificarCancelar.ts` | Reglas, servicio y controladores de las tres rutas. También declara qué funciones compartidas necesita recibir. |
| `tests/modificarCancelar.test.ts` | Todas las pruebas propias y sus dobles de prueba. |
| `requests.http` | Pedidos manuales de tus tres operaciones, para usar una vez integrado el servidor. |
| `package.json`, `package-lock.json`, `tsconfig.json` | Configuración mínima para instalar dependencias, comprobar TypeScript y ejecutar estas pruebas. Al integrar, se combinan con la configuración común. |

## Cómo funciona

**Modificar:** acepta únicamente `origen`, `destino`, `tipoVehiculo`, `fechaHora` y `zonaHoraria`, con al menos un campo. Reutiliza las validaciones de Persona 2. Solo permite reservas PENDIENTES o CONFIRMADAS sin despacho asociado. Si a la fecha original le falta menos de la anticipación mínima, responde 422; si cambia la fecha, valida también la nueva ventana. Los valores de anticipación se reciben de la configuración común, por ejemplo 60 minutos y 30 días.

Cuando cambia origen, destino o vehículo, consulta cobertura a M4 y tarifa a M7. Una reprogramación o cambio de zona conserva la tarifa. Si el pedido repite los valores actuales, devuelve la reserva sin escribir otro evento. Un cambio efectivo guarda la reserva y un evento MODIFICADA con actor, valores anteriores y nuevos, usando la misma transacción.

**Cancelar:** exige `motivo` de entre 3 y 1000 caracteres, quitando espacios en los extremos. Aplica las mismas reglas de estado y despacho, sin el límite de la última hora que corresponde a modificar. Guarda CANCELADA, el motivo y su evento de historial en la misma transacción. No calcula cargos ni implementa pagos.

**Historial:** comprueba que la reserva exista y devuelve todos los eventos recibidos del repositorio compartido, incluso los generados por las otras personas. El repositorio de Persona 1 debe devolverlos en orden por fecha e identificador.

## Qué aporta cada persona

| Persona | Trabajo que se recibe al integrar |
| --- | --- |
| 1 | Servidor, conexión/pool, configuración, modelo común, repositorios, SQL de reservas e historial, errores y middleware comunes, actor y contrato OpenAPI. |
| 2 | Crear, consultar y listar; validaciones comunes; adaptadores o stubs M4 y M7 que tu servicio reutiliza. |
| 3 — vos | Modificar, cancelar, endpoint del historial, reglas de estado, pedidos HTTP y pruebas propias. |
| 4 | Activación sin duplicados y base común de pruebas. No se implementa activación en este aporte. |

**La base de datos se conecta una sola vez en la infraestructura compartida.** Tu servicio recibe ese pool y los repositorios: no crea tablas, conexiones ni otra base.

## Cómo integrarlo y ejecutarlo con el equipo

Esta entrega es una parte del backend, no un servidor independiente: por eso no tiene `npm start` ni `npm run dev`. Para levantar la API necesitás integrar el servidor y los repositorios de Persona 1 y las funciones comunes de Persona 2. Después se utiliza el comando de arranque que defina Persona 1, sin agregar Docker a tu trabajo.

`crearServicioPersona3(dependencias)` recibe las funciones detalladas en la interfaz `Dependencias`. Los nombres coinciden con los de la guía; si el equipo usa otros nombres o modelos, se adaptan al pasar las dependencias. Los tipos de este archivo describen los datos mínimos que necesita tu servicio, no reemplazan el modelo compartido.

En el servidor compartido, luego de importar las funciones existentes de Personas 1 y 2, el montaje es:

```ts
import { crearServicioPersona3, crearRutasPersona3 } from './modificarCancelar';

const persona3 = crearServicioPersona3({
  pool, transaccion, config, errores,
  buscarReservaPorId, actualizarDatosReserva, cancelarReservaEnBase,
  registrarHistorial, listarHistorial,
  validaciones, consultarRuta, estimarTarifa,
});

// app, actorDe y manejarErrores son los componentes compartidos de Persona 1.
app.use(express.json());
app.use('/reservas', crearRutasPersona3(persona3, actorDe));
// Mantener aquí también las rutas de Personas 2 y 4.
app.use(manejarErrores);
```

El ejemplo muestra el montaje; las dependencias se importan de los archivos que entregue el equipo. `validaciones` agrupa `esTextoConContenido`, `esTipoVehiculoValido`, `esZonaHorariaValida`, `convertirFecha` y `validarVentana`. El servidor debe usar Express 5, que entrega automáticamente los errores asíncronos al middleware común. Reemplazá las rutas provisorias de Persona 3 para que no queden registradas dos veces.

Para RNF-08, `transaccion` debe hacer commit/rollback y `buscarReservaPorId(db, id, true)` debe bloquear la fila con `SELECT ... FOR UPDATE`. Lectura, actualización e historial deben usar el mismo cliente transaccional. Los UPDATE deben comprobar estado editable y ausencia de despacho, y devolver `null` si ya no corresponde modificar/cancelar; tu servicio convierte ese resultado en 409. Persona 4 debe coordinar su activación sobre la misma fila para no pisarse. Estos requisitos pertenecen a la integración con los repositorios, no se simulan en producción.

Cuando llegue lo de Persona 2, se conservan sus funciones y rutas; se pasan sus validaciones y M4/M7 a tu servicio. No se reemplaza su trabajo ni se crea un segundo servidor. La creación de reservas para la demo se hace con su endpoint; luego usás el UUID existente en `requests.http`.

## Contrato de tus rutas

| Método y ruta | Respuesta correcta |
| --- | --- |
| `PATCH /reservas/:id` | 200 con la reserva actualizada. |
| `POST /reservas/:id/cancelar` | 200 con la reserva cancelada. |
| `GET /reservas/:id/historial` | 200 con un arreglo de eventos. |

Se usan los errores compartidos: 400 para formato/campos inválidos, 404 para reserva inexistente, 409 para estado incompatible o conflicto al guardar, 422 para reglas temporales/cobertura, 503 si falla M4/M7. El middleware común responde `{ codigo, mensaje, detalle }`. Las fechas se serializan como ISO 8601. `X-Actor` sigue siendo una etiqueta de auditoría de esta entrega, gestionada por la utilidad compartida.

El contrato OpenAPI/Swagger del backend completo se mantiene con Persona 1 y Bloque 1. Este aporte controla sus tres rutas y no instala Swagger ni redefine las rutas ajenas.
