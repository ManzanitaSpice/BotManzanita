import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, StringSelectMenuBuilder, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';
import type { User } from 'discord.js';
import { profileShopCategories, profileShopItems } from '../data/profile-shop.js';
import { getAccountBalances } from '../services/economy.js';
import { equippedProfileBadges, getProfileInventory, getProfileProgress, getProfileSettings, PROFILE_CHAT_XP_DAILY_CAP, type ProfileBackgroundTarget, type ProfileSettings } from '../services/profile.js';
import { getRpgPet } from '../services/rpg.js';
import { storePanel } from './panels.js';
import { renderProfileCard, renderShopItemPreview, type ProfileCardMode } from './profile-cards.js';

const pid=(userId:string,action:string)=>`profile:${userId}:${action}`;
function png(buffer:Buffer,name:string){return new AttachmentBuilder(buffer).setName(name);}
function panelContainer(buffer:Buffer,title:string,description:string,accent:string,customId:string,rows:ActionRowBuilder<ButtonBuilder>[],top=''){
  const color=Number.parseInt(accent.slice(1),16)||0x8b75dc;
  const container=new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(new TextDisplayBuilder().setContent(`${top}# ${title}\n${description}`))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${customId}.png`).setDescription(title)));
  for(const row of rows) container.addActionRowComponents(row);
  return {components:[container],files:[png(buffer,`${customId}.png`)],flags:['IsComponentsV2','Ephemeral'] as const};
}

export async function profileCardPanel(guildId:string,user:User,viewerId=user.id,mode:ProfileCardMode='profile'){
  const [settings,progress,account,badges]=await Promise.all([getProfileSettings(user.id),getProfileProgress(guildId,user.id),getAccountBalances(guildId,user.id),equippedProfileBadges(user.id)]);
  const buffer=await renderProfileCard({mode,userId:user.id,username:user.username,avatarUrl:user.displayAvatarURL({extension:'png',size:256}),settings,progress,wallet:account.wallet,bank:account.bank,premium:account.premium,badges});
  const own=user.id===viewerId;
  const rows:ActionRowBuilder<ButtonBuilder>[]=[];
  if(own) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(pid(viewerId,'customize')).setLabel('Personalizar').setEmoji('🎨').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(pid(viewerId,'inventory')).setLabel('Inventario').setEmoji('🎒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(pid(viewerId,'shop')).setLabel('Tienda').setEmoji('🛒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(pid(viewerId,'progress')).setLabel('Progreso').setEmoji('📈').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(pid(viewerId,'wallet')).setLabel('Wallet').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(pid(viewerId,'rank')).setLabel('Rank card').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(pid(viewerId,'backgrounds')).setLabel('Fondos de tarjetas').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
    ));
  }
  const title=mode==='wallet'?'BILLETERA':mode==='rank'?'TARJETA DE RANGO':mode==='levelup'?'NUEVO NIVEL':'TARJETA DE PERFIL';
  const description=mode==='wallet'?'Monedas y gemas premium':mode==='rank'?'Rango global y actividad de usuario':'Tarjeta de comunidad de Manzanita';
  return panelContainer(buffer,title,description,settings.accent,`card-${mode}-${user.id}`,rows);
}

export async function profileCustomizePanel(guildId:string,userId:string,user?:User){
  const settings=await getProfileSettings(userId); const buffer=await selfCard(guildId,userId,'profile',settings,user);
  const activeStyle=profileShopItems.find((item)=>item.type==='accent'&&item.color.toLocaleLowerCase()===settings.accent.toLocaleLowerCase())?.name??'Lavanda predeterminado';
  const container=new ContainerBuilder().setAccentColor(Number.parseInt(settings.accent.slice(1),16)||0x8b75dc)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎨 PERSONALIZAR PERFIL\n**Estilo activo:** ${activeStyle}\nEdita tu título y descripción gratis. Lavanda es el estilo predeterminado; los demás estilos y cosméticos se compran en la tienda.`))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://custom-profile.png').setDescription('Vista previa del perfil')))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(pid(userId,'edit:about')).setLabel('Editar about').setEmoji('📝').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(pid(userId,'edit:title')).setLabel('Cambiar título').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(pid(userId,'shop')).setLabel('Tienda por categorías').setEmoji('🛍️').setStyle(ButtonStyle.Success),
    ))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(pid(userId,'inventory')).setLabel('Equipar cosméticos').setEmoji('🎒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(pid(userId,'backgrounds')).setLabel('Fondos de tarjetas').setEmoji('🖼️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(pid(userId,'wallet')).setLabel('Vista de wallet').setEmoji('💳').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(pid(userId,'home')).setLabel('Volver').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ));
  return {components:[container],files:[png(buffer,'custom-profile.png')],flags:['IsComponentsV2','Ephemeral'] as const};
}

