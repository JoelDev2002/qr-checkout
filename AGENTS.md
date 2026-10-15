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
1. Haz solo la tarea que indique el prompt (si no indica ninguna, la primera sin marcar de `docs/TASKS.md`). No adelantes tareas siguientes ni toques nada fuera de su alcance.
2. Antes de escribir código, dar un plan breve (qué archivos se tocan).
3. Si algo contradice los documentos o falta información, preguntar antes de inventar.
4. No añadir dependencias que no estén en `ARCHITECTURE.md` §1 sin preguntar.
5. Al terminar: correr `npm run test`, marcar la tarea `[x]` y explicar en pocas líneas qué se hizo y cómo probarlo.
6. No hacer cambios fuera de la tarea (ni "mejoras" de paso).
7. Nunca ejecutes comandos interactivos. Usa siempre las opciones que evitan las preguntas (por ejemplo `prisma migrate dev --name nombre`). Si un comando no se puede ejecutar sin preguntas, detente y dime qué comando debo correr yo.
8. Al terminar una tarea: corre las comprobaciones del "Hecho cuando", muestra la salida completa, lista los archivos cambiados con `git status` y espera mi aprobación antes de hacer commit. Nunca hagas commit sin que yo lo pida o sin que el prompt de la tarea lo indique.
9. Mientras desarrollas una tarea, corre solo los archivos de prueba relevantes (por ejemplo npx vitest run tests/modules/xxx.test.ts). Corre la suite completa una sola vez, al final de la tarea.
10. Las pruebas nunca comparan ids contra valores literales (por ejemplo id === 1). Usan el id que devuelve lo que acaban de crear.
11. Este proyecto tiene UNA sola tienda. No existe storeId ni nada parecido. No inventes campos, tablas, rutas ni parámetros que no estén en los documentos.
12. Nunca dejes la suite en rojo. Antes de terminar, corre la suite completa una vez y `npx tsc --noEmit` en backend. Si fallan pruebas que no son tuyas, detente y dime cuáles, sin cambiarlas.
13. Antes de cada commit muestra `git diff --stat` y `git status`, y comprueba que solo aparezcan archivos de la tarea. No borres ni reescribas archivos existentes: edita solo las líneas necesarias.
14. Nunca ejecutes comandos de Prisma que modifican la base o el esquema (db pull, db push, migrate dev, migrate reset). Si hace falta alguno, dime el comando y lo corro yo. migrate deploy solo contra la base de pruebas.

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
16. En pagos en línea el servidor decide el monto: identifica la tarjeta CMR por BIN (`CMR_BINS`) con los datos que entrega Mercado Pago, nunca con los del navegador. Jamás guardar número completo, CVV ni vencimiento de tarjetas.
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
- Crea y edita archivos SOLO con la herramienta de escritura y edición de archivos. Prohibido crear o modificar archivos desde la consola: nada de here-strings (@" "@), echo, Set-Content, Out-File, cat, bash -c ni python -c. En PowerShell el símbolo $ y las comillas invertidas dañan el código.
- Usa la consola solo para correr comandos (npm, npx, git).
- Nunca guardes archivos de código con codificación ASCII. Conserva los acentos y la eñe.
- No uses comandos de Linux en PowerShell (tail, cat, grep). Usa Select-Object, Get-Content o Select-String.
- Si un comando o enfoque falla dos veces, detente y pregúntame. No pruebes rodeos.
- En PowerShell NO existen head, tail, cat, wc, grep ni sed. Usa Get-Content, Select-Object -First o -Last, Select-String y Measure-Object. Si un comando falla porque no existe, no lo repitas con otra forma de Linux.

## Fuera de alcance por ahora
Imágenes de productos, importación masiva desde la interfaz, rol vendedor, guías de entrada y salida, garantía extendida, facturación electrónica real, integración con los sistemas reales de Saga.

## Cierre de tarea (aplica a TODA tarea)
1. Mientras trabajas corre solo los archivos de prueba que toques. Al final corre la suite completa UNA vez y la comprobación de tipos (npx tsc --noEmit) en los paquetes que cambiaste. Todo debe pasar. Si hay pruebas en rojo que no son tuyas, detente y dime cuáles, sin cambiarlas.
2. Antes de commitear muestra git diff --stat y git status. Solo deben aparecer archivos de esta tarea. Si ves archivos o borrados que no son de la tarea, detente.
3. Marca la tarea [x] en docs/TASKS.md solo si el prompt lo indica, editando solo esa línea. Si el prompt dice que no la marques, solo agrega o quita la nota que indique.
4. Haz el commit con el mensaje que indique el prompt. Si algo falla dos veces, detente y dime qué pasó.
5. Si algo del prompt no se puede hacer con lo que existe (una ruta de la API, un campo, una librería), detente y dime en vez de inventarlo.
6. Termina con un resumen corto: qué hiciste, qué decisiones tomaste y qué debo probar a mano.
7. Las pruebas del backend comparten la base qrcheckout_test: nunca corras la suite del backend mientras haya otra corriendo. Si ves fallos masivos que no tienen que ver con tu tarea, vuelve a correr la suite UNA vez antes de concluir nada y dime los dos resultados.

## Pantallas (frontend)
- Solo frontend: no toques backend, prisma ni migraciones. Las formas EXACTAS de lo que se envía y se recibe se leen de backend/src/modules/<módulo>/schemas.ts y controller.ts. Si falta algo en la API, detente y dime; no lo inventes.
- Todas las llamadas van por services/api.ts. Estilos con los tokens de DESIGN.md §2, textos en español con acentos, estados de carga, vacío y error (con botón Reintentar), botones deshabilitados mientras se envía, área táctil mínima de 44 px, que se vea bien desde 360 px y foco visible.
- Reutiliza lo que ya existe (AdminLayout, navegación, session.ts, RequireRole, componentes) en vez de duplicarlo. Antes de crear algo, busca si ya existe.
- Librerías: solo las de ARCHITECTURE.md §1. Si necesitas otra, detente y pregunta.
- Las pruebas de Vitest cubren la lógica pura; la apariencia la compruebo yo a mano.
- Al terminar una pantalla, en docs/TASKS.md NO marques la tarea [x] (la marco yo tras probarla). Solo quita la nota “(API hecha; falta la pantalla)” si la tiene.
