# Fondos de personalización

Cada producto de tipo `profile_bg`, `rank_bg`, `wallet_bg`, `levelup_bg` o `housing` requiere un asset raster propio, declarado en `src/data/profile-shop.ts` mediante `asset`.

- Tamaño de salida: 1200 × 640 px.
- Formato recomendado: JPEG optimizado.
- Escena sin letras, logotipos ni mockups de tarjeta.
- Mantener el foco visual hacia los bordes y dejar contraste/espacio útil para el contenido que se dibuja encima.
- Guardar el archivo aquí con nombre estable y único; el tipo de TypeScript exige indicar el asset en cada producto de fondo.
