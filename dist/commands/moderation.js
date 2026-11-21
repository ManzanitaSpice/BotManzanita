import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
const discordIdPattern = /^\d{17,20}$/;
const discordMentionPattern = /^<@!?(\d{17,20})>$/;
export function isDiscordUserId(value) {
    return discordIdPattern.test(value);
}
export async function resolveBanTarget(guild, input) {
    const query = input.trim();
    if (!query)
        return { ok: false, reason: 'empty' };
    const mention = query.match(discordMentionPattern)?.[1];
    if (mention)
        return { ok: true, id: mention };
    if (isDiscordUserId(query))
        return { ok: true, id: query };
    try {
        const members = [...(await guild.members.search({ query, limit: 25 })).values()];
        const normalized = query.toLocaleLowerCase();
        const exact = members.filter((member) => [member.displayName, member.user.username, member.user.globalName ?? '']
            .some((name) => name.toLocaleLowerCase() === normalized));
        if (exact.length === 1)
            return { ok: true, id: exact[0].id };
        if (exact.length > 1 || members.length > 1)
            return { ok: false, reason: 'ambiguous' };
        if (members.length === 1)
            return { ok: true, id: members[0].id };
        return { ok: false, reason: 'not_found' };
    }
    catch {
        return { ok: false, reason: 'search_failed' };
    }
}
function discordErrorCode(error) {
    return typeof error === 'object' && error !== null && 'code' in error
        ? error.code
        : undefined;
}
export function banFailureMessage(reason) {
    switch (reason) {
        case 'invalid_id': return 'Selecciona a la persona en las sugerencias o escribe un ID de Discord válido.';
        case 'owner': return 'No se puede banear a la persona propietaria del servidor.';
        case 'self': return 'No puedes banearte a ti mismo.';
        case 'bot_unavailable': return 'No pude comprobar los permisos de Manzanita en este servidor.';
        case 'bot_permission': return 'Manzanita necesita el permiso **Banear miembros** para ejecutar el ban.';
        case 'bot': return 'No puedo banear a Manzanita.';
        case 'member_lookup': return 'No pude validar a esa persona en el servidor; no se aplicó el ban.';
        case 'role_hierarchy': return 'El rol más alto de esa persona debe estar por debajo del rol más alto de Manzanita.';
        case 'ban_rejected': return 'Discord rechazó el ban. Revisa los permisos y la jerarquía de roles de Manzanita.';
        case 'ban_failed': return 'No se pudo completar el ban. Comprueba que el ID sea correcto y vuelve a intentarlo.';
    }
}
export async function banGuildUser(guild, actorId, targetId, reason) {
    if (!isDiscordUserId(targetId))
        return { ok: false, reason: 'invalid_id' };
    if (targetId === guild.ownerId)
        return { ok: false, reason: 'owner' };
    if (targetId === actorId)
        return { ok: false, reason: 'self' };
    let botMember;
    try {
        botMember = await guild.members.fetchMe();
    }
    catch {
        return { ok: false, reason: 'bot_unavailable' };
    }
    if (!botMember.permissions.has(PermissionFlagsBits.BanMembers))
        return { ok: false, reason: 'bot_permission' };
    if (targetId === botMember.id)
        return { ok: false, reason: 'bot' };
    let targetMember;
    try {
        targetMember = await guild.members.fetch({ user: targetId, force: true });
    }
    catch (error) {
        if (discordErrorCode(error) !== 10007)
            return { ok: false, reason: 'member_lookup' };
        targetMember = null;
    }
    if (targetMember && targetMember.roles.highest.position >= botMember.roles.highest.position) {
        return { ok: false, reason: 'role_hierarchy' };
    }
    try {
        await guild.members.ban(targetId, reason?.trim() ? { reason: reason.trim() } : {});
        return { ok: true };
    }
    catch (error) {
        return discordErrorCode(error) === 50013
            ? { ok: false, reason: 'ban_rejected' }
            : { ok: false, reason: 'ban_failed' };
    }
}
export async function banAutocomplete(guild, query) {
    const search = query.trim();
    if (!search)
        return [];
    if (isDiscordUserId(search))
        return [{ name: `ID de Discord: ${search}`, value: search }];
    try {
        const members = await guild.members.search({ query: search, limit: 25 });
        return [...members.values()].slice(0, 25).map((member) => ({
            name: `${member.displayName} (@${member.user.username})`.slice(0, 100),
            value: member.id,
        }));
    }
    catch {
        return [];
    }
}
export const banCommand = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Banea a una persona por su nick o ID de Discord.')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption((option) => option
        .setName('objetivo')
        .setDescription('Busca por nick o escribe el ID de Discord.')
        .setRequired(true)
        .setAutocomplete(true))
        .addStringOption((option) => option
        .setName('razon')
        .setDescription('Motivo que aparecerá en el registro de auditoría.')
        .setMaxLength(512)),
    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: 'Este comando solo funciona dentro de un servidor.', flags: MessageFlags.Ephemeral });
            return;
        }
        const targetId = interaction.options.getString('objetivo', true).trim();
        if (!isDiscordUserId(targetId)) {
            await interaction.reply({ content: 'Selecciona a la persona en las sugerencias o escribe un ID de Discord válido.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
            await interaction.reply({ content: 'Necesitas el permiso **Banear miembros** para usar este comando.', flags: MessageFlags.Ephemeral });
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const reason = interaction.options.getString('razon')?.trim();
        const result = await banGuildUser(guild, interaction.user.id, targetId, reason ?? undefined);
        if (!result.ok) {
            await interaction.editReply(banFailureMessage(result.reason));
            return;
        }
        await interaction.editReply({
            content: `🚫 Se baneó la cuenta con ID \`${targetId}\`${reason ? ` · Motivo: ${reason}` : ''}.`,
            allowedMentions: { parse: [] },
        });
    },
};
