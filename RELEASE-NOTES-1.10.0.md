# Bot Manzanita 1.10.0

- Añade `/rpg retar oponente` para enviar un desafío PvP público que la persona elegida puede aceptar o rechazar.
- Implementa combate por turnos con ataque, defensa, una técnica especial según la especialidad de la mascota y rendición.
- Usa estadísticas y especialidad de las dos mascotas al iniciar el duelo; muestra PV, guardia, especial usada, ronda, turno y bitácora en un panel Components V2.
- Guarda desafíos y partidas activas en SQLite o MySQL para que los botones mantengan el turno correcto y las interacciones repetidas no dupliquen acciones.
- Limita a una invitación o partida activa por participante; las invitaciones vencen en 5 minutos y los duelos abandonados en 24 horas.
- El duelo es amistoso: los PV son temporales, no consume energía ni artículos y no cambia el estado persistente de las mascotas.
- La especialidad Apoyo recupera PV; Atacante potencia el daño; Explorador puede hacer críticos con más frecuencia; Guardián reduce daño al defender y su técnica deja guardia.

## Despliegue

Reemplaza los archivos del paquete y conserva `.env`, `ECONOMY-MYSQL.env` y `data/`. Ejecuta una vez `dist/deploy-commands.js` para registrar `/rpg retar`; luego inicia el bot con `dist/index.js`. La tabla nueva se crea automáticamente al iniciar.
