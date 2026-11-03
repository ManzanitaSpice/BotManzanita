# Bot Manzanita 1.11.1

## Configuración y mantenimiento

- Un registro de comandos compartido alimenta tanto al bot en ejecución como al publicador de comandos, evitando diferencias entre ambos.
- La carga de `.env` completa variables ausentes o vacías del panel; los valores no vacíos configurados por el host tienen prioridad. `ECONOMY-MYSQL.env` completa lo que falte en `.env`.
- Lavalink ahora es opcional durante el arranque. Si `LAVALINK_PASSWORD` está vacío, el bot conserva Discord, economía y RPG activos e indica cómo habilitar música.
- TypeScript ahora falla al compilar si queda una variable local o parámetro sin uso. Se limpiaron los hallazgos existentes.
- Los errores de proceso que no se pueden manejar cierran el proceso para que Pterodactyl pueda reiniciarlo en un estado limpio.
- Se añadió `ARCHITECTURE.md` con el mapa de módulos, la precedencia de configuración y los pasos de publicación.

## Verificación

`npm run build` termina correctamente con `noUnusedLocals` y `noUnusedParameters` activados.
