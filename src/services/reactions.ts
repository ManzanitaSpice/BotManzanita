import { randomInt } from 'node:crypto';
import { EmbedBuilder } from 'discord.js';

export type AnimeReactionId = 'happy' | 'sip' | 'slap' | 'hug' | 'pat' | 'punch' | 'kick' | 'bite' | 'kiss' | 'cuddle' | 'cry' | 'blush' | 'dance' | 'wave' | 'wink' | 'laugh' | 'bonk' | 'shrug' | 'nod' | 'smug' | 'bored' | 'confused' | 'nom' | 'yeet' | 'salute' | 'angry' | 'baka' | 'bleh' | 'blowkiss' | 'carry' | 'clap' | 'facepalm' | 'feed' | 'handhold' | 'handshake' | 'highfive' | 'kabedon' | 'lappillow' | 'peck' | 'poke' | 'pout' | 'run' | 'shocked' | 'spin' | 'think';
type ReactionDefinition = { endpoint: string; aliases: string[]; targetRequired: boolean; text: (actor: string, target?: string) => string; sharedText?: (actor: string, target: string) => string[] };

const definitions: Record<AnimeReactionId, ReactionDefinition> = {
  happy: { endpoint: 'happy', aliases: ['feliz', 'felicidad'], targetRequired: false, text: (actor, target) => target ? `${actor} celebró con ${target}; hoy sí salió una bien.` : `${actor} está tan feliz que hasta contestó los mensajes.` },
  sip: { endpoint: 'sip', aliases: ['te', 'tea', 'tomar_te', 'tomarte'], targetRequired: false, text: (actor, target) => target ? `${actor} comparte un té con ${target}. 🍵` : `${actor} está tomando té. 🍵`, sharedText: (actor, target) => [`${actor} invita a ${target} a tomar el té. 🍵`, `${actor} prepara una taza y la comparte con ${target}.`, `${actor} brinda con su taza junto a ${target}. ☕`, `${actor} disfruta una pausa para el té con ${target}.`, `${actor} le acerca una taza calentita a ${target}.`, `${actor} comparte su té favorito con ${target}.`, `${actor} y ${target} se toman un descanso con té.`, `${actor} sirve otra taza para ${target}.`, `${actor} propone una merienda de té a ${target}.`, `${actor} acompaña a ${target} con una taza de té.`] },
  slap: { endpoint: 'slap', aliases: ['golpear', 'golpe', 'pegar', 'bofetada'], targetRequired: true, text: (actor, target) => `${actor} le dio un golpe a ${target}.`, sharedText: (actor, target) => [`${actor} le dio un manotazo a ${target}; el eco llegó primero al otro canal.`, `${actor} le acomodó las ideas a ${target} de un bofetón.`, `${actor} le soltó un cachetadón a ${target}. El árbitro pide repetición.`, `${actor} le dio una palmada a ${target} con demasiada confianza.`, `${actor} sorprendió a ${target} con un golpe y luego preguntó “¿todo bien?”.`, `${actor} le dio un manotazo a ${target}. La dignidad salió del servidor.`, `${actor} le plantó un bofetón a ${target}; el chat exige VAR.`, `${actor} le dio un golpe a ${target} y ahora ambos fingen que no pasó.`, `${actor} le acomodó el fleco a ${target} con la mano abierta.`, `${actor} le propinó a ${target} el clásico “piensa antes de escribir”.`] },
  hug: { endpoint: 'hug', aliases: ['abrazo', 'abrazar'], targetRequired: true, text: (actor, target) => `${actor} le dio un abrazo a ${target}.` },
  pat: { endpoint: 'pat', aliases: ['acariciar', 'caricia', 'mimos'], targetRequired: true, text: (actor, target) => `${actor} acarició a ${target}.` },
  punch: { endpoint: 'punch', aliases: ['puñetazo', 'punetazo'], targetRequired: true, text: (actor, target) => `${actor} le dio un puñetazo a ${target}.`, sharedText: (actor, target) => [`${actor} le dio un puñetazo a ${target}; se escuchó hasta en el chat de voz.`, `${actor} lanzó un derechazo y ${target} pidió que lo repitieran en cámara lenta.`, `${actor} retó a ${target} a resolverlo con piedra, papel o puñetazo.`, `${actor} soltó un golpe y luego revisó si tenía las manos bien.`, `${actor} le dio a ${target} el puñetazo más innecesariamente dramático del día.`, `${actor} lanzó un puñetazo; ${target} esquivó con el poder de la lag.`, `${actor} le dio un golpe a ${target}. El teclado presentó una queja.`, `${actor} retó a ${target} a un duelo y olvidó las reglas.`, `${actor} lanzó el puño; el sentido común llegó tarde.`, `${actor} le dio un puñetazo a ${target} y ambos culparon al ping.`] },
  kick: { endpoint: 'kick', aliases: ['patada', 'patear'], targetRequired: true, text: (actor, target) => `${actor} le lanzó una patada a ${target}.`, sharedText: (actor, target) => [`${actor} le lanzó una patada a ${target}; el árbitro pide VAR.`, `${actor} hizo una patada voladora y aterrizó con cero elegancia.`, `${actor} retó a ${target} a esquivar una patada que todavía no decide lanzar.`, `${actor} le soltó una patada a ${target}. El ping se llevó parte del impacto.`, `${actor} intentó una patada giratoria y casi se golpea a sí mismo.`, `${actor} lanzó una patada; ${target} ya está redactando el reporte.`, `${actor} pateó el aire junto a ${target}. El aire no se lo esperaba.`, `${actor} le lanzó a ${target} una patada con puntería de lunes.`, `${actor} hizo una patada tan dramática que el chat pidió subtítulos.`, `${actor} desafió a ${target} a esquivar su patada. No había premio.`] },
  bite: { endpoint: 'bite', aliases: ['morder', 'mordida'], targetRequired: true, text: (actor, target) => `${actor} le dio un mordisquito a ${target}.`, sharedText: (actor, target) => [`${actor} le dio un mordisquito a ${target}. No se aceptan devoluciones.`, `${actor} amenazó con morder a ${target}; el snack de emergencia sigue intacto.`, `${actor} mordió la manga de ${target} porque claramente era una botana.`, `${actor} sorprendió a ${target} con un mordisquito y cara de inocencia.`, `${actor} le dio a ${target} una mordida pequeña, pero con mucha actitud.`, `${actor} intentó morder a ${target}; el dentista del servidor está preocupado.`, `${actor} mordió a ${target} y ahora ofrece disculpas con galletas.`, `${actor} se acercó a ${target} con cara de “esto no es lo que parece”.`, `${actor} le dio un mordisco a ${target}; la botana oficial levantó una queja.`, `${actor} y ${target} negociaron la mordida con términos y condiciones.`] },
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
  yeet: { endpoint: 'yeet', aliases: ['lanzar'], targetRequired: true, text: (actor, target) => `${actor} lanzó a ${target}. La física ya presentó su renuncia.` },
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
  kabedon: { endpoint: 'kabedon', aliases: ['pared'], targetRequired: true, text: (actor, target) => `${actor} puso una mano junto a ${target} contra la pared. El comité de telenovelas pide calma.` },
  lappillow: { endpoint: 'lappillow', aliases: ['regazo', 'almohada_regazo'], targetRequired: true, text: (actor, target) => `${actor} le ofreció su regazo a ${target} para descansar.` },
  peck: { endpoint: 'peck', aliases: ['besito', 'piquito'], targetRequired: true, text: (actor, target) => `${actor} le dio un besito en la mejilla a ${target}.` },
  poke: { endpoint: 'poke', aliases: ['picar', 'picotear'], targetRequired: true, text: (actor, target) => `${actor} le dio un toquecito a ${target}.` },
  pout: { endpoint: 'pout', aliases: ['puchero', 'hacer_puchero'], targetRequired: false, text: (actor, target) => target ? `${actor} hizo puchero frente a ${target}.` : `${actor} hace puchero.` },
  run: { endpoint: 'run', aliases: ['correr', 'huir'], targetRequired: false, text: (actor, target) => target ? `${actor} salió corriendo junto a ${target}.` : `${actor} salió corriendo a toda velocidad.` },
  shocked: { endpoint: 'shocked', aliases: ['impactado', 'sorprendido'], targetRequired: false, text: (actor, target) => target ? `${actor} se quedó en shock por lo que hizo ${target}.` : `${actor} se quedó en shock.` },
  spin: { endpoint: 'spin', aliases: ['girar', 'dar_vueltas'], targetRequired: false, text: (actor, target) => target ? `${actor} dio una vuelta alrededor de ${target}.` : `${actor} empezó a dar vueltas.` },
  think: { endpoint: 'think', aliases: ['pensar', 'reflexionar'], targetRequired: false, text: (actor, target) => target ? `${actor} se quedó pensando en ${target}.` : `${actor} está pensando.` },
};

