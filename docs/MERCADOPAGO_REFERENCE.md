# Referencia Mercado Pago (T3.5a)

Fuente única para nombres de funciones, campos y estados: MCP de Mercado Pago
(`search_documentation`) con `siteId = MPE` (Perú) cuando fue posible.
Cada punto indica la página de la que salió y el país con el que se buscó.
Si algo no se pudo encontrar, dice **NO ENCONTRADO**. No se inventó nada.

Índice:

- (a) Card Payment Brick: renderizado por defecto, `onSubmit` y token
- (b) Crear order con tarjeta (`POST /v1/orders`)
- (c) Reembolsar una order (`POST /v1/orders/{id}/refund`)
- (d) Leer los datos de la tarjeta a partir del token (BIN, marca, últimos 4, emisor)
- (e) Tarjetas de prueba para Perú y simulación de aprobado/pendiente/rechazado
- (f) Prueba empírica del Plan B (captura manual) con credenciales de prueba
- (g) Consultas adicionales (order procesada, Brick, medios/emisores, reembolso parcial)

---

## (a) Card Payment Brick: renderizado por defecto, `onSubmit` y token

**Páginas:** `https://www.mercadopago.com/developers/es/docs/checkout-bricks/card-payment-brick/default-rendering`
y `https://www.mercadopago.com/developers/es/docs/checkout-bricks/card-payment-brick/payment-submission`.
**País de la búsqueda:** MPE (Perú). El fragmento aplica a `mla, mlu, mpe, mco, mlb, mlm`.

### Código de renderizado por defecto (JavaScript, versión MPE)

```Javascript
const renderCardPaymentBrick = async (bricksBuilder) => {
 const settings = {
   initialization: {
     amount: 100, // monto total a pagar
   },
   callbacks: {
     onReady: () => {
       /*
         Callback llamado cuando Brick está listo.
         Aquí puedes ocultar cargamentos de su sitio, por ejemplo.
       */
     },
     onSubmit: (formData) => {
       // callback llamado al hacer clic en el botón enviar datos
       return new Promise((resolve, reject) => {
         fetch('/process_payment', {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
           },
           body: JSON.stringify(formData),
         })
           .then((response) => response.json())
           .then((response) => {
             // recibir el resultado del pago
             resolve();
           })
           .catch((error) => {
             // manejar la respuesta de error al intentar crear el pago
             reject();
           });
       });
     },
     onError: (error) => {
       // callback llamado para todos los casos de error de Brick
       console.error(error);
     },
   },
  };
  window.cardPaymentBrickController = await bricksBuilder.create(
   'cardPayment',
   'cardPaymentBrick_container',
   settings,
  );  
};
renderCardPaymentBrick(bricksBuilder);
```

### Renderizado (div contenedor)

El id `cardPaymentBrick_container` del `div` debe coincidir con el valor enviado
en `create()`.

```html
<div id="cardPaymentBrick_container"></div>
```

### Desmontar al salir de la pantalla (obligatorio)

> Cada vez que el usuario sale de la pantalla donde se muestra algún Brick, es
> necesario destruir la instancia actual con el comando
> `window.cardPaymentBrickController.unmount()`. Al ingresar nuevamente se debe
> generar una nueva instancia.

### Qué entrega `onSubmit` (datos para cobrar)

El `formData` de `onSubmit` contiene el **token** de la tarjeta y los datos del
formulario. En el backend los campos mínimos para cobrar son: `token`,
`transaction_amount` (en Orders API pasa a `amount`), `installments`,
`payment_method_id` y `payer.email`.

Su backend debe exponer un endpoint `/process_payment` para recibir `formData`.
Además se debe enviar obligatoriamente el header `X-Idempotency-Key`.

### Datos adicionales (BIN, últimos 4, nombre del titular) — lado cliente

**Página:** `https://www.mercadopago.com/developers/es/docs/checkout-bricks/card-payment-brick/advanced-features/additional-data`
**País:** MPE.

Dentro del callback `onSubmit` hay un segundo parámetro opcional
`additionalData`. Contiene, solo si el usuario pagó con tarjeta:

| Campo | Tipo | Descripción |
|---|---|---|
| `bin` | string | BIN de la tarjeta ingresada por el usuario. |
| `lastFourDigits` | string | Los últimos cuatro dígitos para compras con tarjeta. |
| `cardholderName` | string | Nombre de la persona titular de la tarjeta. |

Ejemplo:

