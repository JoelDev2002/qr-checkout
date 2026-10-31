# ARCHITECTURE — QRCheckout

Versión 1.0 · Todo se ejecuta en local (Windows) · Lenguaje: **TypeScript** en frontend y backend

## 1. Stack y librerías

**Frontend** (`frontend/`)

| Librería | Para qué |
|---|---|
| React + Vite | Base del proyecto |
| React Router | Pantallas y rutas protegidas por rol |
| Tailwind CSS | Estilos, mobile-first |
| @fontsource-variable/archivo | Tipografía (ver DESIGN.md) |
| @zxing/browser | Leer códigos de barras y QR desde la cámara (funciona en Safari) |
| qrcode.react | Mostrar el QR del carrito |
| JsBarcode | Dibujar códigos de barras internos para imprimir |
| React Hook Form + Zod | Formularios y validación |
| Sileo | Avisos (toasts) de resultado en el frontend |
| @react-oauth/google | Botón de login con Google |
| @vitejs/plugin-basic-ssl | HTTPS de desarrollo (la cámara lo exige) |
| @testing-library/react + @testing-library/user-event | Pruebas de componentes de React |
| jsdom | Entorno de DOM para las pruebas de componentes (solo archivos `.test.tsx`) |

**Backend** (`backend/`)

| Librería | Para qué |
|---|---|
| Express | API |
| Prisma + MySQL | Acceso a la base de datos y migraciones |
| jsonwebtoken + bcrypt | Sesión con JWT y contraseñas con hash |
| google-auth-library | Verificar el token que entrega Google |
| Zod | Validar todo lo que llega a la API |
| helmet, cors, express-rate-limit | Seguridad básica |
| nanoid | Código corto del carrito |
| csv-parse | Leer el CSV de la semilla de productos |
| Mercado Pago (API REST con `fetch`, sin SDK en el backend) | Cobro con tarjeta en modo pruebas; el Card Payment Brick se carga desde `sdk.mercadopago.com/js/v2` solo en la pantalla de pago |

**Pruebas:** Vitest (lógica y componentes) y Supertest (API).

Mercado Pago se integra sin SDK: el backend llama a su API REST con `fetch` usando el Access Token (solo en el servidor), y el script MercadoPago.js (`sdk.mercadopago.com/js/v2`) se carga únicamente cuando el cliente abre la pantalla de pago.

No añadir dependencias fuera de esta lista sin consultarlo.

## 2. Estructura de carpetas

```
qrcheckout/
├── AGENTS.md
├── package.json              (workspaces: frontend, backend)
├── docs/                     (PRD, ARCHITECTURE, DESIGN, TASKS)
├── backend/
│   ├── prisma/               (schema.prisma, migrations, seed.ts, seed-data/*.json)
│   ├── src/
│   │   ├── app.ts, server.ts
│   │   ├── config/           (env.ts: lee y valida .env)
│   │   ├── domain/           (lógica pura, sin Express ni Prisma)
│   │   │   ├── pricing.ts        precios (campañas y CMR) y resumen del carrito
│   │   │   ├── attributes.ts     validar los campos adicionales según la categoría
│   │   │   ├── installments.ts   cuotas informativas
│   │   │   ├── barcode.ts        validar EAN-13 y generar códigos internos
│   │   │   └── cartCode.ts       generar código corto
│   │   ├── infrastructure/   (prisma.ts, jwt.ts, googleAuth.ts, mercadoPago.ts)
│   │   ├── middlewares/      (auth, roles, validate, errorHandler)
│   │   └── modules/          (auth, users, categories, campaigns, products, carts, checkout, purchases, dashboard, payments)
│   │       └── <módulo>/     routes.ts, controller.ts, service.ts, repository.ts, schemas.ts
│   └── tests/
└── frontend/
    └── src/
        ├── pages/            (client/, cashier/, admin/, auth/)
        ├── components/       (PriceTag, CartSummary, Scanner, QrTicket, ...)
        ├── features/         (scanner/, cart/, checkout/, products/)
        ├── services/         (api.ts: único lugar que hace peticiones)
        ├── lib/              (money.ts, auth.ts)
        └── routes.tsx
```

## 3. Capas y reglas de dependencia

Cada módulo del backend separa tres responsabilidades:

1. **routes + controller:** reciben la petición, validan con Zod y devuelven la respuesta.
2. **service:** aplica las reglas de negocio.
3. **repository:** único lugar que habla con Prisma.

