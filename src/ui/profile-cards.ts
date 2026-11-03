import { createCanvas, loadImage } from '@napi-rs/canvas';
import { profileItem, type ProfileProgress, type ProfileSettings } from '../services/profile.js';
import type { ProfileShopItem } from '../data/profile-shop.js';

export type ProfileCardMode = 'profile' | 'wallet' | 'rank' | 'levelup' | 'room';
export type ProfileCardInput = {
  mode: ProfileCardMode; userId: string; username: string; avatarUrl: string; settings: ProfileSettings; progress: ProfileProgress;
  wallet: number; bank: number; premium: number; badges: string[]; petName?: string; petSpritePath?: string; levelUpTo?: number;
};
const cardCache = new Map<string, { expiresAt: number; buffer: Buffer }>();
const width = 1200; const height = 640;

export async function renderProfileCard(input: ProfileCardInput): Promise<Buffer> {
  const key=cacheKey(input); const cached=cardCache.get(key);
  if (cached&&cached.expiresAt>Date.now()) return cached.buffer;
  const scale=input.mode==='levelup'?.78:1;
  const canvas=createCanvas(Math.round(width*scale),Math.round(height*scale)); const ctx=canvas.getContext('2d');
  if(scale!==1)ctx.scale(scale,scale);
  const accent=input.settings.accent; const background=itemForMode(input);
  const baseColor=background?.color ?? accent;
  const gradient=ctx.createLinearGradient(0,0,width,height); gradient.addColorStop(0,baseColor); gradient.addColorStop(.48,'#171b31'); gradient.addColorStop(1,'#0b1021');
  ctx.save(); roundRect(ctx,0,0,width,height,38); ctx.clip();
  if(background?.asset) {
    try { const image=await loadImage(new URL(`../../assets/profile-backgrounds/${background.asset}`,import.meta.url)); ctx.drawImage(image,0,0,width,height); }
    catch { ctx.fillStyle=gradient; ctx.fillRect(0,0,width,height); }
    const shade=ctx.createLinearGradient(0,0,width,0); shade.addColorStop(0,'rgba(5,8,19,.60)'); shade.addColorStop(.56,'rgba(5,8,19,.32)'); shade.addColorStop(1,'rgba(5,8,19,.50)'); ctx.fillStyle=shade; ctx.fillRect(0,0,width,height);
  } else { ctx.fillStyle=gradient; ctx.fillRect(0,0,width,height); }
  ctx.restore();
  // Low contrast ambient lights and a dark glass overlay keep text readable on every theme.
  const orb=ctx.createRadialGradient(1010,110,20,1010,110,520); orb.addColorStop(0,hexAlpha(accent,.44)); orb.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=orb; roundRect(ctx,0,0,width,height,38); ctx.fill();
  ctx.save(); roundRect(ctx,0,0,width,height,38); ctx.clip();
  if(!background?.asset) for(let i=0;i<34;i++){ const x=(i*197+53)%width; const y=(i*113+29)%height; ctx.beginPath(); ctx.arc(x,y,(i%3)+1,0,Math.PI*2); ctx.fillStyle=`rgba(255,255,255,${.08+(i%4)*.025})`; ctx.fill(); }
  ctx.fillStyle=background?.asset?'rgba(8,12,25,0.12)':'rgba(8,12,25,0.68)'; roundRect(ctx,22,22,width-44,height-44,30); ctx.fill();
  ctx.restore();
  ctx.strokeStyle=hexAlpha(accent,.8); ctx.lineWidth=3; roundRect(ctx,3,3,width-6,height-6,38); ctx.stroke();

  if(input.mode==='wallet') drawWallet(ctx,input,accent);
  else if(input.mode==='levelup') await drawLevelup(ctx,input,accent);
  else if(input.mode==='room') await drawRoom(ctx,input,accent);
  else await drawProfile(ctx,input,accent,input.mode==='rank');
  const buffer=canvas.toBuffer('image/png');
  if(cardCache.size>200) for(const [key,entry] of cardCache) if(entry.expiresAt<Date.now()) cardCache.delete(key);
  cardCache.set(key,{expiresAt:Date.now()+60_000,buffer});
  return buffer;
}

