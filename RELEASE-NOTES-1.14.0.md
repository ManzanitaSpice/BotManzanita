# Bot Manzanita 1.14.0

## Prefijo alternativo

- Añadido `a!` para ejecutar acciones sin slash y alias cortos para comandos frecuentes de música, economía y RPG.
- Añadidos atajos de reproducción y búsqueda, controles de cola, favoritos y listas; saldos, recompensas, juegos, transferencias y paneles de economía; panel RPG, adopción, exploración, combate, tienda, misiones y PvP.
- Los comandos `a!` reutilizan los servicios, la base de datos y los paneles existentes; no crean flujos de datos paralelos.
- Añadida gestión `a!admin` exclusivamente por DM, con validación del ID propietario y parámetros de servidor/usuario explícitos.
- Activados `GuildMessages`, `DirectMessages`, `MessageContent` y partial de canal. El administrador debe habilitar **Message Content Intent** en el portal de Discord.
