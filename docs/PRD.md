# PRD — QRCheckout

Versión 1.0 · Prototipo académico con datos simulados · Interfaz en español (Perú)

## 1. Resumen

QRCheckout es una web responsive que se usa desde el celular. El cliente escanea los códigos de barras de los productos de la tienda, ve al instante el **precio de oferta** y el **precio con tarjeta CMR**, arma su carrito y lo lleva a caja como un **QR**. El cajero escanea ese QR desde su propia pantalla de la misma web, cobra y confirma la venta. Opcionalmente, el cliente puede pagar en línea con Mercado Pago.

Tienda de referencia: Saga Falabella Puruchuco. Los precios y la lógica CMR se basan en cómo los muestra falabella.com.pe.

## 2. Problema

- En campañas y días de mucha afluencia se forman colas porque cada producto se escanea otra vez en caja.
- El cliente no sabe cuánto pagará hasta llegar a caja. Un mismo producto tiene precio normal y precio CMR, y muchas veces se entera del descuento CMR recién al pagar.
- El vendedor calcula totales a mano, con demoras y errores.
- El stock no siempre está actualizado.

## 3. Objetivos y cómo se miden en el prototipo

| Objetivo del canvas | Cómo se verifica en el prototipo |
|---|---|
| Cobro en caja menor a 1 minuto con QR | Cronometrar en pruebas: desde escanear el QR hasta confirmar el cobro |
| 100% de precios calculados correctamente | Pruebas automáticas del cálculo con casos reales (ver ARCHITECTURE.md, sección de pruebas) |
| El cliente conoce su precio final antes de caja | Resumen del carrito con total normal y total CMR |
| Stock actualizado | El stock baja al confirmar cada venta y los ajustes manuales quedan registrados |
| Reducir la espera 50%, subir ventas CMR 15%, ROI en 6 meses, disponibilidad 99% | **No medibles en un prototipo local.** Se presentan como metas del despliegue real |

## 4. Roles

| Rol | Cómo entra | Qué hace |
|---|---|---|
| **Cliente** | Login con Google (obligatorio) | Escanea productos, arma su carrito, genera el QR, ve su historial y comprobantes. Opcional: paga en línea |
| **Cajero** | Correo y contraseña, creados por el admin | Escanea el QR del cliente, elige el medio de pago, confirma el cobro, ve sus cobros del día. Opcional: verifica salida |
| **Administrador** | Correo y contraseña (primer admin creado por script de arranque) | Administra categorías y sus campos, campañas de descuento y productos (con escaneo), ajusta stock, crea cajeros, ve el dashboard |

No existe registro público para cajero ni admin.

## 5. Alcance

### Dentro del MVP
- Login con Google (cliente) y login con contraseña (cajero y admin).
- Categorías administrables por el admin, cada una con sus propios campos adicionales.
- Catálogo de productos con precio original, stock, máximo por compra, descuento CMR por producto y los campos de su categoría.
- Campañas de descuento para productos concretos, categorías o toda la tienda, por porcentaje o monto fijo, con prioridad, fechas de inicio y fin, e interruptor para activarlas o desactivarlas.
- Creación de productos con escaneo del código de barras (se usa el código que ya trae el producto) o generación de un código interno.
- Escáner del cliente, carrito guardado en su cuenta, resumen estilo Falabella.
- QR del carrito, pantalla del cajero, confirmación de cobro, baja de stock.
- Comprobante simulado imprimible e historial de compras del cliente.
- Cuotas sin intereses como cálculo informativo.
- Dashboard básico del admin.
- Carga inicial de 20 a 30 productos de ejemplo con un script (semilla).

### Opcional, solo si alcanza el tiempo
- Pago en línea con Mercado Pago en modo pruebas, siempre por el total de oferta (RN-20).
- Código de salida (`O-XXXXX`) para verificar la entrega de las compras pagadas en línea (RN-21).

### Ampliación del curso: compras, almacén y seguridad (Sprint 4)
El proyecto registrado en el curso es un *Sistema de Gestión de Ventas, Compras y Almacén*, y el docente pidió las épicas Gestionar compras, Gestionar almacén, Gestionar seguridad y Generar dashboard. Por eso se agregan, después del MVP de ventas:
- Proveedores (RUC válido y único), órdenes de compra y guías de entrada que suman al stock.
- Guías de salida (traslado, devolución al proveedor, merma) que nunca dejan el stock en negativo, e inventario físico con diferencias que generan ajustes de stock.
- Roles de compras y almacén, backup y restauración de la base de datos.
- Dashboards de compras y de almacén.

