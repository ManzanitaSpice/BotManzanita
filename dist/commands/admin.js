import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getSpeciesCatalog, adminEditRpgPet, adminGrantRpgPet, adminRemoveRpgPet, rpgItems } from '../services/rpg.js';
import { addAdminAudit, adjustAdminCurrency, getAdminAudit, grantAdminRpgItem, inspectAdminUser, resetAdminCooldown, rollbackAdminCurrency, setAdminRobberyShield } from '../services/admin.js';
export const ADMIN_OWNER_ID = '931978822323159111';
const currencyNames = { wallet: 'monedas', bank: 'monedas del banco', premium: 'gemas premium' };
export const adminCommand = {
    data: new SlashCommandBuilder().setName('admin').setDescription('Herramientas privadas de administración')
        .setDefaultMemberPermissions('0')
        .addSubcommand((sub) => sub.setName('moneda').setDescription('Agregar o retirar monedas de billetera')
        .addUserOption((option) => option.setName('usuario').setDescription('Cuenta destino').setRequired(true))
        .addIntegerOption((option) => option.setName('cantidad').setDescription('Positivo agrega; negativo retira').setRequired(true).setMinValue(-1_000_000_000).setMaxValue(1_000_000_000)))
        .addSubcommand((sub) => sub.setName('banco').setDescription('Ajustar el ahorro bancario')
        .addUserOption((option) => option.setName('usuario').setDescription('Cuenta destino').setRequired(true))
        .addIntegerOption((option) => option.setName('cantidad').setDescription('Positivo agrega; negativo retira').setRequired(true).setMinValue(-1_000_000_000).setMaxValue(1_000_000_000)))
        .addSubcommand((sub) => sub.setName('premium').setDescription('Agregar o retirar gemas premium')
        .addUserOption((option) => option.setName('usuario').setDescription('Cuenta destino').setRequired(true))
        .addIntegerOption((option) => option.setName('cantidad').setDescription('Positivo agrega; negativo retira').setRequired(true).setMinValue(-1_000_000_000).setMaxValue(1_000_000_000)))
        .addSubcommand((sub) => sub.setName('mascota_dar').setDescription('Otorgar una especie RPG específica si no tiene mascota')
        .addUserOption((option) => option.setName('usuario').setDescription('Dueño de la mascota').setRequired(true))
        .addStringOption((option) => option.setName('especie').setDescription('Especie exacta del bestiario').setRequired(true).setAutocomplete(true))
        .addStringOption((option) => option.setName('nombre').setDescription('Nombre opcional').setMaxLength(24)))
        .addSubcommand((sub) => sub.setName('mascota_quitar').setDescription('Retirar la mascota RPG de una persona')
        .addUserOption((option) => option.setName('usuario').setDescription('Dueño de la mascota').setRequired(true)))
        .addSubcommand((sub) => sub.setName('mascota_curar').setDescription('Restaurar por completo salud y energía')
        .addUserOption((option) => option.setName('usuario').setDescription('Dueño de la mascota').setRequired(true)))
        .addSubcommand((sub) => sub.setName('mascota_xp').setDescription('Otorgar experiencia y aplicar subidas de nivel')
        .addUserOption((option) => option.setName('usuario').setDescription('Dueño de la mascota').setRequired(true))
        .addIntegerOption((option) => option.setName('cantidad').setDescription('XP a otorgar, máximo 100000').setRequired(true).setMinValue(1).setMaxValue(100_000)))
        .addSubcommand((sub) => sub.setName('mascota_atributo').setDescription('Ajustar un atributo de la mascota')
        .addUserOption((option) => option.setName('usuario').setDescription('Dueño de la mascota').setRequired(true))
        .addStringOption((option) => option.setName('atributo').setDescription('Atributo que cambiarás').setRequired(true)
        .addChoices({ name: 'Fuerza', value: 'strength' }, { name: 'Defensa', value: 'defense' }, { name: 'Agilidad', value: 'agility' }))
        .addIntegerOption((option) => option.setName('cantidad').setDescription('Aumenta o reduce; máximo ±1000').setRequired(true).setMinValue(-1_000).setMaxValue(1_000)))
        .addSubcommand((sub) => sub.setName('mascota_nombre').setDescription('Cambiar nombre y marcar el uso gratuito como consumido')
        .addUserOption((option) => option.setName('usuario').setDescription('Dueño de la mascota').setRequired(true))
        .addStringOption((option) => option.setName('nombre').setDescription('Nombre nuevo (2 a 24 caracteres)').setRequired(true).setMinLength(2).setMaxLength(24)))
        .addSubcommand((sub) => sub.setName('objeto').setDescription('Agregar o retirar artículos RPG de la mochila')
        .addUserOption((option) => option.setName('usuario').setDescription('Dueño de la mochila').setRequired(true))
        .addStringOption((option) => option.setName('articulo').setDescription('Artículo del catálogo RPG').setRequired(true).setAutocomplete(true))
        .addIntegerOption((option) => option.setName('cantidad').setDescription('Positivo agrega; negativo retira').setRequired(true).setMinValue(-1_000).setMaxValue(1_000)))
        .addSubcommand((sub) => sub.setName('reiniciar_tiempo').setDescription('Quitar un enfriamiento económico o de exploración')
        .addUserOption((option) => option.setName('usuario').setDescription('Cuenta destino').setRequired(true))
        .addStringOption((option) => option.setName('tipo').setDescription('Enfriamiento que se reiniciará').setRequired(true).addChoices({ name: 'Todos', value: 'all' }, { name: 'Diaria', value: 'daily' }, { name: 'Trabajo', value: 'work' }, { name: 'Pesca', value: 'fish' }, { name: 'Robo', value: 'rob' }, { name: 'Crimen', value: 'crime' }, { name: 'Exploración', value: 'explore' })))
        .addSubcommand((sub) => sub.setName('proteger_robo').setDescription('Dar protección temporal contra robos')
        .addUserOption((option) => option.setName('usuario').setDescription('Cuenta protegida').setRequired(true))
        .addIntegerOption((option) => option.setName('horas').setDescription('Duración (1 a 720 horas)').setRequired(true).setMinValue(1).setMaxValue(720)))
        .addSubcommand((sub) => sub.setName('inspeccionar').setDescription('Ver economía, mascota e inventario de una cuenta')
        .addUserOption((option) => option.setName('usuario').setDescription('Cuenta que consultarás').setRequired(true)))
        .addSubcommand((sub) => sub.setName('rollback').setDescription('Deshacer un ajuste de moneda hecho por /admin')
        .addIntegerOption((option) => option.setName('id').setDescription('ID de la entrada mostrado por /admin moneda').setRequired(true).setMinValue(1).setMaxValue(2_147_483_647)))
        .addSubcommand((sub) => sub.setName('historial').setDescription('Ver las últimas acciones administrativas')),
    async execute(interaction) {
        if (interaction.user.id !== ADMIN_OWNER_ID) {
            await interaction.reply({ content: 'Este comando es privado.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (!interaction.guildId) {
            await interaction.reply({ content: 'La administración solo funciona dentro de un servidor.', flags: MessageFlags.Ephemeral });
            return;
        }
        const guildId = interaction.guildId;
        const actorId = interaction.user.id;
        const action = interaction.options.getSubcommand();
        const target = interaction.options.getUser('usuario');
        if (action === 'historial') {
            const entries = await getAdminAudit(guildId, 12);
            const lines = entries.map((entry) => `<t:${entry.createdAt}:R> · #${entry.id} **${entry.action}**${entry.targetId ? ` → <@${entry.targetId}>` : ''} · ${entry.details.slice(0, 140)}`);
            await interaction.reply({ content: `# 🛡️ Historial administrativo\n${lines.length ? lines.join('\n') : 'Todavía no hay acciones registradas.'}`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'rollback') {
            const ledgerId = interaction.options.getInteger('id', true);
            const result = await rollbackAdminCurrency(guildId, ledgerId, actorId);
            const messages = { not_found: 'No existe ese movimiento en este servidor.', not_reversible: 'Solo se pueden revertir ajustes hechos con /admin.', already_reversed: 'Ese ajuste ya fue revertido.', insufficient: 'No hay saldo suficiente para devolverlo sin dejar la cuenta negativa.' };
            if (!result.ok) {
                await interaction.reply({ content: messages[result.reason], flags: MessageFlags.Ephemeral });
                return;
            }
            await addAdminAudit(guildId, actorId, result.targetId, 'rollback', { ledgerId, currency: result.currency, amount: result.amount });
            await interaction.reply({ content: `↩️ Ajuste #${ledgerId} revertido. Cuenta: <@${result.targetId}> · ${result.currency} **${result.balance.toLocaleString('es-MX')}**.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (!target) {
            await interaction.reply({ content: 'Selecciona una cuenta destino.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'moneda' || action === 'banco' || action === 'premium') {
            const currency = action === 'moneda' ? 'wallet' : action === 'banco' ? 'bank' : 'premium';
            const amount = interaction.options.getInteger('cantidad', true);
            const result = await adjustAdminCurrency(guildId, target.id, currency, amount, actorId, interaction.id);
            if (!result.ok) {
                await interaction.reply({ content: result.reason === 'insufficient' ? `${target} no tiene suficientes ${currencyNames[currency]} para retirar eso.` : 'La cantidad debe ser distinta de cero y no superar mil millones.', flags: MessageFlags.Ephemeral });
                return;
            }
            await addAdminAudit(guildId, actorId, target.id, `currency_${currency}`, { amount, balance: result.balance, ledgerId: result.ledgerId });
            await interaction.reply({ content: `✅ ${amount > 0 ? 'Agregaste' : 'Retiraste'} **${Math.abs(amount).toLocaleString('es-MX')} ${currencyNames[currency]}** ${amount > 0 ? 'a' : 'de'} ${target}. Saldo: **${result.balance.toLocaleString('es-MX')}** · Movimiento #${result.ledgerId}.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'mascota_dar') {
            const species = interaction.options.getString('especie', true);
            const name = interaction.options.getString('nombre') ?? '';
            const result = await adminGrantRpgPet(guildId, target.id, species, name);
            if (!result.ok) {
                await interaction.reply({ content: result.reason === 'already_has_pet' ? `${target} ya tiene mascota; usa /admin mascota_quitar antes de reemplazarla.` : result.reason === 'invalid_name' ? 'El nombre debe tener 2–24 caracteres y no incluir menciones ni formato.' : 'Especie desconocida; elige una del bestiario.', flags: MessageFlags.Ephemeral });
                return;
            }
            await addAdminAudit(guildId, actorId, target.id, 'pet_grant', { species, name: result.pet.name, rarity: result.pet.rarity });
            await interaction.reply({ content: `🐾 Otorgaste **${result.pet.name}**, ${result.pet.rarity} ${result.pet.species} (${result.pet.element} · ${result.pet.specialization}) a ${target}.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'mascota_quitar') {
            const removed = await adminRemoveRpgPet(guildId, target.id);
            if (!removed) {
                await interaction.reply({ content: `${target} no tiene una mascota RPG.`, flags: MessageFlags.Ephemeral });
                return;
            }
            await addAdminAudit(guildId, actorId, target.id, 'pet_remove', {});
            await interaction.reply({ content: `🗑️ Retiraste la mascota RPG de ${target}.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'mascota_curar') {
            const result = await adminEditRpgPet(guildId, target.id, { type: 'restore' });
            if (!result.ok) {
                await interaction.reply({ content: `${target} no tiene mascota RPG.`, flags: MessageFlags.Ephemeral });
                return;
            }
            await addAdminAudit(guildId, actorId, target.id, 'pet_restore', {});
            await interaction.reply({ content: `💚 Restauré salud y energía de **${result.pet.name}**.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'mascota_xp') {
            const amount = interaction.options.getInteger('cantidad', true);
            const result = await adminEditRpgPet(guildId, target.id, { type: 'xp', amount });
            if (!result.ok) {
                await interaction.reply({ content: `${target} no tiene mascota RPG.`, flags: MessageFlags.Ephemeral });
                return;
            }
            await addAdminAudit(guildId, actorId, target.id, 'pet_xp', { amount, levels: result.levels ?? 0 });
            await interaction.reply({ content: `📘 **${result.pet.name}** recibió ${amount.toLocaleString('es-MX')} XP${result.levels ? ` y subió ${result.levels} nivel(es)` : ''}. Nivel actual: **${result.pet.level}**.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'mascota_atributo') {
            const stat = interaction.options.getString('atributo', true);
            const amount = interaction.options.getInteger('cantidad', true);
            const result = await adminEditRpgPet(guildId, target.id, { type: 'stat', stat, amount });
            if (!result.ok) {
                await interaction.reply({ content: 'No hay mascota o el cambio dejaría el atributo fuera del rango permitido (1–10000).', flags: MessageFlags.Ephemeral });
                return;
            }
            await addAdminAudit(guildId, actorId, target.id, 'pet_stat', { stat, amount });
            await interaction.reply({ content: `⚖️ **${result.pet.name}** · ${stat}: **${result.pet[stat]}**.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'mascota_nombre') {
            const name = interaction.options.getString('nombre', true);
            const result = await adminEditRpgPet(guildId, target.id, { type: 'rename', name });
            if (!result.ok) {
                await interaction.reply({ content: result.reason === 'no_pet' ? `${target} no tiene mascota.` : 'El nombre debe tener 2–24 caracteres y no incluir menciones ni formato.', flags: MessageFlags.Ephemeral });
                return;
            }
            await addAdminAudit(guildId, actorId, target.id, 'pet_rename', { name: result.pet.name });
            await interaction.reply({ content: `🏷️ La mascota de ${target} ahora se llama **${result.pet.name}**.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'objeto') {
            const itemId = interaction.options.getString('articulo', true);
            const amount = interaction.options.getInteger('cantidad', true);
            if (!rpgItems.some((item) => item.id === itemId)) {
                await interaction.reply({ content: 'Artículo desconocido.', flags: MessageFlags.Ephemeral });
                return;
            }
            const quantity = await grantAdminRpgItem(guildId, target.id, itemId, amount);
            if (quantity === undefined) {
                await interaction.reply({ content: amount < 0 ? 'No hay suficientes unidades para retirar esa cantidad.' : 'La cantidad debe ser distinta de cero.', flags: MessageFlags.Ephemeral });
                return;
            }
            const item = rpgItems.find((candidate) => candidate.id === itemId);
            await addAdminAudit(guildId, actorId, target.id, 'rpg_item', { itemId, amount, quantity });
            await interaction.reply({ content: `🎒 ${amount > 0 ? 'Agregaste' : 'Retiraste'} **${Math.abs(amount)} × ${item.name}** ${amount > 0 ? 'a' : 'de'} ${target}. Cantidad actual: **${quantity}**.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'reiniciar_tiempo') {
            const cooldown = interaction.options.getString('tipo', true);
            await resetAdminCooldown(guildId, target.id, cooldown);
            await addAdminAudit(guildId, actorId, target.id, 'cooldown_reset', { cooldown });
            await interaction.reply({ content: `⏱️ Reinicié el enfriamiento **${cooldown}** de ${target}.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'proteger_robo') {
            const hours = interaction.options.getInteger('horas', true);
            const until = await setAdminRobberyShield(guildId, target.id, hours);
            await addAdminAudit(guildId, actorId, target.id, 'robbery_shield', { hours, until });
            await interaction.reply({ content: `🛡️ ${target} queda protegido contra robos por **${hours} horas** (<t:${until}:R>).`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (action === 'inspeccionar') {
            const result = await inspectAdminUser(guildId, target.id);
            const pet = result.pet;
            const inventory = result.inventory.map((entry) => { const item = rpgItems.find((candidate) => candidate.id === entry.itemId); return `${item?.emoji ?? '📦'} ${item?.name ?? entry.itemId} ×${entry.quantity}`; }).join(' · ') || 'Vacío';
            const petLine = pet ? `**${pet.name}** · ${pet.species} (${pet.rarity}) · Nv. ${pet.level} · ${pet.hp}/${pet.maxHp} PV · ${pet.energy}/${pet.maxEnergy} energía` : 'Sin mascota RPG';
            await interaction.reply({ content: `# 🔎 ${target.username}\n💰 **${result.wallet.toLocaleString('es-MX')}** · 🏦 **${result.bank.toLocaleString('es-MX')}** · 💎 **${result.premium.toLocaleString('es-MX')}**\n🐾 ${petLine}\n🎒 ${inventory}`, flags: MessageFlags.Ephemeral });
            return;
        }
    },
};
export function adminAutocomplete(query, optionName) {
    const normalized = query.toLocaleLowerCase();
    if (optionName === 'especie')
        return getSpeciesCatalog().filter((pet) => `${pet.name} ${pet.rarity} ${pet.element}`.toLocaleLowerCase().includes(normalized)).slice(0, 25)
            .map((pet) => ({ name: `${pet.name} · ${pet.rarity} · ${pet.element}`, value: pet.name }));
    if (optionName === 'articulo')
        return rpgItems.filter((item) => `${item.name} ${item.rarity} ${item.category}`.toLocaleLowerCase().includes(normalized)).slice(0, 25)
            .map((item) => ({ name: `${item.emoji} ${item.name} · ${item.rarity}`, value: item.id }));
    return [];
}
