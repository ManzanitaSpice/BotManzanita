import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { businessCooldownSeconds, businessJobs, formatCooldown, getBalance, getBusinessOverviewForUser, getJobRoster, getPersonalLoanOverview } from '../services/economy.js';
import { getProductPriceQuote } from '../services/product-market.js';
import { renderBusinessBackdrop } from './business-art.js';

const money = new Intl.NumberFormat('es-MX');
const categorySize = businessJobs.length * 4 + 16;
const quoteAsset = (id: string, basePrice: number) => getProductPriceQuote({ kind: 'economy', id, category: 'economy:business_assets', basePrice, categorySize });

export async function businessPanel(guildId: string, userId: string, selectedJobId?: string, notice = '') {
  const [overview, roster, balance, loanOverview] = await Promise.all([getBusinessOverviewForUser(guildId, userId), getJobRoster(guildId, userId), getBalance(guildId, userId), getPersonalLoanOverview(guildId, userId)]);
  const bankruptLoan = loanOverview.loan?.bankruptAt !== null && loanOverview.loan ? loanOverview.loan : null;
  const activeJobs = roster.jobs.filter((entry) => entry.active);
  const chosen = activeJobs.find((entry) => entry.job.id === selectedJobId)
    ?? activeJobs.find((entry) => entry.job.id === roster.primaryJobId) ?? activeJobs[0];
  const config = overview ? businessJobs.find((entry) => entry.jobId === overview.job.id) : undefined;
  const selectedConfig = chosen ? businessJobs.find((entry) => entry.jobId === chosen.job.id) : undefined;
  const isOwner = overview?.ownerId === userId;
  const artJobId = overview?.job.id ?? chosen?.job.id;
  const artStatus = overview?.status ?? 'land';
  const artLevel = overview?.level ?? 1;
  const heading = !overview ? '# 🏡 TERRENO'
    : overview.status === 'land' ? '# 🏡 TERRENO · ' + overview.job.emoji + ' ' + overview.name
      : overview.status === 'construction' ? '# 🏗️ NEGOCIO EN CONSTRUCCIÓN · ' + overview.name
        : overview.status === 'closed' ? '# 🚫 NEGOCIO CLAUSURADO · ' + overview.name
          : '# ' + overview.job.emoji + ' NEGOCIO · ' + overview.name;
  const container = new ContainerBuilder().setAccentColor(overview?.status === 'active' ? 0x22c55e : overview?.status === 'closed' ? 0xef4444 : 0x75a8d8)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      heading + (overview && !isOwner ? ' · empleo' : '')
      + '\nPropiedad conectada a tu oficio y a la economía del banco.' + (notice ? '\n\n' + notice : '')))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://business-terrain.png').setDescription('Ilustración de ' + (overview?.name ?? 'tu terreno'))));

  if (!overview && loanOverview.foreclosureNotice && (!loanOverview.loan || loanOverview.loan.createdAt <= loanOverview.foreclosureNotice.foreclosedAt)) {
    const foreclosure = loanOverview.foreclosureNotice;
    const surplusText = foreclosure.cashSurplus
      ? ` El excedente de **${money.format(foreclosure.cashSurplus)} monedas** sí se acreditó a tu billetera.`
      : ' No hubo excedente en efectivo.';
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 🚨 Propiedad ejecutada · <t:${foreclosure.foreclosedAt}:F>\nEl banco aplicó **${money.format(foreclosure.appliedToDebt)} monedas** del terreno o negocio a tu préstamo; ese importe no se te entregó en efectivo.${surplusText}${bankruptLoan ? `\nTu deuda pendiente es **${money.format(bankruptLoan.balanceDue)} monedas**. Sigue trabajando y abonando desde a!prestamos para volver a comprar una propiedad.` : '\nLa deuda quedó liquidada con la garantía.'}`));
  }

  if (overview?.mortgagedAt !== null && overview?.mortgagedAt !== undefined) {
    const foreclosure = overview.foreclosureAt ? `<t:${overview.foreclosureAt}:R>` : 'sin inmueble pendiente';
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(isOwner
      ? `## 🏦 Propiedad hipotecada por mora\nValor de liquidación estimado: **${money.format(overview.collateralValue)} monedas** · deuda actual: **${money.format(overview.loanBalanceDue ?? 0)} monedas**. Si no se liquida el préstamo, el banco ejecutará la propiedad ${foreclosure}. Puedes seguir trabajando y cada ingreso del trabajo se abona primero a la deuda. Al pagarla por completo, la hipoteca se libera.`
      : `## 🏦 Propiedad hipotecada\nEl negocio sigue operando durante el plazo de regularización. Los ingresos del trabajo del dueño se aplican primero a su préstamo; fecha límite de la propiedad: ${foreclosure}.`));
  }

  if (!overview && !chosen) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Antes de comprar\nElige un oficio activo con a!jobs. El terreno se compra para ese oficio y solo él puede operar el negocio.'))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('biz:jobs').setLabel('Elegir oficio').setEmoji('🧰').setStyle(ButtonStyle.Primary),
      ));
  } else if (!overview && chosen && selectedConfig) {
    const quote = await quoteAsset('business_land_' + chosen.job.id, selectedConfig.landPrice);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      bankruptLoan
        ? `## Comprar terreno\nNo puedes adquirir terrenos mientras sigas en bancarrota. El saldo pendiente es **${money.format(bankruptLoan.balanceDue)} monedas**; trabaja para que se descuente automáticamente y liquídalo en a!prestamos.`
        : '## Comprar terreno\nOficio: **' + chosen.job.emoji + ' ' + chosen.job.name + ' · nivel ' + chosen.level + '**.\n\nEl terreno cuesta **' + money.format(quote.price)
          + ' monedas** a precio dinámico. La construcción requiere otra inversión y tarda **6 horas**. Solo puedes tener un negocio.'));
    if (activeJobs.length > 1) container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId('biz:job:' + userId).setPlaceholder('Oficio del negocio · ' + chosen.job.name).addOptions(
        activeJobs.map((entry) => ({ label: entry.job.name, value: entry.job.id, emoji: entry.job.emoji, description: 'Nivel ' + entry.level + ' · ' + (businessJobs.find((b) => b.jobId === entry.job.id)?.name ?? 'Negocio'), default: entry.job.id === chosen.job.id })),
      ),
    ));
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('biz:buy:' + userId + ':' + chosen.job.id).setLabel('Comprar terreno · ' + money.format(quote.price)).setEmoji('🏡').setStyle(ButtonStyle.Success).setDisabled(balance < quote.price || !!bankruptLoan),
    ));
  } else if (overview?.status === 'land' && config) {
    const quote = await quoteAsset('business_build_' + overview.job.id, config.buildPrice);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## Terreno listo para construir\nLa obra cuesta **' + money.format(quote.price) + ' monedas** y tarda 6 horas. Al abrir, a!work pagará desde el negocio con un turno inicial de 3 horas.'));
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('biz:build:' + userId).setLabel('Iniciar construcción · ' + money.format(quote.price)).setEmoji('🔨').setStyle(ButtonStyle.Success).setDisabled(balance < quote.price || overview.mortgagedAt !== null),
      new ButtonBuilder().setCustomId('biz:refresh:' + userId).setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ));
  } else if (overview?.status === 'construction') {
    const left = Math.max(0, (overview.constructionCompleteAt ?? 0) - Math.floor(Date.now() / 1000));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🏗️ En construcción\n' + overview.name + ' abrirá en aproximadamente **' + formatCooldown(left) + '**. El panel la activará al terminar el plazo.'))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('biz:refresh:' + userId).setLabel('Actualizar obra').setEmoji('🔄').setStyle(ButtonStyle.Primary),
      ));
  } else if (overview?.status === 'closed' && config) {
    const closureEvent = overview.events.find((event) => event.type === 'closure');
    const pestEvent = overview.events.find((event) => event.type === 'pest');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## 🚫 Negocio clausurado\nNo hubo actividad durante 14 días. La multa para reabrir es de **' + money.format(closureEvent?.amount ?? 0) + ' monedas**.'
      + (pestEvent ? '\n🐀 También hay una plaga pendiente de **' + money.format(pestEvent.amount) + ' monedas**.' : '')
      + (isOwner ? '\nPaga cada evento para recuperar la operación. Los cobros se hacen desde tu billetera.' : '\nEl dueño debe pagar la multa y resolver los incidentes desde su panel.')));
    if (isOwner) {
      const eventButtons: ButtonBuilder[] = [];
      if (closureEvent) eventButtons.push(new ButtonBuilder().setCustomId('biz:event:' + userId + ':closure').setLabel('Pagar multa · ' + money.format(closureEvent.amount)).setEmoji('⚖️').setStyle(ButtonStyle.Danger).setDisabled(balance < closureEvent.amount));
      if (pestEvent) eventButtons.push(new ButtonBuilder().setCustomId('biz:event:' + userId + ':pest').setLabel('Exterminar plaga · ' + money.format(pestEvent.amount)).setEmoji('🐀').setStyle(ButtonStyle.Primary).setDisabled(balance < pestEvent.amount));
      if (eventButtons.length) container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(eventButtons));
    }
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('biz:refresh:' + userId).setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ));
  } else if (overview?.status === 'active' && config) {
    const feeText = config.utilityNames.map((name, index) => name + ': **' + money.format(Math.ceil(config.utilityCosts[index]! * (1 + (overview.level - 1) * 0.025))) + '**').join(' · ');
    const actorLastWorkAt = isOwner ? overview.lastWorkAt : overview.employees.find((employee) => employee.userId === userId)?.lastWorkAt ?? null;
    const remaining = Math.max(0, (actorLastWorkAt ?? 0) + businessCooldownSeconds(overview.level) - Math.floor(Date.now() / 1000));
    const limit = overview.staffLimit;
    const employeeText = overview.employees.length
      ? overview.employees.map((employee) => employee.kind === 'npc'
        ? '🤖 ' + employee.name + ' · nómina: 75% del ingreso base por turno del dueño'
        : (employee.status === 'pending' ? '📨 Invitación pendiente para ' : '👤 Empleado ') + '<@' + employee.userId + '>'
          + (employee.status === 'active' ? ' · cooldown: ' + (Math.max(0, (employee.lastWorkAt ?? 0) + businessCooldownSeconds(overview.level) - Math.floor(Date.now() / 1000)) ? formatCooldown(Math.max(0, (employee.lastWorkAt ?? 0) + businessCooldownSeconds(overview.level) - Math.floor(Date.now() / 1000))) : 'disponible') : '')).join('\n')
      : 'Sin personal contratado.';
    const upgradeBase = Math.round(650 + (overview.level - 1) * 430 + (overview.level - 1) ** 2 * 85);
    const upgradeQuote = isOwner && overview.level < 10 ? await quoteAsset('business_upgrade_' + overview.job.id + '_' + (overview.level + 1), upgradeBase) : undefined;
    const npcQuote = isOwner ? await quoteAsset('business_npc_' + overview.job.id + '_' + overview.level, 450 + overview.level * 180) : undefined;
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '## Operación · nivel ' + overview.level + '/10\n**Ingresos brutos · 30 días:** ' + money.format(overview.income30d)
        + ' monedas\n**Servicios pagados · 30 días:** ' + money.format(overview.expenses30d) + ' · **nóminas:** ' + money.format(overview.wages30d)
        + '\n**Resultado neto registrado:** ' + money.format(overview.profit30d) + ' monedas\n**Deuda de servicios:** ' + money.format(overview.debt)
        + '\n**Próximo a!work:** ' + (remaining ? formatCooldown(remaining) : 'disponible')
        + '\n**Gastos por turno:** ' + feeText + '\n\n## Personal · ' + overview.employees.filter((employee) => employee.status !== 'pending').length + '/' + limit
        + ' · recomendado: ' + overview.recommendedStaff + '\n' + employeeText
        + '\n\nEl nivel recomienda ' + overview.recommendedStaff + ' empleado(s). Superar esa dotación reduce rápidamente las ventas: el beneficio del dueño puede llegar a cero. Si las ventas no cubren la nómina completa, el turno no se realiza y no se descuenta dinero personal.'
        + (overview.events.some((event) => event.type === 'pest') ? '\n\n🐀 Hay una plaga activa; el negocio no puede trabajar hasta pagar el exterminio.' : '')));
    if (isOwner) {
      container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('biz:upgrade:' + userId).setLabel(overview.level >= 10 ? 'Nivel máximo' : 'Mejorar · ' + money.format(upgradeQuote?.price ?? upgradeBase)).setEmoji('⬆️').setStyle(ButtonStyle.Primary).setDisabled(overview.level >= 10 || balance < (upgradeQuote?.price ?? upgradeBase) || overview.mortgagedAt !== null),
        new ButtonBuilder().setCustomId('biz:npc:' + userId).setLabel('Contratar NPC · ' + money.format(npcQuote?.price ?? 0)).setEmoji('🤖').setStyle(ButtonStyle.Success).setDisabled(overview.employees.length >= limit || balance < (npcQuote?.price ?? 0) || overview.mortgagedAt !== null),
        new ButtonBuilder().setCustomId('biz:debt:' + userId).setLabel(overview.debt ? 'Pagar deuda' : 'Sin deuda').setEmoji('🧾').setStyle(ButtonStyle.Secondary).setDisabled(overview.debt <= 0 || balance <= 0),
        new ButtonBuilder().setCustomId('biz:fire-npc:' + userId).setLabel('Retirar NPC').setEmoji('👋').setStyle(ButtonStyle.Secondary).setDisabled(!overview.employees.some((employee) => employee.kind === 'npc' && employee.status === 'active')),
        new ButtonBuilder().setCustomId('biz:refresh:' + userId).setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      ));
      const pest = overview.events.find((event) => event.type === 'pest');
      if (pest) container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('biz:event:' + userId + ':pest').setLabel('Pagar exterminación · ' + money.format(pest.amount)).setEmoji('🐀').setStyle(ButtonStyle.Danger).setDisabled(balance < pest.amount),
      ));
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Eres empleado de este negocio. Tu salario sale de las ventas del turno, es menor que el pago independiente y se entrega completo si el turno se realiza. El cooldown mostrado es el tuyo.'))
        .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('biz:refresh:' + userId).setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        ));
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(isOwner
      ? 'Cada turno liquida primero las nóminas completas con sus ventas; los tres servicios se pagan con el sobrante y cualquier factura pendiente se acumula como deuda. Los gastos operativos nunca descuentan el saldo personal del dueño. Los eventos y pagos extraordinarios se muestran arriba.'
      : 'Las ventas del turno cubren nómina y servicios antes de entregar el beneficio al dueño. Tu salario reducido se acredita completo y los productos de tu jornada se guardan en tu inventario.'));
  }
  container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('biz:eco:' + userId).setLabel('Volver a economía').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  ));
  const backdrop = new AttachmentBuilder(renderBusinessBackdrop(artJobId, artStatus, artLevel)).setName('business-terrain.png');
  return { components: [container], files: [backdrop], flags: ['IsComponentsV2', 'Ephemeral'] as const };
}

export function businessInvitePanel(ownerId: string, employeeId: string, ownerName: string, jobName: string) {
  const container = new ContainerBuilder().setAccentColor(0x3b82f6)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '# 💼 Invitación de empleo\n<@' + employeeId + '>, ' + ownerName + ' te invita a trabajar como **' + jobName + '** en su negocio. Debes tener ese oficio activo para aceptar.\n\nCada turno paga un salario reducido con las ventas y solo se realiza si cubre la nómina completa. El cooldown es mayor que el trabajo independiente.'))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('biz:accept:' + ownerId + ':' + employeeId).setLabel('Aceptar empleo').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('biz:decline:' + ownerId + ':' + employeeId).setLabel('Rechazar').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
    ));
  return { components: [container], flags: ['IsComponentsV2'] as const };
}

export function businessInviteResultPanel(text: string) {
  return { components: [new ContainerBuilder().setAccentColor(0x3b82f6).addTextDisplayComponents(new TextDisplayBuilder().setContent('# 💼 Contrato de negocio\n' + text))], flags: ['IsComponentsV2'] as const };
}
