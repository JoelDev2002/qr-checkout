# TASKS — QRCheckout

Cómo usar este archivo:
- Se hace **una tarea a la vez**, en orden. Cada tarea tiene un "Hecho cuando" que debe cumplirse antes de marcarla `[x]`.
- Antes de programar, leer las secciones de `PRD.md`, `ARCHITECTURE.md` y `DESIGN.md` que se mencionan en la tarea.
- Al terminar una tarea: correr las pruebas, marcar la casilla y resumir qué se hizo y cómo probarlo.
- Los sprints no tienen fechas (las del canvas son ficticias).

## Sprint 0 — Base del proyecto

- [x] **T0.1 Repositorio y workspaces.** Crear `qrcheckout/` con Git, `.gitignore` (incluye `.env`, `node_modules`), `package.json` con workspaces `frontend` y `backend`, y los scripts `dev:api`, `dev:web`, `test`, `db:migrate`, `db:seed`.
  *Hecho cuando:* `npm install` funciona en la raíz y los scripts existen (aunque aún no hagan todo).
- [x] **T0.2 Backend base.** Express con TypeScript, `config/env.ts` que valida variables con Zod, `helmet`, `cors`, manejador de errores con el formato de `ARCHITECTURE.md` §6, y `GET /api/health`.
  *Hecho cuando:* `npm run dev:api` responde `{ "data": { "status": "ok" } }` y falla con un mensaje claro si falta una variable.
- [x] **T0.3 Frontend base.** Vite + React + TypeScript + Tailwind, React Router con una página de inicio, tokens de `DESIGN.md` §2 y fuente Archivo.
  *Hecho cuando:* la página abre en `https://localhost:5173` con `@vitejs/plugin-basic-ssl` y usa los colores y la fuente del diseño.
- [x] **T0.4 Proxy de la API.** Configurar en Vite el proxy de `/api` hacia `http://localhost:3000` y `server.allowedHosts` para el túnel. Crear `services/api.ts`.
  *Hecho cuando:* el frontend llama a `/api/health` y muestra el resultado.
- [x] **T0.5 Base de datos y Prisma.** Crear el esquema de `ARCHITECTURE.md` §5, la primera migración y `infrastructure/prisma.ts`. Crear `.env.example` en ambos paquetes.
  *Hecho cuando:* `npm run db:migrate` crea las tablas en MySQL.
- [x] **T0.6 Vitest.** Configurar Vitest en backend y frontend, y Supertest en el backend con `DATABASE_URL_TEST`.
  *Hecho cuando:* `npm run test` corre una prueba de ejemplo en cada paquete.

## Sprint 1 — Catálogo, cuentas y escáner

- [x] **T1.1 Dinero y resumen del carrito.** `frontend/src/lib/money.ts` para formatear céntimos como `S/ 1,889.00`, y en `domain/pricing.ts` la función `summarizeCart` (RN-02) que recibe ítems con precios ya resueltos.
  *Hecho cuando:* la prueba con los seis productos de `ARCHITECTURE.md` §10 da exactamente 1685590 / 699100 / 986490 / 947290 / 39200.
- [x] **T1.2 Precios con campañas y CMR.** En `domain/pricing.ts`, la función `resolvePrices(producto, campañasVigentes, ahora)` según `ARCHITECTURE.md` §4: alcance tienda, categorías o productos; descuento por porcentaje o monto fijo; prioridad (una sola campaña gana, sin acumular); precio de oferta; CMR sobre la oferta; redondeo de mitad hacia arriba; nombre de la campaña aplicada; y porcentajes para mostrar, calculados y redondeados sin guardarlos.
  *Hecho cuando:* hay pruebas para todos los casos listados en `ARCHITECTURE.md` §10 (por ejemplo, original 10000 con campaña de 3000 bps y CMR de 500 bps da oferta 7000 y CMR 6650; con monto fijo de 1500 da oferta 8500).
- [x] **T1.3 Códigos de barras y de carrito.** `domain/barcode.ts`: validar EAN-13 (dígito verificador) y generar códigos internos con prefijo 200–299. `domain/cartCode.ts`: generar `C-XXXXX`.
  *Hecho cuando:* hay pruebas con códigos válidos e inválidos, y los internos generados pasan la validación.
- [x] **T1.4 Cuotas informativas.** `domain/installments.ts` según RN-10 y la configuración de `.env`.
  *Hecho cuando:* pruebas con totales que no se dividen exactos (la primera cuota absorbe los céntimos) y con total por debajo del mínimo (sin cuotas).
- [x] **T1.5 Login de cajero y admin.** Módulo `auth` con `POST /auth/login`, bcrypt, JWT, `GET /auth/me` y middlewares de autenticación y roles.
  *Hecho cuando:* pruebas Supertest confirman que un cajero no accede a rutas de admin y que un token vencido o falso es rechazado.
