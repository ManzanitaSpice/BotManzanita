# Fondos de personalización

Cada producto de tipo `profile_bg`, `rank_bg`, `wallet_bg` o `levelup_bg` requiere un asset raster propio, declarado en `src/data/profile-shop.ts` mediante `asset`.

- Tamaño de asset recomendado: 1200 × 640 px.
- Formato recomendado: JPEG optimizado.
- Escena sin letras, logotipos ni mockups de tarjeta.
- Los fondos de perfil, rango y subida de nivel se recortan al centro para tarjetas panorámicas de 1200 × 420 px; deja los detalles importantes fuera de los 110 px superiores e inferiores.
- Wallet usa 1200 × 540 px.
- Deja poco detalle detrás del avatar a la izquierda y del texto a la derecha para que se mantenga legible.
- Guardar el archivo aquí con nombre estable y único; el tipo de TypeScript exige indicar el asset en cada producto de fondo.
