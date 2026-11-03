# Bot Manzanita 1.0.1

Primera versión preparada para despliegue en un host Node.js.

- Módulos de economía y música con comandos de aplicación.
- Economía persistente con SQLite, recompensas, transferencias, tienda e inventario.
- Música mediante Lavalink, con panel interactivo, efectos, cola, favoritos y listas persistentes.
- `dist/` compilado incluido para que el host pueda iniciar con `npm start` sin compilar TypeScript.
- Requiere Node.js 20 o superior y un endpoint Lavalink v4 para reproducción.

El paquete no contiene tokens, `.env`, base de datos local ni `node_modules` específicos de Windows. Revisa `HOSTING.md` para instalarlo y configurar el panel del host.
