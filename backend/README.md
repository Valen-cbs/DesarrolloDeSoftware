# Backend M9 — aporte Persona 3

Implementa modificación, cancelación e historial siguiendo la guía de Bloque 3. Al crear esta rama el repositorio solo contenía el README inicial; se agrega una base ejecutable de referencia para probar los endpoints sin esperar los PR de las otras personas. Los archivos compartidos deben reconciliarse con sus implementaciones, no reemplazarse ciegamente.

## Ejecutar en Linux Mint o Windows

Requiere Node 24 y Docker con Compose. Desde la raíz:

```bash
cp .env.example .env
docker compose --profile test up -d --wait db-test
cd backend
npm ci
npm run dev
```

La configuración de ejemplo utiliza exclusivamente PostgreSQL local. Abrir http://localhost:3000/docs y ejecutar `requests.http` con REST Client en VS Code.

Para Supabase, cambiar `DATABASE_URL` y `DB_SSL=true` en `.env` y revisar `db/schema.sql` con Bloque 2 antes de aplicarlo. La aplicación no crea ni modifica tablas al iniciar. No se accede a tablas de M2/M4/M5/M7.

## Validar

```bash
npm run typecheck
npm run build
npm run validate:api
npm run test:unit
npm test
```

`npm test` ejecuta integración sobre `TEST_DATABASE_URL`. El helper solo permite una base llamada `m9_test` en localhost, 127.0.0.1, ::1 o db-test; comprueba su nombre real antes de limpiar tablas. Nunca usar una base compartida con datos importantes. Las pruebas observan bloqueos reales en PostgreSQL y no dependen de una lista en memoria.

## Contenedor del backend

Para Supabase: configurar `.env` con la URL externa y ejecutar `docker compose up --build -d backend` desde la raíz. Para conectar el contenedor a `db-test`, cambiar en `.env` el host/puerto de `DATABASE_URL` a `db-test:5432`, mantener `DB_SSL=false`, y levantar previamente el perfil test. El backend no depende de la base de pruebas en despliegues externos.

## Alcance

- Persona 3: `src/reglas/estados.ts`, `src/services/modificarCancelar.service.ts`, `src/controllers/modificarCancelar.controller.ts`, `tests/reservas.modificar-cancelar.test.ts`, `requests.http`.
- Infraestructura y repositorios de referencia: Persona 1.
- Crear/consultar/listar, validaciones y stubs M2/M4/M7 de referencia: Persona 2.
- Activación manual, stub M5 y base de pruebas de referencia: Persona 4.
- Contrato de referencia: `../api/openapi.yaml`; verificar con Bloque 1.

No implementa login M1, autorización real, cargos por cancelación, recordatorios, vencimiento automático, scheduler de activación, RabbitMQ ni integraciones reales. `X-Actor` es únicamente una etiqueta de auditoría de TP1.

Las tarifas y recorridos son simulados. AUTO: 4750; MOTO: 3500 con el recorrido fijo del stub. El stub M5 conserva sus claves solo durante su proceso: para servicios reales se requiere idempotencia persistente en M5, no basta con este mapa en memoria.

Consultar `../docs/persona3-integracion.md` para las decisiones de concurrencia y el ajuste pendiente del frontend.
