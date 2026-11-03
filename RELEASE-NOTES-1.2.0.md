# Bot Manzanita 1.2.0

- Añade banco personal con billetera y ahorro separados, depósitos y retiros en un panel privado.
- El ahorro produce 0.5% compuesto por cada día completo; al consultar u operar se acredita el rendimiento vencido y cada actualización procesa hasta 30 días.
- Actualiza el inventario a cantidades apilables y agrega un registro transaccional de adquisición, uso y apuestas de artículos.
- Reemplaza la tienda anterior por consumibles funcionales: Cebo premium duplica una pesca y Escudo antirrobo protege durante 24 horas. Las unidades se pueden acumular.
- Añade `/economia usar` y controles de uso desde el panel de inventario.
- Añade `/economia apostar_objeto`: arriesga un consumible en ruleta; rojo/negro paga 2× su precio y verde paga 36×. El artículo se consume también al perder.
- El ranking ahora cuenta billetera y ahorro.
- Extiende automáticamente el esquema SQLite/MySQL y la migración de datos existentes para incluir saldo bancario, protección e inventario apilable.
