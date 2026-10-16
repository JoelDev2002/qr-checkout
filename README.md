# QRCheckout

QRCheckout es una web responsive para Saga Falabella Puruchuco (prototipo con datos simulados) donde el cliente escanea los códigos de barras de los productos con su celular, ve al instante el precio de oferta y el precio con tarjeta CMR, y arma un carrito. Al pagar, la app genera un QR con un código corto (`C-XXXXX`) que el cajero escanea en su propia pantalla de la misma web para cobrar y bajar el stock. Hay tres roles: cliente (entra con Google), cajero y administrador (correo y contraseña).

La interfaz está en español (Perú). Todos los montos se manejan como enteros en céntimos y los precios de oferta y CMR se calculan en el servidor.

## Requisitos

- **Node.js LTS** (con `npm`). No hace falta instalar Prisma ni Vite por separado: son dependencias del proyecto.
- **MySQL 8**. Se puede usar un contenedor de Docker (recomendado) o un MySQL instalado en Windows (instalador oficial o XAMPP).
- **Git**.
- (Opcional) **Docker Desktop** para levantar MySQL sin instalarlo.
- (Opcional, para el celular) Una herramienta de túnel: `cloudflared` o `ngrok`.

## Instalación en Windows (PowerShell)

Todos los comandos son de PowerShell y se ejecutan desde la raíz del repositorio.

### 1. Descargar el proyecto e instalar dependencias

```powershell
git clone <url-del-repositorio> qrcheckout
Set-Location qrcheckout
npm install
```

`npm install` instala los workspaces `frontend` y `backend` y, al terminar, ejecuta `prisma generate` (script `postinstall` del backend). No ejecutes `npm install` dentro de `frontend/` o `backend/` por separado.

### 2. Levantar MySQL y crear las bases

Con Docker (recomendado). El puerto se publica solo en tu PC (`127.0.0.1`), no en la red:

```powershell
docker run --name qrcheckout-mysql -e MYSQL_ROOT_PASSWORD=tu_clave_de_mysql -p 127.0.0.1:3306:3306 -d mysql:8
```

Espera entre 20 y 30 segundos a que el contenedor termine de iniciar y luego crea las dos bases (producción local y pruebas):

```powershell
docker exec qrcheckout-mysql mysql -uroot -ptu_clave_de_mysql -e "CREATE DATABASE IF NOT EXISTS qrcheckout CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE DATABASE IF NOT EXISTS qrcheckout_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Para levantarlo de nuevo en otra sesión: `docker start qrcheckout-mysql`.

Si usas MySQL instalado en Windows, crea las mismas bases `qrcheckout` y `qrcheckout_test` con MySQL Workbench o la consola `mysql` (conjunto de caracteres `utf8mb4`).

### 3. Copiar los `.env.example` a `.env`

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Nunca se sube ningún `.env` a Git (solo `.env.example`). No pongas valores reales en `.env.example`.

#### `backend/.env`

| Variable | Qué poner |
|---|---|
| `PORT` | Puerto de la API. Por defecto `3000`. |
| `NODE_ENV` | `development` en local. |
| `DATABASE_URL` | `mysql://root:tu_clave_de_mysql@localhost:3306/qrcheckout` (misma clave que usaste en Docker). |
| `DATABASE_URL_TEST` | Igual pero terminando en `qrcheckout_test`. La base debe terminar en `_test` (lo exigen las pruebas). |
| `JWT_SECRET` | Una cadena larga y aleatoria, mínimo 32 caracteres. Genera una con el comando de abajo. |
| `JWT_EXPIRES_IN` | Vigencia del token, por ejemplo `8h`. |
| `FRONTEND_URL` | `https://localhost:5173` (origen permitido por CORS). |
| `GOOGLE_CLIENT_ID` | ID de cliente OAuth de Google. Si se deja vacío, el login con Google queda deshabilitado y `/auth/google` responde 503. |
| `CART_QR_TTL_MINUTES` | Minutos de vigencia del QR del carrito. Por defecto `30`. |
| `INSTALLMENTS_OPTIONS` | Cuotas informativas ofrecidas, por ejemplo `3,6,12`. |
| `INSTALLMENTS_MIN_TOTAL_CENTS` | Total mínimo en céntimos para mostrar cuotas (por ejemplo `30000` = S/ 300.00). |
| `DEV_LOGIN` | `true` solo en desarrollo: habilita `POST /auth/dev-login` (cliente de prueba). En cualquier otro caso la ruta no existe. |
| `MP_ACCESS_TOKEN` | Solo para el pago en línea opcional con Mercado Pago. Déjalo vacío si no lo usas. |
| `ADMIN_EMAIL` | Correo del admin inicial que crea `npm run db:seed`. |
| `ADMIN_PASSWORD` | Contraseña del admin inicial (mínimo 8 caracteres). |

Si la contraseña de MySQL tiene caracteres especiales (`@`, `:`, `/`, `#`…), escríbela codificada para URL en `DATABASE_URL`. Lo más simple para el prototipo es usar una clave sin esos caracteres.

#### `frontend/.env`