### Fuera del MVP
- Integración con el sistema o la base de datos real de Saga.
- Garantía extendida.
- Facturación electrónica real (SUNAT). Se deja la estructura lista.
- Imágenes de productos (el campo existe, pero no se usa todavía).
- Importación masiva desde la interfaz.
- Rol vendedor.
- Envío del comprobante por correo: en el pago en línea se pide y se guarda el correo, pero el comprobante solo se muestra en pantalla.
- Campo de descuento suelto en el producto: un descuento a un producto concreto se hace con una campaña que lo apunte. El único descuento propio del producto es el CMR.
- Campañas por marca (los alcances son productos, categorías o toda la tienda).
- Descuento CMR en monto fijo (solo porcentaje).
- Vendedores externos, "compra internacional" y opciones de entrega de la web de Falabella.

## 6. Reglas de negocio

**Los tres precios de un producto**

| Precio | Qué es | ¿Lo tiene todo producto? |
|---|---|---|
| **Original** | Precio de lista, se muestra tachado | Sí, siempre |
| **Oferta** | Precio con el descuento de una campaña. **No pone condiciones**: lo paga cualquiera | No: solo si una campaña activa alcanza al producto. Si no, es igual al original |
| **CMR** | Descuento extra **solo si se paga con tarjeta CMR**, calculado sobre la oferta | No: solo si el producto tiene descuento CMR. Si no, es igual a la oferta |

Un producto puede tener los tres precios, solo original y oferta, solo original y CMR (en ese caso el CMR se calcula sobre el original), o un único precio. Cuando dos precios coinciden, la pantalla muestra uno solo.

- **RN-01 Precios.** El producto guarda solo su **precio original** y, si corresponde, su regla CMR. Los demás precios y todos los porcentajes mostrados se calculan al consultar y no se guardan como dato principal. El **precio de oferta** (en los cálculos y en el código figura como *normal*) es el original menos el descuento de la campaña que gane (RN-16), o igual al original si ninguna aplica. El **precio CMR** es el de oferta menos el porcentaje CMR del producto, si tiene descuento CMR; si no, es igual al de oferta. Los porcentajes son mayores que 0 y llegan hasta 90. Todo se redondea al céntimo (mitad hacia arriba). Por construcción se cumple `CMR ≤ oferta ≤ original`.
- **RN-02 Resumen del carrito** (igual al de Falabella):
  - Productos = suma de precios originales × cantidad.
  - Descuentos = suma de (original − normal) × cantidad.
  - Total = suma de normal × cantidad.
  - Total con CMR = suma de CMR × cantidad.
  - Ahorro con CMR = Total − Total con CMR.
  - Porcentaje mostrado por producto = 1 − CMR / original, redondeado.
