# Cómo publicar S2 Fit en internet, gratis, paso a paso

Esta guía es para principiantes. Usa tres servicios **gratuitos y sin tarjeta de crédito**:

| Servicio | Para qué | Dirección que obtendrás |
|---|---|---|
| **Supabase** | Base de datos, inicio de sesión y almacenamiento de fotos/videos | `https://xxxx.supabase.co` |
| **Render** | La API (backend en Python) | `https://s2fit-api.onrender.com` |
| **GitHub Pages** | El sitio web (frontend) | `https://TU-USUARIO.github.io/s2fit/` |

Hazlo **en este orden**, porque cada parte necesita datos de la anterior. Tiempo aproximado: 1 hora.

> Ten a mano un archivo de notas (Bloc de notas) para ir pegando las claves y direcciones que
> vas copiando. Al final hay una tabla para llenarla.

---

## Parte 0. Crea las cuentas

1. **GitHub**: <https://github.com/signup>. Tu nombre de usuario aparecerá en la dirección del sitio.
2. **Supabase**: <https://supabase.com> → *Start your project* → entra con GitHub.
3. **Render**: <https://render.com> → *Get Started* → entra con GitHub.

Instala también **Git** en tu computador (ver el Paso 0 de [EJECUTAR_EN_LOCAL.md](EJECUTAR_EN_LOCAL.md)).

---

## Parte 1. Supabase (base de datos y login)

### 1.1 Crear el proyecto

1. En el panel de Supabase pulsa **New project**.
2. **Name**: `s2fit`.
3. **Database Password**: pulsa *Generate a password* y **cópiala en tus notas**. La necesitarás después.
4. **Region**: *South America (São Paulo)*.
5. Pulsa **Create new project** y espera uno o dos minutos.

### 1.2 Copiar la URL y las claves

1. Ve a **Project Settings** (el engranaje abajo a la izquierda) → **API Keys**.
2. Copia en tus notas:
   - **Publishable key** (empieza por `sb_publishable_…`). Es pública: va en el sitio web.
   - **Secret key** (empieza por `sb_secret_…`; pulsa el ojo para verla). Es **secreta**: solo va en Render.
3. Ve a **Project Settings → Data API** (o mira arriba en *Connect*) y copia la **Project URL**:
   `https://xxxxxxxx.supabase.co`.

> Si tu proyecto solo muestra la pestaña *Legacy API keys*, usa la clave **anon** como publishable
> y la clave **service_role** como secret. Funcionan igual.

### 1.3 Copiar la conexión a la base de datos

1. Pulsa el botón **Connect** que está arriba, en la barra del proyecto.
2. En la pestaña de cadenas de conexión elige **Session pooler** (¡no *Direct connection*!: Render no puede usarla).
3. Copia la URI. Se parece a:
   ```
   postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```
4. Reemplaza `[YOUR-PASSWORD]` (incluidos los corchetes) por la contraseña del paso 1.1 y guárdala
   en tus notas como **DATABASE_URL**.

> Si tu contraseña tiene símbolos como `@`, `#` o `/`, genera otra solo con letras y números en
> *Project Settings → Database → Reset database password*. Esos símbolos rompen la URI.

### 1.4 Firma de los tokens (JWT)

Ve a **Project Settings → JWT Keys**.

- Si ves **JWT Signing Keys** con un algoritmo como `ECC (P-256)` o `RSA`: no tienes que copiar
  nada. El backend verifica los tokens solo con la Project URL. **SUPABASE_JWT_SECRET queda vacío.**
- Si ves un **Legacy JWT Secret** en uso: cópialo en tus notas como **SUPABASE_JWT_SECRET**.

### 1.5 Crear el espacio para fotos y videos

1. Menú izquierdo → **Storage** → **New bucket**.
2. **Name**: `product-images` (exactamente así).
3. Activa **Public bucket**.
4. Pulsa **Create**.

### 1.6 Correo de confirmación

En **Authentication → Sign In / Providers → Email**, deja activado *Confirm email*.
El correo gratuito de Supabase permite pocos envíos por hora: no crees muchas cuentas de golpe.