const backgroundTargetOptions: { id: ProfileBackgroundTarget; label: string; setting: keyof ProfileSettings }[] = [
  { id: 'profile', label: 'Perfil', setting: 'profileBg' },
  { id: 'rank', label: 'Rango', setting: 'rankBg' },
  { id: 'wallet', label: 'Wallet', setting: 'walletBg' },
  { id: 'levelup', label: 'Subida de nivel', setting: 'levelupBg' },
];

const backgroundTargetLabel = (target: ProfileBackgroundTarget) => target === 'all'
  ? 'Todas las tarjetas' : backgroundTargetOptions.find((entry) => entry.id === target)?.label ?? 'Perfil';

export async function profileBackgroundsPanel(guildId:string,userId:string,target:ProfileBackgroundTarget='profile',selectedId?:string,notice='',user?:User){
  const [inventory,settings]=await Promise.all([getProfileInventory(guildId,userId),getProfileSettings(userId)]);
  const ownedIds=new Set(inventory.map((entry)=>entry.itemId));
  const backgrounds=profileShopItems.filter((item)=>['profile_bg','rank_bg','wallet_bg','levelup_bg'].includes(item.type)&&ownedIds.has(item.id));
  const targetSetting=target==='all'?'profileBg':backgroundTargetOptions.find((entry)=>entry.id===target)?.setting??'profileBg';
  const currentId=target==='all'?settings.profileBg??settings.rankBg??settings.walletBg??settings.levelupBg:settings[targetSetting];
  const selected=backgrounds.find((item)=>item.id===selectedId);
  const previewMode=target==='all'?'profile':target;
  const previewSetting=backgroundTargetOptions.find((entry)=>entry.id===previewMode)?.setting??'profileBg';
  const currentlyEquipped=profileShopItems.find((item)=>item.id===settings[previewSetting]&&['profile_bg','rank_bg','wallet_bg','levelup_bg'].includes(item.type));
  const hasCurrent=target==='all'?Boolean(settings.profileBg||settings.rankBg||settings.walletBg||settings.levelupBg):Boolean(currentId);
  const previewSettings=selected?{...settings,[previewSetting]:selected.id}:settings;
  const buffer=await selfCard(guildId,userId,previewMode,previewSettings,user);
  const filename='profile-background-manager.png';
  const assignments=backgroundTargetOptions.map((entry)=>{
    const item=profileShopItems.find((candidate)=>candidate.id===settings[entry.setting]);
    return `**${entry.label}:** ${item?`${item.emoji} ${item.name}`:'Predeterminado'}`;
  }).join(' · ');
  const description=selected
    ? `Previsualización de **${selected.name}** en la tarjeta de ${previewMode==='profile'?'perfil':previewMode==='rank'?'rango':previewMode==='wallet'?'wallet':'subida de nivel'}.`
    : currentlyEquipped?`Fondo equipado: **${currentlyEquipped.name}**.`
      : backgrounds.length?'Fondo predeterminado. Selecciona uno del inventario para ver cómo quedaría.'
        :'Fondo predeterminado. No tienes fondos en el inventario; puedes conseguir uno en la tienda.';
  const status=notice?`\n\n${notice}`:'';
  const container=new ContainerBuilder().setAccentColor(Number.parseInt(settings.accent.slice(1),16)||0x8b75dc)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🖼️ FONDOS DE TARJETAS\nElige una tarjeta y un fondo de tu inventario. Puedes asignar uno distinto a cada tarjeta o aplicar el mismo a todas.\n\n**Fondos equipados:** ${assignments}\n**Destino:** ${backgroundTargetLabel(target)} · **Selección:** ${selected?`${selected.emoji} ${selected.name}`:'ninguna'}${target==='all'?'\nAl aplicar, se actualizarán perfil, rango, wallet y subida de nivel.':''}${status}`))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Vista previa\n${description}`))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(`attachment://${filename}`).setDescription('Vista previa de tu tarjeta con tus datos y el fondo seleccionado.')))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(pid(userId,`background-target:${selected?.id??''}`)).setPlaceholder('¿Qué tarjeta quieres personalizar?')
        .addOptions([{label:'Todas las tarjetas',value:'all',emoji:'🪄',default:target==='all'},...backgroundTargetOptions.map((entry)=>({label:entry.label,value:entry.id,emoji:entry.id==='profile'?'👤':entry.id==='rank'?'🏆':entry.id==='wallet'?'💰':'⬆️',default:target===entry.id}))]),
    ));
  if(backgrounds.length) container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(pid(userId,`background-item:${target}`)).setPlaceholder('Escoge un fondo de tu inventario')
      .addOptions(backgrounds.slice(0,25).map((item)=>({label:item.name,value:item.id,description:`${item.rarity} · ${item.description}`.slice(0,100),emoji:item.emoji,default:selected?.id===item.id}))),
  ));
  container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(pid(userId,`background-apply:${target}:${selected?.id??''}`)).setLabel('Aplicar fondo').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!selected),
    new ButtonBuilder().setCustomId(pid(userId,`background-clear:${target}`)).setLabel('Quitar fondo').setEmoji('➖').setStyle(ButtonStyle.Secondary).setDisabled(!hasCurrent),
    new ButtonBuilder().setCustomId(pid(userId,'shop')).setLabel('Tienda').setEmoji('🛒').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(pid(userId,'customize')).setLabel('Volver').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  ));
  return {components:[container],files:[png(buffer,filename)],flags:['IsComponentsV2','Ephemeral'] as const};
}