- **RN-03 CMR en caja.** La web muestra ambos totales. En caja no puede saber con qué tarjeta paga el cliente, así que el cajero elige el medio de pago: si es tarjeta CMR se cobra el Total con CMR; con cualquier otro medio, el Total. El pago en línea siempre cobra el Total (RN-20).
- **RN-04 Cantidad máxima.** Por producto, la cantidad no puede superar el menor entre el máximo por compra y el stock disponible.
- **RN-05 El QR contiene solo un código corto** (por ejemplo `C-8F3K2`), nunca productos ni precios. Vigencia: 30 minutos (configurable).
- **RN-06 Mientras el QR está activo, el carrito queda bloqueado.** El cliente puede cancelar el QR para editarlo. Si el QR vence, el carrito vuelve a estar abierto.
- **RN-07 El servidor decide.** Al cobrar, el servidor recalcula con los precios y el stock actuales. Nunca confía en totales enviados por el navegador.
- **RN-08 Un carrito se cobra una sola vez.** El stock baja solo al confirmar el cobro.
- **RN-09 Precios congelados.** Cada venta guarda una copia de nombre, código, los tres precios y el nombre de la campaña aplicada de cada ítem, en montos y no en porcentajes, para que el historial no cambie si luego cambian las campañas.
- **RN-10 Cuotas informativas.** Se ofrecen 3, 6 y 12 cuotas, con un monto mínimo configurable. La app no financia nada; solo muestra cuánto sería cada cuota. Si el total no se divide exacto, la primera cuota absorbe los céntimos sobrantes.
- **RN-11 Comprobante simulado.** Sin validez tributaria, con la leyenda correspondiente. Tipos: ticket, boleta (exige DNI de 8 dígitos) y factura (exige RUC de 11 dígitos y razón social).
- **RN-12 Productos.** Solo el admin los crea y edita. No se eliminan, se desactivan. El código de barras es único.
- **RN-13 Ajustes de stock.** Todo ajuste manual exige un motivo y queda registrado con usuario, fecha y cantidad.
- **RN-14 Cuentas.** El cliente entra con Google. Cajero y admin usan contraseña guardada con hash y son creados por el admin.
- **RN-15 Categorías y campos adicionales.** Cada categoría puede tener campos adicionales definidos por el admin: texto, número (con unidad opcional), lista de opciones o sí/no, obligatorios u opcionales. El formulario de producto muestra los campos de su categoría y el servidor los valida. Los campos y las categorías se desactivan, no se borran; la clave y el tipo de un campo no cambian después de crearlo. Si se cambia un producto de categoría, se descartan (con confirmación) los valores de campos que la nueva categoría no tiene.
- **RN-16 Campañas.** Una campaña guarda una **regla de descuento**, no precios. Puede apuntar a productos específicos, a categorías completas o a toda la tienda. El descuento es un **porcentaje** o un **monto fijo en soles por unidad**. Tiene fecha de inicio y de fin (hora de Lima; la fecha final incluye todo ese día), un interruptor activa/inactiva y una **prioridad**. Si a un producto le aplican varias campañas a la vez, gana la de mayor prioridad; si empatan, la que dé más ahorro en ese producto; si aún empatan, la más reciente. Nunca se acumulan. Un monto fijo que iguale o supere el precio original de un producto no se aplica a ese producto.
- **RN-17 Cambios de precio en curso.** Si una campaña empieza o termina mientras hay carritos abiertos, el carrito muestra los precios vigentes al consultarse y el cobro usa los vigentes en ese momento (RN-07).
- **RN-18 Porcentajes mostrados.** Los porcentajes que ve el cliente (por ejemplo `-42%`) se calculan a partir de los precios (`1 − precio final / original`) y se muestran redondeados a entero. No se guardan.
- **RN-19 Cantidad al escanear.** Al escanear un producto se agrega 1 unidad. El cliente puede cambiar la cantidad con un contador (− y +) o escribiendo el número, sin escanear el producto varias veces. Escanear otra vez el mismo producto suma 1. La cantidad siempre respeta el límite de RN-04.
- **RN-20 Pago en línea.** El pago en línea siempre cobra el total de oferta. El precio CMR solo se aplica en caja, donde el cajero comprueba la tarjeta (RN-03). Motivo: la pasarela no permite al servidor verificar que la tarjeta sea CMR. El monto lo decide siempre el servidor; nunca acepta el que envíe el navegador. Nunca se guardan el número de tarjeta, el CVV ni el vencimiento; la marca y los últimos 4 dígitos que informa el navegador se guardan solo como informativos y no deciden nada.
- **RN-21 Salida de compras en línea.** Una compra pagada en línea genera un código de salida (`O-XXXXX`). El cajero lo verifica al salir y la venta pasa a entregada; una segunda verificación responde "Ya entregado".
- **RN-22 Vaciar carrito.** El cliente puede vaciar el carrito completo, con una confirmación en pantalla. No es posible mientras el QR esté activo.
- **RN-23 Números y códigos de venta.** Cada venta recibe un número de comprobante correlativo por serie: `T001-000001` para tickets, `B001-000001` para boletas y `F001-000001` para facturas. Además tiene un código corto: el del carrito si se cobró en caja, o `O-XXXXX` si se pagó en línea.
- **RN-28 Un pago en línea no se repite.** Un token ya usado, cualquiera que haya sido el resultado anterior, responde `409 PAYMENT_TOKEN_INVALID` sin cobrar. El cliente revisa su historial de compras antes de reintentar.

## 7. Historias de usuario

**Cliente**
- Como cliente, quiero escanear el código de barras de un producto para ver su precio normal y su precio CMR.
  - Si el producto existe, se agrega al carrito. Si lo escaneo otra vez, sube la cantidad hasta el límite (RN-04).
  - Veo los detalles del producto según su categoría (por ejemplo, medida o material).
  - Puedo cambiar la cantidad con un contador (− y +) o escribiendo el número, sin escanear el producto varias veces (RN-19).
  - Si no existe, veo "No encontramos este producto" y puedo escribir el código a mano.
  - Si la cámara no funciona, veo por qué y cómo solucionarlo.
- Como cliente, quiero ver mi carrito con el resumen completo y las cuotas informativas para saber cuánto pagaré.
  - Puedo vaciar el carrito completo con una confirmación (RN-22).
