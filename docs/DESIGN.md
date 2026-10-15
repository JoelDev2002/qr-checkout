# DESIGN — QRCheckout

Versión 1.0 · Mobile-first para cliente y cajero · Escritorio para admin

## 1. Dirección visual

QRCheckout se usa de pie, en el piso de una tienda, con una mano ocupada. La pantalla tiene que leerse de un vistazo y transmitir una sola cosa: **cuánto vale esto y cuánto ahorro con CMR**.

La imagen del producto es la etiqueta de precio de góndola, y el comprobante es el ticket de caja. Todo lo demás es callado: fondo neutro, poco adorno, mucho contraste.

**El elemento memorable es el `PriceTag`**: el bloque de precio que aparece igual en el escáner, el carrito y el cajero. El resto de la interfaz se mantiene sobria para que el precio destaque.

Principios:
1. El precio CMR es siempre lo más grande y lo único en rojo.
2. Un solo estilo de botón principal por pantalla.
3. Nada se mueve sin que la persona lo pida, salvo la cuenta regresiva del QR.
4. Los errores dicen qué pasó y qué hacer.
5. Alineación a la izquierda en listas y textos; los totales se alinean a la derecha.

## 2. Tokens

**Color** (definir como variables CSS y extender la configuración de Tailwind)

| Nombre | Hex | Uso |
|---|---|---|
| `ink` | `#172033` | Texto, botón principal, iconos |
| `paper` | `#F4F5F7` | Fondo de la app |
| `surface` | `#FFFFFF` | Tarjetas, hojas inferiores, formularios |
| `line` | `#D9DDE3` | Bordes y separadores |
| `cmr` | `#D1243B` | Precio CMR, insignia CMR |
| `saving` | `#16794F` | Ahorro, éxito, cobro confirmado |
| `warn` | `#B26A00` | Avisos: poco stock, QR por vencer |
| `muted` | `#5B6472` | Texto secundario, precio tachado |

Contraste: verificar que `cmr` sobre `surface` y `muted` sobre `paper` cumplan AA (4.5:1 en texto normal).

**Tipografía:** una sola familia, **Archivo** (`@fontsource-variable/archivo`), con pila de respaldo `system-ui, sans-serif`.
- Cifras con `font-variant-numeric: tabular-nums` en todos los montos.
- Escala: 12 / 14 / 16 / 20 / 28 / 40 px. Cuerpo 16 px, línea 1.5.
- Pesos: 400 texto, 600 etiquetas y botones, 700 precios y totales.
- Precio CMR: 28 px en tarjetas de producto; 40 px en la vista de escáner y en el total del cajero.
- Etiquetas y encabezados en minúscula normal (sin mayúsculas sostenidas).
- Códigos (código de barras, código del QR) en la misma familia con cifras tabulares, separados por espacio para leerlos.

**Espaciado:** múltiplos de 4 px. Área táctil mínima de 44 px. Márgenes laterales de 16 px en celular.

**Radios:** 2 px en etiquetas de precio y comprobante (bordes casi rectos, como papel). 14 px en hojas inferiores y en el visor de cámara. Botones: 10 px.

**Sombras:** ninguna en tarjetas. Bordes de 1 px `line` para separarlas. Sombra solo en la hoja inferior del carrito.

## 3. Componentes clave

**`PriceTag`** (props: `originalCents`, `normalCents`, `cmrCents`, `hasCmr`, `campaignName?`)
```
┌──────────────────────────────┐
│ S/ 89.90  (tachado, muted)   │
│ Normal   S/ 39.90            │
│ ▌CMR▐    S/ 37.90  (rojo)    │
│ -58%                         │
└──────────────────────────────┘
```
La insignia "CMR" es un rectángulo de 2 px de radio, fondo `cmr`, texto blanco. El porcentaje se calcula contra el precio original. Si hay una campaña vigente, la etiqueta del segundo precio dice "Oferta" (si no, dice "Normal") y su nombre aparece debajo en `muted` (por ejemplo, "Campaña Dormitorio"). Los porcentajes se muestran redondeados a entero. Si el producto no tiene descuento CMR, se oculta la fila CMR y se muestra un solo precio.

**`CartSummary`**: las mismas cuatro líneas de Falabella, más el ahorro.
```
Productos            S/ 16,855.90
Descuentos          − S/  6,991.00
Total                S/  9,864.90
Total con CMR        S/  9,472.90   (rojo, 700)
Ahorras con CMR      S/    392.00   (verde)
o 6 cuotas de aprox. S/ 1,578.82 con CMR
```

**`Scanner`**: visor con marco guía, botón de linterna (si el celular lo permite), botón "Escribir código". Se reutiliza en cliente, cajero y admin. Estados: pidiendo permiso, escaneando, leído, error.

**`QrTicket`**: tarjeta con forma de ticket (borde inferior en zigzag o perforado dibujado en CSS), QR grande, código en texto (`C-8F3K2`), cuenta regresiva y botón "Cancelar QR". Debajo de 2 minutos, la cuenta regresiva pasa a `warn`.