export async function profileProgressPanel(guildId:string,user:User){
  const [settings,progress]=await Promise.all([getProfileSettings(user.id),getProfileProgress(guildId,user.id)]); const buffer=await selfCard(guildId,user.id,'rank',settings,user);
  const target=(progress.level**2)*100;
  const container=new ContainerBuilder().setAccentColor(0x5c89d8).addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `# 📈 PROGRESO GLOBAL\nNivel **${progress.level}** · **${progress.xp.toLocaleString('es-MX')} XP** · rango global **#${progress.globalRank}**\nSiguiente nivel: **${Math.max(0,target-progress.xp).toLocaleString('es-MX')} XP** · XP de chat hoy: **${progress.dailyXp}/${PROFILE_CHAT_XP_DAILY_CAP}**\nActividad: **${progress.messages.toLocaleString('es-MX')} mensajes**`))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://rank-card.png').setDescription('Tarjeta de rango global')))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(pid(user.id,'home')).setLabel('Perfil').setEmoji('👤').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(pid(user.id,'wallet')).setLabel('Wallet').setEmoji('💰').setStyle(ButtonStyle.Secondary)));
  return {components:[container],files:[png(buffer,'rank-card.png')],flags:['IsComponentsV2','Ephemeral'] as const};
}

export async function levelUpCardMessage(guildId:string,user:User,level:number){
  const [settings,progress,account,badges]=await Promise.all([getProfileSettings(user.id),getProfileProgress(guildId,user.id),getAccountBalances(guildId,user.id),equippedProfileBadges(user.id)]);
  const buffer=await renderProfileCard({mode:'levelup',userId:user.id,username:user.username,avatarUrl:user.displayAvatarURL({extension:'png',size:256}),settings,progress,wallet:account.wallet,bank:account.bank,premium:account.premium,badges,levelUpTo:level});
  return png(buffer,'level-up.png');
}