| Variable | Qué poner |
|---|---|
| `VITE_API_URL` | Debe ser `/api`. Ver [Probar desde el celular](#probar-desde-el-celular-con-un-túnel). |
| `VITE_GOOGLE_CLIENT_ID` | El mismo ID de cliente OAuth que `GOOGLE_CLIENT_ID`. Si queda vacío, el botón de Google muestra un aviso. |
| `VITE_MP_PUBLIC_KEY` | Solo para el pago en línea opcional con Mercado Pago. Déjalo vacío si no lo usas. |

### 4. Generar el `JWT_SECRET` con Node

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copia la salida y pégala como valor de `JWT_SECRET` en `backend/.env`.

### 5. Aplicar migraciones y cargar datos de ejemplo

```powershell
npm run db:migrate
npm run db:seed
```

- `npm run db:migrate` aplica las migraciones de Prisma a `qrcheckout`.
- `npm run db:seed` crea el admin inicial (con `ADMIN_EMAIL` / `ADMIN_PASSWORD`) y carga el catálogo de ejemplo de `prisma/seed-data/` (categorías con sus campos, campañas y productos). Se puede ejecutar más de una vez sin duplicar datos.

### 6. Levantar la aplicación

Abre dos terminales en la raíz del proyecto:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

- API: `http://localhost:3000` (puedes comprobar `http://localhost:3000/api/health`).
- Web: `https://localhost:5173`. El navegador mostrará una advertencia porque el certificado es de prueba; acéptala.

`npm run dev:web` sirve HTTPS porque la cámara del navegador exige HTTPS.

### 7. Correr las pruebas

```powershell
npm run test
```

Necesita que exista la base `qrcheckout_test` y que `DATABASE_URL_TEST` esté en `backend/.env`. Antes de correr, el proyecto aplica solo a esa base las migraciones pendientes (`prisma migrate deploy`); nunca toca `qrcheckout`. No ejecutes la suite del backend dos veces a la vez: comparte la base de pruebas.

### Comandos disponibles (definidos en la raíz)

| Comando | Qué hace |
|---|---|
| `npm install` | Instala todo el monorepo. |
| `npm run dev:api` | Backend con recarga en `http://localhost:3000`. |
| `npm run dev:web` | Frontend con HTTPS en `https://localhost:5173`. |
| `npm run test` | Vitest en backend y frontend. |
| `npm run db:migrate` | Aplica migraciones de Prisma (`prisma migrate dev`). |
| `npm run db:seed` | Carga el admin y el catálogo de ejemplo. |

Dentro de cada paquete también existe `npm run typecheck` (`tsc --noEmit`).

## Probar desde el celular con un túnel

`VITE_API_URL` vale `/api` a propósito: el celular no puede llegar a `localhost:3000` de tu PC y una página HTTPS no puede llamar a una API HTTP. Por eso el navegador llama siempre a `/api` en el **mismo origen** y el servidor de desarrollo de Vite hace de proxy hacia `http://localhost:3000`. Así solo hay que exponer un puerto (el 5173).

1. Con `npm run dev:web` corriendo, levanta el túnel apuntando al Vite local. Como el certificado de Vite es autofirmado:

   ```powershell
   cloudflared tunnel --no-tls-verify --url https://localhost:5173
   ```

   o, con ngrok (no verifica el certificado del origen por defecto):

   ```powershell
   ngrok http https://localhost:5173
   ```

2. La herramienta imprime una URL pública HTTPS (por ejemplo `https://algo.trycloudflare.com`). Ábrela en el celular y acepta la advertencia de certificado si aparece.

3. Vite puede rechazar el nombre del túnel: añádelo en `server.allowedHosts` de `frontend/vite.config.ts`. Los sufijos de Cloudflare y ngrok (`.trycloudflare.com`, `.ngrok-free.app`, `.ngrok.io`) ya están incluidos; si usas otro dominio, agrega su sufijo o el host exacto.

4. El origen `VITE_API_URL=/api` no cambia: la llamada sale por el mismo host del túnel y Vite la reenvía a la API local.

Revisa las condiciones vigentes del servicio de túnel que elijas antes de usarlo.

## Configurar el login con Google

1. Entra a **Google Cloud Console** → **APIs y servicios** → **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth**. Tipo de aplicación: **Aplicación web**.
2. En **Orígenes de JavaScript autorizados** agrega:
   - `https://localhost:5173`
   - la URL pública HTTPS del túnel (cambia en cada ejecución de Cloudflare/ngrok; vuelve a agregarla cuando cambie).
   
   Google no acepta direcciones IP como origen.
3. Copia el **ID de cliente** en las dos variables:
   - `backend/.env` → `GOOGLE_CLIENT_ID`
   - `frontend/.env` → `VITE_GOOGLE_CLIENT_ID`
4. Reinicia `npm run dev:api` y `npm run dev:web` para que tomen los nuevos valores.
5. En `/login`, la sección **Clientes** muestra el botón de Google. Al usarlo, el navegador recibe el token de Google y lo envía a `POST /auth/google`; el servidor lo verifica, crea el cliente si no existe y devuelve el JWT propio de la app.

### Acceso de prueba (sin Google)

Mientras haya `NODE_ENV=development` y `DEV_LOGIN=true` en `backend/.env`, en `/login` aparece el botón **Entrar como cliente de prueba** (solo en el servidor de desarrollo del frontend). Usa `POST /auth/dev-login`, que crea o reutiliza un cliente fijo (`cliente.prueba@qrcheckout.test`). Fuera de desarrollo esa ruta no existe (responde 404), así que el botón no sirve contra una API de producción.

## Crear un cajero (la pantalla de gestión aún no existe)

El cajero se crea con la API de administración. Con la API corriendo y un admin ya sembrado:

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType 'application/json' -Body '{"email":"ADMIN_EMAIL","password":"ADMIN_PASSWORD"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/users -Headers @{ Authorization = "Bearer $($login.data.token)" } -ContentType 'application/json' -Body '{"name":"Cajero Demo","email":"cajero@ejemplo.com","password":"una_clave_de_8_o_mas"}'
```

Sustituye el correo y la contraseña del admin por los de tu `backend/.env`, y elige los datos del cajero. Luego ese cajero puede entrar en `/login` con su correo y contraseña.

## Guion de demostración

El guion paso a paso, con los códigos de barras de ejemplo y los precios esperados, está en [`docs/DEMO.md`](docs/DEMO.md).
