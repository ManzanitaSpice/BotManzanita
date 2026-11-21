import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type Guild } from 'discord.js';
import type { BotCommand } from '../types.js';

const discordIdPattern = /^\d{17,20}$/;

export async function banAutocomplete(guild: Guild, query: string): Promise<Array<{ name: string; value: string }>> {
  const search = query.trim();
  if (!search) return [];

  if (discordIdPattern.test(search)) return [{ name: `ID de Discord: ${search}`, value: search }];

  try {
    const members = await guild.members.search({ query: search, limit: 25 });
    return [...members.values()].slice(0, 25).map((member) => ({
      name: `${member.displayName} (@${member.user.username})`.slice(0, 100),
      value: member.id,
    }));
  } catch {
    return [];
  }
}

function discordErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
}

export const banCommand: BotCommand = {
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
    if (!discordIdPattern.test(targetId)) {
      await interaction.reply({ content: 'Selecciona a la persona en las sugerencias o escribe un ID de Discord válido.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
      await interaction.reply({ content: 'Necesitas el permiso **Banear miembros** para usar este comando.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let botMember;
    try {
      botMember = await guild.members.fetchMe();
    } catch {
      await interaction.editReply('No pude comprobar los permisos de Manzanita en este servidor.');
      return;
    }

    if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction.editReply('Manzanita necesita el permiso **Banear miembros** para ejecutar el ban.');
      return;
    }

    if (targetId === guild.ownerId) {
      await interaction.editReply('No se puede banear a la persona propietaria del servidor.');
      return;
    }
    if (targetId === interaction.client.user.id) {
      await interaction.editReply('No puedo banear a Manzanita.');
      return;
    }
    if (targetId === interaction.user.id) {
      await interaction.editReply('No puedes banearte a ti mismo.');
      return;
    }

    let targetMember;
    try {
      targetMember = await guild.members.fetch({ user: targetId, force: true });
    } catch (error) {
      if (discordErrorCode(error) !== 10007) {
        await interaction.editReply('No pude validar a esa persona en el servidor; no se aplicó el ban.');
        return;
      }
      targetMember = null;
    }

    if (targetMember && targetMember.roles.highest.position >= botMember.roles.highest.position) {
      await interaction.editReply('El rol más alto de esa persona debe estar por debajo del rol más alto de Manzanita.');
      return;
    }

    const reason = interaction.options.getString('razon')?.trim();
    try {
      await guild.members.ban(targetId, reason ? { reason } : {});
    } catch (error) {
      const message = discordErrorCode(error) === 50013
        ? 'Discord rechazó el ban. Revisa los permisos y la jerarquía de roles de Manzanita.'
        : 'No se pudo completar el ban. Comprueba que el ID sea correcto y vuelve a intentarlo.';
      await interaction.editReply(message);
      return;
    }

    await interaction.editReply({
      content: `🚫 Se baneó la cuenta con ID \`${targetId}\`${reason ? ` · Motivo: ${reason}` : ''}.`,
      allowedMentions: { parse: [] },
    });
  },
};