(La configuración de direcciones de Authentication se hace en la Parte 5, cuando ya tengas la dirección del sitio.)

---

## Parte 2. Subir el código a GitHub

### 2.1 Crear el repositorio

1. En GitHub pulsa **+ → New repository**.
2. **Repository name**: `s2fit`.
3. Elige **Public**. GitHub Pages es gratis solo con repositorios públicos.
   No hay secretos en el código: las claves van en GitHub *Variables* y en Render.
4. **No** marques *Add a README* ni *.gitignore* (el proyecto ya los trae).
5. Pulsa **Create repository**.

### 2.2 Subir el proyecto

Descomprime el `.zip` del proyecto y abre PowerShell **dentro de la carpeta `S2Fit`** (donde está
este archivo). Ejecuta, cambiando `TU-USUARIO`:

```powershell
git config --global user.name "Tu Nombre"          # solo la primera vez que usas Git
git config --global user.email "tu_correo@gmail.com"

git remote add origin https://github.com/TU-USUARIO/s2fit.git
git branch -M main
git push -u origin main
```

La primera vez se abre una ventana para iniciar sesión en GitHub: acéptala.
Si dice `remote origin already exists`, usa `git remote set-url origin https://github.com/TU-USUARIO/s2fit.git`
y repite el `git push`.

Recarga la página del repositorio: deben aparecer las carpetas `backend`, `frontend`, etc.

### 2.3 Activar GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. En **Build and deployment → Source** elige **GitHub Actions**.

### 2.4 Guardar las variables del sitio

