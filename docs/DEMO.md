# Guion de demostración — QRCheckout

Recorrido de punta a punta con los datos de ejemplo de `prisma/seed-data/`. Duración aproximada: 10–15 minutos. Todos los datos son simulados.

## Antes de empezar

- MySQL arriba, `backend/.env` y `frontend/.env` configurados, migraciones aplicadas y catálogo cargado (`npm run db:migrate` y `npm run db:seed`).
- API y web corriendo en dos terminales: `npm run dev:api` y `npm run dev:web`.
- Navegador en `https://localhost:5173` (acepta la advertencia de certificado).
- Ten a mano el correo y la contraseña del admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` de `backend/.env`).
- Crea un cajero si aún no tienes uno (la pantalla de gestión todavía no existe):

  ```powershell
  $login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType 'application/json' -Body '{"email":"ADMIN_EMAIL","password":"ADMIN_PASSWORD"}'
  Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/users -Headers @{ Authorization = "Bearer $($login.data.token)" } -ContentType 'application/json' -Body '{"name":"Cajero Demo","email":"cajero@ejemplo.com","password":"una_clave_de_8_o_mas"}'
  ```

  Sustituye los datos del admin por los de tu `.env`.

### Códigos de barras y precios esperados

| Código | Producto | Precio de oferta | Precio CMR | Campaña aplicada |
|---|---|---|---|---|
| `2000000000138` | Apple Pencil USB-C | **S/ 429.00** | **S/ 289.15** | Apple Pencil (−28.5 %) |
| `2000000000060` | Audífonos Xiaomi Redmi Buds 6 Play | **S/ 39.90** | **S/ 37.91** | Audífonos −S/ 50 (monto fijo) |
| `2000000000077` | Audífonos Samsung Galaxy Buds3 | **S/ 399.00** | **S/ 349.13** | Audífonos −S/ 50 (monto fijo) |
| `2000000000091` | Audífonos Sony WH-CH520 | **S/ 149.00** | S/ 149.00 (sin CMR) | Audífonos −S/ 50 (monto fijo) |
| `2000000000015` | Dormitorio Royal Prince Firme Queen + 2 Almohadas | **S/ 1,892.24** | **S/ 1,843.04** | Cyber Dormitorio (−44 %) |
| `2000000000169` | Tablet iPad 10.9" | **S/ 1,804.05** | **S/ 1,713.85** | Toda la tienda 5 % |
| `2000000000114` | Cable USB-C 1 m | **S/ 28.41** | S/ 28.41 (sin CMR) | Toda la tienda 5 % |
| `2000000000176` | Tablet Samsung Galaxy Tab A9+ | — | — | Sin stock: muestra el aviso de agotado |

Recuerda: gana una sola campaña, la de mayor prioridad (Apple Pencil > Audífonos > Cyber Dormitorio > Toda la tienda), y el CMR se aplica sobre el precio de oferta. Cuando el precio de oferta y el de CMR coinciden, la pantalla muestra un solo precio.

## Parte 1 — Cliente

1. **Entrar.** En `/login`, sección **Clientes**, pulsa **Entrar como cliente de prueba** (o el botón de Google, si lo configuraste). Queda en la pantalla del escáner.
2. **Escanear.** Con el visor de cámara apunta al código, o usa la entrada manual y escribe `2000000000138`.
   - Aparece el **Apple Pencil USB-C** con el precio original tachado, la oferta **S/ 429.00**, el precio CMR **S/ 289.15** y la campaña **Apple Pencil**.
   - Abre el bloque plegable **Detalles**: compatibilidad iPad, largo 17.5 cm, material Aluminio, incluye estuche: no.
3. **Cantidad.** Con el contador (`−` / `+`) sube el Apple Pencil a **2 unidades**. El contador espera ~400 ms desde el último toque antes de enviar la cantidad al servidor. Comprueba que no puedes pasar del límite (máximo 3, stock 7).
4. **Más productos.** Escanea (o escribe) `2000000000060` (Redmi Buds, oferta S/ 39.90 / CMR S/ 37.91) y `2000000000015` (Dormitorio Royal Prince Queen, oferta S/ 1,892.24 / CMR S/ 1,843.04).
5. **(Opcional) Fuera de stock.** Escanea `2000000000176` (Galaxy Tab A9+): muestra el aviso de que no hay stock.
6. **Carrito.** Entra a **Carrito**. Muestra las líneas del resumen estilo Falabella: **Productos**, **Descuentos**, **Total**, **Total con CMR** y el **ahorro con CMR**. Como el total supera S/ 300.00, se ven las **cuotas informativas** de 3, 6 y 12 (la primera cuota absorbe los céntimos sobrantes).
7. **Generar el QR.** Pulsa **Generar QR para caja**. Aparece el código `C-XXXXX` con una **cuenta regresiva de 30:00**. Mientras el QR está activo el carrito queda bloqueado (si intentas editarlo desde otra pestaña, responde `CART_LOCKED`).

## Parte 2 — Cajero

8. **Entrar.** En `/login`, usa el correo y la contraseña del cajero creado arriba. Queda en la pantalla del cajero.
9. **Leer el carrito.** Escanea el QR del cliente o escribe el código `C-XXXXX`. Se ve el carrito completo con **Total** (con campañas) y **Total con CMR**.
10. **Cobrar con CMR.** Elige el medio de pago **Tarjeta CMR**: las tarjetas de monto muestran que se cobra el **Total con CMR**.
11. **Comprobante.** Elige el tipo. Por ejemplo **Boleta** exige **DNI de 8 dígitos**; **Factura** exige **RUC de 11 dígitos y razón social**; **Ticket** no pide documento. Pulsa **Confirmar cobro**.
    - Se muestra el comprobante con su número correlativo (`B001-000001` para boletas, `T001-000001` para tickets) y la leyenda de comprobante simulado.
    - Pulsa **Imprimir comprobante**: al imprimir o guardar como PDF solo aparece el comprobante.
12. **Cobrar con otro medio.** Vuelve al cliente, genera un nuevo QR con el carrito y repite el paso 9 eligiendo **Tarjeta** o **Efectivo**: ahora se cobra el **Total** (con campañas, sin el descuento CMR), que es mayor que el total CMR. Observa que el stock bajó solo al confirmar cada venta.

## Parte 3 — Administrador

13. **Entrar.** En `/login` entra con el admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Redirige a `/admin` (Panel).
14. **Categoría con campos.** En **Categorías**, crea una categoría y agrégale campos de los **cuatro tipos**: texto, número (con unidad opcional), lista de opciones y sí/no; marca algunos como obligatorios. Desactiva un campo y comprueba que no se pierden los valores ya guardados.
15. **Producto.** En **Productos → Nuevo**, usa **Escanear código** (o **Generar código interno** para un producto sin código). Al elegir la categoría aparecen sus **campos dinámicos**; activa **Tiene descuento CMR** y escribe un porcentaje. La **vista previa de precios** se calcula en el servidor (`POST /products/price-preview`). Guarda y verifica que aparece en la lista.
16. **Campaña con prioridad.** En **Campañas**, crea una campaña: elige el alcance (productos concretos, categorías o toda la tienda), el tipo y valor del descuento (porcentaje o monto fijo), la **prioridad**, las fechas de inicio y fin y el interruptor activa/inactiva. La lista indica si queda **Vigente**, **Programada** o **Vencida** y muestra el conteo **Afecta a N productos**. Comprueba que una campaña de mayor prioridad gana sobre una de menor prioridad para el mismo producto.
17. **Panel.** Entra a **Panel** (`/admin` o `/admin/dashboard`): ventas por día, productos más escaneados, ventas con CMR frente a otros medios y productos con poco stock (por ejemplo los Redmi Buds, con stock 2).