export async function profileInventoryPanel(guildId:string,userId:string,category='all',selectedId?:string){
  const [inventory,settings,pet]=await Promise.all([getProfileInventory(guildId,userId),getProfileSettings(userId),category==='pets'?getRpgPet(guildId,userId):Promise.resolve(undefined)]); const owned=new Map(inventory.map((entry)=>[entry.itemId,entry.quantity]));
  const visibleInventory=inventory.filter((entry)=>profileShopItems.some((item)=>item.id===entry.itemId));
  const matching=profileShopItems.filter((item)=>item.type!=='pet'&&owned.has(item.id)&&(category==='all'||item.category===category));
  const selected=matching.find((item)=>item.id===selectedId)??matching[0];
  const equippedIds=new Set([settings.profileBg,settings.rankBg,settings.walletBg,settings.levelupBg,settings.tag,settings.frame,settings.sticker,profileShopItems.find((item)=>item.type==='accent'&&item.color.toLocaleLowerCase()===settings.accent.toLocaleLowerCase())?.id].filter(Boolean));
  const activeBadges=await equippedProfileBadges(userId); activeBadges.forEach((id)=>equippedIds.add(id));
  const info=category==='pets'?(pet?`🐾 **${pet.name}** · ${pet.species} · ${pet.rarity}\nNivel ${pet.level} · ${pet.element} · ${pet.specialization}\nLas mascotas se adoptan y entrenan en el módulo RPG.`:'Todavía no tienes una mascota activa. Adopta una en el módulo RPG.'):(selected?`${selected.emoji} **${selected.name}** · ${selected.rarity}\n${selected.description}\n${equippedIds.has(selected.id)?'✅ Equipado':'En tu inventario'}${owned.get(selected.id)!>1?` · x${owned.get(selected.id)}`:''}`:'Aún no tienes cosméticos de esta categoría. Explora la tienda para conseguirlos.');
  const container=new ContainerBuilder().setAccentColor(0x4ba886).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎒 INVENTARIO\n${visibleInventory.reduce((sum,item)=>sum+item.quantity,0)} artículos · elige uno para previsualizar o equipar.\n\n${info}`));
  if(selected) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://inventory-preview.png').setDescription(`Vista previa ${selected.name}`)));
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(pid(userId,`inventory-category:${category}`)).setPlaceholder('Filtrar inventario').addOptions(profileShopCategories.map((entry)=>({label:entry.label,value:entry.id,emoji:entry.emoji,default:category===entry.id})))));
  if(matching.length) container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(pid(userId,`inventory-item:${category}`)).setPlaceholder('Selecciona un artículo').addOptions(matching.slice(0,25).map((item)=>({label:item.name,value:item.id,description:`${item.rarity} · ${equippedIds.has(item.id)?'equipado':'disponible'}`,emoji:item.emoji,default:selected?.id===item.id})))));
  const rows:ActionRowBuilder<ButtonBuilder>[]=[];
  if(category==='pets') rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(pid(userId,'rpg')).setLabel(pet?'Ver y entrenar mascota':'Adoptar mascota').setEmoji('🐾').setStyle(ButtonStyle.Success)));
  if(selected&&selected.type!=='badge') {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(pid(userId,`equip:${selected.id}`)).setLabel('Equipar').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(equippedIds.has(selected.id)),new ButtonBuilder().setCustomId(pid(userId,`unequip:${selected.type}`)).setLabel('Desequipar ranura').setEmoji('➖').setStyle(ButtonStyle.Secondary)));
  }
  if(selected?.type==='badge') rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(pid(userId,`equip:${selected.id}`)).setLabel('Equipar badge').setEmoji('🏅').setStyle(ButtonStyle.Success).setDisabled(equippedIds.has(selected.id)),new ButtonBuilder().setCustomId(pid(userId,'unequip:badge')).setLabel('Quitar badges').setEmoji('➖').setStyle(ButtonStyle.Secondary)));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(pid(userId,'shop')).setLabel('Ir a tienda').setEmoji('🛒').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(pid(userId,'customize')).setLabel('Personalizar').setEmoji('🎨').setStyle(ButtonStyle.Secondary),...(category==='wallet_bg'||category==='accent'?[new ButtonBuilder().setCustomId(pid(userId,'wallet')).setLabel('Vista de wallet').setEmoji('💳').setStyle(ButtonStyle.Primary)]:[]),new ButtonBuilder().setCustomId(pid(userId,'home')).setLabel('Perfil').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
  for(const row of rows)container.addActionRowComponents(row);
  const response={components:[container],flags:['IsComponentsV2','Ephemeral'] as const};
  return selected?{...response,files:[png(await renderShopItemPreview(selected),'inventory-preview.png')]}:response;
}

export async function profileShopPanel(guildId:string,userId:string,category='all',query='',selectedId?:string,notice='',previewUser?:User){
  void query;
  return storePanel(guildId,userId,category==='all'?'profile:all':`profile:${category}`,0,selectedId,notice,'profile',previewUser);
}

async function selfCard(guildId:string,userId:string,mode:ProfileCardMode,settingsOverride?:ProfileSettings,user?:User){
  const [settings,progress,account,badges]=await Promise.all([settingsOverride?Promise.resolve(settingsOverride):getProfileSettings(userId),getProfileProgress(guildId,userId),getAccountBalances(guildId,userId),equippedProfileBadges(userId)]);
  const username=user?.username??`Usuario ${userId.slice(-4)}`;const avatarUrl=user?.displayAvatarURL({extension:'png',size:256})??'';
  return renderProfileCard({mode,userId,username,avatarUrl,settings,progress,wallet:account.wallet,bank:account.bank,premium:account.premium,badges});
}