export async function renderShopItemPreview(item:ProfileShopItem):Promise<Buffer>{
  const canvas=createCanvas(width,height);const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,item.color);gradient.addColorStop(.58,'#171b31');gradient.addColorStop(1,'#090d18');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  if(item.asset){try{const image=await loadImage(new URL(`../../assets/profile-backgrounds/${item.asset}`,import.meta.url));ctx.drawImage(image,0,0,width,height);}catch{/* The catalog still renders a clear item tile if a local asset is missing. */}}
  const shade=ctx.createLinearGradient(0,0,0,height);shade.addColorStop(0,'rgba(6,9,17,.08)');shade.addColorStop(.55,'rgba(6,9,17,.16)');shade.addColorStop(1,'rgba(6,9,17,.85)');ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
  if(!item.asset){
    ctx.fillStyle='rgba(8,12,25,.52)';roundRect(ctx,44,44,width-88,height-88,34);ctx.fill();
    ctx.strokeStyle=hexAlpha(item.color,.8);ctx.lineWidth=3;roundRect(ctx,47,47,width-94,height-94,32);ctx.stroke();
    if(item.type==='badge'){
      ctx.fillStyle=hexAlpha(item.color,.32);ctx.beginPath();ctx.arc(600,260,145,0,Math.PI*2);ctx.fill();ctx.strokeStyle=item.color;ctx.lineWidth=8;ctx.stroke();label(ctx,item.emoji,600,310,120,'#fff',700,'center');
    }else if(item.type==='tag'){
      pill(ctx,`${item.emoji} ${item.name}`,600,270,item.color);ctx.textAlign='center';
    }else if(item.type==='frame'){
      const x=600,y=260;const ring=ctx.createLinearGradient(x-120,y-120,x+120,y+120);ring.addColorStop(0,'#e2c5ff');ring.addColorStop(.45,item.color);ring.addColorStop(1,'#57d8cf');ctx.strokeStyle=ring;ctx.lineWidth=24;ctx.beginPath();ctx.arc(x,y,112,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#242b40';ctx.beginPath();ctx.arc(x,y,86,0,Math.PI*2);ctx.fill();label(ctx,'●',x,y+35,92,'#c4cce2',700,'center');
    }else if(item.type==='sticker')label(ctx,item.emoji,600,330,190,'#fff',700,'center');
  }
  ctx.fillStyle='rgba(8,12,25,.66)';roundRect(ctx,54,height-156,width-108,102,24);ctx.fill();
  label(ctx,`${item.emoji}  ${item.name}`,82,height-98,35,'#fff',800);
  label(ctx,`${item.rarity.toLocaleUpperCase()}  ·  ${moneyLabel(item.price)} monedas`,84,height-66,17,'#e0e4f3',600);
  const border=ctx.createLinearGradient(0,0,width,height);border.addColorStop(0,hexAlpha(item.color,.9));border.addColorStop(1,'rgba(255,255,255,.24)');ctx.strokeStyle=border;ctx.lineWidth=3;roundRect(ctx,3,3,width-6,height-6,38);ctx.stroke();
  return canvas.toBuffer('image/png');
}

function moneyLabel(value:number):string{return new Intl.NumberFormat('es-MX').format(value);}

async function drawProfile(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,input:ProfileCardInput,accent:string,rankMode:boolean) {
  const {progress,settings}=input;
  label(ctx,rankMode?'RANK CARD':'PROFILE CARD',62,66,18,accent,700);
  label(ctx,`NIVEL ${progress.level}`,65,117,25,'#ffffff',800);
  label(ctx,`GLOBAL #${progress.globalRank}`,1136,78,22,'#eff2ff',700,'right');
  label(ctx,`${progress.xp.toLocaleString('es-MX')} XP GLOBAL`,1136,112,15,'#aeb6d0',600,'right');
  await drawAvatar(ctx,input,75,175,174,settings.frame);
  label(ctx,truncate(input.username,26),292,228,42,'#fff',800);
  label(ctx,settings.title || 'Aventurero/a',296,269,21,'#c2c9dc',500);
  if(settings.tag) { const tag=profileItem(settings.tag); if(tag) pill(ctx,tag.emoji+' '+tag.name,296,291,tag.color); }
  const currentXp=progress.xp; const currentLevel=progress.level; const floorXp=(currentLevel-1)**2*100; const nextXp=currentLevel**2*100;
  const x=295,y=370,w=575,h=17; label(ctx,`${(currentXp-floorXp).toLocaleString('es-MX')} / ${(nextXp-floorXp).toLocaleString('es-MX')} XP`,x,y-18,16,'#e5e7f2',600);
  ctx.fillStyle='rgba(255,255,255,.13)'; roundRect(ctx,x,y,w,h,9); ctx.fill();
  ctx.fillStyle=accent; roundRect(ctx,x,y,w*Math.max(.025,Math.min(1,(currentXp-floorXp)/Math.max(1,nextXp-floorXp))),h,9); ctx.fill();
  label(ctx,`${progress.messages.toLocaleString('es-MX')} mensajes globales`,296,435,17,'#c2c9dc',500);
  label(ctx,`Reputación ${progress.reputation}`,296,466,17,'#c2c9dc',500);
  label(ctx,input.petName?`🐾 ${input.petName}`:'🐾 Sin mascota activa',296,508,18,'#f5e8ff',600);
  label(ctx,settings.about?truncate(settings.about,58):'Cuéntale algo de ti desde Personalizar.',72,583,16,'#c0c8dc',500);
  const sticker=profileItem(settings.sticker);if(sticker)label(ctx,sticker.emoji,862,480,40,'#fff',700,'center');
  drawBadges(ctx,input,934,204);
}

