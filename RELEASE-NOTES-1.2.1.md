# Bot Manzanita 1.2.1

- Hace que la configuración acepte el Endpoint MySQL completo (`host:puerto`) directamente desde el panel del proveedor.
- Detecta MySQL automáticamente si hay datos de conexión y no se especifica driver; conserva SQLite como predeterminado cuando no hay datos MySQL.
- Acepta las variables habituales `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` y `MYSQL_DATABASE` además de `ECONOMY_DB_*`.
- Registra en consola el motor y destino de la economía sin imprimir usuario ni contraseña.
- Añade una plantilla de variables y pasos directos para crear el `.env` desde Files en Pterodactyl.