Reglas:
- `domain/` no importa Express, Prisma ni nada de `infrastructure/`. Es lo que más se prueba.
- Los servicios usan `domain/` para calcular; los controladores no calculan precios.
- Cambiar de base de datos o conectar el catálogo real de Saga debe afectar solo a los repositorios.

## 4. Dinero y precios

Todos los montos se guardan y calculan como **enteros en céntimos** (S/ 37.90 = `3790`). Nunca `float`. El formateo a soles se hace solo al mostrar, en `frontend/src/lib/money.ts`.

Los porcentajes se guardan como enteros en **puntos básicos** (2850 = 28.50 %), mayores que 0 y hasta 9000. En pantalla se escriben como porcentaje con hasta dos decimales.

El producto guarda solo `originalPriceCents` y su regla CMR (`hasCmrDiscount`, `cmrDiscountBps`). Cada campaña guarda solo su **regla** (tipo y valor del descuento). Los precios de oferta y CMR **y todos los porcentajes que se muestran se calculan al consultar** en `domain/pricing.ts`; no se guardan como dato principal, porque dependen de las fechas y del estado de las campañas:

1. **Campañas aplicables** = activas, con `startsAt ≤ ahora ≤ endsAt`, y cuyo alcance incluye al producto: `STORE` (todos los productos), `CATEGORIES` (la categoría del producto está en su lista) o `PRODUCTS` (el producto está en su lista). Se descarta una campaña de monto fijo si el monto es mayor o igual al precio original del producto.
2. **Cuál gana:** la de mayor `priority`; si empatan, la que dé más ahorro en ese producto; si aún empatan, la de mayor `id`. Se aplica **una sola**; nunca se acumulan.
3. **Precio de oferta** (`normal` en el código): con `PERCENT`, `round(original × (10000 − discountValue) / 10000)`; con `FIXED`, `original − discountValue`. Sin campaña, `normal = original`.
4. **Precio CMR**, calculado sobre el de oferta: `round(normal × (10000 − cmrDiscountBps) / 10000)` si `hasCmrDiscount`; si no, `cmr = normal`.
5. **Porcentajes para el cliente:** se calculan a partir de los precios (`round((1 − precioFinal / original) × 100)`) y se muestran redondeados a entero. No se guardan.

Para `PERCENT`, `discountValue` está en puntos básicos; para `FIXED`, en céntimos por unidad.

`round` redondea al céntimo con mitad hacia arriba. Hay dos funciones: `resolvePrices(producto, campañasVigentes, ahora)` y `summarizeCart(ítems con precios ya resueltos)`. El repositorio devuelve las campañas activas y en fecha con los ids de sus productos y categorías; el servicio las consulta **una sola vez por petición** y se las pasa a `domain/`.

Las fechas de las campañas se guardan en UTC. El admin las escribe como fechas de Lima (UTC−5) y la fecha final incluye todo ese día.

## 5. Modelo de datos (Prisma, referencia)

