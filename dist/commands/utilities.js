import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { randomInt } from 'node:crypto';
const colors = { utility: 0x38bdf8 };
const eightBallAnswers = [
    'Sí, y con bastante confianza.', 'Todo apunta a que sí.', 'Parece que sí, pero no lo grites todavía.',
    'Hoy las probabilidades están de tu lado.', 'Mejor pregunta en un ratito.', 'No puedo prometerlo.',
    'Las señales dicen que no.', 'No cuentes con ello.', 'Definitivamente no.', 'La respuesta está detrás de otra taza de té.',
];
export const utilitiesCommand = {
    data: new SlashCommandBuilder()
        .setName('utilidad')
        .setDescription('Herramientas rápidas para el servidor y tus conversaciones.')
        .addSubcommand((sub) => sub.setName('dado').setDescription('Lanza un dado de 2 a 1,000,000 lados.')
        .addIntegerOption((option) => option.setName('caras').setDescription('Número de caras (por defecto, 100)').setMinValue(2).setMaxValue(1_000_000)))
        .addSubcommand((sub) => sub.setName('moneda').setDescription('Lanza una moneda al aire.'))
        .addSubcommand((sub) => sub.setName('elegir').setDescription('Elige una opción de tu lista separada por comas.')
        .addStringOption((option) => option.setName('opciones').setDescription('Ejemplo: pizza, tacos, sushi').setRequired(true).setMaxLength(500)))
        .addSubcommand((sub) => sub.setName('bola').setDescription('Consulta a la bola de cristal.')
        .addStringOption((option) => option.setName('pregunta').setDescription('Pregunta de sí o no').setRequired(true).setMaxLength(250)))
        .addSubcommand((sub) => sub.setName('avatar').setDescription('Muestra el avatar de una persona.')
        .addUserOption((option) => option.setName('persona').setDescription('Persona (por defecto, tú)')))
        .addSubcommand((sub) => sub.setName('usuario').setDescription('Muestra información básica de una persona.')
        .addUserOption((option) => option.setName('persona').setDescription('Persona (por defecto, tú)')))
        .addSubcommand((sub) => sub.setName('servidor').setDescription('Muestra información de este servidor.'))
        .addSubcommand((sub) => sub.setName('ping').setDescription('Mide la latencia de Manzanita y Discord.')),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'dado') {
            const sides = interaction.options.getInteger('caras') ?? 100;
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(colors.utility).setTitle('🎲 Dado').setDescription(`Salió **${randomInt(1, sides + 1)}** de **${sides}**.`)] });
            return;
        }
        if (subcommand === 'moneda') {
            const side = randomInt(0, 2) === 0 ? 'Águila' : 'Sol';
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(colors.utility).setTitle('🪙 Volado').setDescription(`Cayó **${side}**.`)] });
            return;
        }
        if (subcommand === 'elegir') {
            const options = interaction.options.getString('opciones', true).split(',').map((item) => item.trim()).filter(Boolean).slice(0, 25);
            if (options.length < 2) {
                await interaction.reply({ content: 'Escribe al menos dos opciones separadas por coma.', ephemeral: true });
                return;
            }
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(colors.utility).setTitle('🧭 Decisión tomada').setDescription(`Entre ${options.length} opciones, elijo **${options[randomInt(options.length)]}**.`)] });
            return;
        }
        if (subcommand === 'bola') {
            const question = interaction.options.getString('pregunta', true);
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(colors.utility).setTitle('🔮 Bola de cristal').addFields({ name: question, value: eightBallAnswers[randomInt(eightBallAnswers.length)] })] });
            return;
        }
        if (subcommand === 'avatar') {
            const user = interaction.options.getUser('persona') ?? interaction.user;
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(colors.utility).setTitle(`🖼️ Avatar de ${user.username}`).setImage(user.displayAvatarURL({ size: 1024 }))] });
            return;
        }
        if (subcommand === 'usuario') {
            const user = interaction.options.getUser('persona') ?? interaction.user;
            const member = interaction.guild?.members.cache.get(user.id);
            const fields = [
                { name: 'Cuenta', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
                ...(member?.joinedTimestamp ? [{ name: 'Se unió', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`, inline: true }] : []),
                { name: 'ID', value: `\`${user.id}\``, inline: true },
            ];
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(colors.utility).setAuthor({ name: user.username, iconURL: user.displayAvatarURL() }).setTitle('👤 Información de usuario').addFields(fields)] });
            return;
        }
        if (subcommand === 'servidor') {
            const guild = interaction.guild;
            if (!guild) {
                await interaction.reply({ content: 'Este comando necesita ejecutarse dentro de un servidor.', ephemeral: true });
                return;
            }
            const counts = guild.channels.cache;
            const text = counts.filter((channel) => channel.isTextBased() && !channel.isDMBased()).size;
            const voice = counts.filter((channel) => channel.isVoiceBased()).size;
            const embed = new EmbedBuilder().setColor(colors.utility).setTitle(`🏠 ${guild.name}`)
                .setThumbnail(guild.iconURL({ size: 256 }))
                .addFields({ name: 'Miembros', value: `${guild.memberCount.toLocaleString('es-MX')}`, inline: true }, { name: 'Canales', value: `${text} texto · ${voice} voz`, inline: true }, { name: 'Creado', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true });
            await interaction.reply({ embeds: [embed] });
            return;
        }
        const started = Date.now();
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(colors.utility).setTitle('🏓 Pong').setDescription(`Gateway: **${Math.max(0, Math.round(interaction.client.ws.ping))} ms** · respuesta: **${Date.now() - started} ms**`)] });
    },
};
