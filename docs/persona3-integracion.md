# Integración y revisión de Persona 3

## Contrato adoptado

La guía nueva propone dos tablas: `reservas` (UUID) e `historial_reservas` (BIGSERIAL con reserva UUID). Esta rama sigue esa propuesta. No reutiliza el modelo previo de cinco tablas con IDs BIGINT. El DDL es una propuesta versionada para conciliar con Bloque 2; no se aplicó a Supabase.

Los modelos exponen `creadoEn` y `modificadoEn`, importe numérico, fecha ISO al serializar, estado `VENCIDA` y errores `{codigo,mensaje,detalle}` con detalle null cuando no hay información. El router se monta una sola vez en `/reservas`.

## Corrección del PATCH concurrente

Leer antes de iniciar la transacción permite que dos pedidos calculen tarifas sobre un vehículo desactualizado. El UPDATE condicional por estado no detecta ese problema porque ambos mantienen CONFIRMADA.

Se lee con `SELECT FOR UPDATE` dentro de la misma transacción y conexión; luego se validan el estado y fecha vigentes, se calcula la tarifa sobre esos datos, se actualiza y se inserta el historial. Modificación, cancelación y activación deben respetar el mismo bloqueo. La condición del UPDATE sigue siendo una defensa adicional.

Los stubs son locales y los tiempos de integración están acotados. Con integraciones reales, evaluar control por versión para no mantener bloqueos durante llamadas de red. Cualquier versionado deberá incluir a todos los escritores; no agregarlo solo al PATCH.

La fecha límite exacta se admite. La fecha nueva respeta ambos extremos de la ventana. UTC con una zona IANA de Buenos Aires es válido: la fecha es el instante y la zona es información de presentación. Las fechas imposibles como 30 de febrero se rechazan. Un cambio exclusivo de zona conserva el instante.

## Historial

Cada modificación registra un evento con diferencias `{anterior,nuevo}` por campo y actor. Se conservan los valores leídos bajo bloqueo. Un PATCH sin cambios efectivos no agrega eventos. Cancelar guarda motivo y estado junto con su evento; un fallo del historial revierte la operación. Historial solo usa INSERT y SELECT en la aplicación, ordenados por fecha e id.

## Activación e interacción con cancelar

La activación de referencia incorpora una columna interna `activacion_iniciada` (no aparece en las respuestas API). Esta extensión respecto del anexo C debe revisarse con Personas 1/4 y Bloque 2.

1. Bajo bloqueo, se registra y confirma una intención de activación persistente.
2. Modificar/cancelar rechazan con 409 mientras exista esa intención, incluso si M9 recibió 503.
3. Una segunda transacción bloquea la reserva y llama a M5 usando la clave estable `reserva:{UUID}`.
4. Estado ACTIVADA, solicitud vinculada, eliminación del indicador e historial se guardan juntos.
5. Un error deja la intención persistente. Repetir activar permite recuperar la operación con la misma clave; no devuelve automáticamente la reserva a un estado modificable con efectos externos inciertos.

Si M5 creó la solicitud pero se perdió la respuesta o falló el historial, la siguiente llamada reutiliza esa solicitud. Si el proceso se corta antes de contactar M5, el indicador persistente permite retomarlo. Ninguna reserva queda confirmada como ACTIVADA sin solicitud vinculada.

El stub registra intentos y solicitudes por separado: diez activaciones concurrentes deben dar exactamente un intento y una solicitud. Así, su deduplicación no oculta múltiples llamadas del backend. Pruebas adicionales verifican respuesta perdida, fallo del historial y cancelación durante activación.

La garantía entre reinicios de M5 depende de que el M5 real persista las claves, sus datos asociados y sus resultados. El mapa del stub no ofrece esa persistencia y no es un servicio de despacho de producción. Tampoco hay recuperación automática: en TP1 se utiliza el endpoint manual.

## Diferencia con el frontend existente

La rama `front/pantalla` se leyó como referencia y no se modificó ni se incorporó a esta rama. A fecha de esta integración:

| Frontend actual | Contrato de esta rama | Ajuste al integrar frontend |
|---|---|---|
| `Reserva.id: number` | UUID `string` | Cambiar tipos de id y firma cancelar a string. |
| `creadaEn` | `creadoEn` y `modificadoEn` | Actualizar tipos y cualquier uso de fechas de creación. |
| `ErrorApi.detalle?: string` | detalle presente, null/objeto/lista | Declarar `detalle: unknown` o un tipo equivalente. |
| Mock con IDs numéricos | IDs UUID | Usar `crypto.randomUUID()` en el mock. |
| Tarifa mock AUTO 4500 | Stub de guía AUTO 4750 | Alinear simulación o mostrar siempre el importe del backend. |

Los endpoints crear/listar/cancelar mantienen las URLs que el frontend ya utiliza. Su fecha en `toISOString()` y zona IANA se admiten. CORS acepta Content-Type y X-Actor.

## Propiedad de archivos

Los cinco archivos centrales de Persona 3 siguen la guía. La base adicional permite ejecutarlos porque no existía backend en el repositorio. Al integrar los PR de Personas 1/2/4, preservar el contrato y las invariantes probadas, conciliando sus archivos compartidos. No considerar esta rama una sustitución de sus responsabilidades.

El paquete anterior independiente no se copió al repositorio: se adaptaron sus ideas a CommonJS, Vitest, UUID y el esquema nuevo. Node_modules, dist y credenciales quedan excluidos de Git.
