import { randomInt } from 'node:crypto';
import { EmbedBuilder } from 'discord.js';
const definitions = {
    happy: { endpoint: 'happy', aliases: ['feliz', 'felicidad'], targetRequired: false, text: (actor, target) => target ? `${actor} se alegra por ${target}.` : `${actor} está muy feliz.` },
    sip: { endpoint: 'sip', aliases: ['te', 'tea', 'tomar_te', 'tomarte'], targetRequired: false, text: (actor, target) => target ? `${actor} comparte un té con ${target}. 🍵` : `${actor} está tomando té. 🍵`, sharedText: (actor, target) => [`${actor} invita a ${target} a tomar el té. 🍵`, `${actor} prepara una taza y la comparte con ${target}.`, `${actor} brinda con su taza junto a ${target}. ☕`, `${actor} disfruta una pausa para el té con ${target}.`, `${actor} le acerca una taza calentita a ${target}.`, `${actor} comparte su té favorito con ${target}.`, `${actor} y ${target} se toman un descanso con té.`, `${actor} sirve otra taza para ${target}.`, `${actor} propone una merienda de té a ${target}.`, `${actor} acompaña a ${target} con una taza de té.`] },
    slap: { endpoint: 'slap', aliases: ['golpear', 'golpe', 'pegar', 'bofetada'], targetRequired: true, text: (actor, target) => `${actor} le dio un golpe de anime a ${target}.`, sharedText: (actor, target) => [`${actor} le dio una bofetada de caricatura a ${target}.`, `${actor} soltó un slap dramático contra ${target}.`, `${actor} le conectó un golpe de anime a ${target}.`, `${actor} hizo volar a ${target} con un manotazo de comedia.`, `${actor} le dio un coscorrón exagerado a ${target}.`, `${actor} sorprendió a ${target} con un golpe de escena.`, `${actor} lanzó un slap con efecto de sonido a ${target}.`, `${actor} le dio un golpe de caricatura a ${target}.`, `${actor} retó a ${target} a un duelo de bofetadas anime.`, `${actor} le dio un manotazo teatral a ${target}.`] },
    hug: { endpoint: 'hug', aliases: ['abrazo', 'abrazar'], targetRequired: true, text: (actor, target) => `${actor} le dio un abrazo a ${target}.` },
    pat: { endpoint: 'pat', aliases: ['acariciar', 'caricia', 'mimos'], targetRequired: true, text: (actor, target) => `${actor} acarició a ${target}.` },
    punch: { endpoint: 'punch', aliases: ['puñetazo', 'punetazo'], targetRequired: true, text: (actor, target) => `${actor} lanzó un puñetazo de anime a ${target}.`, sharedText: (actor, target) => [`${actor} lanzó un puñetazo de anime hacia ${target}.`, `${actor} retó a ${target} a un duelo de puños de caricatura.`, `${actor} sorprendió a ${target} con un golpe cinematográfico.`, `${actor} lanzó un derechazo de anime a ${target}.`, `${actor} hizo retroceder a ${target} con un puñetazo dramático.`, `${actor} protagonizó una escena de pelea con ${target}.`, `${actor} lanzó un golpe al estilo shōnen contra ${target}.`, `${actor} retó a ${target} a intercambiar golpes de anime.`, `${actor} le dio a ${target} un puñetazo de puro drama.`, `${actor} lanzó un golpe de entrenamiento hacia ${target}.`] },
    kick: { endpoint: 'kick', aliases: ['patada', 'patear'], targetRequired: true, text: (actor, target) => `${actor} le lanzó una patada de anime a ${target}.`, sharedText: (actor, target) => [`${actor} lanzó una patada giratoria de anime a ${target}.`, `${actor} retó a ${target} a un duelo de patadas de caricatura.`, `${actor} hizo una entrada dramática con una patada frente a ${target}.`, `${actor} le lanzó una patada voladora a ${target}.`, `${actor} sorprendió a ${target} con una patada de escena.`, `${actor} hizo una patada de entrenamiento junto a ${target}.`, `${actor} lanzó una patada al aire en dirección a ${target}.`, `${actor} protagonizó una coreografía de pelea con ${target}.`, `${actor} le lanzó una patada de puro drama a ${target}.`, `${actor} desafió a ${target} a esquivar su patada anime.`] },
    bite: { endpoint: 'bite', aliases: ['morder', 'mordida'], targetRequired: true, text: (actor, target) => `${actor} mordió a ${target}.`, sharedText: (actor, target) => [`${actor} le dio un mordisquito a ${target}.`, `${actor} amagó con morder a ${target} en una escena de anime.`, `${actor} le dio a ${target} una mordida de caricatura.`, `${actor} sorprendió a ${target} con un mordisquito juguetón.`, `${actor} le mordió suavemente la manga a ${target}.`, `${actor} hizo una travesura y mordió a ${target}.`, `${actor} se acercó a ${target} con ganas de dar un mordisquito.`, `${actor} mordió a ${target} en una escena cómica.`, `${actor} le dio a ${target} un mordisco de anime.`, `${actor} y ${target} protagonizaron una escena de mordisquitos.`] },
    kiss: { endpoint: 'kiss', aliases: ['besar', 'beso'], targetRequired: true, text: (actor, target) => `${actor} le dio un beso a ${target}.` },
    cuddle: { endpoint: 'cuddle', aliases: ['acurrucar', 'acurrucarse'], targetRequired: true, text: (actor, target) => `${actor} se acurrucó con ${target}.` },
    cry: { endpoint: 'cry', aliases: ['llorar', 'lloro'], targetRequired: false, text: (actor, target) => target ? `${actor} llora junto a ${target}.` : `${actor} está llorando.` },
    blush: { endpoint: 'blush', aliases: ['sonrojar', 'sonrojo'], targetRequired: false, text: (actor, target) => target ? `${actor} se sonrojó por ${target}.` : `${actor} se sonrojó.` },
    dance: { endpoint: 'dance', aliases: ['bailar', 'baile'], targetRequired: false, text: (actor, target) => target ? `${actor} sacó a bailar a ${target}.` : `${actor} se puso a bailar.` },
    wave: { endpoint: 'wave', aliases: ['saludar', 'hola'], targetRequired: false, text: (actor, target) => target ? `${actor} saludó a ${target}.` : `${actor} saluda a todos.` },
    wink: { endpoint: 'wink', aliases: ['guiñar', 'guiño'], targetRequired: false, text: (actor, target) => target ? `${actor} le guiñó un ojo a ${target}.` : `${actor} guiñó un ojo.` },
    laugh: { endpoint: 'laugh', aliases: ['reir', 'reír', 'risa'], targetRequired: false, text: (actor, target) => target ? `${actor} se rio con ${target}.` : `${actor} se está riendo.` },
    bonk: { endpoint: 'bonk', aliases: ['coscorrón', 'coscorron'], targetRequired: true, text: (actor, target) => `${actor} le dio un coscorrón de caricatura a ${target}.` },
    shrug: { endpoint: 'shrug', aliases: ['encoger_hombros'], targetRequired: false, text: (actor, target) => target ? `${actor} se encoge de hombros mirando a ${target}.` : `${actor} no sabe qué decir.` },
    nod: { endpoint: 'nod', aliases: ['asentir'], targetRequired: false, text: (actor, target) => target ? `${actor} asiente con la cabeza a ${target}.` : `${actor} asiente con la cabeza.` },
    smug: { endpoint: 'smug', aliases: ['presumir', 'presumido'], targetRequired: false, text: (actor, target) => target ? `${actor} presume frente a ${target} con una sonrisa.` : `${actor} presume con una sonrisa.` },
    bored: { endpoint: 'bored', aliases: ['aburrido', 'aburrida'], targetRequired: false, text: (actor, target) => target ? `${actor} mira a ${target} con cara de aburrimiento.` : `${actor} está aburrido.` },
    confused: { endpoint: 'confused', aliases: ['confundido', 'confundida'], targetRequired: false, text: (actor, target) => target ? `${actor} mira a ${target} sin entender nada.` : `${actor} no entendió nada.` },
    nom: { endpoint: 'nom', aliases: ['comer', 'ñam', 'nyam'], targetRequired: false, text: (actor, target) => target ? `${actor} comparte algo rico con ${target}.` : `${actor} está comiendo algo rico.` },
    yeet: { endpoint: 'yeet', aliases: ['lanzar'], targetRequired: true, text: (actor, target) => `${actor} lanzó a ${target} en una escena de anime.` },
    salute: { endpoint: 'salute', aliases: ['saludo_militar', 'saludar_militar'], targetRequired: false, text: (actor, target) => target ? `${actor} saludó a ${target} con respeto.` : `${actor} saluda con respeto.` },
    angry: { endpoint: 'angry', aliases: ['enojado', 'enojarse', 'molesto'], targetRequired: false, text: (actor, target) => target ? `${actor} se indignó frente a ${target}.` : `${actor} está molesto.` },
    baka: { endpoint: 'baka', aliases: ['tonto', 'broma_baka'], targetRequired: false, text: (actor, target) => target ? `${actor} le hizo una broma baka a ${target}.` : `${actor} tuvo un momento baka.` },
    bleh: { endpoint: 'bleh', aliases: ['lengua', 'mueca'], targetRequired: false, text: (actor, target) => target ? `${actor} le sacó la lengua a ${target}.` : `${actor} hizo una mueca y sacó la lengua.` },
    blowkiss: { endpoint: 'blowkiss', aliases: ['beso_volado', 'mandar_beso'], targetRequired: true, text: (actor, target) => `${actor} le mandó un beso volado a ${target}.` },
    carry: { endpoint: 'carry', aliases: ['cargar', 'cargar_a'], targetRequired: true, text: (actor, target) => `${actor} llevó a ${target} en brazos.` },
    clap: { endpoint: 'clap', aliases: ['aplaudir', 'aplausos'], targetRequired: false, text: (actor, target) => target ? `${actor} aplaudió a ${target}.` : `${actor} aplaude con entusiasmo.` },
    facepalm: { endpoint: 'facepalm', aliases: ['palma_cara', 'vergüenza_ajena'], targetRequired: false, text: (actor, target) => target ? `${actor} hizo facepalm por ${target}.` : `${actor} no puede creer lo que acaba de ver.` },
    feed: { endpoint: 'feed', aliases: ['dar_de_comer', 'alimentar'], targetRequired: true, text: (actor, target) => `${actor} le compartió algo rico a ${target}.` },
    handhold: { endpoint: 'handhold', aliases: ['tomar_mano', 'agarrar_mano'], targetRequired: true, text: (actor, target) => `${actor} tomó de la mano a ${target}.` },
    handshake: { endpoint: 'handshake', aliases: ['apretón', 'apreton', 'estrechar_mano'], targetRequired: true, text: (actor, target) => `${actor} saludó a ${target} con un apretón de manos.` },
    highfive: { endpoint: 'highfive', aliases: ['chocar_manos', 'choca_esos_cinco'], targetRequired: true, text: (actor, target) => `${actor} chocó esos cinco con ${target}.` },
    kabedon: { endpoint: 'kabedon', aliases: ['pared_anime'], targetRequired: true, text: (actor, target) => `${actor} hizo un kabedon dramático frente a ${target}.` },
    lappillow: { endpoint: 'lappillow', aliases: ['regazo', 'almohada_regazo'], targetRequired: true, text: (actor, target) => `${actor} le ofreció su regazo a ${target} para descansar.` },
    peck: { endpoint: 'peck', aliases: ['besito', 'piquito'], targetRequired: true, text: (actor, target) => `${actor} le dio un besito en la mejilla a ${target}.` },
    poke: { endpoint: 'poke', aliases: ['picar', 'picotear'], targetRequired: true, text: (actor, target) => `${actor} le dio un toquecito a ${target}.` },
    pout: { endpoint: 'pout', aliases: ['puchero', 'hacer_puchero'], targetRequired: false, text: (actor, target) => target ? `${actor} hizo puchero frente a ${target}.` : `${actor} hace puchero.` },
    run: { endpoint: 'run', aliases: ['correr', 'huir'], targetRequired: false, text: (actor, target) => target ? `${actor} salió corriendo junto a ${target}.` : `${actor} salió corriendo a toda velocidad.` },
    shocked: { endpoint: 'shocked', aliases: ['impactado', 'sorprendido'], targetRequired: false, text: (actor, target) => target ? `${actor} se quedó en shock por lo que hizo ${target}.` : `${actor} se quedó en shock.` },
    spin: { endpoint: 'spin', aliases: ['girar', 'dar_vueltas'], targetRequired: false, text: (actor, target) => target ? `${actor} dio una vuelta alrededor de ${target}.` : `${actor} empezó a dar vueltas.` },
    think: { endpoint: 'think', aliases: ['pensar', 'reflexionar'], targetRequired: false, text: (actor, target) => target ? `${actor} se quedó pensando en ${target}.` : `${actor} está pensando.` },
};
const lookup = new Map();
for (const [id, definition] of Object.entries(definitions)) {
    lookup.set(id, id);
    for (const alias of definition.aliases)
        lookup.set(alias, id);
}
const lastRequest = new Map();
const lastCategoryRequest = new Map();
const REQUEST_COOLDOWN_MS = 2_500;
const API_BASE = 'https://nekos.best/api/v2';
export function findAnimeReaction(command) { return lookup.get(command.normalize('NFC').toLocaleLowerCase()); }
export function animeReactionCatalog() {
    return Object.entries(definitions).map(([id, definition]) => ({ id, aliases: definition.aliases, targetRequired: definition.targetRequired, variants: 10 }));
}
const captionStyles = [
    (line) => line,
    (line) => `🎬 Escena anime: ${line}`,
    (line) => `✨ ¡Momento Manzanita! ${line}`,
    (line) => `La cámara enfoca: ${line}`,
    (line) => `💫 Cambio de escena: ${line}`,
    (line) => `Con todo el dramatismo: ${line}`,
    (line) => `El episodio de hoy incluye esto: ${line}`,
    (line) => `🌿 Reacción del día: ${line}`,
    (line) => `¡Que suene el opening! ${line}`,
    (line) => `Un fotograma memorable: ${line}`,
];
export async function createAnimeReaction(id, actor, target, cooldownKey) {
    const definition = definitions[id];
    if (definition.targetRequired && !target)
        return { ok: false, reason: 'target_required' };
    if (target && actor === target)
        return { ok: false, reason: 'self' };
    const now = Date.now();
    const previous = lastRequest.get(cooldownKey) ?? 0;
    if (now - previous < REQUEST_COOLDOWN_MS)
        return { ok: false, reason: 'cooldown', seconds: Math.ceil((REQUEST_COOLDOWN_MS - (now - previous)) / 1000) };
    const categoryPrevious = lastCategoryRequest.get(id) ?? 0;
    if (now - categoryPrevious < 310)
        return { ok: false, reason: 'cooldown', seconds: 1 };
    if (lastRequest.size > 4_000) {
        for (const [key, time] of lastRequest)
            if (now - time > 60_000)
                lastRequest.delete(key);
    }
    lastRequest.set(cooldownKey, now);
    lastCategoryRequest.set(id, now);
    try {
        const response = await fetch(`${API_BASE}/${definition.endpoint}`, {
            headers: { 'User-Agent': 'BotManzanita (https://discord.com/oauth2/authorize?client_id=1567009025529352263&scope=bot)', Accept: 'application/json' },
            signal: AbortSignal.timeout(7_000),
        });
        if (!response.ok)
            return { ok: false, reason: 'unavailable' };
        const payload = await response.json();
        const image = payload.results?.[0];
        if (!image?.url)
            return { ok: false, reason: 'unavailable' };
        const imageUrl = new URL(image.url);
        if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'nekos.best' || !imageUrl.pathname.toLowerCase().endsWith('.gif'))
            return { ok: false, reason: 'unavailable' };
        const sharedTexts = target && definition.sharedText ? definition.sharedText(actor, target) : undefined;
        const interaction = sharedTexts?.length
            ? sharedTexts[randomInt(sharedTexts.length)]
            : definition.text(actor, target);
        const caption = captionStyles[randomInt(captionStyles.length)](interaction);
        const embed = new EmbedBuilder()
            .setColor(0x9b78e8)
            .setDescription(caption)
            .setImage(imageUrl.toString())
            .setFooter({ text: image.anime_name ? `🎬 ${image.anime_name} · GIF: NEKOS.BEST` : 'GIF: NEKOS.BEST' });
        return { ok: true, embed };
    }
    catch {
        return { ok: false, reason: 'unavailable' };
    }
}