```Javascript
const settings = {
 ...,
 callbacks: {
   onSubmit: (cardFormData, additionalData) => {
     // el parámetro additionalData es opcional, puede eliminarlo si lo desea
     console.log(additionalData);
     // ejemplo de envío de los datos recopilados por Brick a su servidor
     return new Promise((resolve, reject) => {
       fetch("/process_payment", {
         method: "POST",
         headers: {
             "Content-Type": "application/json",
         },
         body: JSON.stringify(cardFormData)
       })
       .then((response) => {
         resolve();
       })
       .catch((error) => {
         reject();
       })
     });
   },
 },
}
```

### Callback `onBinChange` — lado cliente

**Página:** `https://www.mercadopago.com/developers/es/docs/checkout-bricks/card-payment-brick/advanced-features/additional-callbacks`
**País:** MPE.

```Javascript
const settings = {
   ...,
   callbacks: {
       ...
       onBinChange: (bin) => {
           // callback llamado cada vez que se cambia el bin de la tarjeta
           console.log(bin);
       },
   }
};
```

> El bin de tarjeta devuelto por el callback `onBinChange` es el mismo que el
> usuario ingresó en el campo del número de tarjeta. Solo considere que el bin
> es válido y confiable para ser utilizado **después** de que el evento de envío
> sea activado por el callback `onSubmit`.

---

## (b) Crear order con tarjeta (`POST /v1/orders`)

**Páginas:** `https://www.mercadopago.com/developers/es/docs/checkout-api-orders/payment-integration/websites/cards`
y **Referencia API** `https://www.mercadopago.com/developers/es/reference/online-payments/checkout-api/create-order/post`.
**País de la búsqueda:** MPE (Perú). La documentación técnica es de Orders API
(`/developers/es/docs/checkout-api-orders/...`).

### Ejemplo completo (solicitud con tarjeta)

```curl
curl -X POST 'https://api.mercadopago.com/v1/orders' \
  -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
  -H 'Content-Type: application/json' \
  -H 'X-Idempotency-Key: {{SOME_UNIQUE_VALUE}}' \
  -d '{
    "type": "online",
    "processing_mode": "automatic",
    "total_amount": "50.00",
    "external_reference": "ext_ref_1234",
    "payer": { "email": "test@testuser.com" },
    "transactions": { "payments": [{
      "amount": "50.00",
      "payment_method": { "id": "master", "type": "credit_card", "token": "{{CARD_TOKEN}}", "installments": 1 }
    }] }
  }'
```

### Respuesta (ejemplo)

```json
{
  "id": "ORD01JS2V6CM8KJ0EC4H502TGK1WP",
  "status": "processed",
  "status_detail": "accredited",
  "transactions": {
    "payments": [
      {
        "id": "PAY01JS2V6CM8KJ0EC4H504R7YE34",
        "status": "processed",
        "status_detail": "accredited"
      }
    ]
  }
}
```

> Después de la creación, guarda el `id`, el `status` y el `status_detail`. En
> Orders API, guarda también `transactions.payments[].id` y trata los valores de
> estado en los niveles de la order y de la transacción al consultar
> `GET /v1/orders/{id}`.

### Parámetros (mapa desde Payments API) — tabla de la página de migración

**Página:** `https://www.mercadopago.com/developers/es/docs/checkout-api-orders/payment-integration/websites/cards`
(sección "Cómo migrar de la Payments API a la Orders API"). **País:** MPE.

| Campo | Orders API | Obligatoriedad |
|---|---|---|
| Marca de la tarjeta | `transactions.payments[].payment_method.id` | Obligatorio |
| Tipo de tarjeta | `transactions.payments[].payment_method.type` (`credit_card` / `debit_card`) | Obligatorio |
| Token de la tarjeta | `transactions.payments[].payment_method.token` | Obligatorio |
| Cuotas | `transactions.payments[].payment_method.installments` | Obligatorio |
| Texto en el resumen | `transactions.payments[].payment_method.statement_descriptor` | Opcional |
| Monto | `transactions.payments[].amount` / `total_amount` (es una **string**) | Obligatorio |
| Tipo de order | `type` = `online` | Obligatorio |
| Modo | `processing_mode` (`automatic` / `manual`) | Opcional |
| Referencia externa | `external_reference` | En algunos medios es obligatorio |
| Correo del pagador | `payer.email` | — |
| Idempotencia | Header `X-Idempotency-Key` (UUID v4) | Obligatorio |

Notas del mapa:

- `transaction_amount` pasa a ser **string** (`"50.00"`). El `amount` como
  texto con **2 decimales** es el formato de Orders API.