**`ProductRow`**: nombre, marca, color, `PriceTag` compacto, `QuantityStepper` y botón quitar.

**`QuantityStepper`**: botones − y +, con el número en medio que también se puede tocar para escribir. Se usa en el escáner y en el carrito. Respeta el límite del producto y se desactiva cuando el carrito está bloqueado por un QR.

**`StatusBadge`**: OPEN, PENDING, PAID, CANCELLED con texto y color (no solo color).

**`DynamicFields`**: dibuja los campos adicionales de una categoría en el formulario de producto: texto, número (con su unidad al lado), lista desplegable y interruptor sí/no. Marca los obligatorios y muestra el error debajo de cada campo.

**`DetailsList`**: bloque plegable "Detalles" para el cliente, con pares etiqueta y valor (por ejemplo, "Medida: Queen", "Batería: 36 horas").

**`Receipt`**: hoja blanca de ancho de ticket (320 px), lista de ítems, totales, medio de pago, leyenda "Comprobante simulado, sin validez tributaria". Con estilos de impresión (`@media print`) que ocultan todo lo demás.

## 4. Pantallas

### Cliente (celular)

1. **Entrar**: logo de texto "QRCheckout", una frase ("Escanea, ve tu precio con CMR y paga rápido") y el botón de Google. Nada más.
2. **Escáner** (inicio)
```
┌────────────────────────┐
│  visor de cámara       │
│   ┌──────────────┐     │
│   │  marco guía  │     │
│   └──────────────┘     │
│ [linterna] [escribir]  │
├────────────────────────┤
│ Último: Redmi Buds 6   │
│ PriceTag               │
├────────────────────────┤
│ Carrito (3)  S/ 1,889  │
│ con CMR   [Ver carrito]│
└────────────────────────┘
```
Debajo del último producto escaneado hay un bloque plegable **Detalles** (`DetailsList`) con los campos de su categoría. Junto al producto hay un **contador de cantidad** (`QuantityStepper`): botones − y +, y el número en medio se puede tocar para escribirlo. Escanear otra vez el mismo producto suma 1. Muestra el límite (por ejemplo, "máx. 10").
3. **Carrito**: lista de `ProductRow`, `CartSummary`, botón principal **Generar QR para caja**, botón secundario **Pagar en línea** (opcional) y botón **Vaciar carrito**, que pide confirmación en la misma pantalla ("¿Vaciar el carrito? Sí, vaciar / No") y no está disponible con un QR activo. Estado vacío: "Tu carrito está vacío. Escanea un producto para empezar."
4. **QR**: `QrTicket` centrado, texto "Muéstraselo al cajero", botón **Cancelar QR**. El carrito no se puede editar mientras el QR está activo.
5. **Historial**: lista de compras con fecha, total y medio de pago; detalle con `Receipt`.
6. **Pago en línea** (opcional): no hay formulario propio de tarjeta ni detección mientras se escribe. La pantalla pide el comprobante (ticket, boleta con DNI o factura con RUC), un aviso de que los datos de la tarjeta van directo a la pasarela, y el botón **Pagar con tarjeta**, que abre el Custom Checkout de Culqi para escribir la tarjeta. Después, una pantalla de confirmación muestra la marca, los últimos 4 dígitos y el monto: "Detectamos una tarjeta CMR. Pagarás S/ X" (en `saving`, con el ahorro) o "Esta tarjeta no es CMR. Pagarás S/ Y", con una cuenta regresiva de 4 minutos. El botón **Confirmar y pagar** pasa a "Procesando con el banco…" y se bloquea. Si el banco rechaza: "El banco rechazó la tarjeta. Prueba con otra tarjeta."
7. **Pago aprobado**: total, marca y últimos 4 dígitos, `QrTicket` de salida con el código `O-XXXXX` ("Muestra este QR al salir de la tienda") y los botones **Ver comprobante** y **Seguir comprando**. En el historial, la compra aparece como "En línea · Por entregar" o "Entregado".

### Cajero (celular o tablet, también funciona en escritorio)

1. **Entrar**: correo y contraseña.
2. **Cobrar**
```
┌────────────────────────────────┐
│ [Escanear QR]  o  C-______ [Ir]│
├────────────────────────────────┤
│ Carrito C-8F3K2 · 3 productos  │
│ (lista de ítems)               │
│                                │
│ ┌─────────────┐ ┌────────────┐ │
│ │ Con CMR     │ │ Otro medio │ │
│ │ S/ 1,889.00 │ │ S/ 2,099   │ │
│ └─────────────┘ └────────────┘ │
│ Comprobante: Ticket ▾          │
│ [ Confirmar cobro ]            │
└────────────────────────────────┘
```
Las dos tarjetas de monto funcionan como opciones excluyentes (el medio de pago CMR o los demás). Por defecto ninguna está elegida; **Confirmar cobro** se habilita al elegir una.
3. **Cobro confirmado**: pantalla en `saving` con el total cobrado, botón **Imprimir comprobante** y botón **Siguiente cliente**.
4. **Cobros de hoy**: lista con hora, código, medio de pago y total.
5. **Verificar salida** (opcional): escáner y resultado "Entregado" o "Ya entregado".