- [x] **T1.6 Semilla inicial.** `prisma/seed.ts` que crea el admin inicial (desde variables de entorno).
  *Hecho cuando:* `npm run db:seed` se puede ejecutar más de una vez sin duplicar datos.
- [ ] **T1.7 Login con Google.** `POST /auth/google` (verifica el token, crea o busca al cliente) y botón en el frontend. Añadir `POST /auth/dev-login` solo con `NODE_ENV=development` y `DEV_LOGIN=true`, y un botón "Entrar como cliente de prueba" visible solo en desarrollo. (falta probar el login con Google en el navegador)
  *Hecho cuando:* un cliente entra con Google en `localhost`, y la ruta `dev-login` responde 404 fuera de desarrollo (hay prueba).
- [x] **T1.8 API de categorías y campos adicionales.** Módulo `categories` (RN-15): CRUD de categorías y de sus campos (texto, número con unidad, lista de opciones, sí/no; obligatorio u opcional). `key` y `type` no se pueden cambiar después de crear el campo; categorías y campos se desactivan, no se borran. Crear `domain/attributes.ts` que valida los valores de un producto contra los campos activos de su categoría.
  *Hecho cuando:* pruebas cubren tipos incorrectos, obligatorios faltantes, valores fuera de la lista, claves desconocidas, intento de cambiar `key` o `type`, y permisos por rol.
- [x] **T1.8b Frontend: sesión y acceso por rol.** Pantalla de inicio de sesión para cajero y administrador (correo y contraseña, según `DESIGN.md` §4), sesión guardada en el navegador, rutas protegidas por rol (`/admin`, `/cashier`), botón de cerrar sesión y manejo de sesión vencida. El login del cliente con Google es la T1.7.
  *Hecho cuando:* un admin entra y ve una pantalla de administración vacía con su nombre, un cajero entra a su pantalla y no puede abrir `/admin`, y una sesión vencida o un token falso lleva al login.
- [x] **T1.9 Admin: categorías y campos.** Pantalla según `DESIGN.md` §4 (admin, punto 3) con la tabla ordenable de campos y los avisos indicados.
  *Hecho cuando:* se crea una categoría con campos de los cuatro tipos y se desactiva uno sin perder los valores ya guardados.
- [x] **T1.10 API de campañas.** Módulo `campaigns` (RN-16): CRUD con alcance (productos, categorías o toda la tienda), tipo y valor del descuento (porcentaje o monto fijo), prioridad, fechas y activar o desactivar; listado que indica si cada campaña está vigente, programada o vencida (fechas de Lima, la fecha final incluye todo el día). Repositorio con `findActive(ahora)` que devuelve las campañas activas y en fecha con los ids de sus productos y categorías, para consultarlas una sola vez por petición.
  *Hecho cuando:* pruebas cubren los tres alcances, porcentaje y monto fijo, prioridades y empates, fechas de borde, campañas inactivas y permisos por rol.
- [x] **T1.11 Admin: campañas.** Pantalla según `DESIGN.md` §4 (admin, punto 4): alcance con su selector, tipo y valor, prioridad, fechas, interruptor activa/inactiva, conteo "Afecta a N productos" y los avisos indicados.
  *Hecho cuando:* se crea una campaña de cada alcance, aparece como Programada o Vigente según sus fechas y se puede desactivar sin borrarla.
  *(Si el tiempo aprieta, T1.10 y T1.11 pueden pasar al Sprint 3: mientras no haya campañas, oferta = original.)*
- [x] **T1.12 API de productos.** Módulo `products`: crear, editar, listar con búsqueda, filtro por categoría y paginación, activar y desactivar, `GET /products/barcode/:barcode` (con precios calculados y detalles de la categoría) y `POST /products/price-preview`. Validar código único, EAN-13, campos adicionales (T1.8) y porcentaje CMR entre 0 y 90. Al editar un producto, conservar los valores ya guardados de campos desactivados (RN-15): validar con validateAttributes solo los valores enviados, rechazar claves de campos inactivos o desconocidas, y fusionar el resultado con los valores guardados de campos inactivos. Al cambiar un producto de categoría, descartar, con confirmación, los valores que la nueva categoría no tiene.
  *Hecho cuando:* pruebas cubren duplicados, campos adicionales inválidos, producto sin descuento CMR (cmr = normal), precio con campaña vigente y permisos por rol.
- [x] **T1.13 Componente Scanner.** `Scanner` reutilizable con `@zxing/browser`: cámara trasera, formatos EAN-13, EAN-8, UPC, Code 128 y QR, pausa de 1 segundo tras cada lectura, linterna si es posible, entrada manual, y los mensajes de error de `DESIGN.md` §5 (permiso denegado, navegador interno).
  *Hecho cuando:* lee un código real en Chrome de Android y en Safari de iPhone (probar con el túnel) y muestra un mensaje útil si se niega la cámara.