```prisma
enum Role          { CUSTOMER CASHIER ADMIN }
enum CartStatus    { OPEN PENDING PAID CANCELLED }
enum PaymentMethod { CMR_CARD OTHER_CARD CASH ONLINE }
enum PriceType     { NORMAL CMR }
enum DocType       { TICKET BOLETA FACTURA }
enum FieldType     { TEXT NUMBER SELECT BOOLEAN }
enum DiscountType   { PERCENT FIXED }
enum CampaignScope  { PRODUCTS CATEGORIES STORE }
enum PaymentAttemptStatus { CREATED FAILED APPROVED SALE_CREATED REFUNDED REFUND_FAILED UNKNOWN }

model User {
  id           Int               @id @default(autoincrement())
  email        String            @unique
  name         String
  role         Role
  googleId     String?           @unique
  passwordHash String?
  active       Boolean           @default(true)
  createdAt    DateTime          @default(now())
  carts        Cart[]
  cashierSales Sale[]            @relation("CashierSales")
  customerSales Sale[]           @relation("CustomerSales")
  adjustments  StockAdjustment[]
  scans        ProductScan[]
  paymentAttempts PaymentAttempt[]
}

model Category {
  id        Int             @id @default(autoincrement())
  name      String          @unique
  active    Boolean         @default(true)
  fields    CategoryField[]
  products  Product[]
  campaigns CampaignCategory[]
}

model CategoryField {
  id         Int       @id @default(autoincrement())
  categoryId Int
  category   Category  @relation(fields: [categoryId], references: [id])
  key        String    // identificador estable, no cambia después de crearse
  label      String    // texto visible en formularios y en la app del cliente
  type       FieldType // tampoco cambia después de crearse
  required   Boolean   @default(false)
  options    Json?     // lista de textos, solo si type = SELECT
  unit       String?   // por ejemplo "horas", solo si type = NUMBER
  sortOrder  Int       @default(0)
  active     Boolean   @default(true)
  @@unique([categoryId, key])
}

model Campaign {
  id            Int                @id @default(autoincrement())
  name          String
  scope         CampaignScope
  discountType  DiscountType
  discountValue Int                // PERCENT: puntos básicos · FIXED: céntimos por unidad
  priority      Int                @default(0) // mayor gana
  startsAt      DateTime
  endsAt        DateTime
  active        Boolean            @default(true)
  createdAt     DateTime           @default(now())
  products      CampaignProduct[]  // se usa si scope = PRODUCTS
  categories    CampaignCategory[] // se usa si scope = CATEGORIES
}

model CampaignProduct {
  campaignId Int
  campaign   Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  productId  Int
  product    Product  @relation(fields: [productId], references: [id])
  @@id([campaignId, productId])
}

model CampaignCategory {
  campaignId Int
  campaign   Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  categoryId Int
  category   Category @relation(fields: [categoryId], references: [id])
  @@id([campaignId, categoryId])
}

model Product {
  id                 Int               @id @default(autoincrement())
  barcode            String            @unique
  name               String
  brand              String
  color              String?
  categoryId         Int
  category           Category          @relation(fields: [categoryId], references: [id])
  originalPriceCents Int
  hasCmrDiscount     Boolean           @default(false)
  cmrDiscountBps     Int               @default(0)
  attributes         Json?             // valores de los campos de su categoría, por key
  campaigns          CampaignProduct[]
  stock              Int               @default(0)
  maxPerPurchase     Int               @default(10)
  imageUrl           String?
  active             Boolean           @default(true)
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt
  cartItems          CartItem[]
  saleItems          SaleItem[]
  adjustments        StockAdjustment[]
  scans              ProductScan[]
}

model StockAdjustment {
  id        Int      @id @default(autoincrement())
  productId Int
  product   Product  @relation(fields: [productId], references: [id])
  userId    Int
  user      User     @relation(fields: [userId], references: [id])
  delta     Int
  reason    String
  createdAt DateTime @default(now())
}

model Cart {
  id          Int        @id @default(autoincrement())
  customerId  Int
  customer    User       @relation(fields: [customerId], references: [id])
  status      CartStatus @default(OPEN)
  qrCode      String?    @unique
  qrExpiresAt DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  items       CartItem[]
  sale        Sale?
  paymentAttempts PaymentAttempt[]
}

model CartItem {
  id        Int     @id @default(autoincrement())
  cartId    Int
  cart      Cart    @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productId Int
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  @@unique([cartId, productId])
}

model Sale {
  id                 Int           @id @default(autoincrement())
  code               String        @unique // el código del carrito (caja) u O-XXXXX (en línea)
  receiptNumber      String        @unique // T001-000001, B001-000001, F001-000001
  cartId             Int           @unique
  cart               Cart          @relation(fields: [cartId], references: [id])
  customerId         Int
  customer           User          @relation("CustomerSales", fields: [customerId], references: [id])
  cashierId          Int?          // nulo si fue pago en línea
  cashier            User?         @relation("CashierSales", fields: [cashierId], references: [id])
  paymentMethod      PaymentMethod
  priceApplied       PriceType
  originalTotalCents Int           // suma de precios originales
  offerTotalCents    Int           // total con campañas, sin CMR
  cmrTotalCents      Int           // total con CMR
  totalCents         Int           // lo realmente cobrado
  docType            DocType       @default(TICKET)
  buyerDocType       String?
  buyerDocNumber     String?
  buyerName          String?
  buyerEmail         String?
  cardBrand          String?       // solo pagos en línea: informativos, los informa el navegador y no deciden nada
  cardLast4          String?
  mpOrderId          String?
  deliveredAt        DateTime?
  createdAt          DateTime      @default(now())
  items              SaleItem[]
}

model SaleItem {
  id                 Int     @id @default(autoincrement())
  saleId             Int
  sale               Sale    @relation(fields: [saleId], references: [id], onDelete: Cascade)
  productId          Int
  product            Product @relation(fields: [productId], references: [id])
  barcode            String
  name               String
  quantity           Int
  originalPriceCents Int
  normalPriceCents   Int
  cmrPriceCents      Int
  paidPriceCents     Int     // precio unitario realmente cobrado
  subtotalCents      Int     // paidPriceCents × cantidad
  campaignName       String?
}

model PaymentAttempt {
  id                 Int                  @id @default(autoincrement())
  tokenHash          String               @unique // SHA-256 del token de Mercado Pago; nunca el token en claro
  cartId             Int
  cart               Cart                 @relation(fields: [cartId], references: [id])
  customerId         Int
  customer           User                 @relation(fields: [customerId], references: [id])
  amountCents        Int
  status             PaymentAttemptStatus @default(CREATED)
  mpOrderId          String?
  externalReference  String               @unique // derivado del attemptId: mayúsculas alfanuméricas, sin guiones
  failureCode        String?
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt
}

model DocumentSeries {
  series     String @id // T001, B001, F001
  lastNumber Int    @default(0)
}

model ProductScan {
  id         Int      @id @default(autoincrement())
  productId  Int
  product    Product  @relation(fields: [productId], references: [id])
  customerId Int
  customer   User     @relation(fields: [customerId], references: [id])
  createdAt  DateTime @default(now())

  @@index([productId, createdAt])
  @@index([createdAt])
}
```