- En Orders API no hay un campo `issuer_id` directo documentado.
- `capture` pasa a `capture_mode` (`manual`, `automatic`, `automatic_async`).
- La tokenización de la tarjeta en el cliente sigue usando MercadoPago.js V2,
  sin cambios en el flujo.

### Estados de la order y de la transacción (aprobado / rechazado / pendiente)

**Página:** `https://www.mercadopago.com/developers/es/docs/checkout-api-orders/payment-management/status/order-status`
y `.../status/transaction-status` (referenciadas desde la guía de migración). **País:** MPE.

Mapa de estados (Payments API → Orders API order → Orders API transaction):

| Payments API | Orders API (order) | Orders API (transacción) | Observación |
|---|---|---|---|
| `pending` | `action_required` | `action_required` | Esperando una acción del pagador o del vendedor. |
| `approved` | `processed` | `processed` | Pago aprobado y acreditado. |
| `authorized` | `action_required` (`waiting_capture`) | `action_required` (`waiting_capture`) | Monto reservado, esperando la captura. |
| `in_process` | `processing` | `processing` | En análisis o procesamiento. |
| `in_mediation` | `charged_back` (`in_process`) | `charged_back` (`in_process`) | Contracargo en curso. |
| `rejected` | `failed` | `failed` | Rechazado. El `status_detail` indica el motivo. |
| `cancelled` | `canceled` | `canceled` | Cancelado por el vendedor, el comprador o por vencimiento. |
| `refunded` | `refunded` | `refunded` | Reembolsado en su totalidad. |
| `charged_back` | `charged_back` (`settled` / `reimbursed`) | `charged_back` (`settled`/`reimbursed`) | Contracargo recibido y resuelto. |

> Prestar atención a la ortografía: Payments API usa `cancelled` (dos L) y
> Orders API usa `canceled` (una L).

Resumen para los tres casos que nos interesan:

- **Aprobado:** `status = processed`, `status_detail = accredited`.
- **Rechazado:** `status = failed` (el `status_detail` indica el motivo).
- **Pendiente / en revisión:** `status = action_required` o `status = processing`.

Mapa de `status_detail` para rechazos con tarjeta (Payments API → Orders API):

| Payments API | Orders API | Descripción |
|---|---|---|
| `cc_rejected_bad_filled_card_number` | `bad_filled_card_data` | Datos de la tarjeta completados incorrectamente. |
| `cc_rejected_bad_filled_date` | `bad_filled_card_data` | Fecha de vencimiento incorrecta. |
| `cc_rejected_bad_filled_security_code` | `bad_filled_card_data` | Código de seguridad incorrecto. |
| `cc_rejected_call_for_authorize` | `required_call_for_authorize` | El emisor exige la autorización del titular. |
| `cc_rejected_card_disabled` | `card_disabled` | Tarjeta deshabilitada. |
| `cc_rejected_duplicated_payment` | `processing_error` | Pago duplicado (se previene con `X-Idempotency-Key`). |
| `cc_rejected_high_risk` | `high_risk` | Rechazado por prevención de fraude. |
| `cc_rejected_insufficient_amount` | `insufficient_amount` o `card_insufficient_amount` | Fondos insuficientes. |
| `cc_rejected_invalid_installments` | `invalid_installments` | Cuotas no permitidas. |
| `cc_rejected_max_attempts` | `max_attempts_exceeded` | Número de intentos excedido. |
| `cc_rejected_other_reason` | `rejected_by_issuer` | Rechazo genérico del emisor. |
| `accredited` | `accredited` | Acreditado con éxito. Sin cambios. |
| `pending_waiting_transfer` | `waiting_transfer` | Esperando transferencia. |
| `pending_review_manual` | `pending_review_manual` | En revisión manual. Sin cambios. |

### Errores de creación (lista completa en la doc de errores de Orders API)

**Página:** guía de migración, sección 8 ("Actualizar el tratamiento de errores en la creación"). **País:** MPE.

- `400 invalid_total_amount`: la suma de `transactions.payments[].amount` no
  coincide con `total_amount`.
- `400 invalid_email_for_sandbox`: el correo debe contener `@testuser.com` en el
  entorno de prueba.
- `409 idempotency_key_already_used`: misma `X-Idempotency-Key` con un body
  distinto.
- `423 resource_locked`: clave de idempotencia bloqueada temporalmente.
- `429 usage_quota_exceeded`: se alcanzó el límite de solicitudes (respetar `Retry-After`).
- `500 internal_error`: error genérico.
- `402` (sin código): la order fue creada, pero alguna transacción falló.

