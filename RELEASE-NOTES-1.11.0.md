# Bot Manzanita 1.11.0

## RPG: ataques y builds

- Cada nivel otorga un punto de aprendizaje. Las mascotas existentes reciben puntos retroactivos por los niveles que ya tenían.
- Las técnicas se desbloquean por nivel, elemento o especialidad. La mascota comienza con Placaje y un ataque de su elemento.
- `/rpg ataques` y el botón de la ficha abren la escuela de combate: aprender técnicas, consultar sus efectos y equipar hasta cuatro.
- Los movimientos incluyen daño, drenaje, curación, guardia y debilitamiento; cada uno indica precisión, energía, potencia y afinidad elemental.
- PvE utiliza los ataques equipados y su coste de energía. El panel PvP muestra los ataques de quien tiene el turno, sus PV y su energía; también aplica afinidades, críticos, guardia, curación y estados.
- Los movimientos, build y puntos se guardan en SQLite y MySQL; la inicialización migra las bases existentes.

## Actualización en Pterodactyl

Extrae el ZIP en la raíz conservando `.env`, `ECONOMY-MYSQL.env` y `data/`. Ejecuta una vez `dist/deploy-commands.js` para publicar `/rpg ataques`; después configura `BOT_JS_FILE=dist/index.js` y arranca el bot.