### Administrador (escritorio)

1. **Productos**: tabla con búsqueda, filtro por categoría y estado, y botón **Nuevo producto**.
2. **Formulario de producto**, en este orden:
   1. Arriba, botones **Escanear código** y **Generar código interno**. Al escanear, el código se usa tal como viene en el producto. Si ya existe, aviso "Este producto ya existe" con enlace para editarlo.
   2. Nombre, marca, color y **categoría**.
   3. Al elegir la categoría aparece el bloque "Detalles de {categoría}" con sus campos adicionales (`DynamicFields`).
   4. Precio original.
   5. Interruptor **Tiene descuento CMR** y, si está activo, el porcentaje.
   6. **Vista previa de precios** con `PriceTag`, calculada por el servidor: muestra el precio de oferta (con la campaña que gane, si la hay) y el precio CMR.
   7. Stock y máximo por compra.
   Errores en línea, por ejemplo: "El porcentaje debe ser mayor que 0 y hasta 90."
3. **Categorías**: lista con estado y un interruptor que pide confirmación en un modal antes de activar o desactivar. **Nueva categoría** y **Editar** abren una pantalla aparte. Su formulario tiene el nombre, el estado y la sección **Campos adicionales**: tabla ordenable con nombre visible, tipo, obligatorio, opciones (si es lista) y unidad (si es número). Aviso: "Los campos no se borran, solo se desactivan. Su tipo no se puede cambiar después de crearlos."
4. **Campañas**: lista con estado (Vigente, Programada, Vencida, Inactiva), prioridad y un interruptor que pide confirmación en un modal antes de activar o desactivar cada una. **Nueva campaña** y **Editar** abren una pantalla aparte. Su formulario tiene: nombre; **alcance** (Productos concretos, Categorías o Toda la tienda) con su selector (búsqueda de productos o lista de categorías); **tipo de descuento** (Porcentaje o Monto fijo en S/ por unidad) y su valor; **prioridad** (número, mayor gana); y fechas de inicio y fin. Muestra "Afecta a N productos" y, si otra campaña alcanza a los mismos productos, el aviso "Algunos productos ya tienen otra campaña; se aplicará la de mayor prioridad." Si un monto fijo iguala o supera el precio de algún producto, avisa cuántos quedarían sin descuento.
5. **Ajuste de stock**: ventana modal con cantidad (positiva o negativa) y motivo obligatorio. Debajo, historial de ajustes.
6. **Cajeros**: lista, crear y un interruptor que pide confirmación en un modal antes de activar o desactivar.
7. **Dashboard**: ventas por día, productos más escaneados, ventas con CMR frente a otros medios, productos con poco stock. Gráficos simples con tablas de respaldo.

## 5. Textos

Frases en español, oración normal, verbos activos, y la misma acción con el mismo nombre en todo el flujo.

| Acción | Texto del botón | Confirmación |
|---|---|---|
| Escanear | Escanear producto | — |
| Agregar | Agregar al carrito | "Agregado: {nombre}" |
| Generar QR | Generar QR para caja | — |
| Cobrar | Confirmar cobro | "Cobro confirmado" |
| Guardar producto | Guardar producto | "Producto guardado" |
| Activar / Desactivar | Activar / Desactivar | "¿Activar «{nombre}»?" (confirmación en un modal) |
| Ajustar stock | Ajustar stock | "Stock ajustado" |
| Mostrar contraseña | Ícono de ojo (muestra / oculta, se alterna) | — |

Los resultados de una acción (guardar, activar, ajustar) aparecen como un aviso breve (toast) en la esquina superior derecha; las acciones que cambian el estado de un producto, categoría, campaña o cajero piden antes una confirmación en un modal.

**Errores** (qué pasó y qué hacer):
- Producto inexistente: "No encontramos este producto. Escribe el código a mano o pide ayuda a un vendedor."
- Límite: "Máximo 10 unidades de este producto por compra."
- Sin stock: "Solo quedan 2 unidades."
- QR vencido (cajero): "Este QR venció. Pide al cliente que genere uno nuevo."
- Ya cobrado: "Este carrito ya fue cobrado."
- Cámara bloqueada: "No podemos usar la cámara. Actívala en los permisos del navegador o escribe el código."
- Navegador interno de una red social: "Abre esta página en Chrome o Safari para usar la cámara."

## 6. Accesibilidad y calidad mínima

- Funciona bien desde 360 px de ancho.
- Foco de teclado visible en todos los controles.
- Los botones y campos tienen etiqueta de texto; los iconos solos llevan `aria-label`.
- Respetar `prefers-reduced-motion`.
- No transmitir información solo con color (usar texto o icono junto a rojo y verde).
- Montos con formato peruano: `S/ 1,889.00`.
- Estados de carga, vacío y error en cada pantalla.

## 7. Implementación

- Definir los tokens en `frontend/src/styles/tokens.css` y en `tailwind.config`.
- Los componentes de la sección 3 viven en `frontend/src/components/`.
- El único lugar que da formato a montos es `lib/money.ts`.
