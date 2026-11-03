# Bot Manzanita 1.7.0

- Guarda una bitácora de expedición por usuario con llegada, decisión de la mascota, encuentro, hallazgo/recompensa y regreso al gremio.
- Muestra el relato completo al terminar `/rpg explorar`; el panel conserva la última bitácora y el resumen del resultado.
- Añade `/rpg bestiario`, paginado y con las 48 especies clasificadas por rareza, elemento, especialidad y atributos base, junto a los dos atlas pixel art.
- Asigna la rareza natural de cada especie. La adopción conserva probabilidades globales de 58% común, 25% poco común, 11% rara, 5% épica y 1% legendaria.
- La rareza aumenta las estadísticas iniciales, la resistencia efectiva durante expediciones, la probabilidad de encontrar artículos y el poder de combate.
- Amplía la tienda RPG a 80 artículos: 10 existentes y 70 nuevos de curación, energía, experiencia, mejoras permanentes, equipo y preparativos de exploración.
- Persiste registros de expedición y nuevas propiedades de mascotas en SQLite o MySQL, con migraciones de columnas para bases existentes.
- Incluye los atlas pixel art y demás imágenes necesarias en `assets/rpg/` para el host.

## Despliegue

Reemplaza los archivos del paquete y conserva `.env`, `ECONOMY-MYSQL.env` y `data/`. Ejecuta una vez `dist/deploy-commands.js` para registrar `/rpg bestiario`; luego inicia con `dist/index.js`. No se requiere migración manual: el bot crea la tabla de bitácoras y agrega las columnas que faltan al arrancar.
