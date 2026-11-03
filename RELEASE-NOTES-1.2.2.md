# Bot Manzanita 1.2.2

- Carga el archivo estándar `.env` y también `ECONOMY-MYSQL.env` para facilitar la configuración desde el administrador de archivos de Pterodactyl.
- No reemplaza variables ya definidas por el panel ni por `.env` al cargar el archivo adicional.
- Excluye `ECONOMY-MYSQL.env` de Git para no publicar credenciales.