### 5.1 Compras, almacén y backup (Sprint 4, épicas del curso)

Se agregan en la migración `20261025120000_purchasing_warehouse`. Los números correlativos usan `DocumentSeries` con las series `OC01` (orden de compra), `GE01` (guía de entrada), `GS01` (guía de salida) e `IN01` (inventario), con el mismo formato `SERIE-000001` de los comprobantes. El detalle completo está en `backend/prisma/schema.prisma` y el diagrama EER de las 25 tablas en [`docs/diagrama-eer.png`](diagrama-eer.png).

| Modelo | Para qué | Reglas |
|---|---|---|
| `Supplier` | Proveedores | RUC de 11 dígitos único y con dígito verificador válido (`domain/ruc.ts`); se desactivan, no se borran |
| `PurchaseOrder` + `PurchaseOrderItem` | Órdenes de compra | Estados `REGISTERED → APPROVED → RECEIVED` o `CANCELLED`; costos en céntimos; el total lo calcula el servidor |
| `GoodsReceipt` + `GoodsReceiptItem` | Guías de entrada | Siempre desde una orden aprobada; suman al stock dentro de una transacción |
| `GoodsIssue` + `GoodsIssueItem` | Guías de salida | Motivo `TRANSFER`, `SUPPLIER_RETURN` o `SHRINKAGE`; restan stock con actualización condicionada (nunca negativo) |
| `InventoryCount` + `InventoryCountItem` | Inventario físico | Guarda stock del sistema, conteo y diferencia; al cerrarlo, cada diferencia crea un `StockAdjustment` con motivo |
| `BackupRecord` | Backups y restauraciones | Quién, cuándo, archivo, tamaño y resultado |

`Product` suma `minStock` (por defecto 5): bajo ese stock el producto se sugiere al crear una orden de compra y aparece en el dashboard de almacén.

Esto es una referencia: ajustar nombres y detalles al implementar, sin cambiar las reglas del PRD.

## 6. API

Formato de respuesta: `{ "data": ... }` en éxito y `{ "error": { "code": "...", "message": "..." } }` en error. Todas las rutas van bajo `/api`.