---

## (c) Reembolsar una order (`POST /v1/orders/{id}/refund`)

**Página:** `https://www.mercadopago.com/developers/es/docs/checkout-api-orders/payment-management/refunds-cancellations`.
**País de la búsqueda:** MPE (Perú).

### Endpoint y cabeceras

`POST /v1/orders/{order_id}/refund`, con `Authorization`, `Content-Type` y
`X-Idempotency-Key` (obligatorio en las operaciones de escritura de Orders API).

### Reembolso total

Se envía el cuerpo **sin** el array `transactions` (body vacío `{}`).

### Reembolso parcial

Exige el identificador de la transacción específica y el monto:

```json
{
  "transactions": [
    { "id": "<transaction_id>", "amount": "<monto>" }
  ]
}
```

### Límites y estado

- **Plazo:** hasta **180 días** después de la aprobación.
- **Estado del reembolso:** `processed` / `refunded`
  (`status_detail = "refunded"` o `"partially_refunded"`).
- **Consulta del reembolso:** `GET /v1/orders/{id}` en `transactions.refunds[]`.

### Errores específicos del reembolso

| Error de solicitud | HTTP | Código | Observación |
|---|---|---|---|
| Error de solicitud | 400 | `refund_amount_exceeds` | El valor solicitado es mayor que el disponible para reembolso. |
| Error de solicitud | 409 | `cannot_refund_order` | La order no está en un estado que permita el reembolso. |
| Error de solicitud | 409 | `order_already_refunded` | La order ya fue reembolsada. |
| Error de solicitud | 409 | `order_refund_already_in_process` | Ya existe un reembolso total en proceso para esa order. |

---

## (d) Leer los datos de la tarjeta a partir del token (BIN, marca, últimos 4, emisor)

**Páginas revisadas:** Card Payment Brick (additional-data, additional-callbacks),
guía de migración a Orders API, y la búsqueda en una segunda fuente
(`/v1/card_tokens`, tokenización PCI, Core Methods del SDK nativo).
**País de la búsqueda:** MPE (Perú).

### Lado cliente (sí documentado)

- `onSubmit(cardFormData, additionalData)` → `additionalData` puede traer `bin`,
  `lastFourDigits` y `cardholderName`.
- `onBinChange(bin)` entrega el BIN mientras el usuario escribe.
- Core Methods del SDK nativo (Android/iOS): `getPaymentMethods(bin)` y
  `getCardIssuers(bin, paymentMethodId)` identifican marca y emisor, pero
  reciben el BIN del callback `onBinChange`, es decir, también del lado cliente.

### Lado servidor ANTES de cobrar (BIN, marca, emisor, últimos 4 a partir del `token`)

**NO ENCONTRADO.**

La documentación consultada **no describe ningún endpoint** para intercambiar un
`token` ya generado por el Brick por el BIN, la marca, el emisor o los últimos 4
dígitos desde el servidor antes de crear la order/pago.

Segunda fuente revisada (tokenización del lado servidor):

- **`POST /v1/card_tokens`** sí existe y es la tokenización del lado servidor
  para vendedores PCI Compliant. Su **respuesta sí incluye** `first_six_digits`
  (el BIN), `last_four_digits`, `card_number_length` y `cardholder`. Página:
  `https://www.mercadopago.com/developers/es/docs/resources-pci-compliant-merchants/receiving-payment-by-card`.
  **Pero no sirve para este punto:** es una operación de **creación** que exige
  enviar `card_number`, `security_code`, `expiration_month` y `expiration_year`
  (datos completos de la tarjeta) al servidor. No lee un `token` existente. No
  aplica: nuestro servidor nunca recibe el número completo ni el CVV (regla 11 y
  regla 16).
- No aparece documentado ningún `GET /v1/card_tokens/{id}` para consultar un
  token ya creado. La búsqueda "card_tokens" devuelve únicamente la creación.

Datos relacionados hallados que **no** resuelven el punto:

- En la respuesta de creación de Orders API, `card.{...}` **no se devuelve**;
  la respuesta incluye únicamente el `token` y el identificador del pago. Los
  datos persistidos de tarjeta se consultan en los endpoints de "Tarjetas
  guardadas" (no aplica a un token de un solo uso).
- No aparece un `issuer_id` directo documentado en Orders API; en Payments API
  el `issuer_id` venía en el `formData` del Brick (lado cliente), no se leía del
  token en el servidor.

### Consecuencia

**NO DISPONIBLE: el BIN, la marca, los últimos 4 y el emisor solo llegan del
navegador; el servidor no puede leerlos antes ni después del cobro.**