function drawWallet(ctx:ReturnType<ReturnType<typeof createCanvas>['getContext']>,input:ProfileCardInput,accent:string) {
  const fmt=new Intl.NumberFormat('es-MX');
  label(ctx,'MANZANITA',68,78,20,'#fff',800);label(ctx,'BILLETERA GLOBAL',1130,78,16,'#e4e9f6',700,'right');
  label(ctx,'SALDO DISPONIBLE',70,178,16,'#e1e5f3',700);label(ctx,`${fmt.format(input.wallet)} monedas`,68,253,54,'#fff',800);
  label(ctx,`👤 ${truncate(input.username,28)}`,70,302,19,'#f1f3fb',600);
  const tiles=[{title:'🏦  BANCO',value:input.bank,color:'#55d5c0'},{title:'💎  PREMIUM',value:input.premium,color:'#d0a3ff'},{title:'✨  PATRIMONIO',value:input.wallet+input.bank,color:accent}];
  tiles.forEach((tile,index)=>{const x=68+index*365;ctx.fillStyle='rgba(8,12,25,.44)';roundRect(ctx,x,382,335,126,20);ctx.fill();ctx.strokeStyle=hexAlpha(tile.color,.72);ctx.lineWidth=2;roundRect(ctx,x,382,335,126,20);ctx.stroke();label(ctx,tile.title,x+20,422,15,'#e4e9f6',700);label(ctx,fmt.format(tile.value),x+20,478,31,'#fff',800);});
  label(ctx,`Nivel ${input.progress.level}  ·  ${input.progress.xp.toLocaleString('es-MX')} XP global`,70,570,17,'#e2e6f3',600);
}

async function drawLevelup(ctx:ReturnType<ReturnType<typeof createCanvas>['getContext']>,input:ProfileCardInput,accent:string) {
  label(ctx,'✨ NUEVO NIVEL',70,83,23,accent,800); label(ctx,input.username,70,155,38,'#fff',800);
  label(ctx,`${input.levelUpTo ?? input.progress.level}`,76,360,132,'#fff',900);
  label(ctx,'¡SIGUE SUBIENDO!',300,278,25,'#fff',800); label(ctx,`${input.progress.xp.toLocaleString('es-MX')} XP global`,304,320,20,'#c8cde0',600);
  label(ctx,`Rango global #${input.progress.globalRank}`,304,359,17,'#aeb6d0',500);
  await drawAvatar(ctx,input,818,174,116,input.settings.frame);
  if(input.petSpritePath){
    try { const sprite=await loadImage(input.petSpritePath); const aura=ctx.createRadialGradient(1030,360,14,1030,360,112); aura.addColorStop(0,hexAlpha(accent,.28)); aura.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=aura; ctx.beginPath(); ctx.arc(1030,360,112,0,Math.PI*2); ctx.fill(); ctx.drawImage(sprite,965,284,130,130); }
    catch { /* A missing cosmetic sprite should not block the level-up notice. */ }
  }
  if(input.petName) label(ctx,`🐾 ${truncate(input.petName,22)} celebra contigo`,790,478,17,'#f6eaff',600,'center');
}

async function drawRoom(ctx:ReturnType<ReturnType<typeof createCanvas>['getContext']>,input:ProfileCardInput,accent:string){
  const home=profileItem(input.settings.housing);label(ctx,'ROOM CARD',64,76,19,accent,700);label(ctx,home?.name??'Hogar de '+input.username,64,139,42,'#fff',800);label(ctx,`Un espacio de ${truncate(input.username,28)}`,66,176,19,'#e0e4f3',500);
  if(home)label(ctx,home.description,66,224,20,'#f0f1f6',500);
  if(input.petName)label(ctx,`🐾 ${input.petName}`,66,276,19,'#fff',600);
  label(ctx,input.settings.about?truncate(input.settings.about,58):'Un rincón propio para descansar.',66,576,17,'#f0f1f6',500);
  await drawAvatar(ctx,input,968,420,132,input.settings.frame);
}