| Método y ruta | Rol | Qué hace |
|---|---|---|
| POST `/auth/google` | público | Recibe el token de Google, crea o busca al cliente y devuelve el JWT |
| POST `/auth/login` | público | Cajero y admin: correo y contraseña |
| POST `/auth/dev-login` | solo desarrollo | Login falso para pruebas (ver sección 9) |
| GET `/auth/me` | autenticado | Usuario actual |
| GET `/products/barcode/:barcode` | cualquiera logueado | Producto activo por código, con precios calculados y sus detalles (campos de la categoría con etiqueta y valor) |
| GET `/products` | admin | Lista con búsqueda, filtro por categoría y paginación |
| POST `/products`, PUT `/products/:id` | admin | Crear y editar; valida los campos adicionales contra la categoría |
| POST `/products/price-preview` | admin | Calcula los precios para el formulario (original, categoría, CMR), sin duplicar la lógica en el frontend |
| PATCH `/products/:id/active` | admin | Activar o desactivar |
| POST `/products/:id/stock-adjustments` | admin | Ajuste con motivo |
| GET `/categories` | cualquiera logueado | Categorías activas con sus campos |
| POST `/categories`, PUT `/categories/:id`, PATCH `/categories/:id/active` | admin | CRUD de categorías (se desactivan, no se borran) |
| POST `/categories/:id/fields`, PUT `/categories/:id/fields/:fieldId`, PATCH `/categories/:id/fields/:fieldId/active` | admin | Campos adicionales de una categoría |
| GET, POST, PUT `/campaigns`, PATCH `/campaigns/:id/active` | admin | Campañas (alcance, tipo y valor del descuento, prioridad, fechas, activa); el listado indica si cada una está vigente, programada o vencida |
| GET `/cart` | cliente | Carrito abierto con su resumen (lo crea si no existe) |
| POST `/cart/items` | cliente | Agrega un producto por código de barras (suma 1 si ya estaba) |
| PATCH y DELETE `/cart/items/:productId` | cliente | PATCH fija la cantidad exacta (`{ quantity }`, respetando el límite de RN-04); DELETE quita el producto |
| DELETE `/cart/items` | cliente | Vacía el carrito abierto; responde `CART_LOCKED` si hay un QR activo |
| POST `/cart/qr` | cliente | Genera el código, lo bloquea y fija la expiración |
| DELETE `/cart/qr` | cliente | Cancela el QR y desbloquea el carrito |
| GET `/purchases`, GET `/purchases/:saleId` | cliente | Historial y comprobante |
| GET `/checkout/:code` | cajero | Vista previa con ambos totales |
| POST `/checkout/:code/confirm` | cajero | Confirma el cobro (sección 7) |
| POST `/checkout/:code/reject` | cajero | Rechaza el carrito |
| GET `/checkout/sales/today` | cajero | Cobros del día |
| GET, POST, PATCH `/users` | admin | Gestión de cajeros |
| GET `/suppliers` (`?search=`, `?active=`), GET `/suppliers/:id` | admin | Proveedores ordenados por razón social; la búsqueda filtra por razón social o RUC |
| POST `/suppliers`, PUT `/suppliers/:id`, PATCH `/suppliers/:id/active` | admin | Crear, editar (el RUC no cambia) y activar o desactivar proveedores; RUC duplicado responde `CONFLICT` |
| GET `/dashboard/summary` | admin | Métricas por rango de fechas |
| POST `/payments/online` | cliente | Cobra con Mercado Pago siempre el total de oferta y crea la venta (sección 7) |
| POST `/checkout/exit/:code/verify` | cajero | Opcional: verifica el código de salida `O-XXXXX` y marca la venta como entregada |

Códigos de error usados: `PRODUCT_NOT_FOUND`, `OUT_OF_STOCK`, `MAX_PER_PURCHASE`, `CART_LOCKED`, `QR_EXPIRED`, `CART_NOT_PENDING`, `ALREADY_PAID`, `INVALID_DOCUMENT`, `DUPLICATE_BARCODE`, `CONFLICT`, `INVALID_ATTRIBUTES`, `PAYMENT_DECLINED`, `AMOUNT_CHANGED`, `PAYMENT_UNCERTAIN`, `PAYMENT_NOT_CONFIGURED`, `PAYMENT_TOKEN_INVALID`, `ALREADY_DELIVERED`, `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`.

## 7. Flujo crítico: QR y cobro

**Generar el QR** (`POST /cart/qr`)
1. Verificar que el carrito está OPEN y tiene ítems.
2. Generar un código con `nanoid` usando el alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sin caracteres ambiguos), con prefijo `C-` y 5 caracteres. Reintentar si ya existe.
3. Guardar `qrCode`, `qrExpiresAt = ahora + 30 min` y cambiar el estado a PENDING.
4. El QR del frontend contiene **solo el código**.

**Expiración:** se resuelve al leer, sin tareas programadas. Si un carrito PENDING tiene `qrExpiresAt` vencido, se vuelve a OPEN y se borra el código.