No hay forma documentada de decidir CMR en el servidor leyendo el BIN desde el
`token` **antes** de cobrar. Alternativas documentadas: obtener el BIN en el
cliente con `additionalData.bin` / `onBinChange` (lo prohíbe la regla 16 de este
proyecto), tokenizar del lado servidor con `POST /v1/card_tokens` (exige el
número completo, también prohibido), o leer los datos de la tarjeta recién en la
respuesta del cobro (que, además, tampoco los trae: ver (g)(1)). El Plan B con
`capture_mode: manual` quedó descartado (ver (f): la creación no expone la
tarjeta y la captura no admite un monto menor).

**Decisión tomada:** el pago en línea cobra **siempre el total de oferta**; el
precio CMR solo se aplica **en caja**. Por eso el script `mp:inspect-token` se
eliminó y no se implementa detección de CMR en el cobro en línea.

---

## (e) Tarjetas de prueba para Perú y simulación de estados

**Páginas:** `https://www.mercadopago.com/developers/es/docs/checkout-api-orders/resources/test-cards`
y `https://www.mercadopago.com/developers/es/docs/checkout-api-orders/integration-test`.
**País de la búsqueda:** MPE (Perú).

### Tarjetas de prueba (tabla `[mpe]`)

| Tipo de tarjeta | Bandera | Número | Código de seguridad | Fecha de caducidad |
|---|---|---|---|---|
| Tarjeta de crédito | Mastercard | 5031 7557 3453 0604 | 123 | 11/30 |
| Tarjeta de crédito | Visa | 4009 1753 3280 6176 | 123 | 11/30 |
| Tarjeta de crédito | American Express | 3711 803032 57522 | 1234 | 11/30 |
| Tarjeta de débito | Mastercard | 5178 7816 2220 2455 | 123 | 11/30 |

### Cómo simular aprobado / pendiente / rechazado (tabla `[mpe]`)

Los datos del **titular** determinan el resultado. Para Perú, el documento es
`123456789`.

| Estado de pago | Nombre y apellido del titular | Documento de identidad |
|---|---|---|
| Pago aprobado | `APRO` | 123456789 |
| Rechazado por error general | `OTHE` | 123456789 |
| Pendiente de pago | `CONT` | - |
| Rechazado con validación para autorizar | `CALL` | - |
| Rechazado por importe insuficiente | `FUND` | - |
| Rechazado por código de seguridad inválido | `SECU` | - |
| Rechazado por problema de fecha de vencimiento | `EXPI` | - |
| Rechazado por error de formulario | `FORM` | - |
| Rechazado por falta de `card_number` | `CARD` | - |
| Rechazado por cuotas inválidas | `INST` | - |
| Rechazado por pago duplicado | `DUPL` | - |
| Rechazado por tarjeta deshabilitada | `LOCK` | - |
| Rechazado por tipo de tarjeta no permitida | `CTNA` | - |
| Rechazado por intentos excedidos del pin | `ATTE` | - |
| Rechazado por estar en lista negra | `BLAC` | - |
| No soportado | `UNSU` | - |
| Usado para aplicar regla de montos | `TEST` | - |

Otros datos de la doc:

- Usar correos con `@testuser.com` en el entorno de prueba.
- La cuenta de prueba puede requerir un saldo ficticio.

---

## (f) Prueba empírica del Plan B (captura manual) con credenciales de prueba

**Cómo se hizo.** Con la credencial de **PRUEBA** de la aplicación (prefijo
`APP_USR-`, cuenta de prueba `site_id = MPE`; verificado con `GET /users/me`,
id `3767…40`, correo `test_user_…@testuser.com`), se ejecutó una prueba
empírica contra la API real usando la tarjeta de prueba Mastercard de la sección
(e) y el titular `APRO`. La tarjeta se tokenizó con `POST /v1/card_tokens`
(única forma server-side documentada; exige el número completo, por eso la prueba
la usa, pero **no se guarda ni el número ni la llave**). No se implementó nada
del Plan B en el código del proyecto.

**Tarjeta de prueba usada:** Mastercard 5031 •••• (sección e), titular `APRO`,
documento `123456789`. **No se guarda el número completo en este documento.**

### Pregunta 1 — ¿La order creada con captura manual devuelve BIN, marca, últimos 4 o emisor?