function drawBadges(ctx:ReturnType<ReturnType<typeof createCanvas>['getContext']>,input:ProfileCardInput,x:number,y:number) {
  label(ctx,'BADGES',x,y-35,15,'#aeb6d0',700);
  for(let i=0;i<3;i++){const left=x+(i%2)*106,top=y+Math.floor(i/2)*102; ctx.fillStyle='rgba(255,255,255,.07)'; roundRect(ctx,left,top,88,82,20); ctx.fill(); const item=input.badges[i]?profileItem(input.badges[i]):undefined; if(item){ctx.strokeStyle=hexAlpha(item.color,.9);ctx.lineWidth=2;roundRect(ctx,left,top,88,82,20);ctx.stroke();label(ctx,item.emoji,left+44,top+40,30,'#fff',600,'center');label(ctx,truncate(item.name,10),left+44,top+65,10,'#e5e8f2',600,'center');}else label(ctx,'＋',left+44,top+49,24,'#5d6478',500,'center'); }
}

async function drawAvatar(ctx:ReturnType<ReturnType<typeof createCanvas>['getContext']>,input:ProfileCardInput,x:number,y:number,size:number,frameId:string|null) {
  const item=profileItem(frameId);
  ctx.save(); ctx.beginPath(); ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2); ctx.clip();
  try{const response=await fetch(input.avatarUrl,{signal:AbortSignal.timeout(4500)}); if(!response.ok)throw new Error('avatar');const buffer=Buffer.from(await response.arrayBuffer()); if(buffer.length>3_000_000)throw new Error('avatar too large');const image=await loadImage(buffer);ctx.drawImage(image,x,y,size,size);}catch{ctx.fillStyle='#373e5a';ctx.fillRect(x,y,size,size);label(ctx,input.username.slice(0,1).toUpperCase(),x+size/2,y+size*.67,size*.48,'#fff',800,'center');}
  ctx.restore(); ctx.beginPath(); ctx.arc(x+size/2,y+size/2,size/2+8,0,Math.PI*2); ctx.strokeStyle=item?.color??input.settings.accent; ctx.lineWidth=8; ctx.stroke();
}

function itemForMode(input:ProfileCardInput):ProfileShopItem|undefined { const id=input.mode==='wallet'?input.settings.walletBg:input.mode==='levelup'?input.settings.levelupBg:input.mode==='rank'?input.settings.rankBg:input.mode==='room'?input.settings.housing:input.settings.profileBg; return profileItem(id); }
function cacheKey(input:ProfileCardInput):string{return `${input.mode}:${input.userId}:${input.username}:${input.progress.level}:${input.progress.xp}:${input.progress.globalRank}:${input.progress.serverLevel}:${input.progress.serverXp}:${input.progress.serverRank}:${input.progress.messages}:${input.progress.reputation}:${input.wallet}:${input.bank}:${input.premium}:${input.settings.accent}:${input.settings.profileBg}:${input.settings.rankBg}:${input.settings.walletBg}:${input.settings.levelupBg}:${input.settings.housing}:${input.settings.frame}:${input.settings.tag}:${input.settings.sticker}:${input.settings.about}:${input.settings.title}:${input.badges.join(',')}:${input.petName??''}:${input.petSpritePath??''}:${input.levelUpTo??''}`;}
function label(ctx:ReturnType<ReturnType<typeof createCanvas>['getContext']>,text:string,x:number,y:number,size:number,color:string,weight:number,align:CanvasTextAlign='left'){ctx.font=`${weight} ${size}px Arial, sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(text,x,y);}
function pill(ctx:ReturnType<ReturnType<typeof createCanvas>['getContext']>,text:string,x:number,y:number,color:string){ctx.font='600 14px Arial,sans-serif';const w=ctx.measureText(text).width+24;ctx.fillStyle=hexAlpha(color,.28);roundRect(ctx,x,y,w,29,14);ctx.fill();label(ctx,text,x+12,y+20,14,'#fff',600);}
function roundRect(ctx:ReturnType<ReturnType<typeof createCanvas>['getContext']>,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function truncate(value:string,max:number):string{return value.length>max?`${value.slice(0,max-1)}…`:value;}
function hexAlpha(value:string,alpha:number):string{const hex=/^#[0-9a-fA-F]{6}$/.test(value)?value:'#8b75dc';const num=parseInt(hex.slice(1),16);return `rgba(${(num>>16)&255},${(num>>8)&255},${num&255},${alpha})`;}
