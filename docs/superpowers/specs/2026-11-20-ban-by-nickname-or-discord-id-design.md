# Diseño: comando `/ban` por nick o ID

## Intención

Agregar a BotManzanita un comando de moderación para expulsar permanentemente una cuenta del servidor donde se ejecuta. El moderador podrá encontrar miembros por nick mediante autocompletado o escribir un ID de Discord.

## Alcance

- `/ban objetivo` solo funciona dentro de un servidor.
- El autocompletado busca miembros actuales del servidor por su nick o nombre de usuario y envía su ID como valor seleccionado.
- El mismo campo acepta un ID de Discord para banear también una cuenta que ya no sea miembro.
- Incluye un motivo opcional, que se envía al registro de auditoría de Discord.
- El comando requiere el permiso `BanMembers`; el bot también necesita ese permiso y un rol por encima del miembro objetivo.
- La autorización del moderador sigue el permiso `BanMembers` de Discord; el comando no agrega una restricción de rango propia.
- La respuesta confirma el resultado de forma privada y explica fallos de permisos, objetivo o jerarquía.

## Fuera de alcance

- Banear en otro servidor distinto del servidor donde se ejecuta el comando.
- Buscar por apodos de personas que no sean miembros actuales; el ID es la alternativa para ellas.
- Guardar una base de datos propia de sanciones o construir un panel de moderación.

## Enfoques considerados

1. Subcomandos separados, `/ban usuario` con selector de Discord y `/ban id` con texto. Es más explícito, pero presenta dos flujos para una misma acción.
2. Un solo `/ban objetivo` con autocompletado de miembros y soporte de ID escrito. **Adoptado por defecto** porque mantiene un único flujo y permite sancionar IDs aunque la cuenta ya no esté en el servidor.

## Decisiones para implementar

- Registrar el comando en la lista central existente.
- Usar búsqueda REST de miembros del servidor para el autocompletado; no habilitar el intent privilegiado `GuildMembers` solo para esta función.
- Resolver nombres ambiguos mediante las opciones del autocompletado, sin escoger un miembro arbitrariamente.
- Comprobar permisos al ejecutar y enviar el motivo a Discord junto con el ban.
- Confirmar la interacción de forma privada antes de las llamadas REST y editar esa respuesta al terminar.