**NO.** La respuesta de `POST /v1/orders` con `capture_mode: "manual"` **no
incluye** `first_six_digits`, `last_four_digits`, `bin`, `issuer` ni
`cardholder`. El único dato de tarjeta es
`transactions.payments[].payment_method.id` (`"master"`) y `.type`
(`"credit_card"`), pero `id` es el medio de pago **que nosotros enviamos**, no un
dato derivado del BIN por el servidor. Es decir, la creación de la order **no
sirve** para decidir CMR en el servidor.

Respuesta real de la creación (JSON sanitizado: sin llave, sin número de tarjeta,
identificadores opacos enmascarados):

```json
{
  "id": "ORDT***30",
  "type": "online",
  "processing_mode": "automatic",
  "external_reference": "PROBE31792110345002",
  "total_amount": "10.00",
  "total_paid_amount": "10.00",
  "country_code": "PER",
  "user_id": "3767***40",
  "status": "action_required",
  "status_detail": "waiting_capture",
  "capture_mode": "manual",
  "currency": "PEN",
  "created_date": "2026-10-16T00:25:26.535Z",
  "last_updated_date": "2026-10-16T00:25:27.621Z",
  "integration_data": { "application_id": "5817***21" },
  "config": { "online": { "transaction_security": { "validation": "***" } } },
  "transactions": {
    "payments": [
      {
        "id": "PAY0***WN",
        "amount": "10.00",
        "paid_amount": "10.00",
        "reference_id": "000g***02",
        "status": "action_required",
        "status_detail": "waiting_capture",
        "payment_method": {
          "id": "master",
          "type": "credit_card",
          "token": "bcf7***bb",
          "installments": 1,
          "installment_amount": "10.00",
          "transaction_security": { "validation": "***" }
        }
      }
    ]
  }
}
```

Observaciones de la creación (manual):

- `status = action_required` y `status_detail = waiting_capture` (autoriza sin
  cobrar). El `capture_mode: "manual"` se respeta.
- El correo del pagador debe contener `@testuser.com` en pruebas.
- `external_reference` no acepta guiones ni minúsculas: el intento inicial con
  `t3.5a-probe-<uuid>` fue rechazado con
  `400 property_value` / `'$.external_reference' - does not match pattern`. Con
  un valor alfanumérico en mayúsculas (`PROBET35A…`) funcionó. Dato útil para la
  implementación futura.

### Pregunta 2 — ¿Se puede capturar un monto MENOR al autorizado?

**NO** (con el esquema documentado del endpoint de captura). `POST
/v1/orders/{id}/capture` **no acepta monto**:

- Cuerpo `{ "transactions": { "payments": [ { "amount": "5.00" } ] } }` →
  `400 unsupported_properties` / `"additionalProperties '$.transactions' not allowed"`.
- Cuerpo `{ "amount": "5.00" }` → `400 unsupported_properties` /
  `"additionalProperties '$.amount' not allowed"`.
- Cuerpo `{ "amount": "10.00" }` → mismo `400 unsupported_properties`.

La captura solo funciona con **cuerpo vacío** y captura **siempre el total
autorizado**. Respuesta real de la captura (JSON sanitizado):

```json
{
  "id": "ORDT***30",
  "status": "processed",
  "status_detail": "accredited",
  "transactions": {
    "payments": [
      {
        "id": "PAY0***WN",
        "amount": "10.00",
        "paid_amount": "10.00",
        "status": "processed",
        "status_detail": "accredited",
        "reference_id": "000g***02"
      }
    ]
  }
}
```

Consecuencia: si se autoriza por el monto mayor, **no** se puede capturar el
monto CMR menor; habría que capturar el total y **reembolsar la diferencia**
(`POST /v1/orders/{id}/refund`, sección c). El reembolso parcial sí acepta monto,
pero en un esquema distinto (array `transactions[]`).

### Pregunta 3 — ¿Se puede cancelar la autorización sin capturar?

**SÍ.** `POST /v1/orders/{id}/cancel` con cuerpo vacío → `200`, y la order pasa a
`status = "canceled"`, `status_detail = "canceled"` (con
`transactions.payments[].status = "canceled"`). Respuesta real (JSON sanitizado):

```json
{
  "id": "ORDT***37",
  "type": "online",
  "capture_mode": "manual",
  "status": "canceled",
  "status_detail": "canceled",
  "currency": "PEN",
  "transactions": {
    "payments": [
      {
        "id": "PAY0***GD",
        "amount": "10.00",
        "status": "canceled",
        "status_detail": "canceled_transaction"
      }
    ]
  }
}
```

### Resumen del Plan B (sin implementar)

