# S2 Fit Evolution

Aplicación web de **S2 Fit Evolution**, una marca de Medellín que combina tres líneas de negocio:

1. **Tienda**: ropa deportiva seamless (conjuntos, leggings, tops, shorts, enterizos).
2. **Mi Ruta** (gratis): rutinas, recetas, crecimiento personal, panel de hábitos, retos y descuentos.
3. **S2 Plus** (membresía): contenido exclusivo, alimentación diaria, retos progresivos y recompensas.

Las compras y las suscripciones **se acuerdan y pagan por WhatsApp**, mediante transferencia, consignación u otro medio del convenio. La web crea primero una referencia guardada en la base de datos y después abre WhatsApp con el mensaje ya escrito. Un administrador confirma cada pago desde el panel, después de verificar que el dinero llegó.

> La interfaz reconstruye el prototipo `S2 Fit Evolution – prototipo web – Sitio S2 Fit Evolution.html`, con la misma paleta (borgoña `#582222`, crema `#F5F4EF`, beige `#E8DCC8`), las mismas tipografías y las mismas secciones. El prototipo solo traía dos imágenes, el logo y la foto del «Mono negro». Los otros cinco productos usan imágenes provisionales (`frontend/public/products/*.svg`) que se reemplazan desde el panel de administración.

---

## Índice

