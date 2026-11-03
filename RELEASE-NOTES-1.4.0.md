# Bot Manzanita 1.4.0

- Añade `/economia crimen` y el atajo `/crime` como nueva actividad de economía.
- El golpe puede otorgar entre 80 y 250 monedas o cobrar una multa de hasta 20% del saldo, con 45% de probabilidad de éxito y 90 minutos de enfriamiento.
- Los resultados usan mensajes variados y cada premio o multa se registra en el ledger de la economía.
- Añade `last_crime_at` a SQLite y MySQL/MariaDB, con actualización automática de esquemas existentes y soporte en el migrador de economía.