| Necesidad | Resultado empírico |
|---|---|
| Autorizar sin cobrar (`capture_mode: manual`) | Sí; order queda `action_required` / `waiting_capture`. |
| Obtener BIN/marca/últimos 4/emisor desde la creación | **No**; la respuesta no trae datos de tarjeta. |
| Capturar un monto menor al autorizado | **No**; el endpoint de captura no acepta monto. |
| Cancelar la autorización sin capturar | Sí; `canceled`. |

Con esto, el Plan B tal como se planteó (decidir CMR en el servidor leyendo los
datos de la tarjeta que devuelve Mercado Pago al autorizar, y capturar el monto
correcto) **no es viable con el esquema documentado de captura**: la creación no
expone la tarjeta y la captura no permite un monto distinto. Alternativa viable:
autorizar por el monto mayor, capturar el total y reembolsar la diferencia tras
decidir CMR. **Decisión tomada: se descarta el Plan B.** El pago en línea cobra
siempre el total de oferta y el precio CMR solo se aplica en caja (ver (d),
"Consecuencia").

---

## (g) Consultas adicionales (order procesada, Brick, medios/emisores, reembolso parcial)

**Cómo se hizo.** Todo con la credencial de **PRUEBA** (`APP_USR-`, `site_id =
MPE`, cuenta de prueba). Consultas `GET` (solo lectura) y un reembolso parcial de
prueba. Los JSON están sanitizados: sin llave y sin número de tarjeta; los
identificadores opacos van enmascarados.

### (1) En una order procesada, ¿`GET /v1/orders/{id}` o el pago devuelve BIN, primeros dígitos, últimos 4 o emisor?

**NO.** Se creó una order con captura normal/automática (10.00) → se procesó
(`status = processed`, `status_detail = accredited`). Ni la creación ni
`GET /v1/orders/{id}` devuelven `first_six_digits`, `last_four_digits`, `bin`,
`issuer` ni `cardholder`. El único dato de tarjeta sigue siendo
`transactions.payments[].payment_method` (`id` = medio enviado, `type`, `token`,
`installments`).

Además, `GET /v1/payments/{payment_id}` usando el id de pago de Orders API
(`PAY01…`) responde **404** (`resource not found`): ese id no es consultable por
la Payments API clásica. Es decir, **tampoco hay un endpoint que exponga la
tarjeta** después de cobrar.

`GET /v1/orders/{id}` de una order procesada (JSON sanitizado):

```json
{
  "id": "ORDT***4A",
  "type": "online",
  "processing_mode": "automatic",
  "external_reference": "PROBE41792113282950",
  "total_amount": "10.00",
  "total_paid_amount": "10.00",
  "country_code": "PER",
  "user_id": "3767***40",
  "status": "processed",
  "status_detail": "accredited",
  "capture_mode": "automatic",
  "currency": "PEN",
  "integration_data": { "application_id": "5817***21" },
  "transactions": {
    "payments": [
      {
        "id": "PAY0***AH",
        "amount": "10.00",
        "paid_amount": "10.00",
        "reference_id": "000g***ps",
        "status": "processed",
        "status_detail": "accredited",
        "payment_method": {
          "id": "master",
          "type": "credit_card",
          "token": "365a***9c",
          "installments": 1,
          "installment_amount": "10.00",
          "transaction_security": { "validation": "***" }
        }
      }
    ]
  }
}
```

Respuesta de `GET /v1/payments/{payment_id}` (JSON sanitizado):

```json
{
  "error": "resource not found",
  "message": "Si quieres conocer los recursos de la API que se encuentran disponibles visita el Sitio de Desarrolladores de MercadoLibre (https://developers.mercadopago.com)"
}
```

### (2) Card Payment Brick: ¿expone el BIN y qué trae `formData` al enviar?

**SÍ.** Confirmado con la documentación oficial del SDK
(`https://github.com/mercadopago/sdk-js/blob/main/docs/bricks/card-payment.md`)
y la doc de Checkout Bricks (páginas de `additional-callbacks` y
`behavior-customizations`). Todo esto es **lado cliente**:

- **`onBinChange(bin)`** entrega el **BIN** (primeros 8 dígitos) cada vez que el
  usuario modifica el número de tarjeta. La doc advierte que solo es confiable
  **después** de que se dispara `onSubmit`.
- **`formData` (objeto `CardData`) al enviar** contiene:

  ```ts
  {
      token: string,
      issuer_id: string,
      payment_method_id: string,
      transaction_amount: number,
      payment_method_option_id: string | null,
      processing_mode: string | null,
      installments: number,
      payer: { email: string, identification: { type: string, number: string } }
  }
  ```

  Es decir, **sí trae `issuer_id` y `payment_method_id`** (además de `token`,
  monto, cuotas y `payer.email`/`identification`). La doc nota que `CardData` se
  puede enviar directamente a la API de pagos de Mercado Pago.
