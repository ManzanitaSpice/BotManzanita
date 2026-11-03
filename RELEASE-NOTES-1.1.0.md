# Bot Manzanita 1.1.0

- Añade almacenamiento de economía en MySQL/MariaDB con creación automática de tablas, transacciones y ledger de movimientos.
- Incluye migración idempotente de saldos, historial e inventario desde SQLite mediante `npm run economy:migrate:mysql`.
- Añade `/economia pescar`, con enfriamiento, capturas comunes y raras y mensajes variados.
- Añade `/economia robar usuario`, con probabilidad de éxito, botín limitado, multa por fallo y enfriamiento.
- Añade `/economia ruleta cantidad color` con apuestas a rojo, negro y verde.
- Añade `/economia blackjack apuesta` con panel interactivo, partidas persistentes y liquidación única.
- Añade `/economia casino` y acceso desde el panel principal.
- La economía sigue usando SQLite por defecto; MySQL se activa con las variables `ECONOMY_DB_*`.

Antes de habilitar MySQL en producción, rota las credenciales que hayan sido compartidas y sigue la migración en `HOSTING.md`.