- Como cliente, quiero generar un QR para caja y verlo con su cuenta regresiva.
- (Opcional) Como cliente, quiero pagar en línea con tarjeta por el total de oferta y recibir un código de salida si se aprueba.
  - Elijo ticket, boleta (DNI) o factura (RUC) y escribo mi correo.
  - Si el banco rechaza la tarjeta, veo el motivo y puedo intentar con otra.
  - Si se aprueba, recibo un código de salida (QR) para mostrar al salir de la tienda.
- Como cliente, quiero ver mi historial de compras y abrir el comprobante de cada una.

**Cajero**
- Como cajero, quiero escanear el QR (o escribir el código) y ver el carrito completo con los dos totales.
- Como cajero, quiero elegir el medio de pago y confirmar el cobro para que la venta quede registrada y el stock baje.
  - Si el QR venció, veo "Este QR venció. Pide al cliente que genere uno nuevo".
  - Si el carrito ya se cobró, no se puede cobrar de nuevo.
  - Si falta stock de algún ítem, el cobro se bloquea y se indica cuál.
- Como cajero, quiero rechazar un carrito si el cliente se arrepiente.
- Como cajero, quiero ver mis cobros del día.
- (Opcional) Como cajero, quiero verificar el código de salida de una compra en línea para marcarla como entregada.

**Administrador**
- Como admin, quiero escanear el código de un producto nuevo y completar sus datos en un formulario.
  - Si el código ya existe, se me avisa y puedo editar ese producto.
  - Al elegir la categoría aparecen sus campos adicionales; los obligatorios deben completarse.
  - Puedo activar "Tiene descuento CMR" y escribir su porcentaje, y veo al instante los precios resultantes.
- Como admin, quiero crear categorías y definir sus campos adicionales (texto, número, lista de opciones, sí/no).
- Como admin, quiero crear campañas de descuento (porcentaje o monto fijo) para productos concretos, categorías o toda la tienda, con fechas, prioridad y un interruptor para activarlas o desactivarlas, y ver cuáles están vigentes.
- Como admin, quiero generar un código interno para productos sin código de barras.
- Como admin, quiero ajustar el stock indicando el motivo.
- Como admin, quiero crear y desactivar cuentas de cajero.
- Como admin, quiero ver ventas por día, productos más escaneados, ventas con CMR frente a otros medios, y productos con poco stock.

## 8. Flujo principal

1. El cliente inicia sesión con Google y escanea productos.
2. Revisa el carrito y pulsa **Generar QR para caja**.
3. El cajero escanea el QR, ve el carrito, elige el medio de pago y pulsa **Confirmar cobro**.
4. La venta queda guardada, el stock baja y se muestra el comprobante para imprimir.
5. El cliente ve la compra en su historial.

## 9. Correcciones al Lean Canvas

| En el canvas | En este proyecto |
|---|---|
| Vendedor usa la solución | El cliente escanea; el vendedor queda fuera del MVP |
| Cajero sin función definida | Cajero con pantalla propia para cobrar (sección 4) |
| Stock en tiempo real con ventas en caja | Solo baja con ventas confirmadas dentro de QRCheckout |
| Integración con la caja de Saga | Sustituida por la pantalla del cajero |
| Garantía extendida, guías de entrada y salida | Fuera del MVP |
| Pago con Mercado Pago | Opcional, al final. Mercado Pago acepta Visa y Mastercard, así que una CMR se puede cobrar en línea, pero siempre al total de oferta; el precio CMR solo se aplica en caja (RN-20) |
| Fechas de sprint y 12 semanas | Ficticias; el plan usa 3 sprints sin fechas |
| Descuento CMR | Porcentaje por producto, calculado sobre el precio de oferta (ya con campaña) y opcional por producto |
| Descuentos regulares | Solo campañas (productos, categorías o toda la tienda), con porcentaje o monto fijo, fechas y prioridad |

## 10. Supuestos y puntos abiertos

- Vigencia del QR de 30 minutos y cuotas de 3, 6 y 12 son valores por defecto. Se cambian en la configuración.
- Los porcentajes de campaña y de CMR aceptan hasta 90 (valor por defecto). La prioridad de una campaña es un número entero: gana el mayor.
- Se quitaron las campañas por marca; si más adelante se quieren, se agregan como un alcance más.
- Las fechas de las campañas se interpretan en hora de Lima.
- Los datos de los productos son de ejemplo. Los códigos de barras deben poder escanearse (productos reales o códigos internos impresos).
- No sabemos qué tipo de código llevan los productos físicos de la tienda; probar con productos reales cuanto antes.
- Si en el futuro se quiere precio CMR en línea, hace falta una pasarela que permita verificar el BIN en el servidor.
- La norma de SUNAT sobre identificación del comprador en boletas de monto alto debe revisarse si el proyecto pasa a producción.
