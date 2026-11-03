# Bot Manzanita 1.9.0

- Configura cada zona con dificultad, peligro base, rango de monedas, oportunidad de hallazgo y pesos de rareza del botín.
- El botín normal usa tablas regionales: las zonas iniciales favorecen suministros comunes y las avanzadas aumentan la presencia de artículos raros y épicos.
- Cada región incorpora un jefe con nombre, poder, tasa de aparición, rango de recompensa, XP, posibilidad de botín especial y tabla propia de objetos.
- Los jefes aparecen solo al superar el encuentro de expedición. La tasa se muestra como probabilidad condicionada a completar la ruta.
- La fuerza, defensa, agilidad, nivel, rareza y especialidad de la mascota afectan el combate con el jefe.
- Derrotarlo entrega monedas y XP adicionales y puede soltar un artículo especial; perder añade daño, pero da XP de supervivencia.
- Los resultados de jefes y ambos artículos posibles quedan en la bitácora; los objetos se guardan en el inventario y las monedas en la economía.
- El panel de zona muestra dificultad, riesgo, probabilidad de botín, jefe, tasa de aparición, poder y tasa de botín especial antes de explorar.

## Despliegue

Reemplaza los archivos del paquete y conserva `.env`, `ECONOMY-MYSQL.env` y `data/`. Ejecuta una vez `dist/deploy-commands.js` para publicar la descripción actualizada de `/rpg explorar`; inicia el bot con `dist/index.js`.
