import { profileShopCategories, profileShopItems } from '../data/profile-shop.js';
import { getAccountBalances, getInventory, purchaseItem, storeItems } from './economy.js';
import { buyProfileItem, getProfileInventory } from './profile.js';
import { buyRpgItem, getRpgInventory, rpgItems } from './rpg.js';
export const storeCategoryOptions = [
    { id: 'all', label: 'Todo', emoji: '🛍️' },
    { id: 'profile:all', label: 'Personalización', emoji: '🎨' },
    ...profileShopCategories
        .filter((category) => !['all', 'pets', 'badge', 'tag', 'frame', 'sticker'].includes(category.id))
        .map((category) => ({ id: `profile:${category.id}`, label: category.label, emoji: category.emoji })),
    { id: 'profile:details', label: 'Detalles del perfil', emoji: '✨' },
    { id: 'economy', label: 'Consumibles', emoji: '🪙' },
    { id: 'economy:jobs', label: 'Herramientas de trabajo', emoji: '🧰' },
    { id: 'rpg:all', label: 'Artículos RPG', emoji: '🐾' },
    ...[...new Set(rpgItems.map((item) => item.category))]
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((category) => ({
        id: `rpg:${category}`,
        label: `RPG · ${category}`,
        emoji: rpgItems.find((item) => item.category === category)?.emoji ?? '📦',
    })),
];
export function storeCatalog() {
    return [
        ...profileShopItems
            .filter((item) => item.type !== 'pet')
            .map((item) => ({ kind: 'profile', id: item.id, name: item.name, emoji: item.emoji, category: item.category, description: item.description, price: item.price, rarity: item.rarity, repeatable: false })),
        ...storeItems.map((item) => ({ kind: 'economy', id: item.id, name: item.name, emoji: item.emoji, category: item.category === 'jobs' ? 'economy:jobs' : 'economy', description: item.description, price: item.cost, rarity: 'Común', repeatable: item.repeatable })),
        ...rpgItems.map((item) => ({ kind: 'rpg', id: item.id, name: item.name, emoji: item.emoji, category: item.category, description: item.description, price: item.cost, rarity: item.rarity, repeatable: true })),
    ];
}
export function findStoreProduct(kind, itemId) {
    return storeCatalog().find((item) => item.kind === kind && item.id === itemId);
}
export function filterStoreCatalog(category) {
    const catalog = storeCatalog();
    if (category === 'all')
        return catalog;
    if (category === 'profile:all')
        return catalog.filter((item) => item.kind === 'profile');
    if (category === 'profile:details')
        return catalog.filter((item) => item.kind === 'profile' && ['badge', 'tag', 'frame', 'sticker'].includes(item.category));
    if (category.startsWith('profile:'))
        return catalog.filter((item) => item.kind === 'profile' && item.category === category.slice('profile:'.length));
    if (category === 'economy')
        return catalog.filter((item) => item.kind === 'economy' && item.category === 'economy');
    if (category === 'economy:jobs')
        return catalog.filter((item) => item.kind === 'economy' && item.category === 'economy:jobs');
    if (category === 'rpg:all')
        return catalog.filter((item) => item.kind === 'rpg');
    if (category.startsWith('rpg:'))
        return catalog.filter((item) => item.kind === 'rpg' && item.category === category.slice('rpg:'.length));
    return [];
}
export async function getStoreSnapshot(guildId, userId) {
    const [account, economyInventory, profileInventory, rpgInventory] = await Promise.all([
        getAccountBalances(guildId, userId),
        getInventory(guildId, userId),
        getProfileInventory(guildId, userId),
        getRpgInventory(guildId, userId),
    ]);
    const quantities = new Map();
    for (const item of economyInventory)
        quantities.set(`economy:${item.itemId}`, item.quantity);
    for (const item of profileInventory)
        quantities.set(`profile:${item.itemId}`, item.quantity);
    for (const item of rpgInventory)
        quantities.set(`rpg:${item.itemId}`, item.quantity);
    return {
        balance: account.wallet,
        products: storeCatalog().map((item) => ({ ...item, quantity: quantities.get(`${item.kind}:${item.id}`) ?? 0 })),
    };
}
export async function purchaseStoreProduct(guildId, userId, kind, itemId, reference) {
    const item = findStoreProduct(kind, itemId);
    if (!item)
        return { ok: false, reason: 'not_found' };
    if (kind === 'profile') {
        const result = await buyProfileItem(guildId, userId, itemId, reference);
        if (result.ok) {
            const inventory = await getProfileInventory(guildId, userId);
            return { ok: true, balance: result.balance, quantity: inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 1 };
        }
        return { ok: false, reason: result.reason === 'already_owned' ? 'already_owned' : result.reason === 'insufficient' ? 'insufficient_funds' : 'not_found' };
    }
    if (kind === 'economy') {
        const result = await purchaseItem(guildId, userId, itemId, reference);
        return result.ok ? result : { ok: false, reason: result.reason === 'insufficient_funds' ? 'insufficient_funds' : result.reason === 'already_owned' ? 'already_owned' : 'not_found' };
    }
    const result = await buyRpgItem(guildId, userId, itemId, reference);
    return result.ok ? result : { ok: false, reason: result.reason === 'funds' ? 'insufficient_funds' : 'not_found' };
}
