import { randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';

export type AnimeReactionId = 'happy' | 'sip' | 'slap' | 'hug' | 'pat' | 'punch' | 'kick' | 'bite' | 'kiss' | 'cuddle' | 'cry' | 'blush' | 'dance' | 'wave' | 'wink' | 'laugh' | 'bonk' | 'shrug' | 'nod' | 'smug' | 'bored' | 'confused' | 'nom' | 'yeet' | 'salute' | 'angry' | 'baka' | 'bleh' | 'blowkiss' | 'carry' | 'clap' | 'facepalm' | 'feed' | 'handhold' | 'handshake' | 'highfive' | 'kabedon' | 'lappillow' | 'peck' | 'poke' | 'pout' | 'run' | 'shocked' | 'spin' | 'think' | 'sleep' | 'smile' | 'yawn' | 'stare' | 'lurk' | 'nope' | 'nya' | 'teehee' | 'thumbsup' | 'tickle' | 'wag' | 'shoot' | 'tableflip' | 'shake' | 'hello' | 'hi' | 'bye' | 'goodbye' | 'goodmorning' | 'goodnight' | 'welcome' | 'congrats' | 'celebrate' | 'sorry' | 'comfort' | 'love' | 'missyou' | 'goodluck' | 'cheer' | 'yay' | 'proud' | 'relax' | 'excited' | 'thanks' | 'cacawe' | 'peek' | 'boop' | 'gasp' | 'headpat' | 'cheerup' | 'panic' | 'snooze' | 'giggle' | 'grin' | 'stretch';
type ReactionDefinition = { endpoint?: string; localAsset?: string; aliases: string[]; targetRequired: boolean; text: (actor: string, target?: string) => string; sharedText?: (actor: string, target: string) => string[] };

const definitions: Record<AnimeReactionId, ReactionDefinition> = {
  cacawe: { localAsset: 'cacawe.gif', aliases: ['cacawe', 'caca'], targetRequired: false, text: (actor, target) => target ? `${actor} hizo cacawe con ${target}.` : `${actor} hizo cacawe.` },
  happy: { endpoint: 'happy', aliases: ['feliz', 'felicidad'], targetRequired: false, text: (actor, target) => target ? `${actor} celebra con ${target}.` : `${actor} está feliz.` },
  sip: { endpoint: 'sip', aliases: ['te', 'tea', 'tomar_te', 'tomarte'], targetRequired: false, text: (actor, target) => target ? `${actor} comparte té con ${target}. 🍵` : `${actor} toma té. 🍵`, sharedText: (actor, target) => [`${actor} sirve té a ${target}. 🍵`, `${actor} brinda con ${target}. ☕`, `${actor} comparte una taza con ${target}.`, `${actor} toma té con ${target}.`, `${actor} invita a ${target} a tomar té.`, `${actor} ofrece té a ${target}.`, `${actor} y ${target} hacen una pausa para el té.`, `${actor} prepara té para ${target}.`, `${actor} disfruta té con ${target}.`, `${actor} acompaña a ${target} con una taza.`] },
  slap: { endpoint: 'slap', aliases: ['golpear', 'golpe', 'pegar', 'bofetada'], targetRequired: true, text: (actor, target) => `${actor} abofeteó a ${target}.`, sharedText: (actor, target) => [`${actor} abofeteó a ${target}.`, `${actor} le dio una cachetada a ${target}.`, `${actor} le soltó un bofetón a ${target}.`, `${actor} le dio un manotazo a ${target}.`, `${actor} sorprendió a ${target} con una cachetada.`, `${actor} le dio una palmada a ${target}.`, `${actor} le acomodó el fleco a ${target}.`, `${actor} le dio un golpe a ${target}.`, `${actor} golpeó a ${target}; pide repetición el árbitro.`, `${actor} abofeteó a ${target}; el chat pide VAR.`] },
  hug: { endpoint: 'hug', aliases: ['abrazo', 'abrazar'], targetRequired: true, text: (actor, target) => `${actor} le dio un abrazo a ${target}.` },
  pat: { endpoint: 'pat', aliases: ['acariciar', 'caricia', 'mimos'], targetRequired: true, text: (actor, target) => `${actor} acarició a ${target}.` },
  punch: { endpoint: 'punch', aliases: ['puñetazo', 'punetazo'], targetRequired: true, text: (actor, target) => `${actor} golpeó a ${target}.`, sharedText: (actor, target) => [`${actor} golpeó a ${target}.`, `${actor} le dio un puñetazo a ${target}.`, `${actor} lanzó un derechazo a ${target}.`, `${actor} retó a ${target} a un duelo.`, `${actor} atacó a ${target}; el ping ayudó a esquivar.`, `${actor} lanzó un puñetazo a ${target}.`, `${actor} le dio un golpe a ${target}.`, `${actor} y ${target} iniciaron un duelo.`, `${actor} lanzó el puño contra ${target}.`, `${actor} dio un puñetazo a ${target}.`] },
  kick: { endpoint: 'kick', aliases: ['patada', 'patear'], targetRequired: true, text: (actor, target) => `${actor} pateó a ${target}.`, sharedText: (actor, target) => [`${actor} pateó a ${target}.`, `${actor} le lanzó una patada a ${target}.`, `${actor} intentó una patada voladora.`, `${actor} retó a ${target} a esquivar.`, `${actor} soltó una patada a ${target}.`, `${actor} lanzó una patada giratoria.`, `${actor} pateó el aire junto a ${target}.`, `${actor} atacó a ${target} con una patada.`, `${actor} falló la patada frente a ${target}.`, `${actor} desafió a ${target} a esquivar.`] },
  bite: { endpoint: 'bite', aliases: ['morder', 'mordida'], targetRequired: true, text: (actor, target) => `${actor} mordió a ${target}.`, sharedText: (actor, target) => [`${actor} mordió a ${target}.`, `${actor} le dio un mordisquito a ${target}.`, `${actor} intentó morder a ${target}.`, `${actor} mordió la manga de ${target}.`, `${actor} sorprendió a ${target} con una mordida.`, `${actor} le dio una mordida a ${target}.`, `${actor} ofreció galletas a ${target} después de morderle.`, `${actor} se acercó a ${target} con cara inocente.`, `${actor} mordió a ${target}; sin devoluciones.`, `${actor} y ${target} negociaron la mordida.`] },
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
  sleep: { endpoint: 'sleep', aliases: ['dormir', 'siesta'], targetRequired: false, text: (actor, target) => target ? `${actor} se quedó dormido mientras ${target} explicaba el chisme.` : `${actor} se fue a dormir; que el chat se cuide solo.` },
  smile: { endpoint: 'smile', aliases: ['sonreir', 'sonreír', 'sonrisa'], targetRequired: false, text: (actor, target) => target ? `${actor} le sonrió a ${target}; ya mejoró el ambiente.` : `${actor} apareció con una sonrisa sospechosamente tranquila.` },
  yawn: { endpoint: 'yawn', aliases: ['bostezar', 'bostezo'], targetRequired: false, text: (actor, target) => target ? `${actor} bostezó mientras ${target} contaba una historia larguísima.` : `${actor} soltó un bostezo que contagió a medio chat.` },
  stare: { endpoint: 'stare', aliases: ['mirar_fijo', 'mirada'], targetRequired: false, text: (actor, target) => target ? `${actor} se quedó mirando a ${target} en completo silencio.` : `${actor} mira fijamente al vacío esperando una respuesta.` },
  lurk: { endpoint: 'lurk', aliases: ['acechar', 'vigilar'], targetRequired: false, text: (actor, target) => target ? `${actor} apareció silenciosamente detrás de ${target}.` : `${actor} está leyendo el chat sin hacer ruido.` },
  nope: { endpoint: 'nope', aliases: ['nel', 'negativo'], targetRequired: false, text: (actor, target) => target ? `${actor} respondió “ni de broma” a ${target}.` : `${actor} acaba de votar que no, sin explicar por qué.` },
  nya: { endpoint: 'nya', aliases: ['miau', 'nyaa'], targetRequired: false, text: (actor, target) => target ? `${actor} saludó a ${target} con un “nya”.` : `${actor} soltó un “nya” y siguió con su día.` },
  teehee: { endpoint: 'teehee', aliases: ['jeje', 'risita'], targetRequired: false, text: (actor, target) => target ? `${actor} se rio bajito después de lo que dijo ${target}.` : `${actor} soltó una risita y no piensa explicar el motivo.` },
  thumbsup: { endpoint: 'thumbsup', aliases: ['pulgar_arriba', 'bien_hecho'], targetRequired: false, text: (actor, target) => target ? `${actor} le dio el visto bueno a ${target}. 👍` : `${actor} aprueba el plan con un pulgar arriba. 👍` },
  tickle: { endpoint: 'tickle', aliases: ['hacer_cosquillas', 'cosquillas'], targetRequired: true, text: (actor, target) => `${actor} le hizo cosquillas a ${target}; se cancela toda conversación seria.` },
  wag: { endpoint: 'wag', aliases: ['mover_colita', 'cola'], targetRequired: false, text: (actor, target) => target ? `${actor} movió la cola al ver a ${target}.` : `${actor} está tan feliz que no puede dejar quieta la cola.` },
  shoot: { endpoint: 'shoot', aliases: ['disparar'], targetRequired: true, text: (actor, target) => `${actor} retó a ${target} a un duelo de pistolas de agua.` },
  tableflip: { endpoint: 'tableflip', aliases: ['voltear_mesa', 'voltearmesa'], targetRequired: false, text: (actor) => `${actor} volteó la mesa. El inventario de muebles presentará cargos.` },
  shake: { endpoint: 'shake', aliases: ['sacudir', 'temblar'], targetRequired: true, text: (actor, target) => `${actor} sacudió a ${target} para que volviera al tema.` },
  hello: { endpoint: 'wave', aliases: ['buenas', 'holi'], targetRequired: false, text: (actor, target) => target ? `${actor} llegó y saludó a ${target} con entusiasmo.` : `${actor} llegó al chat y dijo hola.` },
  hi: { endpoint: 'wave', aliases: ['hey', 'que_hay'], targetRequired: false, text: (actor, target) => target ? `${actor} le dijo “¡hey!” a ${target}.` : `${actor} saludó al chat con un “¡hey!”.` },
  bye: { endpoint: 'wave', aliases: ['adios', 'adiós', 'hasta_luego', 'nos_vemos'], targetRequired: false, text: (actor, target) => target ? `${actor} se despidió de ${target}; nos vemos pronto.` : `${actor} se despidió del chat. ¡Hasta luego!` },
  goodbye: { endpoint: 'wave', aliases: ['chao', 'hasta_pronto', 'despedida'], targetRequired: false, text: (actor, target) => target ? `${actor} le dijo adiós a ${target} con cariño.` : `${actor} cerró la sesión con una despedida dramática.` },
  goodmorning: { endpoint: 'wave', aliases: ['buenos_dias', 'buenosdias'], targetRequired: false, text: (actor, target) => target ? `${actor} le deseó buenos días a ${target}.` : `${actor} llegó con un alegre “¡buenos días!”.` },
  goodnight: { endpoint: 'sleep', aliases: ['buenas_noches', 'buenasnoches'], targetRequired: false, text: (actor, target) => target ? `${actor} le deseó buenas noches a ${target}.` : `${actor} se despidió hasta mañana y se fue a dormir.` },
  welcome: { endpoint: 'wave', aliases: ['bienvenido', 'bienvenida', 'dar_la_bienvenida'], targetRequired: false, text: (actor, target) => target ? `${actor} le dio la bienvenida a ${target}.` : `${actor} dio la bienvenida a todas las personas que llegaron.` },
  congrats: { endpoint: 'clap', aliases: ['felicidades', 'felicitar'], targetRequired: false, text: (actor, target) => target ? `${actor} felicitó a ${target} por su logro. ¡Bien hecho!` : `${actor} celebró un logro del chat. ¡Felicidades!` },
  celebrate: { endpoint: 'dance', aliases: ['celebrar', 'festejar'], targetRequired: false, text: (actor, target) => target ? `${actor} se puso a festejar con ${target}. ¡Que siga la celebración!` : `${actor} empezó a celebrar como si fuera viernes.` },
  sorry: { endpoint: 'cry', aliases: ['perdon', 'perdón', 'disculparse', 'lo_siento'], targetRequired: false, text: (actor, target) => target ? `${actor} le pidió disculpas a ${target}; promete portarse mejor.` : `${actor} ofreció una disculpa sincera al chat.` },
  comfort: { endpoint: 'hug', aliases: ['consolar', 'consuelo'], targetRequired: false, text: (actor, target) => target ? `${actor} acompañó a ${target} con un abrazo reconfortante.` : `${actor} dejó un abrazo reconfortante para quien lo necesite.` },
  love: { endpoint: 'kiss', aliases: ['amor', 'te_amo', 'te_quiero'], targetRequired: false, text: (actor, target) => target ? `${actor} le mandó mucho cariño a ${target}.` : `${actor} mandó amor para todo el chat.` },
  missyou: { endpoint: 'cuddle', aliases: ['te_extraño', 'te_extrano', 'extrañar', 'extranar'], targetRequired: false, text: (actor, target) => target ? `${actor} extrañaba a ${target} y fue a buscar un abrazo.` : `${actor} extraña a alguien y dejó un abrazo pendiente.` },
  goodluck: { endpoint: 'salute', aliases: ['buena_suerte', 'suerte'], targetRequired: false, text: (actor, target) => target ? `${actor} le deseó mucha suerte a ${target}.` : `${actor} desea buena suerte a quienes la necesiten.` },
  cheer: { endpoint: 'clap', aliases: ['animar', 'animo', 'ánimo'], targetRequired: false, text: (actor, target) => target ? `${actor} animó a ${target}: ¡tú puedes!` : `${actor} animó al chat con toda su energía.` },
  yay: { endpoint: 'happy', aliases: ['yupi', 'hurra'], targetRequired: false, text: (actor, target) => target ? `${actor} celebró con ${target}: ¡yupi!` : `${actor} gritó “¡yupi!” de pura felicidad.` },
  proud: { endpoint: 'smug', aliases: ['orgulloso', 'orgullosa', 'orgullo'], targetRequired: false, text: (actor, target) => target ? `${actor} está orgulloso de ${target}.` : `${actor} se siente orgulloso de lo que logró.` },
  relax: { endpoint: 'sip', aliases: ['relajarse', 'relajacion', 'relajación'], targetRequired: false, text: (actor, target) => target ? `${actor} invitó a ${target} a tomarse un respiro.` : `${actor} se tomó una pausa para relajarse.` },
  excited: { endpoint: 'happy', aliases: ['emocionado', 'emocionada', 'emocion'], targetRequired: false, text: (actor, target) => target ? `${actor} se emocionó muchísimo por ${target}.` : `${actor} no puede contener la emoción.` },
  thanks: { endpoint: 'thumbsup', aliases: ['gracias', 'agradecer'], targetRequired: false, text: (actor, target) => target ? `${actor} le dio las gracias a ${target}.` : `${actor} agradeció la buena onda del chat.` },
  peek: { endpoint: 'lurk', aliases: ['asomar', 'espiar'], targetRequired: false, text: (actor, target) => target ? `${actor} se asomó para ver qué hacía ${target}.` : `${actor} se asomó discretamente al chat.` },
  boop: { endpoint: 'poke', aliases: ['toque_nariz', 'tocarnariz'], targetRequired: true, text: (actor, target) => `${actor} le dio un toque en la nariz a ${target}.` },
  gasp: { endpoint: 'shocked', aliases: ['jadear', 'sorpresa'], targetRequired: false, text: (actor, target) => target ? `${actor} se sorprendió por ${target}.` : `${actor} soltó un “¡ah!” de sorpresa.` },
  headpat: { endpoint: 'pat', aliases: ['mimo_cabeza', 'palmadita_cabeza'], targetRequired: true, text: (actor, target) => `${actor} le dio una palmadita en la cabeza a ${target}.` },
  cheerup: { endpoint: 'clap', aliases: ['echar_porras', 'levantar_animo'], targetRequired: true, text: (actor, target) => `${actor} le echó porras a ${target}: ¡tú puedes!` },
  panic: { endpoint: 'run', aliases: ['panico', 'entrar_panico'], targetRequired: false, text: (actor, target) => target ? `${actor} entró en pánico junto a ${target}.` : `${actor} entró en pánico y salió corriendo.` },
  snooze: { endpoint: 'sleep', aliases: ['dormitar', 'siestita'], targetRequired: false, text: (actor, target) => target ? `${actor} se quedó dormitando junto a ${target}.` : `${actor} se quedó dormitando un ratito.` },
  giggle: { endpoint: 'teehee', aliases: ['risita_tonta', 'reirse_bajito'], targetRequired: false, text: (actor, target) => target ? `${actor} soltó una risita con ${target}.` : `${actor} soltó una risita.` },
  grin: { endpoint: 'smile', aliases: ['sonrisa_grande', 'sonreir_amplio'], targetRequired: false, text: (actor, target) => target ? `${actor} le sonrió ampliamente a ${target}.` : `${actor} sonrió de oreja a oreja.` },
  stretch: { endpoint: 'yawn', aliases: ['estirarse', 'desperezarse'], targetRequired: false, text: (actor, target) => target ? `${actor} se estiró junto a ${target}.` : `${actor} se desperezó después de una siesta.` },
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
  return (Object.entries(definitions) as Array<[AnimeReactionId, ReactionDefinition]>).map(([id, definition]) => ({ id, aliases: definition.aliases, targetRequired: definition.targetRequired, variants: definition.localAsset ? 1 : 10 }));
}

export async function createAnimeReaction(id: AnimeReactionId, actor: string, target: string | undefined, cooldownKey: string): Promise<
  { ok: true; embed: EmbedBuilder; files?: AttachmentBuilder[] } | { ok: false; reason: 'target_required' | 'cooldown' | 'unavailable'; seconds?: number }
> {
  const definition = definitions[id];
  if (definition.targetRequired && !target) return { ok: false, reason: 'target_required' };
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
    let imageUrl: string;
    let files: AttachmentBuilder[] | undefined;
    if (definition.localAsset) {
      const filename = definition.localAsset;
      imageUrl = `attachment://${filename}`;
      files = [new AttachmentBuilder(resolve(process.cwd(), 'assets', 'reactions', filename), { name: filename })];
    } else {
      if (!definition.endpoint) return { ok: false, reason: 'unavailable' };
      const response = await fetch(`${API_BASE}/${definition.endpoint}`, {
        headers: { 'User-Agent': 'BotManzanita (https://discord.com/oauth2/authorize?client_id=1567009025529352263&scope=bot)', Accept: 'application/json' },
        signal: AbortSignal.timeout(7_000),
      });
      if (!response.ok) return { ok: false, reason: 'unavailable' };
      const payload = await response.json() as { results?: Array<{ url?: string }> };
      const image = payload.results?.[0];
      if (!image?.url) return { ok: false, reason: 'unavailable' };
      const remoteImageUrl = new URL(image.url);
      if (remoteImageUrl.protocol !== 'https:' || remoteImageUrl.hostname !== 'nekos.best' || !remoteImageUrl.pathname.toLowerCase().endsWith('.gif')) return { ok: false, reason: 'unavailable' };
      imageUrl = remoteImageUrl.toString();
    }
    const sharedTexts = target && definition.sharedText ? definition.sharedText(actor, target) : undefined;
    const interaction = sharedTexts?.length
      ? sharedTexts[randomInt(sharedTexts.length)]!
      : definition.text(actor, target);
    const caption = interaction;
    const embed = new EmbedBuilder()
      .setColor(0x9b78e8)
      .setDescription(caption)
      .setImage(imageUrl)
      .setFooter({ text: definition.localAsset ? 'GIF: Bot Manzanita' : 'GIF: NEKOS.BEST' });
    return { ok: true, embed, ...(files ? { files } : {}) };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