const lookup = new Map<string, AnimeReactionId>();
for (const [id, definition] of Object.entries(definitions) as Array<[AnimeReactionId, ReactionDefinition]>) {
  lookup.set(id, id);
  for (const alias of definition.aliases) lookup.set(alias, id);
}
const lastRequest = new Map<string, number>();
const lastCategoryRequest = new Map<AnimeReactionId, number>();
const REQUEST_COOLDOWN_MS = 2_500;
const API_BASE = 'https://nekos.best/api/v2';

export function findAnimeReaction(command: string): AnimeReactionId | undefined { return lookup.get(command.normalize('NFC').toLocaleLowerCase()); }
export function animeReactionCatalog(): Array<{ id: AnimeReactionId; aliases: string[]; targetRequired: boolean; variants: number }> {
  return (Object.entries(definitions) as Array<[AnimeReactionId, ReactionDefinition]>).map(([id, definition]) => ({ id, aliases: definition.aliases, targetRequired: definition.targetRequired, variants: 10 }));
}

const captionStyles = [
  (line: string) => `🚨 El chat solicita explicaciones: ${line}`,
  (line: string) => `📋 El comité de convivencia tomó nota: ${line}`,
  (line: string) => `Los testigos dicen que fue “sin querer”: ${line}`,
  (line: string) => `Última hora: nadie estaba preparado para esto. ${line}`,
  (line: string) => `La moderación está redactando el reporte: ${line}`,
  (line: string) => `El grupo familiar ya se enteró: ${line}`,
  (line: string) => `Se escuchó un “yo no fui” a lo lejos. ${line}`,
  (line: string) => `Esto se pudo resolver con una galleta, pero: ${line}`,
  (line: string) => `El sentido común llegó tarde. ${line}`,
  (line: string) => `Quedó registrado en el acta de asuntos pendientes: ${line}`,
];