**Confirmar el cobro** (`POST /checkout/:code/confirm`)
1. Buscar el carrito por `qrCode` con ítems y productos. Debe estar PENDING y vigente.
2. Consultar las campañas vigentes, recalcular los precios de cada ítem con `resolvePrices` y luego el resumen con `summarizeCart`. El monto a cobrar depende del medio: CMR_CARD → total CMR; los demás → total normal.
3. Validar el comprobante: BOLETA exige DNI de 8 dígitos; FACTURA exige RUC de 11 dígitos y razón social.
4. Dentro de **una sola transacción de Prisma**:
   - Por cada ítem, bajar el stock con una actualización condicionada a `stock >= cantidad`. Si no afecta ninguna fila, cancelar todo con `OUT_OF_STOCK`.
   - Asignar el número de comprobante (ver Numeración) y crear `Sale` y `SaleItem` con copia de los precios (original, oferta, CMR y el realmente cobrado) y del nombre de la campaña aplicada.
   - Pasar el carrito a PAID con actualización condicionada a `status = PENDING`. Si no afecta ninguna fila, cancelar con `ALREADY_PAID`. Esto evita el doble cobro si dos cajeros escanean a la vez.
5. Devolver la venta para mostrar el comprobante.

Para la ruta de vista previa (`GET /checkout/:code`), aplicar límite de intentos por usuario, para que nadie pueda adivinar códigos.

**Pago en línea** (`POST /payments/online`)
1. El cliente elige el comprobante (ticket, boleta con DNI o factura con RUC) y paga en el formulario de tarjeta de Mercado Pago (Card Payment Brick): la tarjeta se escribe en el navegador y nunca toca nuestro servidor. Al enviarlo, el navegador llama a `POST /payments/online` con **solo** el token de un solo uso, el medio de pago, el comprobante y `expectedAmountCents`. El correo del pagador no lo envía el navegador: el servidor lo toma de la cuenta del cliente.
2. El servidor valida el carrito (OPEN, con ítems, sin QR activo y con stock) y el comprobante, calcula el total de oferta (**nunca** CMR) y, si no coincide con `expectedAmountCents`, responde `409 AMOUNT_CHANGED` con el monto nuevo.
3. Crea un `PaymentAttempt` en estado `CREATED` con el hash (SHA-256) del token y, **solo después**, crea la order en Mercado Pago con `X-Idempotency-Key` estable por intento y `external_reference` derivado del attemptId (mayúsculas alfanuméricas, sin guiones). Un token ya usado, cualquiera que haya sido el resultado anterior, responde `409 PAYMENT_TOKEN_INVALID` sin cobrar. El cliente revisa su historial de compras antes de reintentar.
4. Rechazo de Mercado Pago: attempt `FAILED` con `failureCode` y respuesta `402 PAYMENT_DECLINED`, sin cambiar nada (ni carrito ni stock).
5. Aprobado: dentro de **una sola transacción**, el carrito pasa a PAID (actualización condicionada), se descuenta el stock (condicionado), se asigna el número de comprobante y se crea la `Sale` con `paymentMethod = ONLINE`, `priceApplied = NORMAL`, marca y últimos 4 dígitos (solo informativos) y el código `O-XXXXX`. El attempt queda `SALE_CREATED`.
6. Si la transacción falla después de haber cobrado: se reembolsa el total con `POST /v1/orders/{id}/refund` (sin monto, con `X-Idempotency-Key`) y el attempt pasa a `REFUNDED`; si el reembolso también falla, queda `REFUND_FAILED` para revisión manual.
7. Tiempo agotado, error de red o estado no documentado como aprobado o rechazado: no se reembolsa ni se reintenta; el attempt queda `UNKNOWN` y se responde `503 PAYMENT_UNCERTAIN`. El script de conciliación podrá consultar a Mercado Pago (solo lectura) por `external_reference` para ayudar a resolverlo.
8. Nunca se guardan el número de tarjeta, el CVV, el vencimiento ni el token en claro (solo su hash). El Access Token solo vive en el servidor.

**Salida:** el cliente muestra el QR con el código `O-XXXXX`. El cajero lo verifica (`POST /checkout/exit/:code/verify`) y se guarda `deliveredAt`; una segunda verificación responde `ALREADY_DELIVERED`.

**Numeración:** al crear cada venta, dentro de la misma transacción, se incrementa de forma atómica el contador de su serie en `DocumentSeries` (T001 ticket, B001 boleta, F001 factura) y se arma `receiptNumber`, por ejemplo `B001-000124`.