1. [Arquitectura](#1-arquitectura)
2. [Tecnologías y motivos](#2-tecnologías-y-motivos)
3. [Requisitos del entorno](#3-requisitos-del-entorno)
4. [Instalación del backend](#4-instalación-del-backend)
5. [Instalación del frontend](#5-instalación-del-frontend)
6. [Configuración de Supabase](#6-configuración-de-supabase)
7. [Migraciones de base de datos](#7-migraciones-de-base-de-datos)
8. [Creación segura del primer administrador](#8-creación-segura-del-primer-administrador)
9. [Ejecución de pruebas](#9-ejecución-de-pruebas)
10. [Variables de entorno](#10-variables-de-entorno)
11. [Despliegue del frontend en GitHub Pages](#11-despliegue-del-frontend-en-github-pages)
12. [Despliegue del backend en Render](#12-despliegue-del-backend-en-render)
13. [CORS y URLs de producción](#13-cors-y-urls-de-producción)
14. [Flujo de compra y suscripción por WhatsApp](#14-flujo-de-compra-y-suscripción-por-whatsapp)
15. [Verificación administrativa de pagos](#15-verificación-administrativa-de-pagos)
16. [Inventario y reservas](#16-inventario-y-reservas)
17. [Seguridad](#17-seguridad)
18. [Límites de los planes gratuitos](#18-límites-de-los-planes-gratuitos)
19. [Errores frecuentes](#19-errores-frecuentes)
20. [Supuestos y datos pendientes](#20-supuestos-y-datos-pendientes)

---

## 1. Arquitectura

```
 Navegador ──► GitHub Pages (React estático, HashRouter)
    │  │
    │  └── Supabase Auth (registro, ingreso, recuperación) ── JWT ──┐
    │                                                               ▼
    └────────── HTTPS + "Authorization: Bearer <JWT>" ──► Render: FastAPI (monolito modular)
                                                              │  verifica el JWT, aplica roles,
                                                              │  precios, inventario y pagos
                                                              ▼
                                                   Supabase PostgreSQL (+ Storage)
    WhatsApp ◄── enlace wa.me con la referencia creada por la API
```

- **Frontend** (`frontend/`): solo archivos estáticos. No ejecuta Python ni se conecta a PostgreSQL.
- **Backend** (`backend/`): un único servicio FastAPI organizado por módulos (sin microservicios). Toda escritura de datos pasa por aquí.
- **Base de datos**: PostgreSQL de Supabase, versionada con Alembic. RLS está activo en todas las tablas.

```
backend/
  app/core/        configuración, BD, verificación JWT, errores, límite de solicitudes
  app/models/      modelos SQLAlchemy (20 tablas)
  app/schemas/     validación Pydantic (entradas que rechazan campos desconocidos)
  app/services/    reglas de negocio: inventario, pedidos, pagos, suscripciones, hábitos…
  app/api/v1/      routers públicos, de cliente y admin/
  alembic/         migraciones (0001 esquema, 0002 RLS + políticas Supabase)
  scripts/         seed_demo.py (datos de demostración) y set_role.py (administradores)
  tests/           78 pruebas pytest (AAA) contra PostgreSQL aislado
frontend/
  src/components/  interfaz reutilizable (botones, píldoras, encabezado…)
  src/pages/       Inicio, Mi Ruta, Mi cuenta, páginas estáticas
  src/features/    catalog, cart, orders, habits, challenges, content, subscriptions, auth, admin
  src/services/    cliente API, Supabase, WhatsApp, formatos, tipos
  src/routes/      guardas de rutas (sesión / administración)
```

## 2. Tecnologías y motivos

| Capa | Tecnología | Motivo |
|---|---|---|
| Interfaz | React 19 + TypeScript + Vite 8 | Componentes tipados y compilación rápida a archivos estáticos. |
| Estilos | Tailwind CSS 4 | Los colores del prototipo se definen como variables (`bg-burgundy`, `bg-beige`…). |
| Rutas | React Router con **HashRouter** | En GitHub Pages, recargar `/#/tienda` funciona sin errores 404. |
| Autenticación | Supabase Auth (`@supabase/supabase-js`, flujo PKCE) | Registro, ingreso y recuperación de contraseña gratis, sin guardar contraseñas propias. |
| API | FastAPI + Pydantic + Uvicorn | Validación automática y documentación en `/docs`. |
| Datos | SQLAlchemy 2 + Alembic + psycopg 3 | Transacciones y bloqueos de PostgreSQL; esquema versionado. |
| Pruebas | pytest, Vitest + Testing Library | Pruebas reales de reglas de negocio, concurrencia e interfaz. |
| CI/CD | GitHub Actions | Tipos, pruebas, compilación y publicación en Pages. |

No hay biblioteca de componentes ni de formularios: los formularios son simples y no la necesitan.

## 3. Requisitos del entorno

- **Python 3.14** (también funciona con 3.12 o superior)
- **Node.js 24 LTS** y npm
- **PostgreSQL 15 o superior** para desarrollo y pruebas. Puedes usar un PostgreSQL local o un proyecto de Supabase de desarrollo.
- Git y una cuenta de GitHub. Para producción: cuentas gratuitas de Supabase y Render.

> **Este equipo**: Node.js 24 se instaló de forma portable en `C:\Users\tabor\.s2fit-tools\node-v24.22.2-win-x64` y se añadió al PATH del usuario (abre una terminal nueva para que lo reconozca). Para desarrollo se creó un clúster PostgreSQL **independiente** en `C:\Users\tabor\.s2fit-tools\pgdata`, puerto **54329**, con las bases `s2fit` y `s2fit_test`. No se tocaron los servicios PostgreSQL 17/18 que ya existían en el equipo.
>
> Para iniciar ese clúster después de reiniciar el equipo (PowerShell):
> ```powershell
> & "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "$env:USERPROFILE\.s2fit-tools\pgdata" -o "-p 54329 -c listen_addresses=localhost" -l "$env:USERPROFILE\.s2fit-tools\pg.log" start
> ```

Si partes de cero en otro equipo, crea las dos bases en tu PostgreSQL:

```powershell
psql -U postgres -c "CREATE DATABASE s2fit;" -c "CREATE DATABASE s2fit_test;"
```

## 4. Instalación del backend

**Windows PowerShell**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # si falla: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements-dev.txt
Copy-Item .env.example .env           # edita DATABASE_URL y los datos de Supabase
alembic upgrade head                  # crea las tablas
python -m scripts.seed_demo           # opcional: catálogo, plan y contenido de DEMOSTRACIÓN
uvicorn app.main:app --reload --port 8000
```

**macOS / Linux**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
python -m scripts.seed_demo
uvicorn app.main:app --reload --port 8000
```

Comprueba que funciona en <http://localhost:8000/health> (`{"status":"ok","database":"ok"}`). La documentación interactiva queda en <http://localhost:8000/docs> y se oculta cuando `ENVIRONMENT=production`.

## 5. Instalación del frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local     # macOS/Linux: cp .env.example .env.local
npm run dev                           # http://localhost:5173
```

Otros comandos: `npm run typecheck`, `npm test`, `npm run build` (genera `dist/`) y `npm run preview`.

Sin `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, las páginas públicas (Inicio, Tienda, Mi Ruta, S2 Plus) funcionan, pero no se puede iniciar sesión.

## 6. Configuración de Supabase

1. Crea un proyecto en <https://supabase.com> (plan Free) y elige la región más cercana (por ejemplo, São Paulo).
2. **Project Settings → API**: copia la *Project URL* y la clave pública *anon/publishable*. Van a `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el frontend, y la URL también a `SUPABASE_URL` en el backend.
3. **Project Settings → JWT Keys** (o *API → JWT Settings* en proyectos antiguos):
   - Si el proyecto usa **claves de firma asimétricas** (ES256/RS256), basta con `SUPABASE_URL`. El backend descarga las claves públicas desde `…/auth/v1/.well-known/jwks.json`.
   - Si usa el **secreto JWT heredado** (HS256), cópialo en `SUPABASE_JWT_SECRET` (solo en el backend).
4. **Project Settings → Database → Connection string → Session pooler**: copia la URI en `DATABASE_URL` del backend. Usa el *Session pooler*, porque la conexión directa de Supabase solo funciona por IPv6 y Render no la alcanza.
5. **Authentication → URL Configuration**:
   - *Site URL*: `https://TU-USUARIO.github.io/NOMBRE-REPO/` (o la URL local `http://localhost:5173/` mientras desarrollas).
   - *Redirect URLs*: añade `http://localhost:5173/**` y `https://TU-USUARIO.github.io/**`. Sin esto, fallan los enlaces de confirmación y de recuperación de contraseña.
6. **Authentication → Providers → Email**: deja activada la confirmación de correo (recomendado). El correo integrado de Supabase tiene un límite bajo por hora; para producción conviene configurar SMTP propio.
7. **Storage** (opcional, para subir fotos desde el panel): crea un bucket **público** llamado `product-images` y copia la clave **service_role** (*Project Settings → API*) en `SUPABASE_SERVICE_ROLE_KEY`, **solo en Render**. Las fotos de catálogo son públicas por naturaleza; si en el futuro se guardan archivos privados (por ejemplo, comprobantes), usa un bucket privado separado.

## 7. Migraciones de base de datos

Todas las tablas se crean con Alembic. No se ejecuta SQL a mano.

```powershell
cd backend
alembic upgrade head        # aplica todas las migraciones pendientes
alembic current             # muestra la versión actual
alembic downgrade -1        # revierte la última
# Tras cambiar un modelo en app/models:
alembic revision --autogenerate -m "describe el cambio"   # revisa el archivo generado antes de aplicarlo
alembic check               # confirma que modelos y migraciones coinciden
```

- `0001_esquema_inicial`: 20 tablas con claves foráneas, restricciones `CHECK` (existencias ≥ 0, reservadas ≤ existencias, importes positivos, estados válidos), índices y referencias únicas.
- `0002_rls_supabase`: activa RLS en todas las tablas. En Supabase crea además la clave foránea `profiles.id → auth.users.id` y políticas **de solo lectura**: cada persona ve solo sus filas, y cualquiera ve el catálogo publicado. En un PostgreSQL normal esa parte se omite automáticamente.

En Render, las migraciones se aplican solas en cada arranque (`alembic upgrade head && uvicorn …`).

**Datos de demostración**: `python -m scripts.seed_demo` crea 5 categorías, los 6 productos del prototipo (3 tallas, 5 unidades cada una), el plan «S2 Plus mensual» **sin precio**, 14 contenidos, 5 retos y 7 recompensas. Todo queda marcado con `is_demo = true` y la tienda muestra «Precio de ejemplo». En producción el script exige `--allow-production`.

## 8. Creación segura del primer administrador

El rol **nunca** se asigna desde la web: el registro siempre crea `customer` e ignora cualquier `role` que venga en los metadatos. Para nombrar un administrador:

1. La persona se registra normalmente en la web y confirma su correo.
2. Desde una terminal con acceso a la base de datos (tu equipo con `DATABASE_URL` de producción, o **Render → Shell**):

```powershell
cd backend
python -m scripts.set_role --email admin@tu-dominio.com --role admin
# Para quitar el rol:
python -m scripts.set_role --email admin@tu-dominio.com --role customer
```

3. La persona cierra sesión, vuelve a entrar y verá el enlace **Admin** en el menú.

## 9. Ejecución de pruebas

**Backend** (78 pruebas): cada ejecución borra y reconstruye la base `TEST_DATABASE_URL` con las migraciones. Por seguridad, el nombre de esa base **debe terminar en `_test`**; si no, pytest se niega a ejecutarse.

```powershell
cd backend
$env:TEST_DATABASE_URL = "postgresql+psycopg://postgres@localhost:54329/s2fit_test"   # opcional, es el valor por defecto
python -m pytest
```

Cubren: verificación de JWT (firma, expiración, audiencia, emisor, tokens `anon`, `alg=none`, ES256 vía JWKS), perfiles, roles, separación de datos entre usuarios, catálogo, pedidos, variantes inexistentes, falta de existencias, reservas vencidas, **dos compras simultáneas de la última unidad**, confirmación, **doble confirmación (secuencial y simultánea)**, rechazo, reembolso, activación, renovación y vencimiento de la membresía, acceso a contenido exclusivo, hábitos, retos, recompensas, límite de solicitudes y auditoría.

**Frontend** (29 pruebas):

```powershell
cd frontend
npm run typecheck
npm test
npm run build
```

Cubren: formatos COP, enlace de WhatsApp, cliente de la API, carrito, tienda, detalle de producto, compra (el pedido se crea **antes** de abrir WhatsApp y no se redirige si la API falla), suscripción (incluye conservar el plan elegido antes de iniciar sesión), formularios de autenticación, navegación y protección de rutas.

GitHub Actions ejecuta ambas suites en cada cambio (`.github/workflows/`).

## 10. Variables de entorno

Hay un archivo de ejemplo por aplicación: `backend/.env.example` y `frontend/.env.example`.

### Frontend (públicas: quedan dentro del sitio)

| Variable | Uso |
|---|---|
| `VITE_API_BASE_URL` | URL de la API (`http://localhost:8000` o `https://s2fit-api.onrender.com`). |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | Clave **pública** anon/publishable. |
| `VITE_WHATSAPP_BUSINESS_NUMBER` | Número comercial, solo dígitos y con indicativo (ej. `57…`). Si falta, la web muestra la referencia y el mensaje para copiarlos. |
| `VITE_BASE_PATH` | `/` o `/nombre-repo/`. En GitHub Actions se calcula sola. |

> Todo lo que empieza por `VITE_` es visible para cualquier visitante. **Nunca** pongas ahí la clave `service_role`, el secreto JWT ni contraseñas.

### Backend (privadas: se configuran en Render)

| Variable | Uso |
|---|---|
| `ENVIRONMENT` | `development`, `test` o `production`. En producción se ocultan `/docs` y `/openapi.json`. |
| `DATABASE_URL` | Conexión PostgreSQL (Session pooler de Supabase). Acepta `postgresql://` o `postgresql+psycopg://`. |
| `SUPABASE_URL` | Habilita la verificación por JWKS y la comprobación del emisor del token. |
| `SUPABASE_JWT_SECRET` | Secreto HS256 heredado, si el proyecto lo usa. |
| `SUPABASE_JWT_AUDIENCE` | Por defecto `authenticated`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo para subir imágenes a Storage. **Secreto.** |
| `SUPABASE_STORAGE_BUCKET` | Bucket de imágenes (por defecto `product-images`). |
| `CORS_ORIGINS` | Orígenes permitidos, separados por comas y sin barra final. |
| `RESERVATION_TTL_MINUTES` | Duración de la reserva de un pedido pendiente (por defecto 2880 = 48 h). |
| `RATE_LIMIT_PER_MINUTE` | Límite de creación de pedidos o solicitudes por usuario y minuto (por defecto 10). |
| `APP_TIMEZONE` | Zona horaria para hábitos y retos (por defecto `America/Bogota`). |
| `TEST_DATABASE_URL` | Solo pruebas; nombre terminado en `_test`. |

## 11. Despliegue del frontend en GitHub Pages

1. Crea un repositorio en GitHub y sube el proyecto:
   ```powershell
   git remote add origin https://github.com/TU-USUARIO/s2fit.git
   git push -u origin main
   ```
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → pestaña Variables** (no *Secrets*, porque son valores públicos): crea `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_WHATSAPP_BUSINESS_NUMBER`.
4. Cada `push` a `main` que toque `frontend/` ejecuta `.github/workflows/frontend.yml`: instala dependencias, revisa tipos, ejecuta pruebas, compila y publica `dist/`. También puedes lanzarlo a mano desde *Actions → Frontend → Run workflow*.
5. La ruta base se calcula sola:
   - Repositorio `TU-USUARIO.github.io` → sitio en `https://TU-USUARIO.github.io/` con base `/`.
   - Cualquier otro nombre → `https://TU-USUARIO.github.io/NOMBRE-REPO/` con base `/NOMBRE-REPO/`.

Las imágenes del prototipo se empaquetan con Vite (`src/assets`) o se sirven desde `public/products`, siempre respetando la ruta base. No dependen de rutas temporales.

## 12. Despliegue del backend en Render

**Opción A (Blueprint, recomendada)**: en Render, **New → Blueprint**, elige el repositorio y Render leerá `render.yaml`. Después escribe a mano los valores marcados como `sync: false`.

**Opción B (manual)**: **New → Web Service** con:
- Root Directory: `backend`
- Runtime: Python · Build Command: `pip install -r requirements.txt`
- Start Command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers`
- Health Check Path: `/health`
- Instance type: Free

Variables en **Environment**: `ENVIRONMENT=production`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET` (si aplica), `SUPABASE_SERVICE_ROLE_KEY` (opcional), `CORS_ORIGINS=https://TU-USUARIO.github.io`, y `PYTHON_VERSION=3.14.6`. Si Render no ofrece esa versión, usa otra 3.12+ y actualiza `backend/.python-version`.

Comprueba el despliegue en `https://TU-SERVICIO.onrender.com/health`. Después crea el primer administrador ([sección 8](#8-creación-segura-del-primer-administrador)) y, si quieres, carga los datos de demostración con `python -m scripts.seed_demo --allow-production` desde *Render → Shell*.

## 13. CORS y URLs de producción

- `CORS_ORIGINS` contiene **solo el origen**, sin la ruta del repositorio: `https://TU-USUARIO.github.io`. El navegador envía el origen sin ruta.
- Para varios orígenes (por ejemplo, producción y desarrollo): `https://TU-USUARIO.github.io,http://localhost:5173`.
- `VITE_API_BASE_URL` en GitHub debe ser la URL de Render, sin barra final.
- Los orígenes no autorizados reciben un rechazo en la consulta previa (preflight); esto está cubierto por las pruebas.

## 14. Flujo de compra y suscripción por WhatsApp

### Compra

1. La clienta inicia sesión, elige prenda, color, talla y cantidad, y pulsa **«Comprar por WhatsApp»** en la bolsa.
2. El frontend envía a `POST /api/v1/orders` **solo variantes y cantidades**. Si el navegador intenta mandar un precio, la API lo rechaza.
3. FastAPI bloquea las variantes, valida existencias, calcula los precios con los datos de la base, reserva el inventario y crea el pedido `S2-ORD-XXXXXXXX` con su pago en estado **pendiente**.
4. Con la referencia ya guardada, el navegador abre `https://wa.me/NUMERO?text=…` con un mensaje que incluye la referencia, los productos y el total. Si la API falla, se muestra el error y **no** se abre WhatsApp.
5. Se acuerdan el pago y la entrega por WhatsApp. La clienta paga por el convenio.
6. Un administrador verifica el ingreso y confirma el pago en el panel. Pedido e inventario se actualizan en una sola transacción.

### Suscripción S2 Plus

1. En `/#/plus`, la persona pulsa **«Suscribirme»**. Si no ha iniciado sesión, el plan elegido se guarda y, al volver, aparece «Continuar con mi suscripción».
2. `POST /api/v1/subscriptions/requests` crea la solicitud `S2-SUB-XXXXXXXX`, asociada a la cuenta, con estado pendiente y su pago. Si pulsa de nuevo, se reutiliza la misma solicitud.
3. Se abre WhatsApp con el plan y la referencia. Se acuerdan precio, vigencia y medio de pago.
4. El administrador **registra el precio y la vigencia acordados** y, tras verificar el ingreso, confirma el pago. La membresía se activa o, si era una renovación, se extiende desde la fecha de vencimiento actual.
5. Una solicitud pendiente **no** da acceso. El backend permite el contenido exclusivo solo si hay una suscripción `active` cuyo `ends_at` es posterior al momento actual.

La renovación es manual: en S2 Plus y en *Mi cuenta* aparece el botón **«Renovar por WhatsApp»** cuando la membresía venció, se canceló o vence en 7 días o menos.

El precio de S2 Plus está **por definir**: el plan se crea sin precio y la web muestra «Consulta el precio por WhatsApp». Cuando se defina, se edita en *Admin → S2 Plus*.

## 15. Verificación administrativa de pagos

En **Admin → Pagos**, la bandeja «Por verificar» muestra, para cada operación: referencia, cliente (nombre, correo, celular), pedido o plan, importe acordado, medio de pago, fecha de creación, estado de la reserva, referencia del convenio, observaciones, quién decidió y cuándo.

Procedimiento:

1. Ubica la operación por la referencia que la clienta escribió en WhatsApp. El comprobante que envíe sirve para encontrarla, pero **no prueba** que el dinero llegó.
2. (Opcional) **Marcar en revisión** y anotar el medio de pago informado.
3. Solo en suscripciones: **Registrar precio acordado** (importe y días de vigencia).
4. Verifica en el convenio (banca en línea, corresponsal…) que el dinero **realmente** ingresó.
5. **Confirmar pago**: escribe la referencia de la operación, el **importe recibido**, el medio, la **referencia de la transacción en el convenio** y marca «Verifiqué en el convenio que el dinero fue recibido».

Al confirmar, la API, dentro de una sola transacción:
- bloquea la operación y su pago, y comprueba que no estén ya procesados (una segunda confirmación responde «ya fue procesado» y no repite efectos);
- comprueba que la referencia y el importe coincidan;
- impide reutilizar la misma referencia del convenio para otro pago;
- en pedidos, exige que la reserva siga vigente; si venció, avisa para que la renueves en *Pedidos*;
- descuenta el inventario o activa/renueva la membresía, registra quién confirmó y cuándo, y deja una entrada en la auditoría.

**Rechazar** cancela el pedido y libera su reserva, o marca la solicitud como rechazada. **Registrar reembolso** se usa para devoluciones hechas por fuera del sistema; el inventario no se repone solo, así que si la prenda vuelve se hace un ajuste de existencias.

Toda acción administrativa importante queda en **Admin → Usuarios y auditoría**.

## 16. Inventario y reservas

- Cada variante guarda `stock_on_hand` (unidades físicas) y `stock_reserved` (apartadas). Disponible = existencias − reservadas.
- **Crear pedido**: `SELECT … FOR UPDATE` sobre las variantes, en orden de id para evitar interbloqueos; si hay disponibilidad, se suman a `stock_reserved`. La reserva vence a las `RESERVATION_TTL_MINUTES`.
- **Cancelar, rechazar o vencer**: se resta de `stock_reserved`. **Confirmar pago**: se resta de `stock_on_hand` y de `stock_reserved`.
- El estado de la reserva (`active → released | consumed`) impide liberar o descontar dos veces. Restricciones `CHECK` en la base garantizan que las existencias nunca sean negativas ni las reservas superen a las existencias.
- Como el plan gratuito no tiene tareas programadas, las reservas vencidas se liberan al crear un pedido nuevo y con el botón **«Liberar reservas vencidas»** en *Admin → Pedidos*.
- Una reserva vencida **no** se confirma automáticamente: el administrador pulsa «Renovar reserva», que vuelve a comprobar existencias, y luego confirma.
- La bitácora `inventory_movements` registra cada reserva, liberación, venta y ajuste.

## 17. Seguridad

- **JWT de Supabase verificados criptográficamente** en FastAPI: firma (JWKS ES256/RS256 o HS256), expiración, audiencia, emisor y `role=authenticated`. Se rechaza `alg=none`.
- **Autorización en el backend**: endpoints de cliente filtrados por `user_id` (los recursos ajenos responden 404) y endpoints `/admin` que exigen el rol `admin`. Ocultar botones en React es solo cosmético.
- **Validación con Pydantic** y `extra="forbid"`: no se aceptan campos como `role`, `price` o `total` enviados por el navegador.
- **RLS** activo en todas las tablas, con políticas solo de lectura para filas propias o catálogo público. Las escrituras directas desde la clave pública quedan cerradas.
- **Secretos** solo en variables de entorno del backend (Render). `.env` está en `.gitignore`.
- **CORS** restringido a `CORS_ORIGINS`.
- **Límite de solicitudes** al crear pedidos y solicitudes de suscripción (en memoria, por usuario).
- **Errores sin detalles internos**: formato uniforme `{"error": {"code", "message", "details"}}`; las trazas solo van al log del servidor.
- **Auditoría** de acciones administrativas, en la misma transacción que la acción.
- **Privacidad**: no se guardan datos bancarios ni comprobantes. Hay una página de tratamiento de datos (texto base, pendiente de revisión legal) y casilla de autorización en el registro.
- Cabeceras `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`.

## 18. Límites de los planes gratuitos

- **Render Free**: el servicio se duerme tras unos 15 minutos sin tráfico y la primera solicitud puede tardar entre 30 y 60 s. Tiene horas de uso mensuales limitadas y no ofrece `preDeployCommand` ni discos persistentes. El límite de solicitudes en memoria se reinicia cuando el servicio duerme.
- **Supabase Free**: el proyecto se pausa tras unos 7 días sin actividad (se reactiva desde el panel). Tiene límites de tamaño de base, de Storage y de correos de autenticación por hora (configura SMTP propio para producción) y no incluye copias de seguridad automáticas.
- **GitHub Pages**: solo sitios estáticos y públicos, con límites de ancho de banda y de compilaciones.
- **GitHub Actions**: minutos gratuitos limitados en repositorios privados (ilimitados en públicos).

## 19. Errores frecuentes

| Síntoma | Causa y solución |
|---|---|
| «No pudimos conectar con el servidor» | Render está despertando (espera unos segundos), `VITE_API_BASE_URL` está mal o CORS no incluye tu origen. |
| Error CORS en la consola | `CORS_ORIGINS` debe ser exactamente `https://TU-USUARIO.github.io`, sin ruta ni barra final. |
| 401 «Sesión inválida» | Falta `SUPABASE_URL` o `SUPABASE_JWT_SECRET` en Render, o pertenecen a otro proyecto. |
| La página publicada sale en blanco o sin estilos | Revisa que Pages use *GitHub Actions* como fuente. La ruta base se calcula según el nombre del repositorio. |
| El enlace de confirmación o recuperación no funciona | Agrega tu URL en *Supabase → Authentication → URL Configuration → Redirect URLs* y abre el enlace en el mismo navegador donde lo pediste (flujo PKCE). |
| «La autenticación no está configurada» | Faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` en las Variables de GitHub o en `.env.local`. |
| WhatsApp no se abre | Falta `VITE_WHATSAPP_BUSINESS_NUMBER`. La web igualmente muestra la referencia y el mensaje para copiar. |
| `connection refused` o timeout a la base en Render | Usa la URI del **Session pooler** de Supabase (IPv4), no la conexión directa. |
| `alembic upgrade` falla con `auth.users` | La clave de servicio no tiene permisos: ejecuta las migraciones con la URI del usuario `postgres` del pooler. |
| pytest se cierra con «debe terminar en _test» | Protección contra borrar datos reales: usa una base `…_test`. |
| `Activate.ps1` bloqueado en PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| «La reserva de este pedido expiró» al confirmar | Ve a *Admin → Pedidos → Renovar reserva* (vuelve a comprobar existencias) y confirma de nuevo. |

## 20. Supuestos y datos pendientes

Estos datos no venían en el prototipo y quedaron configurables:

- **Número de WhatsApp comercial**: no se inventó; se configura con `VITE_WHATSAPP_BUSINESS_NUMBER`.
- **Precio de S2 Plus**: por definir. El plan se crea sin precio y se edita en el panel.
- **Precios de las prendas**: los del prototipo, marcados como **ejemplo** (`is_demo`).
- **Porcentajes de descuento por hábitos** (3 %, 5 %, 10 %): de ejemplo, tomados del prototipo.
- **Fotos de 5 productos**: no venían en el archivo; se usan imágenes provisionales.
- **Vigencia de la reserva**: 48 horas por defecto.
- **Texto legal de tratamiento de datos**: base, pendiente de revisión legal (razón social, NIT y canal oficial).
- **Cálculo de recompensas**: las de hábitos usan el cumplimiento de los últimos 7 días; las de retos, el porcentaje de retos completados entre los disponibles.
- **Avisos de vencimiento**: no automatizados en esta fase. El listado *Admin → S2 Plus → Membresías* se ordena por fecha de vencimiento para facilitar el seguimiento, y el modelo permite añadir avisos más adelante.
- **Docker**: mejora opcional futura; no es necesario para ejecutar el proyecto.