- **Segundo parámetro `additionalData`** de `onSubmit` (solo si paga con tarjeta):
  `{ bin: string, lastFourDigits: string, cardholderName: string, paymentTypeId: string }`.

> Nota para el proyecto: obtener BIN/marca/emisor aquí es **lado cliente** (datos
> que entrega el navegador), lo que la **regla 16** de este proyecto prohíbe para
> decidir CMR. Se documenta solo como referencia.

### (3) `mp:payment-methods` y emisores: ¿aparece CMR o Banco Falabella en Perú?

**NO** (con las respuestas de prueba obtenidas). El resultado de
`mp:payment-methods` (`GET /v1/payment_methods`) para MPE fue:

```text
yape, visa, pagoefectivo_atm, amex, debmaster, diners,
master (Prepaid), visa (Prepaid), debvisa, master, paycash
```

Ninguno es "CMR". Se consultó además los **emisores** de tarjeta para `master`
(`GET /v1/payment_methods/card_issuers?payment_method_id=master`) → **BBVA,
Interbank, Cencosud, Scotiabank, Otro**. **No aparece "Banco Falabella" ni "CMR"
como emisor** (JSON sanitizado):

```json
[
  { "id": "12354", "name": "BBVA", "processing_mode": "aggregator", "status": "active" },
  { "id": "12446", "name": "Interbank", "processing_mode": "aggregator", "status": "active" },
  { "id": "12517", "name": "Cencosud", "processing_mode": "aggregator", "status": "active" },
  { "id": "12551", "name": "Scotiabank", "processing_mode": "aggregator", "status": "active" },
  { "id": "12347", "name": "Otro", "processing_mode": "aggregator", "status": "active" }
]
```

> Salvedad: son los datos que devuelve la API con credenciales de **prueba**
> (sitio MPE). No se pudo confirmar con datos productivos. Para el objetivo del
> proyecto: **CMR / Banco Falabella no aparece como medio de pago ni como emisor**
> en las respuestas obtenidas; la identificación de CMR tendría que ser por BIN.

### (4) ¿El reembolso parcial de una order está disponible para Perú?

**SÍ** (verificado empíricamente con credenciales de prueba MPE). Se reembolsó
**5.00** de una order cobrada de 10.00 → `HTTP 201`, y la order pasó a
`status = processed`, `status_detail = partially_refunded`, con el reembolso en
`transactions.refunds[]`. Respuesta real (JSON sanitizado):

```json
{
  "id": "ORDT***4A",
  "status": "processed",
  "status_detail": "partially_refunded",
  "transactions": {
    "refunds": [
      {
        "id": "REF0***MT",
        "transaction_id": "PAY0***AH",
        "reference_id": "01M5***5N",
        "amount": "5.00",
        "status": "processed"
      }
    ]
  }
}
```

Requisito observado: el reembolso parcial se envía con
`{ "transactions": [ { "id": "<transaction_id>", "amount": "<monto>" } ] }`
(el `id` de la transacción, no el de la order; ver sección c).

### Nota sobre `external_reference`

`external_reference` **solo acepta MAYÚSCULAS alfanuméricas, sin guiones ni
minúsculas**. El intento inicial con `t3.5a-probe-<uuid>` (con guiones y
minúsculas) fue rechazado con `400 property_value` /
`'$.external_reference' - does not match pattern`; con un valor alfanumérico en
mayúsculas (`PROBET35A…`) funcionó. Por tanto, hay que **derivar
`external_reference` desde el `attemptId`** limpiando guiones y pasando a
mayúsculas (por ejemplo quitando `-` de un UUID y usando solo `[0-9A-F]`).

---

## Observaciones transversales

- Para listar los medios de pago: `GET /v1/payment_methods` con el Access Token
  (sigue igual en Orders API). Página:
  `https://www.mercadopago.com/developers/es/reference/online-payments/checkout-api/payment-methods/get`.
- Idempotencia: `X-Idempotency-Key` obligatoria en `POST /v1/orders` y demás
  operaciones de escritura de Orders API.
- Orders API usa `amount` como **string** con 2 decimales.
- **Orders API está disponible para Perú (MPE):** la guía de migración y la doc
  de tarjetas de prueba incluyen el país `[mpe]` sin exclusiones.