**Qué se guarda de la tarjeta:** solo marca y últimos 4 dígitos, que informa el navegador y no deciden nada. Nunca el número de tarjeta, el CVV ni el vencimiento.

## 8. Seguridad

- El navegador nunca envía precios ni totales que el servidor acepte como verdad.
- Roles verificados en el servidor en cada ruta (middleware), no solo ocultando botones.
- Contraseñas con bcrypt. JWT con expiración corta. Secretos solo en `.env`.
- Validar con Zod todos los cuerpos, parámetros y consultas.
- `helmet`, CORS limitado a `FRONTEND_URL` y `express-rate-limit` en login y checkout.
- Los datos de tarjeta jamás pasan por el servidor (con Mercado Pago, el Card Payment Brick los tokeniza en el navegador). En un pago en línea, el monto lo decide el servidor: siempre el total de oferta, nunca un precio que envíe el navegador. La marca y los últimos 4 dígitos que informa el navegador se guardan solo como informativos y no deciden nada.
- Los mensajes de error no revelan detalles internos.
- Decisión de prototipo: la sesión vive en `localStorage` (`frontend/src/lib/session.ts`) para no montar un servidor de sesión en el MVP; el token lo firma y verifica el backend. En producción convendría mover la sesión a una cookie `httpOnly` (más `Secure` y `SameSite`) para que el JavaScript del navegador no pueda leer el token; queda fuera del alcance actual.

## 9. Entorno local en Windows

**Requisitos:** Node LTS, MySQL (instalador oficial o XAMPP), Git. Crear las bases `qrcheckout` y `qrcheckout_test`.

**Variables de entorno**

`backend/.env`
```
PORT=3000
NODE_ENV=development
DATABASE_URL="mysql://usuario:clave@localhost:3306/qrcheckout"
DATABASE_URL_TEST="mysql://usuario:clave@localhost:3306/qrcheckout_test"
JWT_SECRET=cambia_esto_por_una_clave_larga
JWT_EXPIRES_IN=8h
FRONTEND_URL=https://localhost:5173
GOOGLE_CLIENT_ID=
CART_QR_TTL_MINUTES=30
INSTALLMENTS_OPTIONS=3,6,12
INSTALLMENTS_MIN_TOTAL_CENTS=30000
DEV_LOGIN=true
MP_ACCESS_TOKEN=
# Admin inicial que crea `npm run db:seed`
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

`frontend/.env`
```
VITE_API_URL=/api
VITE_GOOGLE_CLIENT_ID=
VITE_MP_PUBLIC_KEY=
```

Se sube a Git solo `.env.example` (mismos nombres, sin valores). Los `.env` van en `.gitignore`.

**Por qué `VITE_API_URL=/api`:** el celular no puede llegar a `localhost:3000` de tu PC, y una página HTTPS no puede llamar a una API HTTP. Por eso el navegador llama siempre a `/api` y **el servidor de desarrollo de Vite hace de proxy hacia `http://localhost:3000`**. Así basta con exponer un solo puerto.

**HTTPS y celular**
- La cámara exige HTTPS. En la PC, `@vitejs/plugin-basic-ssl` da HTTPS con certificado de prueba (el navegador mostrará una advertencia).
- Para probar desde el celular, usar un túnel (Cloudflare Tunnel o ngrok) apuntando al puerto de Vite (5173). Vite puede rechazar el nombre del túnel: añadirlo en `server.allowedHosts`.
- Revisar las condiciones vigentes del servicio de túnel elegido antes de usarlo.

**Login con Google**
- Crear un ID de cliente OAuth en Google Cloud Console.
- Registrar como orígenes autorizados `https://localhost:5173` y la URL pública del túnel. Google no acepta direcciones IP como origen.
- Frontend: el botón entrega un token; backend: `google-auth-library` lo verifica con `GOOGLE_CLIENT_ID`, crea el cliente si no existe y devuelve el JWT propio.
- `POST /auth/dev-login` existe solo si `NODE_ENV=development` y `DEV_LOGIN=true`. En cualquier otro caso no debe existir la ruta.

## 10. Pruebas

- **Vitest sobre `domain/`** (obligatorio). Caso de referencia del resumen del carrito (`summarizeCart`, con precios ya resueltos), en céntimos:

| Producto | Original | Normal | CMR |
|---|---|---|---|
| Dormitorio Tempo Issey Queen | 424900 | 249900 | 244900 |
| Dormitorio Boxet Praktibox | 439900 | 269900 | 264900 |
| Royal Prince Queen | 337900 | 189900 | 184900 |
| Royal Prince King | 413900 | 229900 | 219900 |
| Apple Pencil USB-C | 60000 | 42900 | 28900 |
| Audífonos Redmi Buds 6 Play | 8990 | 3990 | 3790 |

  Con cantidad 1 cada uno, el resumen debe dar: productos `1685590`, descuentos `699100`, total `986490`, total con CMR `947290`, ahorro con CMR `39200`.
- **Precios (`resolvePrices`):** original `10000` con campaña `PERCENT` de `3000` bps → oferta `7000`; con CMR de `500` bps → `6650`. Con campaña `FIXED` de `1500` céntimos → oferta `8500`. Casos a cubrir: sin campaña; alcance tienda, categorías y productos; dos campañas con distinta prioridad (gana la mayor); misma prioridad (gana la que más ahorra); empate total (gana el `id` mayor); campaña inactiva, vencida o futura (se ignora); monto fijo mayor o igual al original (no aplica); producto sin CMR (cmr = oferta); redondeo de mitad hacia arriba (original `1005` con `1000` bps → `905`).
- También probar: cuotas con céntimos sobrantes, validación de EAN-13, generación del código de carrito y validación de campos adicionales (tipos, obligatorios, valores fuera de la lista); pago en línea siempre al total de oferta, con monto no coincidente (`AMOUNT_CHANGED`), tarjeta rechazada (no cambia nada) y doble verificación de salida; números de comprobante correlativos sin repetirse.
- **Supertest sobre la API** con la base `qrcheckout_test`: flujo cliente → QR → cajero, QR vencido, doble cobro, stock insuficiente, permisos por rol.

## 11. Códigos de barras internos

Para productos sin código, generar un EAN-13 con prefijo entre 200 y 299 (rango que GS1 reserva para uso interno de una empresa) y calcular el dígito verificador. Mostrarlo con JsBarcode para imprimirlo.

## 12. Semilla de datos

`npm run db:seed` crea el admin inicial (correo y clave desde variables de entorno) y carga tres archivos de `prisma/seed-data/`: `categories.json` (categorías con sus campos adicionales), `campaigns.json` (una o dos campañas de ejemplo) y `products.json`. Cada producto se escribe así (precios en soles y porcentajes normales; el script los convierte a céntimos y puntos básicos):

```json
{
  "barcode": "<código EAN-13>",
  "name": "Audífonos Xiaomi Redmi Buds 6 Play",
  "brand": "Xiaomi",
  "color": "Negro",
  "category": "Audífonos",
  "originalPrice": 89.90,
  "hasCmrDiscount": true,
  "cmrDiscountPercent": 5,
  "stock": 20,
  "maxPerPurchase": 20,
  "attributes": { "connectivity": "Bluetooth", "battery_hours": 36 }
}
```

El script valida cada producto con las mismas reglas de la API (código único, campos de la categoría, porcentajes) y, si algo falla, indica el producto y el motivo.

## 13. Decisiones tomadas

- Web responsive, sin app nativa.
- Cliente siempre con Google, cajero y admin con contraseña.
- Monolito modular en lugar de microservicios.
- Sin importación masiva en la interfaz: bastan 20 a 30 productos y una semilla.
- Comprobante simulado imprimible desde el navegador (imprimir o guardar como PDF).
- El pago en línea con Mercado Pago y la verificación de salida son opcionales y van al final. En línea se cobra **siempre el total de oferta**; el precio CMR solo se aplica en caja, donde el cajero comprueba la tarjeta. Motivo comprobado en la prueba de humo (ver `MERCADOPAGO_REFERENCE.md`): la pasarela no permite al servidor verificar que la tarjeta sea CMR.
- Cada venta guarda los totales original, de oferta, CMR y cobrado, un número de comprobante correlativo y, en pagos en línea, marca y últimos 4 dígitos de la tarjeta (informativos, los informa el navegador y no deciden nada).
- Campos adicionales por categoría definidos por el admin y guardados en JSON dentro del producto.
- Descuentos regulares solo por campañas que guardan su regla (porcentaje o monto fijo), con alcance por productos, categorías o toda la tienda, fechas, interruptor y prioridad; gana una sola, sin acumular.
- Descuento CMR por producto, en porcentaje sobre el precio de oferta.
- Los precios normal y CMR se calculan al consultar; cada venta guarda su copia.
