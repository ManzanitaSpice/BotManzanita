export type ProfileItemType = 'profile_bg' | 'rank_bg' | 'wallet_bg' | 'levelup_bg' | 'badge' | 'tag' | 'frame' | 'sticker' | 'pet' | 'housing';
type ProfileShopItemBase = { id: string; category: string; name: string; description: string; price: number; color: string; rarity: string; emoji: string };
export type ProfileShopItem = ProfileShopItemBase & (
  | { type: 'profile_bg' | 'rank_bg' | 'wallet_bg' | 'levelup_bg' | 'housing'; asset: string }
  | { type: 'badge' | 'tag' | 'frame' | 'sticker' | 'pet'; asset?: never }
);

export const profileShopCategories = [
  { id: 'all', label: 'Todo', emoji: '🛍️' },
  { id: 'profile_bg', label: 'Fondos de perfil', emoji: '🖼️' },
  { id: 'pets', label: 'Mascotas', emoji: '🐾' },
  { id: 'housing', label: 'Housing', emoji: '🏠' },
  { id: 'rank_bg', label: 'Fondos de rank', emoji: '🏆' },
  { id: 'levelup_bg', label: 'Fondos de level-up', emoji: '⬆️' },
  { id: 'wallet_bg', label: 'Fondos de wallet', emoji: '💰' },
  { id: 'badge', label: 'Badges', emoji: '🏅' },
  { id: 'tag', label: 'Tags', emoji: '🔖' },
  { id: 'frame', label: 'Marcos', emoji: '💠' },
  { id: 'sticker', label: 'Stickers', emoji: '✨' },
] as const;

export const profileShopItems: ProfileShopItem[] = [
  { id: 'bg_moonlit', type: 'profile_bg', category: 'profile_bg', asset: 'bg_moonlit.jpg', name: 'Noche lunar', description: 'Valle índigo bajo una luna llena.', price: 350, color: '#394b8c', rarity: 'Común', emoji: '🌙' },
  { id: 'bg_sakura', type: 'profile_bg', category: 'profile_bg', asset: 'bg_sakura.jpg', name: 'Jardín sakura', description: 'Jardín de cerezos al atardecer.', price: 500, color: '#a94878', rarity: 'Poco común', emoji: '🌸' },
  { id: 'bg_nebula', type: 'profile_bg', category: 'profile_bg', asset: 'bg_nebula.jpg', name: 'Nebulosa', description: 'Nubes cósmicas violetas y cian.', price: 900, color: '#6545a4', rarity: 'Raro', emoji: '🌌' },
  { id: 'rank_aurora', type: 'rank_bg', category: 'rank_bg', asset: 'rank_aurora.jpg', name: 'Aurora boreal', description: 'Aurora sobre un bosque nevado.', price: 450, color: '#167b78', rarity: 'Poco común', emoji: '🌌' },
  { id: 'rank_ember', type: 'rank_bg', category: 'rank_bg', asset: 'rank_ember.jpg', name: 'Ascua', description: 'Volcán oscuro iluminado por brasas.', price: 650, color: '#a34e34', rarity: 'Raro', emoji: '🔥' },
  { id: 'wallet_mint', type: 'wallet_bg', category: 'wallet_bg', asset: 'wallet_mint.jpg', name: 'Menta', description: 'Arroyo claro entre hojas de menta.', price: 300, color: '#23806b', rarity: 'Común', emoji: '🍃' },
  { id: 'wallet_gold', type: 'wallet_bg', category: 'wallet_bg', asset: 'wallet_gold.jpg', name: 'Oro suave', description: 'Cámara de tonos bronce y oro suave.', price: 700, color: '#9c7021', rarity: 'Raro', emoji: '🪙' },
  { id: 'levelup_stars', type: 'levelup_bg', category: 'levelup_bg', asset: 'levelup_stars.jpg', name: 'Lluvia de estrellas', description: 'Estela celeste sobre montañas nocturnas.', price: 550, color: '#58469b', rarity: 'Poco común', emoji: '⭐' },
  { id: 'levelup_flame', type: 'levelup_bg', category: 'levelup_bg', asset: 'levelup_flame.jpg', name: 'Llama ascendente', description: 'Fuego mágico entre riscos de obsidiana.', price: 800, color: '#a44b2c', rarity: 'Raro', emoji: '🔥' },
  { id: 'badge_earlybird', type: 'badge', category: 'badge', name: 'Madrugador', description: 'Badge de constancia y primeras horas.', price: 250, color: '#3e8c83', rarity: 'Común', emoji: '🌅' },
  { id: 'badge_stargazer', type: 'badge', category: 'badge', name: 'Observaestrellas', description: 'Un emblema para exploradores del cielo.', price: 400, color: '#7561b5', rarity: 'Poco común', emoji: '🔭' },
  { id: 'badge_veteran', type: 'badge', category: 'badge', name: 'Veterano', description: 'Insignia de perfil con acabado bronce.', price: 750, color: '#a06a3a', rarity: 'Raro', emoji: '🛡️' },
  { id: 'tag_chill', type: 'tag', category: 'tag', name: 'Modo chill', description: 'Tag corto debajo de tu título.', price: 180, color: '#4d8a91', rarity: 'Común', emoji: '🫧' },
  { id: 'tag_creator', type: 'tag', category: 'tag', name: 'Creador', description: 'Tag decorativo para tu tarjeta.', price: 400, color: '#8a5bad', rarity: 'Poco común', emoji: '🎨' },
  { id: 'frame_prism', type: 'frame', category: 'frame', name: 'Marco prisma', description: 'Borde iridiscente para el avatar.', price: 800, color: '#7471d8', rarity: 'Raro', emoji: '💎' },
  { id: 'frame_obsidian', type: 'frame', category: 'frame', name: 'Marco obsidiana', description: 'Borde oscuro con brillo violeta.', price: 950, color: '#50416e', rarity: 'Épico', emoji: '🔮' },
  { id: 'sticker_heart', type: 'sticker', category: 'sticker', name: 'Corazón flotante', description: 'Sticker de perfil en rosa suave.', price: 220, color: '#b94c77', rarity: 'Común', emoji: '💗' },
  { id: 'sticker_comet', type: 'sticker', category: 'sticker', name: 'Cometa', description: 'Sticker celeste con cola luminosa.', price: 360, color: '#4e83bd', rarity: 'Poco común', emoji: '☄️' },
  { id: 'house_cabin', type: 'housing', category: 'housing', asset: 'house_cabin.jpg', name: 'Cabaña musgo', description: 'Cabaña de bosque con arroyo y luciérnagas.', price: 600, color: '#467658', rarity: 'Poco común', emoji: '🏡' },
  { id: 'house_sky', type: 'housing', category: 'housing', asset: 'house_sky.jpg', name: 'Loft celeste', description: 'Loft luminoso en una terraza entre nubes.', price: 900, color: '#4974a9', rarity: 'Raro', emoji: '🏙️' },
];