1. **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**.
2. Crea estas dos (nombre exacto, valor de tus notas):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | La Project URL (`https://xxxxxxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | La **publishable** key (`sb_publishable_…`) |

`VITE_API_BASE_URL` la creas en la Parte 4, cuando Render te dé su dirección.
`VITE_WHATSAPP_BUSINESS_NUMBER` no hace falta: el número se configura desde el panel.

> Usa la pestaña **Variables**, no *Secrets*: estos valores son públicos y el sitio los necesita al compilarse.

---

## Parte 3. Render (la API)

1. En <https://dashboard.render.com> pulsa **New → Blueprint**.
2. Conecta tu cuenta de GitHub si te lo pide y elige el repositorio **s2fit**.
3. Render lee el archivo `render.yaml` y muestra el servicio **s2fit-api** (plan *Free*).
   Te pide los valores que faltan; llénalos así:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La URI del Session pooler con tu contraseña (Parte 1.3) |
| `SUPABASE_URL` | La Project URL |
| `SUPABASE_JWT_SECRET` | Vacío, o el Legacy JWT Secret si lo tenías (Parte 1.4) |
| `SUPABASE_SERVICE_ROLE_KEY` | La **secret** key (`sb_secret_…`) |
| `CORS_ORIGINS` | `https://TU-USUARIO.github.io` (sin barra final y sin `/s2fit`) |

4. Pulsa **Apply** / **Deploy Blueprint**.
5. Abre el servicio **s2fit-api** y mira la pestaña **Logs**. La primera vez tarda unos 5 minutos.
   Al arrancar crea las tablas solo (`alembic upgrade head`). Cuando veas `Your service is live`, sigue.
6. Copia la dirección del servicio (arriba, debajo del nombre): `https://s2fit-api.onrender.com`
   (puede tener letras extra, por ejemplo `s2fit-api-ab12.onrender.com`).
7. Ábrela agregando `/health` al final:
   `https://s2fit-api.onrender.com/health` → debe decir `{"status":"ok","database":"ok"}`.

> Si no te aparece la opción Blueprint, crea el servicio a mano: **New → Web Service**, elige el
> repositorio y usa *Root Directory* `backend`, *Build Command* `pip install -r requirements.txt`,
> *Start Command* `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers`,
> *Instance Type* **Free**, y agrega las variables de la tabla más `ENVIRONMENT=production` y `PYTHON_VERSION=3.14.3`.

---

## Parte 4. Publicar el sitio

1. En GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**:

| Name | Value |
|---|---|
| `VITE_API_BASE_URL` | La dirección de Render, **sin barra final** (`https://s2fit-api.onrender.com`) |

2. Ve a la pestaña **Actions** del repositorio → a la izquierda **Frontend (GitHub Pages)** →
   botón **Run workflow** → **Run workflow**.
3. Espera a que el círculo amarillo se ponga verde (2 a 4 minutos). Si se pone rojo, abre el
   paso que falló para ver el error.
4. Tu sitio queda en: **`https://TU-USUARIO.github.io/s2fit/`**
   (también aparece en *Settings → Pages*).

---

## Parte 5. Conectar el login de Supabase con tu sitio

En Supabase: **Authentication → URL Configuration**.

1. **Site URL**: `https://TU-USUARIO.github.io/s2fit/`
2. **Redirect URLs** → *Add URL* y agrega:
   - `https://TU-USUARIO.github.io/**`
   - `http://localhost:5173/**` (para trabajar en local)
3. Pulsa **Save**.

Sin esto, los enlaces de confirmación de correo y de recuperación de contraseña no funcionan.

---

## Parte 6. Cargar los productos de ejemplo y crear el administrador

El plan gratuito de Render **no tiene consola (Shell)**, así que estos comandos se ejecutan desde
**tu computador**, conectado a la base de Supabase. Necesitas el backend preparado como en el
Paso 3 de [EJECUTAR_EN_LOCAL.md](EJECUTAR_EN_LOCAL.md) (la carpeta `.venv` con las dependencias instaladas).

### 6.1 Regístrate en el sitio publicado

1. Abre `https://TU-USUARIO.github.io/s2fit/` → **Crear cuenta**.
2. En **Celular (WhatsApp)** escribe el número del negocio **sin espacios** (ej. `3001234567`).
   Este número será el WhatsApp de la tienda.
3. Confirma el correo y **inicia sesión una vez**.

> La primera visita puede tardar hasta un minuto: Render está «despertando» la API.

### 6.2 Ejecuta los comandos

Abre PowerShell en la carpeta `backend`:

```powershell
.\.venv\Scripts\Activate.ps1

# Apunta SOLO esta terminal a la base de Supabase (no cambia tu archivo .env)
$env:DATABASE_URL = "postgresql://postgres.xxxxxxxx:TU_CLAVE@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"

# Productos, contenidos y retos de ejemplo
python -m scripts.seed_demo --allow-production

# Te convierte en administrador y guarda tu celular como WhatsApp de la tienda
python -m scripts.set_role --email TU_CORREO@gmail.com --role admin
```

Debe responder algo como:

```
tu_correo@gmail.com: rol customer -> admin
WhatsApp de la tienda: 573001234567
```

Para usar un número distinto al de tu registro:
`python -m scripts.set_role --email TU_CORREO@gmail.com --role admin --whatsapp "+57 310 555 1234"`

Cierra esa terminal al terminar (así la variable `DATABASE_URL` deja de apuntar a producción).

### 6.3 Entra al panel

En el sitio, **cierra sesión y vuelve a entrar**. Verás **Admin** en el menú.

- **Cambiar el WhatsApp:** *Admin → Configuración* → escribe el número → **Guardar número**.
  Con **Probar enlace** compruebas que abre el chat correcto. Si algún día no hay número, el
  panel muestra un aviso arriba.
- **Fotos de productos:** *Admin → Catálogo e inventario* → **Editar** → **Subir foto**.
- **Videos y portadas:** *Admin → Contenido y retos* → pega un enlace de YouTube/Vimeo o sube un
  video MP4 (máx. 50 MB) y una portada → **Guardar cambios**.

---

## Parte 7. Lista de comprobación

- [ ] `https://…onrender.com/health` responde `"database":"ok"`.
- [ ] El sitio carga y la **Tienda** muestra los 6 productos de ejemplo.
- [ ] Puedes registrarte, confirmar el correo e iniciar sesión.
- [ ] Ves el enlace **Admin** y *Admin → Configuración* muestra el WhatsApp.
- [ ] Una compra de prueba (Tienda → bolsa → **Comprar por WhatsApp**) abre WhatsApp con la referencia.
- [ ] Subiste una foto a un producto y se ve en la tienda.
- [ ] *Admin → Pagos* muestra el pago pendiente de la compra de prueba.

---

## Parte 8. Para el día de la demo

- **Despierta la API antes:** abre `/health` 2 minutos antes de presentar. El plan gratis de
  Render la apaga tras 15 minutos sin uso y tarda cerca de un minuto en volver.
- **Supabase se pausa** si pasa 7 días sin actividad. Entra al panel de Supabase la víspera; si
  dice *Paused*, pulsa **Resume project**.
- **Crea las cuentas de prueba con anticipación**, por el límite de correos por hora.
- Los productos y precios de ejemplo dicen «Precio de ejemplo». Puedes editarlos en el panel.

---

## Parte 9. Cómo publicar cambios después

Cada vez que cambies el código:

```powershell
git add .
git commit -m "Describe el cambio"
git push
```

- Si cambiaste algo en `frontend/`, GitHub vuelve a publicar el sitio solo (pestaña *Actions*).
- Si cambiaste algo en `backend/`, Render vuelve a desplegar la API sola y aplica las migraciones.

---

## Problemas frecuentes

| Qué ves | Qué hacer |
|---|---|
| El sitio sale en blanco | *Settings → Pages → Source* debe ser **GitHub Actions**. Vuelve a ejecutar el workflow. |
| «No pudimos conectar con el servidor» | Render está despertando (espera un minuto), `VITE_API_BASE_URL` está mal escrita, o falta volver a ejecutar el workflow después de crearla. |
| Error de **CORS** en la consola del navegador (F12) | En Render, `CORS_ORIGINS` debe ser exactamente `https://TU-USUARIO.github.io`, sin `/s2fit` ni barra final. Guarda y espera el redespliegue. |
| `/health` dice `"database":"unavailable"` | `DATABASE_URL` en Render: usa la del **Session pooler** y revisa que reemplazaste `[YOUR-PASSWORD]`. ¿Está pausado Supabase? |
| El despliegue de Render falla en `alembic upgrade head` | Revisa la contraseña en `DATABASE_URL` (Logs de Render muestran el error). |
| Error 401 «Sesión inválida» al iniciar sesión | `SUPABASE_URL` de Render no es la del mismo proyecto que `VITE_SUPABASE_URL`, o tu proyecto usa Legacy JWT Secret y no lo pusiste. |
| «La autenticación no está configurada» | Faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` en *Variables* de GitHub. Vuelve a ejecutar el workflow. |
| El enlace del correo de confirmación no funciona | Revisa la Parte 5 y abre el enlace en el mismo navegador donde te registraste. |
| `set_role`: «No existe ninguna cuenta» | Regístrate en el sitio publicado e inicia sesión una vez; revisa que `$env:DATABASE_URL` sea la de Supabase. |
| WhatsApp no se abre al comprar | *Admin → Configuración*: agrega el número. |
| «El almacenamiento no está configurado» al subir | Falta `SUPABASE_SERVICE_ROLE_KEY` (secret key) en Render → *Environment*. |
| «No se pudo subir el archivo» | El bucket `product-images` no existe o no está marcado como público. |
| El workflow de GitHub falla en «Pruebas» | Abre el paso en *Actions* para ver qué prueba falló y compártelo para revisarlo. |

---

## Tus notas (llénalas)

| Dato | Dónde se usa | Valor |
|---|---|---|
| Contraseña de la base | Dentro de `DATABASE_URL` | |
| Project URL | GitHub `VITE_SUPABASE_URL` y Render `SUPABASE_URL` | |
| Publishable key | GitHub `VITE_SUPABASE_ANON_KEY` | |
| Secret key (**secreta**) | Render `SUPABASE_SERVICE_ROLE_KEY` | |
| URI Session pooler (**secreta**) | Render `DATABASE_URL` | |
| Legacy JWT Secret (si aplica) | Render `SUPABASE_JWT_SECRET` | |
| Dirección de Render | GitHub `VITE_API_BASE_URL` | |
| Dirección del sitio | Supabase *Site URL* | |
