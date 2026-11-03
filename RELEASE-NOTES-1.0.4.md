# Bot Manzanita 1.0.4

- Desactiva la reconexión automática de voz y destruye el reproductor al desconectarse para que el bot no vuelva a entrar solo.
- Añade desconexión desde el panel y un enlace a la canción cuando la fuente proporciona una URL.
- Mejora los resultados visibles con el nombre de la fuente y limpia enlaces copiados entre `< >`.
- Añade LavaSrc 4.8.3 a la configuración de Lavalink para Spotify y admite búsqueda `spsearch:`.
- Limita las playlists y álbumes a 50 pistas por solicitud y avisa cuando se recortan.

Para Spotify, define `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` en el entorno de Lavalink. El audio se resuelve desde YouTube mediante el proveedor de espejo de LavaSrc.

El paquete no incluye `.env`, tokens, bases de datos ni `node_modules`. Al actualizar en el host, conserva el `.env` y la carpeta `data` existentes.
