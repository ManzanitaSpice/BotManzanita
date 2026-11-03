# Bot Manzanita 1.13.0

## Administración privada

- Añadido `/admin`, bloqueado por defecto y protegido en runtime por el ID de propietario `931978822323159111`.
- Ajustar monedas de billetera, saldo bancario y gemas premium; cada cambio muestra su ID de ledger.
- Revertir una sola vez movimientos de moneda hechos mediante `/admin`, comprobando que la cuenta conserve fondos suficientes.
- Otorgar una mascota concreta del bestiario, retirarla, curarla, restaurar energía, dar XP, ajustar atributos y cambiar su nombre.
- Añadir o quitar artículos RPG, reiniciar cooldowns, activar protección contra robos, inspeccionar cuentas y consultar el historial.
- Las acciones se registran en `admin_audit_log` en SQLite/MySQL; las tablas se crean al iniciar, sin borrar los datos existentes.
- `/admin` solo se muestra al usuario autorizado después de permitirlo por servidor en **Ajustes del servidor → Integraciones → Bot Manzanita → Comandos**.