export async function createAnimeReaction(id: AnimeReactionId, actor: string, target: string | undefined, cooldownKey: string): Promise<
  { ok: true; embed: EmbedBuilder } | { ok: false; reason: 'target_required' | 'self' | 'cooldown' | 'unavailable'; seconds?: number }
> {
  const definition = definitions[id];
  if (definition.targetRequired && !target) return { ok: false, reason: 'target_required' };
  if (target && actor === target) return { ok: false, reason: 'self' };
  const now = Date.now(); const previous = lastRequest.get(cooldownKey) ?? 0;
  if (now - previous < REQUEST_COOLDOWN_MS) return { ok: false, reason: 'cooldown', seconds: Math.ceil((REQUEST_COOLDOWN_MS - (now - previous)) / 1000) };
  const categoryPrevious = lastCategoryRequest.get(id) ?? 0;
  if (now - categoryPrevious < 310) return { ok: false, reason: 'cooldown', seconds: 1 };
  if (lastRequest.size > 4_000) {
    for (const [key, time] of lastRequest) if (now - time > 60_000) lastRequest.delete(key);
  }
  lastRequest.set(cooldownKey, now);
  lastCategoryRequest.set(id, now);
  try {
    const response = await fetch(`${API_BASE}/${definition.endpoint}`, {
      headers: { 'User-Agent': 'BotManzanita (https://discord.com/oauth2/authorize?client_id=1567009025529352263&scope=bot)', Accept: 'application/json' },
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    const payload = await response.json() as { results?: Array<{ url?: string }> };
    const image = payload.results?.[0];
    if (!image?.url) return { ok: false, reason: 'unavailable' };
    const imageUrl = new URL(image.url);
    if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'nekos.best' || !imageUrl.pathname.toLowerCase().endsWith('.gif')) return { ok: false, reason: 'unavailable' };
    const sharedTexts = target && definition.sharedText ? definition.sharedText(actor, target) : undefined;
    const interaction = sharedTexts?.length
      ? sharedTexts[randomInt(sharedTexts.length)]!
      : definition.text(actor, target);
    const caption = captionStyles[randomInt(captionStyles.length)]!(interaction);
    const embed = new EmbedBuilder()
      .setColor(0x9b78e8)
      .setDescription(caption)
      .setImage(imageUrl.toString())
      .setFooter({ text: 'GIF: NEKOS.BEST' });
    return { ok: true, embed };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
