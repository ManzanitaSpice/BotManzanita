# Bot Manzanita 1.17.0

## Tarjetas y progresión

- Añadidas Profile Card global, Wallet Card, Rank Card, Room Card y Level-up Card renderizadas como PNG.
- El perfil incluye nivel, posición, XP global, actividad de chat, reputación, mascota RPG, about, título, badges, marco, tag, sticker y fondo/acento equipado.
- Cada mensaje de servidor puede otorgar XP una vez por minuto por persona y servidor. Al subir de nivel se publica una Level-up Card.
- `/perfil [usuario]`, `/profile`, `/wallet` y `/rank` abren las tarjetas; sus controles privados permiten editar about/título/acento y navegar progreso, inventario y tienda.
- `/rep @persona` otorga reputación con límite diario por pareja.

## Inventario y tienda de perfil

- Añadidas categorías de fondos de perfil, mascotas RPG, housing, fondos de rank, level-up y wallet, badges, tags, marcos y stickers.
- La tienda ofrece búsqueda avanzada y preview de artículos; se puede comprar con monedas, equipar o desequipar desde Discord.
- El housing tiene Room Card propia; las mascotas se enlazan con adopción, entrenamiento y progreso del módulo RPG.
- Añadido catálogo seed con rareza y precio, inventario/equipamiento persistente y tablas sociales en SQLite/MySQL.
- Se usa `@napi-rs/canvas` para generar tarjetas en el host, con cache de render por 60 segundos.
