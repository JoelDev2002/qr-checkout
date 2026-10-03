# QRCheckout — reglas para el agente

## Qué es este proyecto
Web responsive donde el cliente escanea códigos de barras en una tienda (Saga Falabella Puruchuco, prototipo con datos simulados), ve el precio normal y el precio con tarjeta CMR, arma un carrito y lo lleva a caja como QR. El cajero lo escanea y cobra desde su propia pantalla. Roles: cliente (Google), cajero y admin (contraseña).

Stack: React + Vite + TypeScript + Tailwind (frontend), Express + TypeScript + Prisma + MySQL (backend), monorepo con workspaces `frontend` y `backend`.

## Documentos (leer solo lo que necesite la tarea)
- `docs/PRD.md`: qué hace el producto y las reglas de negocio (RN-01 a RN-23).
- `docs/ARCHITECTURE.md`: librerías, carpetas, base de datos, API, flujo del cobro, seguridad.
- `docs/DESIGN.md`: tokens visuales, componentes, pantallas y textos.
- `docs/TASKS.md`: tareas en orden, con su criterio "Hecho cuando".

## Cómo trabajar
1. Hacer **una sola tarea** de `docs/TASKS.md` por vez, la primera sin marcar, salvo que se indique otra.
2. Antes de escribir código, dar un plan breve (qué archivos se tocan).
3. Si algo contradice los documentos o falta información, preguntar antes de inventar.
4. No añadir dependencias que no estén en `ARCHITECTURE.md` §1 sin preguntar.
5. Al terminar: correr `npm run test`, marcar la tarea `[x]` y explicar en pocas líneas qué se hizo y cómo probarlo.
6. No hacer cambios fuera de la tarea (ni "mejoras" de paso).
7. Nunca ejecutes comandos interactivos. Usa siempre las opciones que evitan las preguntas (por ejemplo `prisma migrate dev --name nombre`). Si un comando no se puede ejecutar sin preguntas, detente y dime qué comando debo correr yo.
8. Al terminar una tarea: corre las comprobaciones del "Hecho cuando", muestra la salida completa, lista los archivos cambiados con `git status` y espera mi aprobación antes de hacer commit. Nunca hagas commit sin que yo lo pida o sin que el prompt de la tarea lo indique.

## Reglas que no se rompen
1. **Dinero siempre en céntimos enteros.** Nunca `float`. Formatear solo al mostrar, con `lib/money.ts`.
2. **El servidor decide los precios.** Nunca aceptar totales ni precios enviados por el navegador.
3. **El QR contiene solo el código del carrito** (`C-XXXXX`), jamás productos ni precios.
4. **La lógica de negocio va en `backend/src/domain/`**, sin importar Express ni Prisma, y con pruebas.
5. **Solo los repositorios hablan con Prisma.** Los controladores no calculan precios.
6. **Cobro dentro de una transacción**, con actualizaciones condicionadas para stock y estado (ver `ARCHITECTURE.md` §7).
7. **Roles verificados en el servidor** en cada ruta.
8. **Validar con Zod** todo lo que entra a la API y los formularios.
9. **Nada de secretos en el código ni en el frontend.** Todo va en `.env`; solo se sube `.env.example`.
10. **`POST /auth/dev-login` solo existe en desarrollo** con `DEV_LOGIN=true`.
11. Las llamadas del frontend a la API van solo por `services/api.ts` y usan `/api` (proxy de Vite).
12. Productos, categorías, campos de categoría y campañas se desactivan, no se eliminan.
13. **Los precios normal y CMR no se guardan en el producto:** se calculan con `domain/pricing.ts` (campañas vigentes con su prioridad, y descuento CMR sobre el precio de oferta). Cada venta guarda su copia.
14. Se guardan las **reglas** de descuento, no los resultados: porcentajes en puntos básicos (2850 = 28.50 %) y montos fijos en céntimos. Los porcentajes que ve el cliente se calculan y se redondean a entero. Los precios se redondean al céntimo, mitad hacia arriba.
15. El frontend no calcula precios: los pide al servidor (por ejemplo, `POST /products/price-preview`).
16. En pagos en línea el servidor decide el monto: identifica la tarjeta CMR por BIN (`CMR_BINS`) con los datos que entrega Culqi, nunca con los del navegador. Jamás guardar número completo, CVV ni vencimiento de tarjetas.
17. Cada venta guarda sus totales (original, oferta, CMR y cobrado), su número de comprobante correlativo y la copia de los precios de cada ítem.

## Convenciones de código
- TypeScript estricto (`strict: true`), sin `any` salvo justificación en un comentario.
- Nombres de código en inglés; textos de la interfaz y mensajes de error al usuario en español, sentencia normal.
- Componentes y estilos según `docs/DESIGN.md`; no inventar colores ni tipografías.
- Respuestas de la API: `{ data }` o `{ error: { code, message } }`.
- Archivos pequeños y con una sola responsabilidad. Comentarios solo donde el porqué no sea obvio.
- Cada regla de negocio nueva lleva prueba.

## Entorno (Windows / PowerShell)
- Usar comandos de PowerShell, no de bash (por ejemplo `Copy-Item .env.example .env`, `Remove-Item -Recurse -Force`).
- Rutas relativas al repositorio y separadas con `/` en el código.
- Gestor de paquetes: `npm`.
- Comandos principales (definidos en la tarea T0.1):
  - `npm install` — instalar todo
  - `npm run dev:api` — backend en `http://localhost:3000`
  - `npm run dev:web` — frontend en `https://localhost:5173`
  - `npm run test` — todas las pruebas
  - `npm run db:migrate` y `npm run db:seed` — base de datos
- La cámara exige HTTPS; para probar en celular usar un túnel hacia el puerto 5173 (ver `ARCHITECTURE.md` §9).

## Fuera de alcance por ahora
Imágenes de productos, importación masiva desde la interfaz, rol vendedor, guías de entrada y salida, garantía extendida, facturación electrónica real, integración con los sistemas reales de Saga.
