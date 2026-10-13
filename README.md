# M9 — Reservas de Viajes

**Trabajo Práctico Integrador — Desarrollo de Software 2026**  
**Grupo 9**

## 1. Descripción del proyecto

El Módulo 9 (M9) forma parte de una plataforma distribuida de movilidad urbana bajo demanda. Su objetivo es gestionar reservas de viajes para fechas y horarios futuros, permitiendo a los clientes programar traslados en auto o moto.

El módulo permite administrar reservas y se integra con otros servicios de la plataforma para validar clientes, consultar ubicaciones, estimar tarifas, gestionar solicitudes de despacho y enviar notificaciones.

El proyecto se desarrolla como un servicio independiente, siguiendo una arquitectura modular que permite separar responsabilidades y facilitar la integración con los demás módulos.

## 2. Funcionalidades

Los requerimientos contemplados para la primera entrega son:

| Requerimiento | Funcionalidad |
|---|---|
| RF-9.1 | Crear reservas indicando origen, destino, tipo de vehículo, fecha, hora y zona horaria. |
| RF-9.2 | Validar la anticipación mínima y máxima permitida. |
| RF-9.3 | Validar los datos y condiciones de la reserva. |
| RF-9.5 | Registrar reservas pendientes o confirmadas según las reglas establecidas. |
| RF-9.6 | Modificar o reprogramar reservas dentro de los límites permitidos. |
| RF-9.7 | Cancelar reservas indicando un motivo. |
| RF-9.9 | Activar reservas mediante el módulo de despacho. |
| RF-9.10 | Evitar activaciones duplicadas de una misma reserva. |
| RF-9.12 | Mantener un historial de cambios y transiciones. |

Los demás requerimientos del módulo se abordarán según el alcance acordado para las siguientes entregas.

## 3. Tecnologías utilizadas

| Tecnología | Utilización |
|---|---|
| Node.js | Entorno de ejecución del backend |
| TypeScript | Lenguaje de programación del backend |
| Express | Desarrollo de la API REST |
| React | Desarrollo del frontend previsto |
| PostgreSQL | Base de datos relacional |
| Supabase | Plataforma de alojamiento de PostgreSQL |
| Docker y Docker Compose | Contenedorización y ejecución del servicio |
| Vitest y Supertest | Pruebas del backend |
| OpenAPI | Documentación de contratos HTTP |
| Git y GitHub | Control de versiones y trabajo colaborativo |

## 4. Arquitectura e integraciones

M9 se desarrolla como un servicio independiente, organizado en capas que separan la recepción de solicitudes HTTP, la lógica de negocio y el acceso a los datos.

El módulo se comunica con otros servicios de la plataforma:

| Módulo | Integración |
|---|---|
| M1 — Identidad y Acceso | Autenticación y autorización de operaciones protegidas. |
| M2 — Clientes | Validación del cliente y su habilitación. |
| M4 — Ubicación y Disponibilidad | Consulta de distancia y tiempo estimado a partir de coordenadas de origen y destino. |
| M5 — Solicitud y Despacho | Activación de reservas y generación de solicitudes de viaje. |
| M7 — Tarifas, Pagos y Liquidaciones | Estimación de tarifas. |
| M8 — Notificaciones, Documentos y Soporte | Comunicación de eventos relacionados con reservas. |

Las interfaces entre módulos se documentarán mediante contratos acordados con los equipos correspondientes.

Los diagramas de arquitectura se ubican en `docs/arquitectura/`.

## 5. Estructura del proyecto

```text
DesarrolloDeSoftware/
├── api/                 # Contratos OpenAPI
├── backend/             # API y lógica de negocio
├── db/                  # Base de datos
├── docs/                # Documentación y diagramas
├── frontend/            # Interfaz de usuario
├── docker-compose.yml   # Configuración de contenedores
├── .env.example         # Variables de entorno de ejemplo
└── README.md
```

## 6. Instalación y ejecución

### Requisitos previos

- Git.
- Node.js y npm.
- Docker y Docker Compose.
- Acceso a PostgreSQL/Supabase.

### Clonar el repositorio

```bash
git clone https://github.com/Valen-cbs/DesarrolloDeSoftware.git
cd DesarrolloDeSoftware
```

### Configurar las variables de entorno

Crear un archivo `.env` a partir de `.env.example` y completar los valores necesarios para la conexión con la base de datos y la configuración del servicio.

Por seguridad, el archivo `.env` no debe subirse al repositorio.

### Ejecutar el backend

Desde la raíz del proyecto:

```bash
cd backend
npm install
npm run dev
```

### Ejecutar con Docker

Desde la raíz del repositorio:

```bash
docker compose up --build
```

El backend utiliza el puerto `3000` según la configuración actual del proyecto.

## 7. Pruebas

Para ejecutar las pruebas del backend:

```bash
cd backend
npm test
```

Las pruebas se realizan mediante Vitest y Supertest, con las dependencias y la base de datos de pruebas configuradas según corresponda.

## 8. Documentación técnica

| Archivo | Contenido |
|---|---|
| `README.md` | Presentación, tecnologías e instrucciones de ejecución |
| `docs/decisiones.md` | Justificación de las decisiones tecnológicas |
| `docs/arquitectura/` | Diagramas de contexto, capas y secuencia |
| `api/openapi.yaml` | Especificación de la API REST |
| `docs/catalogo-eventos.md` | Eventos emitidos y consumidos |

Los documentos se incorporarán y actualizarán conforme avance la primera entrega.

## 9. Cómo utilizar el sistema

*Pendiente de completar una vez que se encuentren implementados y verificados los endpoints y los flujos de uso del módulo.*

## 10. Integrantes y distribución de bloques

### Bloque 1 — Documentación y diseño

**Integrantes:** Marco Maiocchi y Ramiro Escobar.

Se encarga de elaborar la documentación del proyecto, justificar las tecnologías utilizadas, desarrollar los diagramas de arquitectura, documentar los contratos de la API mediante OpenAPI y definir el catálogo de eventos.

### Bloque 2 — Base de datos y configuración

**Integrantes:** Valentina Maciel y Mariano Del Valle.

Se encarga de revisar y documentar la base de datos PostgreSQL en Supabase, preparar los datos de prueba y configurar las variables de entorno necesarias para el funcionamiento del sistema.

### Bloque 3 — Backend, Docker y pruebas

**Integrantes:** Irina Medera, Bianca Gómez Báez, Valentino Cabás y Oriana Aguilar.

Se encarga de implementar la API, desarrollar las reglas de negocio de las reservas, evitar activaciones duplicadas, configurar los contenedores Docker y realizar las pruebas correspondientes.

### Bloque 4 — Frontend

**Integrante:** Lara Wolman.

Se encarga de desarrollar la interfaz de usuario en React para interactuar con las funcionalidades del módulo. Su implementación es opcional para la primera entrega.
