# Verificación de esta rama

Validaciones realizadas antes de publicar: **64 pruebas aprobadas en cuatro archivos Vitest**.

- Instalación desde lockfile y compilación TypeScript estricta/CommonJS.
- Validación estructural de `api/openapi.yaml` con Swagger Parser.
- Pruebas Vitest unitarias y HTTP contra PostgreSQL 16.4 local, en una base aislada `m9_test`.
- Pruebas de bloqueos reales: dos PATCH simultáneos, modificación esperando una cancelación, cancelación contra activación y diez activaciones concurrentes.
- Rollback de modificación/cancelación si falla el historial.
- Recuperación de activación ante respuesta perdida, timeout de M5, intención persistida y fallo del historial posterior al efecto externo.
- Contrato HTTP: UUID, nombres de campos, tipos numéricos, fechas, errores comunes, CORS con X-Actor, health y documentación.
- Prueba HTTP del backend compilado: salud, crear, consultar, listar, modificar, historial, activación, reintento y cancelación válida/rechazada.

No se conectó ni se modificó Supabase. No se probaron las APIs reales de otros módulos. Dockerfile y Compose quedan preparados; la ejecución del contenedor debe verificarse en un entorno con Docker.

La prueba de intención persistida reproduce un estado de recuperación, no es una prueba distribuida con procesos reales M5/M9 reiniciándose. El stub M5 conserva claves en memoria; el servicio real deberá persistirlas.
