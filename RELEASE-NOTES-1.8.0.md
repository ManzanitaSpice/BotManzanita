# Bot Manzanita 1.8.0

- Añade cinco fondos pixel art independientes, uno para cada zona de exploración.
- El panel RPG permite elegir una zona para previsualizar su escenario antes de comenzar; el botón de expedición usa la zona seleccionada.
- Al terminar, la ficha conserva el escenario de la última zona visitada y su bitácora completa.
- Añade la quinta zona, **Dunas de Cristal**, desbloqueada en nivel 8, con narración, afinidad elemental, peligros, recompensas y tabla de botín propias.
- Orden de progresión: Bosque Susurrante (Nv. 1), Cumbres de Bruma (Nv. 3), Ruinas Antiguas (Nv. 6), Dunas de Cristal (Nv. 8) y Mar Astral (Nv. 10).

## Despliegue

Reemplaza los archivos del paquete y conserva `.env`, `ECONOMY-MYSQL.env` y `data/`. Ejecuta una vez `dist/deploy-commands.js` para actualizar las opciones de zona de `/rpg explorar`; después inicia con `dist/index.js`.
