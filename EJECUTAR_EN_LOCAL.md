# Cómo ejecutar S2 Fit en tu computador (Windows)

Esta guía es para principiantes. Al final tendrás la tienda abierta en tu navegador en
`http://localhost:5173`, con la API funcionando en `http://localhost:8000`.

El proyecto tiene dos partes que se ejecutan **al mismo tiempo, en dos terminales distintas**:

| Parte | Carpeta | Qué es | Dirección local |
|---|---|---|---|
| Backend (API) | `backend/` | Python + FastAPI. Guarda pedidos, pagos, inventario… | http://localhost:8000 |
| Frontend (sitio) | `frontend/` | React. Lo que ve la clienta en el navegador | http://localhost:5173 |

El inicio de sesión (registro, contraseñas, correos de confirmación) lo hace **Supabase**, que
siempre está en internet, incluso cuando trabajas en local.

---

## Paso 0. Instala los programas (una sola vez)

Instala estos programas con las opciones por defecto. Después de instalarlos, **cierra y vuelve
a abrir** la terminal para que Windows los reconozca.

1. **Git**: <https://git-scm.com/download/win>
2. **Python 3.14** (sirve 3.12 o superior): <https://www.python.org/downloads/>
   En la primera pantalla del instalador marca **«Add python.exe to PATH»**.
3. **Node.js 24 LTS**: <https://nodejs.org/>
4. **PostgreSQL 17** (solo si eliges la opción A del paso 2): <https://www.postgresql.org/download/windows/>
   Anota la contraseña que le pongas al usuario `postgres`.
5. Un editor, por ejemplo **Visual Studio Code**: <https://code.visualstudio.com/>

Comprueba que todo quedó instalado. Abre **PowerShell** y escribe:

```powershell
git --version
python --version
node --version
npm --version
```

Cada comando debe mostrar un número de versión. Si alguno dice «no se reconoce», reinstálalo
o reinicia el computador.

> **Cómo abrir una terminal en una carpeta:** en el Explorador de archivos entra a la carpeta,
> haz clic en la barra de direcciones, escribe `powershell` y pulsa Enter. En VS Code también
> sirve *Terminal → New Terminal*.

---

## Paso 1. Crea tu proyecto de Supabase (una sola vez)

Lo necesitas para registrarte e iniciar sesión, y para subir fotos y videos. Si ya hiciste la
**Parte 1** de [DESPLEGAR_PASO_A_PASO.md](DESPLEGAR_PASO_A_PASO.md), salta este paso: es el mismo
proyecto y sirve para local y para internet.

Resumen (los detalles con capturas de dónde está cada cosa están en esa guía):

1. Crea una cuenta en <https://supabase.com> y un proyecto nuevo (región *South America (São Paulo)*).
2. Copia la **Project URL**, la clave **publishable** y la clave **secret**
   (*Project Settings → API Keys*).
3. En *Storage* crea un bucket **público** llamado `product-images`.
4. En *Authentication → URL Configuration* agrega `http://localhost:5173/**` en **Redirect URLs**.

---

## Paso 2. Elige dónde vive la base de datos en local

**Opción A (recomendada): PostgreSQL en tu computador.** Tus pruebas no tocan los datos de internet.

Abre PowerShell y crea las dos bases (te pedirá la contraseña de `postgres`):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE s2fit;" -c "CREATE DATABASE s2fit_test;"
```

Tu `DATABASE_URL` será (cambia `TU_CLAVE` por la contraseña de `postgres`):

```
postgresql+psycopg://postgres:TU_CLAVE@localhost:5432/s2fit
```

> Si ya tienes el clúster de desarrollo del README en el puerto **54329**, usa
> `postgresql+psycopg://postgres@localhost:54329/s2fit` y no crees nada.

**Opción B (más simple): usar directamente la base de Supabase.** No instalas PostgreSQL, pero
todo lo que hagas en local queda en la misma base que usa el sitio publicado. Tu `DATABASE_URL`
es la URI del **Session pooler** (ver la Parte 1 de la guía de despliegue).

---

## Paso 3. Prepara y ejecuta el backend

Abre una terminal en la carpeta del proyecto y ejecuta, una línea a la vez:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Si sale un error rojo sobre «ejecución de scripts», ejecuta esto **una vez** y repite la última línea:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Cuando la línea de la terminal empiece con `(.venv)`, instala las dependencias y crea tu archivo de configuración:

```powershell
pip install -r requirements-dev.txt
Copy-Item .env.example .env
code .env        # o ábrelo con el Bloc de notas: notepad .env
```

En `backend\.env` cambia estas líneas (deja las demás como están):

```ini
DATABASE_URL=postgresql+psycopg://postgres:TU_CLAVE@localhost:5432/s2fit
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...        # clave secret de Supabase (para subir fotos y videos)
CORS_ORIGINS=http://localhost:5173
```

`SUPABASE_JWT_SECRET` se deja vacío en proyectos nuevos de Supabase. Solo se llena si tu
proyecto muestra un *Legacy JWT secret* (ver la guía de despliegue).

Crea las tablas, carga los datos de ejemplo y arranca la API:

```powershell
alembic upgrade head
python -m scripts.seed_demo
uvicorn app.main:app --reload --port 8000
```

Comprueba en el navegador:

- <http://localhost:8000/health> → debe decir `{"status":"ok","database":"ok"}`
- <http://localhost:8000/docs> → documentación interactiva de la API