- [x] **T1.14 Admin: lista y formulario de productos.** Pantallas según `DESIGN.md` §4 (admin, puntos 1 y 2) con React Hook Form + Zod: botón **Escanear código** (usa `Scanner` y conserva el código que trae el producto), **Generar código interno** (con JsBarcode para imprimir), campos dinámicos según la categoría (`DynamicFields`), interruptor y porcentaje CMR, y vista previa de precios que llama a `POST /products/price-preview`. Si el código ya existe, ofrecer editar. Los campos NUMBER se envían como número, no como texto: convertir antes de enviar.
  *Hecho cuando:* se crea un producto escaneando su código, con los campos de su categoría y su descuento CMR, y queda visible en la lista.
- [x] **T1.15 Ajustes de stock.** `POST /products/:id/stock-adjustments` y ventana en el admin con motivo obligatorio e historial.
  *Hecho cuando:* el stock cambia solo con motivo y cada ajuste queda registrado con usuario y fecha.
- [x] **T1.16 Gestión de cajeros.** Módulo `users` (crear, listar, desactivar) y pantalla del admin.
  *Hecho cuando:* un cajero desactivado ya no puede iniciar sesión.
- [x] **T1.17 Datos de ejemplo.** Preparar en `prisma/seed-data/` los archivos `categories.json` (con sus campos adicionales), `campaigns.json` (una o dos campañas) y `products.json` (20 a 30 productos, incluidos los seis de `ARCHITECTURE.md` §10 y otros de categorías distintas) con códigos de barras que puedas escanear. Usar campañas y porcentajes CMR para que los precios se parezcan a los de Falabella; no tienen que coincidir al céntimo. Ampliar la semilla para cargarlos.
  *Hecho cuando:* `npm run db:seed` carga el catálogo y, si un producto es inválido, indica cuál y por qué.

## Sprint 2 — Carrito, QR y cobro

- [x] **T2.1 API del carrito.** Módulo `carts`: obtener o crear el carrito abierto, agregar por código (suma 1), fijar la cantidad exacta (`PATCH` con `quantity`) quitar un producto y vaciar el carrito (`DELETE /cart/items`, rechazado con `CART_LOCKED` si hay un QR activo). Aplicar RN-04 (máximo y stock) y devolver los precios de cada ítem con `resolvePrices` y el resumen con `summarizeCart`.
  *Hecho cuando:* pruebas cubren producto inexistente, sin stock, superar el máximo, carrito bloqueado y un cambio de campaña entre dos consultas (RN-17).
- [x] **T2.2 Pantalla del escáner del cliente.** Según `DESIGN.md` §4: visor, último producto con `PriceTag`, bloque plegable **Detalles** y contador de cantidad, barra inferior con total CMR. Crear los componentes `PriceTag`, `DetailsList` y `QuantityStepper` (RN-19). El contador espera unos 400 ms tras el último toque antes de enviar la cantidad al servidor, para no mandar una petición por cada toque.
  *Hecho cuando:* al escanear un producto se ven al instante su precio de oferta, su precio CMR (si lo tiene), la campaña aplicada y sus detalles; se agrega 1 unidad y se puede subir o bajar la cantidad con el contador o escribiéndola, sin pasar del límite.
- [x] **T2.3 Pantalla del carrito.** `ProductRow`, `CartSummary` con las cuatro líneas de Falabella y el ahorro CMR, cuotas informativas si ya existen (T1.4), estado vacío y botón **Vaciar carrito** con confirmación en pantalla (RN-22).
  *Hecho cuando:* con los seis productos de ejemplo, la pantalla muestra los cuatro montos del PRD sin errores de redondeo.
- [x] **T2.4 Generar y cancelar el QR.** `POST` y `DELETE /cart/qr` (ARCHITECTURE §7), bloqueo del carrito, expiración al leer, y pantalla `QrTicket` con cuenta regresiva.
  *Hecho cuando:* el QR contiene solo el código, editar el carrito con QR activo devuelve `CART_LOCKED`, y un QR vencido devuelve el carrito a OPEN.
- [x] **T2.5 API de cobro.** Módulo `checkout`: vista previa, confirmar (transacción de ARCHITECTURE §7) y rechazar. Validar DNI y RUC para boleta y factura. Asignar el número de comprobante correlativo por serie (`DocumentSeries`, RN-23) y guardar los totales original, de oferta, CMR y cobrado.
   *Hecho cuando:* pruebas cubren cobro correcto con CMR y sin CMR, QR vencido, doble cobro (dos peticiones seguidas cobran una sola vez), stock insuficiente que revierte todo, y una campaña que vence entre la vista previa y el cobro (se cobra con los precios vigentes en ese momento) y números de comprobante correlativos que no se repiten con cobros simultáneos.
