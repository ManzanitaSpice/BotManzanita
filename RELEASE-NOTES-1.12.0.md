# Bot Manzanita 1.12.0

## Economía y mascotas

- Se separan las monedas ganables de las gemas premium en saldos persistentes SQLite/MySQL.
- `/economia admin_moneda usuario cantidad` permite otorgar o retirar gemas premium a miembros con permiso **Gestionar servidor**. Cada movimiento se registra en el ledger de economía con el administrador asociado.
- Se agregó una tienda premium vacía, lista para agregar productos y precios sin mezclarse con la tienda de monedas.
- `/economia tienda_premium` abre el nuevo catálogo directamente.
- `/rpg nombrar nombre` y el botón del panel permiten usar una vez el cambio gratuito de nombre. Si la mascota se adoptó con nombre personalizado, ya se considera usado.
- Las bases existentes reciben las nuevas columnas automáticamente y conservan sus saldos y mascotas.

## Paneles

- Economía, perfil, RPG, bazar, casino, banco y música muestran primero saldos/estado y acciones, con menos instrucciones repetidas.
- La ficha RPG conserva zona, estado de expedición, mochila, encargos, build y bitácora; añade el acceso directo a nombrar.