**Deja esta terminal abierta.** Si la cierras, la API se apaga.

---

## Paso 4. Prepara y ejecuta el frontend

Abre **otra** terminal en la carpeta del proyecto:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
notepad .env.local
```

En `frontend\.env.local` llena:

```ini
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...     # clave publishable (pública)
```

`VITE_WHATSAPP_BUSINESS_NUMBER` es opcional: el número real se configura desde el panel (paso 5).

> **Nunca** pongas la clave *secret* en este archivo: todo lo que empieza por `VITE_` lo puede ver cualquier visitante.

Arranca el sitio:

```powershell
npm run dev
```

Abre <http://localhost:5173>. Verás la tienda con los productos de ejemplo.

---

## Paso 5. Crea tu usuario administrador y el WhatsApp de la tienda

1. En <http://localhost:5173> pulsa **Crear cuenta**. Escribe tu **celular de WhatsApp** sin
   espacios (por ejemplo `3001234567`), acepta el tratamiento de datos y regístrate.
2. Abre el correo de confirmación de Supabase y pulsa el enlace.
3. **Inicia sesión una vez** en la web (así la API crea tu perfil).
4. En la terminal del backend, detén la API con `Ctrl + C` y ejecuta:

   ```powershell
   python -m scripts.set_role --email TU_CORREO@gmail.com --role admin
   uvicorn app.main:app --reload --port 8000
   ```

   El primer comando muestra algo como:

   ```
   tu_correo@gmail.com: rol customer -> admin
   WhatsApp de la tienda: 573001234567
   ```

   Ese es el número al que llegarán los pedidos: se tomó del celular con el que te registraste.
   Si quieres otro, agrega `--whatsapp "+57 310 555 1234"` al comando.
5. En la web, **cierra sesión y vuelve a entrar**. Aparece el enlace **Admin** en el menú.

**Cambiar el WhatsApp después:** *Admin → Configuración*. Escribe el número nuevo y pulsa
**Guardar número** (o **Usar mi celular**). Con **Probar enlace** abres WhatsApp para comprobarlo.

---

## Paso 6. Sube fotos y videos desde el panel

Necesitas el bucket `product-images` y `SUPABASE_SERVICE_ROLE_KEY` en `backend\.env` (paso 1 y 3).

- **Foto de un producto:** *Admin → Catálogo e inventario →* **Editar** en el producto → **Subir foto**
  (JPG, PNG o WEBP, máximo 5 MB). Se guarda sola.
- **Video de una rutina o receta:** *Admin → Contenido y retos.* Puedes:
  - pegar un enlace de **YouTube** o **Vimeo** (se reproduce dentro de la página), o
  - subir un archivo **MP4, WEBM o MOV** de hasta **50 MB**.
- **Portada del contenido:** en el mismo formulario, **sube la portada** (una imagen).
- Pulsa **Crear contenido** o **Guardar cambios**. La vista previa aparece debajo del campo.

> Para videos largos usa YouTube en modo **Oculto** y pega el enlace: no gasta el espacio
> gratuito de Supabase (1 GB).

---

## El día a día

Cada vez que quieras trabajar en el proyecto:

**Terminal 1 (backend):**

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 (frontend):**

```powershell
cd frontend
npm run dev
```

Si usas la opción A con PostgreSQL instalado normalmente, el servicio arranca solo con Windows.

Si alguien cambia el código y hay migraciones nuevas, ejecuta `alembic upgrade head` en la terminal del backend.

---

## Pruebas automáticas

```powershell
# Backend (usa la base s2fit_test, que se borra y se vuelve a crear en cada ejecución)
cd backend
$env:TEST_DATABASE_URL = "postgresql+psycopg://postgres:TU_CLAVE@localhost:5432/s2fit_test"
python -m pytest

# Frontend
cd frontend
npm run typecheck
npm test
```

---

## Problemas frecuentes

| Qué ves | Qué hacer |
|---|---|
| `python` o `npm` «no se reconoce» | Reinstala marcando *Add to PATH* y abre una terminal nueva. |
| `Activate.ps1 no se puede cargar` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` y vuelve a intentarlo. |
| `/health` dice `"database":"unavailable"` | PostgreSQL está apagado o `DATABASE_URL` tiene mal la clave, el puerto o el nombre de la base. |
| `password authentication failed` | La contraseña de `postgres` en `DATABASE_URL` no es la correcta. |
| La web dice «No pudimos conectar con el servidor» | La terminal del backend está cerrada o `VITE_API_BASE_URL` no es `http://localhost:8000`. |
| «La autenticación no está configurada» | Faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` en `frontend\.env.local`. Detén `npm run dev` y vuelve a arrancarlo después de editar el archivo. |
| El enlace del correo de confirmación no funciona | Agrega `http://localhost:5173/**` en *Supabase → Authentication → URL Configuration → Redirect URLs* y ábrelo en el mismo navegador. |
| `set_role` dice «No existe ninguna cuenta» | Primero regístrate, confirma el correo e **inicia sesión una vez** en la web. |
| «El almacenamiento no está configurado» al subir | Falta `SUPABASE_SERVICE_ROLE_KEY` en `backend\.env`. Reinicia la API después de editarlo. |
| «No se pudo subir el archivo» | El bucket `product-images` no existe o no es público. |
| No aparece el enlace **Admin** | Cierra sesión y vuelve a entrar después de ejecutar `set_role`. |
