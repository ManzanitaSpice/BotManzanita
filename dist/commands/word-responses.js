import { escapeMarkdown, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { ADMIN_OWNER_ID } from './admin.js';
import { getSavedWordResponses, removeWordResponse, saveWordResponse } from '../services/word-responses.js';
export const wordResponsesCommand = {
    data: new SlashCommandBuilder()
        .setName('palabra')
        .setDescription('Configura respuestas automáticas por palabra · solo ManzanitaJuice')
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((subcommand) => subcommand.setName('guardar').setDescription('Guarda o cambia la respuesta de una palabra')
        .addStringOption((option) => option.setName('palabra').setDescription('Palabra exacta que activará la respuesta').setRequired(true).setMinLength(1).setMaxLength(64))
        .addStringOption((option) => option.setName('respuesta').setDescription('Texto que publicará el bot').setRequired(true).setMinLength(1).setMaxLength(1_800)))
        .addSubcommand((subcommand) => subcommand.setName('quitar').setDescription('Elimina una respuesta guardada')
        .addStringOption((option) => option.setName('palabra').setDescription('Palabra que quieres eliminar').setRequired(true).setMinLength(1).setMaxLength(64)))
        .addSubcommand((subcommand) => subcommand.setName('lista').setDescription('Muestra las palabras guardadas en este servidor')),
    async execute(interaction) {
        if (interaction.user.id !== ADMIN_OWNER_ID) {
            await interaction.reply({ content: 'Solo ManzanitaJuice puede administrar las respuestas por palabra.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (!interaction.guildId) {
            await interaction.reply({ content: 'Este comando solo funciona dentro de un servidor.', flags: MessageFlags.Ephemeral });
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'guardar') {
            const word = interaction.options.getString('palabra', true);
            const response = interaction.options.getString('respuesta', true);
            const result = await saveWordResponse(interaction.guildId, word, response);
            const content = result === 'saved'
                ? `✅ Guardé **${word.trim()}**. Responderé cuando aparezca como palabra completa, sin distinguir mayúsculas. Solo envío una respuesta por mensaje.`
                : result === 'invalid_word'
                    ? 'La palabra debe ser un solo término de 1–64 caracteres: letras, números, guion bajo o guiones entre palabras.'
                    : result === 'invalid_response'
                        ? 'La respuesta no puede estar vacía ni superar 1,800 caracteres.'
                        : 'Este servidor ya tiene 100 palabras guardadas. Quita una para poder añadir otra.';
            await interaction.editReply({ content, allowedMentions: { parse: [] } });
            return;
        }
        if (subcommand === 'quitar') {
            const word = interaction.options.getString('palabra', true);
            const removed = await removeWordResponse(interaction.guildId, word);
            await interaction.editReply(removed
                ? `🗑️ Eliminé la respuesta de **${word.trim()}**.`
                : 'No encontré esa palabra guardada (o no es una palabra válida).');
            return;
        }
        const rules = await getSavedWordResponses(interaction.guildId);
        if (!rules.length) {
            await interaction.editReply('Todavía no hay respuestas guardadas. Usa `/palabra guardar` para crear una.');
            return;
        }
        const entries = rules.slice(0, 15).map((rule) => {
            const response = escapeMarkdown(rule.response.replace(/\s+/g, ' ').slice(0, 70));
            return `• **${rule.triggerWord}** → ${response}${rule.response.length > 70 ? '…' : ''}`;
        });
        await interaction.editReply({
            content: `📝 **Respuestas guardadas (${rules.length})**\n${entries.join('\n')}${rules.length > entries.length ? `\n… y ${rules.length - entries.length} más.` : ''}`,
            allowedMentions: { parse: [] },
        });
    },
};
