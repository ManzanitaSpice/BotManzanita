import { ChannelType, EmbedBuilder, escapeMarkdown, MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { countStreamNotifications, listStreamNotifications, removeStreamNotification, saveStreamNotification, } from '../storage/stream-notification-store.js';
import { missingStreamPlatformVariables } from '../services/stream-notifications.js';
const MAX_NOTIFICATIONS_PER_GUILD = 50;
const roleMentionPattern = /<@&(\d{17,20})>/g;
export const streamsCommand = {
    data: new SlashCommandBuilder()
        .setName('stream')
        .setDescription('Configura avisos cuando un canal de Twitch o Kick inicia directo.')
        .addStringOption((option) => option.setName('cuenta').setDescription('Usuario o enlace de Twitch/Kick; el enlace detecta la plataforma').setMaxLength(200))
        .addStringOption((option) => option.setName('plataforma').setDescription('Opcional si escribes el enlace; si solo pones usuario revisa ambas')
        .addChoices({ name: 'Twitch', value: 'twitch' }, { name: 'Kick', value: 'kick' }))
        .addChannelOption((option) => option.setName('canal').setDescription('Canal de Discord donde se publicará el aviso')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption((option) => option.setName('mensaje').setDescription('Texto del aviso; el enlace se agrega automáticamente').setMaxLength(1_600))
        .addRoleOption((option) => option.setName('rol').setDescription('Rol del servidor que quieres mencionar cuando inicie el stream'))
        .addStringOption((option) => option.setName('accion').setDescription('Administrar tus avisos')
        .addChoices({ name: 'Listar avisos', value: 'lista' }, { name: 'Quitar aviso', value: 'quitar' })),
    async execute(interaction) {
        const guildId = interaction.guildId;
        const guild = interaction.guild;
        if (!guildId || !guild) {
            await interaction.reply({ content: 'Este comando solo funciona dentro de un servidor.', flags: MessageFlags.Ephemeral });
            return;
        }
        const action = interaction.options.getString('accion');
        const rawAccount = interaction.options.getString('cuenta')?.trim();
        const selectedPlatform = interaction.options.getString('plataforma');
        if (action === 'lista') {
            await showNotificationList(interaction, guildId);
            return;
        }
        if (!action && !rawAccount && !selectedPlatform && !interaction.options.getChannel('canal')
            && !interaction.options.getString('mensaje') && !interaction.options.getRole('rol')) {
            await showConfigurationPanel(interaction, guildId);
            return;
        }
        if (action === 'quitar') {
            if (!rawAccount) {
                await showConfigurationPanel(interaction, guildId, 'Indica la cuenta que quieres quitar.');
                return;
            }
            const account = parseStreamAccount(rawAccount, selectedPlatform);
            if (!account) {
                await interaction.reply({ content: 'No reconozco esa cuenta o el enlace no corresponde con la plataforma elegida.', flags: MessageFlags.Ephemeral });
                return;
            }
            const targets = listStreamNotifications(guildId).filter((entry) => entry.username === account.username && account.platforms.includes(entry.platform));
            if (!targets.length) {
                await interaction.reply({ content: 'No encontré ese aviso en este servidor.', flags: MessageFlags.Ephemeral });
                return;
            }
            const mayManageOthers = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) ?? false;
            if (targets.some((entry) => entry.ownerId !== interaction.user.id) && !mayManageOthers) {
                await interaction.reply({ content: 'Solo quien configuró esos avisos o alguien con Gestionar servidor puede quitarlos.', flags: MessageFlags.Ephemeral });
                return;
            }
            for (const entry of targets)
                removeStreamNotification(guildId, entry.platform, entry.username);
            await interaction.reply({
                content: `🗑️ Quité el aviso de **${escapeMarkdown(account.username)}** en ${targets.map((entry) => entry.platform).join(' y ')}.`,
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] },
            });
            return;
        }
        const channel = interaction.options.getChannel('canal');
        const rawMessage = interaction.options.getString('mensaje')?.trim() ?? '';
        if (!rawAccount || !channel || !rawMessage) {
            const missing = [
                ...(!rawAccount ? ['la cuenta o enlace'] : []),
                ...(!channel ? ['el canal de Discord'] : []),
                ...(!rawMessage ? ['el mensaje'] : []),
            ];
            await showConfigurationPanel(interaction, guildId, `Para guardar un aviso faltan ${missing.join(', ')}.`);
            return;
        }
        if (/@everyone|@here/i.test(rawMessage)) {
            await interaction.reply({ content: 'Usa el campo **rol** para mencionar un rol del servidor. No se permite @everyone ni @here.', flags: MessageFlags.Ephemeral });
            return;
        }
        const account = parseStreamAccount(rawAccount, selectedPlatform);
        if (!account) {
            await interaction.reply({ content: 'No reconozco esa cuenta. Usa un enlace `twitch.tv/usuario` o `kick.com/usuario`, o indica la plataforma junto al usuario.', flags: MessageFlags.Ephemeral });
            return;
        }
        const selectedRole = interaction.options.getRole('rol');
        const configuredMessage = selectedRole && ![...rawMessage.matchAll(roleMentionPattern)].some((match) => match[1] === selectedRole.id)
            ? `${rawMessage}\n<@&${selectedRole.id}>`
            : rawMessage;
        const mentionedRoleIds = [...configuredMessage.matchAll(roleMentionPattern)]
            .map((match) => match[1]).filter((roleId) => Boolean(roleId));
        const uniqueRoleIds = [...new Set(mentionedRoleIds)];
        const roles = uniqueRoleIds.map((roleId) => guild.roles.cache.get(roleId)).filter((role) => Boolean(role));
        if (roles.length !== uniqueRoleIds.length) {
            await interaction.reply({ content: 'Solo puedes mencionar roles de este servidor. Elige el rol en el campo **rol**.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (roles.some((role) => role && !role.mentionable)) {
            await interaction.reply({ content: 'Para mencionar ese rol, activa **Mencionable** en sus ajustes de servidor.', flags: MessageFlags.Ephemeral });
            return;
        }
        const current = listStreamNotifications(guildId);
        const existing = account.platforms.map((platform) => current.find((entry) => entry.platform === platform && entry.username === account.username));
        const mayManageOthers = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) ?? false;
        if (existing.some((entry) => entry && entry.ownerId !== interaction.user.id) && !mayManageOthers) {
            await interaction.reply({ content: 'Ese canal ya tiene un aviso configurado por otra persona. Pídele que lo cambie o que lo quite.', flags: MessageFlags.Ephemeral });
            return;
        }
        const newEntries = existing.filter((entry) => !entry).length;
        if (countStreamNotifications(guildId) + newEntries > MAX_NOTIFICATIONS_PER_GUILD) {
            await interaction.reply({ content: `Este servidor alcanzó el máximo de ${MAX_NOTIFICATIONS_PER_GUILD} avisos. Quita uno antes de agregar otro.`, flags: MessageFlags.Ephemeral });
            return;
        }
        for (const platform of account.platforms) {
            saveStreamNotification({
                guildId,
                platform,
                username: account.username,
                ownerId: interaction.user.id,
                channelId: channel.id,
                message: configuredMessage,
            });
        }
        const missingVariables = [...new Set(account.platforms.flatMap(missingStreamPlatformVariables))];
        const apiSetup = missingVariables.length
            ? `\n⚠️ Falta configurar ${missingVariables.map((variable) => `\`${variable}\``).join(' y ')} en el host para activar toda la detección.`
            : '';
        await interaction.reply({
            content: `✅ Guardé el aviso de **${escapeMarkdown(account.username)}** en ${account.platforms.join(' y ')}. Publicaré tu mensaje en <#${channel.id}> junto con el enlace al iniciar un nuevo directo.${apiSetup}`,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        });
    },
};
async function showConfigurationPanel(interaction, guildId, notice) {
    const notifications = listStreamNotifications(guildId);
    const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle('📡 Configuración de avisos de directos')
        .setDescription([
        'Completa los campos de `/stream` para guardar un aviso. El bot agrega el enlace automáticamente al detectar que el canal inicia stream.',
        '',
        '**Ejemplo:** `/stream cuenta: twitch.tv/mi_canal canal: #directos mensaje: ¡Ya estamos en vivo! rol: @Avisos`',
        'También puedes pegar un enlace de Kick. Si solo escribes un usuario, se revisan Twitch y Kick; usa **plataforma** para elegir solo una.',
        'El rol es opcional y debe tener activado **Mencionable**. `@everyone` y `@here` no se envían.',
    ].join('\n'))
        .addFields({
        name: 'Administrar',
        value: '`/stream accion: lista` muestra tus avisos.\n`/stream accion: quitar cuenta: usuario` elimina los avisos de esa cuenta.',
    }, {
        name: 'Estado',
        value: `Este servidor tiene **${notifications.length}/${MAX_NOTIFICATIONS_PER_GUILD}** avisos. La detección consulta las plataformas cada minuto.`,
    });
    if (notice)
        embed.addFields({ name: 'Falta completar', value: notice });
    const registered = notifications.slice(0, 8).map((entry) => `• **${entry.platform} / ${escapeMarkdown(entry.username)}** → <#${entry.channelId}>`);
    if (registered.length) {
        embed.addFields({
            name: 'Avisos actuales',
            value: `${registered.join('\n')}${notifications.length > registered.length ? `\n… y ${notifications.length - registered.length} más.` : ''}`,
        });
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}
async function showNotificationList(interaction, guildId) {
    const notifications = listStreamNotifications(guildId);
    if (!notifications.length) {
        await showConfigurationPanel(interaction, guildId, 'Todavía no hay avisos configurados.');
        return;
    }
    const lines = notifications.slice(0, 15).map((entry) => {
        const message = escapeMarkdown(entry.message.replace(/\s+/g, ' ').slice(0, 60));
        return `• **${entry.platform} / ${escapeMarkdown(entry.username)}** → <#${entry.channelId}> · ${message}${entry.message.length > 60 ? '…' : ''}`;
    });
    await interaction.reply({
        content: `📣 **Avisos de directos (${notifications.length})**\n${lines.join('\n')}${notifications.length > lines.length ? `\n… y ${notifications.length - lines.length} más.` : ''}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
    });
}
function parseStreamAccount(value, selectedPlatform) {
    let username = value.trim();
    if (!username)
        return undefined;
    let detectedPlatform;
    const prefix = username.match(/^(twitch|kick):\s*(.+)$/i);
    if (prefix) {
        const prefixPlatform = prefix[1]?.toLowerCase();
        const prefixedUsername = prefix[2];
        if (!prefixPlatform || !prefixedUsername)
            return undefined;
        detectedPlatform = prefixPlatform;
        username = prefixedUsername.trim();
    }
    else if (username.includes('/') || username.includes('.')) {
        try {
            const url = new URL(username.includes('://') ? username : `https://${username}`);
            const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
            detectedPlatform = hostname === 'twitch.tv' ? 'twitch' : hostname === 'kick.com' ? 'kick' : undefined;
            if (!detectedPlatform)
                return undefined;
            username = url.pathname.split('/').filter(Boolean)[0] ?? '';
        }
        catch {
            return undefined;
        }
    }
    if (detectedPlatform && selectedPlatform && detectedPlatform !== selectedPlatform)
        return undefined;
    username = username.replace(/^@/, '').toLowerCase();
    const candidates = selectedPlatform ? [selectedPlatform] : detectedPlatform ? [detectedPlatform] : ['twitch', 'kick'];
    const platforms = candidates.filter((platform) => platform === 'twitch'
        ? /^[a-z0-9_]{1,25}$/.test(username)
        : /^[a-z0-9_-]{1,25}$/.test(username));
    return platforms.length ? { username, platforms } : undefined;
}