- [x] **T2.6 Pantalla del cajero.** Según `DESIGN.md` §4: escaneo del QR o código manual, carrito, elección de medio de pago con las dos tarjetas de monto, tipo de comprobante y **Confirmar cobro**.
  *Hecho cuando:* se cobra un carrito de punta a punta, y con CMR se cobra el total CMR.
- [x] **T2.7 Comprobante.** Componente `Receipt` con estilos de impresión y la leyenda de comprobante simulado. Se muestra tras el cobro (botón **Imprimir comprobante**).
  *Hecho cuando:* al imprimir o guardar como PDF solo aparece el comprobante.
- [x] **T2.8 Historial del cliente.** `GET /purchases` y `/purchases/:saleId`, con pantalla de lista y detalle que reutiliza `Receipt`.
  *Hecho cuando:* un cliente solo ve sus propias compras (hay prueba).
- [x] **T2.9 Cobros del día.** `GET /checkout/sales/today` y pantalla del cajero.
  *Hecho cuando:* la lista muestra solo los cobros de ese cajero en la fecha actual.
- [x] **T2.10 Pulido del flujo.** Estados de carga, vacío y error en todas las pantallas, redirecciones por rol, y revisión de accesibilidad de `DESIGN.md` §6.
  *Hecho cuando:* el flujo completo cliente → QR → cajero se puede recorrer sin instrucciones, en celular.

## Sprint 3 — Dashboard, cuotas y opcionales

- [x] **T3.1 Dashboard.** `GET /dashboard/summary` y pantalla del admin: ventas por día, más escaneados, ventas con CMR frente a otros medios, poco stock. Para "más escaneados" registrar cada lectura exitosa del cliente.
  *Hecho cuando:* los números coinciden con las ventas de prueba.
- [x] **T3.2 Cuotas en pantalla.** Mostrar las cuotas informativas del carrito (calculadas en T1.4) con opciones de 3, 6 y 12.
  *Hecho cuando:* los montos coinciden con las pruebas de `installments.ts`.
- [x] **T3.3 Revisión de seguridad.** Repasar `ARCHITECTURE.md` §8: límites de intentos, validaciones, roles, secretos, mensajes de error.
  *Hecho cuando:* hay una lista de verificación marcada y pruebas para los puntos críticos.
- [x] **T3.4 README y guion de demo.** README con instalación en Windows, variables de entorno, cómo levantar el túnel y configurar Google, y un guion de demostración con los pasos y los códigos de barras a usar.
  *Hecho cuando:* otra persona puede levantar el proyecto siguiendo solo el README.

### Opcionales (solo si el resto está terminado y probado)

- [ ] **T3.5 Pago en línea con Culqi (modo pruebas).** Pantalla de pago según `DESIGN.md` §4 (cliente, puntos 6 y 7): comprobante (ticket, boleta o factura, con validación de DNI y RUC), formulario con tokenización en el navegador y correo del comprador. `POST /payments/online/preview` (consulta el token en Culqi, compara el BIN con `CMR_BINS` y devuelve el monto exacto) y `POST /payments/online` (cobra el monto decidido por el servidor y crea la venta con medio `ONLINE`, marca, últimos 4 dígitos y banco emisor), según `ARCHITECTURE.md` §7. Revisar en la documentación de Culqi cómo consultar los datos de un token y cómo anular un cobro.
  *Hecho cuando:* con el BIN de prueba de `CMR_BINS` se cobra el total CMR y con otra tarjeta el total de oferta; el navegador no puede cambiar el monto; una tarjeta rechazada no cambia el stock ni el carrito y permite reintentar; y no se guarda número completo, CVV ni vencimiento (hay prueba).
- [ ] **T3.6 Verificación de salida.** Pantalla del cliente con el QR de salida (`O-XXXXX`) tras un pago aprobado, y en la pantalla del cajero un campo y escáner para verificar el código (`POST /checkout/exit/:code/verify`) y marcar `deliveredAt`. En el historial del cliente se ve "Por entregar" o "Entregado".
  *Hecho cuando:* el segundo intento de verificar la misma venta responde "Ya entregado".

## Después del MVP (no hacer todavía)

Imágenes de productos, importación masiva en la interfaz, rol vendedor, descuento regular propio por producto, guías de entrada y salida, garantía extendida, facturación electrónica real, integración con los sistemas de Saga.

- Reimprimir el comprobante de una venta pasada desde "Cobros de hoy": requiere que GET /checkout/sales/today incluya el id de cada venta y una ruta de detalle para el cajero (por ejemplo GET /checkout/sales/:saleId).

