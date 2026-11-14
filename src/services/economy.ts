import { GLOBAL_SCOPE_ID } from '../storage/global-scope.js';
import { randomBytes, randomInt } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { db } from '../storage/database.js';
import { ECONOMY_STARTING_BALANCE } from '../storage/economy-defaults.js';
import { economyPool, insertItemLedger, insertLedger, withEconomyTransaction } from '../storage/economy-database.js';
import { profileShopItems } from '../data/profile-shop.js';
import { calculateProductSaleCommission, getProductPriceQuote, recordProductSaleMysql, recordProductSaleSqlite } from './product-market.js';
import { rpgItems } from './rpg.js';

export const DAILY_AMOUNT = 75;
const DAILY_COOLDOWN_SECONDS = 24 * 60 * 60;
const WORK_COOLDOWN_SECONDS = 60 * 60;
const BUSINESS_WORK_COOLDOWN_SECONDS = 3 * 60 * 60;
const BUSINESS_WORK_COOLDOWN_REDUCTION_PER_LEVEL = 5 * 60;
const BUSINESS_CONSTRUCTION_SECONDS = 6 * 60 * 60;
const BUSINESS_MAX_STAFF_BY_LEVEL = [3, 3, 3, 4, 4, 4, 5, 5, 5, 6] as const;
const BUSINESS_INACTIVITY_SECONDS = 14 * 24 * 60 * 60;
const FISH_COOLDOWN_SECONDS = 60 * 60;
const ROB_COOLDOWN_SECONDS = 2 * 60 * 60;
const ROOSTER_DUEL_TTL_SECONDS = 5 * 60;
const CRIME_COOLDOWN_SECONDS = 4 * 60 * 60;
const BANK_INTEREST_INTERVAL_SECONDS = 5 * 60 * 60;
const BANK_PERIODS_PER_YEAR = (365 * 24 * 60 * 60) / BANK_INTEREST_INTERVAL_SECONDS;
const BANK_INTEREST_REMAINDER_DENOMINATOR = 10_000 * BANK_PERIODS_PER_YEAR;
const BANK_POLICY_REBALANCE_SECONDS = 24 * 60 * 60;
const BANK_MODEL_VERSION = 4;
export const BANK_APR_FLOOR_BPS = 500;
export const BANK_APR_CEILING_BPS = 1_800;
export const BANK_BASE_APR_BPS = 1_200;
const BANK_TARGET_SAVINGS_SHARE = 0.3;
const BANK_MAX_DAILY_APR_STEP_BPS = 150;
const BANK_ACTIVITY_WINDOW_SECONDS = 30 * 24 * 60 * 60;
const MAX_BET = 100_000;
export const JOB_XP_PER_SHIFT = 25;
export const MAX_JOB_LEVEL = 20;
const money = new Intl.NumberFormat('es-MX');
function moneyLossRemark(totalBalance: number): string {
  const balance = Math.max(0, Math.floor(totalBalance));
  const formatted = money.format(balance);
  if (balance === 0) return pick([
    'Saldo total: **0 monedas**. Tu billetera ya es un porta-recibos con autoestima.',
    'Te quedaste en **0**. La cartera está tan vacía que hace eco cuando la abres.',
    'Patrimonio líquido: **0 monedas**. Hasta las polillas se mudaron por falta de comida.',
  ]);
  if (balance < 100) return pick([
    `Te quedan **${formatted} monedas**. Hasta el cajero te pregunta si vienes a retirar o a pedir fiado.`,
    `Con **${formatted} monedas**, tu cartera ya solicitó entrar a un programa de apoyo.`,
    `**${formatted} monedas**: no es saldo, es una propina que se perdió camino a la mesa.`,
  ]);
  if (balance < 500) return pick([
    `Tu fortuna quedó en **${formatted} monedas**. Alcanza para entrar al banco y saludar al guardia.`,
    `Te quedan **${formatted} monedas**; ya estás revisando el precio antes de mirar el producto.`,
    `Con **${formatted} monedas**, el lujo de hoy será cerrar la tienda sin comprar nada.`,
  ]);
  if (balance < 2_000) return pick([
    `Te quedan **${formatted} monedas**. No estás en bancarrota; estás en una pausa financiera dramática.`,
    `Tu saldo es **${formatted}**. El menú caro ya te reconoce y te ofrece agua.`,
    `**${formatted} monedas**: la cartera sigue viva, pero ya empezó a pedir descuentos.`,
  ]);
  if (balance < 10_000) return pick([
    `Tu patrimonio quedó en **${formatted} monedas**. El golpe dolió; el lujo tendrá que esperar.`,
    `Te quedan **${formatted} monedas**. Tu presupuesto sobrevivió, aunque presentó una queja formal.`,
    `Saldo total: **${formatted}**. Aún hay colchón, pero la cartera ya mira feo a la ruleta.`,
  ]);
  return pick([
    `Tu patrimonio conserva **${formatted} monedas**; la pérdida fue más golpe al ego que a la cuenta.`,
    `Quedan **${formatted} monedas** en tu patrimonio. El susto fue gratis; esta vez la apuesta no.`,
    `Con **${formatted} monedas** todavía, tu asesor financiero solo suspiró y anotó la apuesta.`,
  ]);
}
const BASE_JOB_TOOL_DURABILITY = 30;
const JOB_TOOL_DURABILITY_PER_LEVEL = 2;
export const JOB_TOOL_DURABILITY_PER_UPGRADE = 15;
const MAX_JOB_TOOL_UPGRADE = 3;

export const economyJobs = [
  { id: 'minero', name: 'Minero', emoji: '⛏️', toolId: 'pico', toolName: 'Pico', minPay: 42, maxPay: 56, messages: ['⛏️ Extrajiste mineral de una veta profunda.', '💎 Encontraste una bolsa de mineral valioso.', '🪨 Limpiaste el túnel y llevaste el mineral al taller.'] },
  { id: 'lenador', name: 'Leñador', emoji: '🪓', toolId: 'hacha', toolName: 'Hacha', minPay: 40, maxPay: 54, messages: ['🪵 Cortaste y apilaste madera para el pueblo.', '🌲 Preparaste troncos para la carpintería.', '🪓 Despejaste una zona y cargaste la leña.'] },
  { id: 'agricultor', name: 'Agricultor', emoji: '🌾', toolId: 'azada', toolName: 'Azada', minPay: 38, maxPay: 52, messages: ['🌱 Preparaste los surcos para la siguiente cosecha.', '🥕 Cuidaste el cultivo y llevaste verduras al mercado.', '🌾 Regaste y limpiaste el campo antes del anochecer.'] },
  { id: 'repartidor', name: 'Repartidor', emoji: '📦', toolId: 'mochila_repartidor', toolName: 'Mochila de reparto', minPay: 40, maxPay: 54, messages: ['🚲 Entregaste paquetes por todo el barrio.', '📦 Completaste una ruta de entregas a tiempo.', '🧭 Encontraste cada dirección y entregaste los pedidos.'] },
  { id: 'cocinero', name: 'Cocinero', emoji: '🍳', toolId: 'kit_cocinero', toolName: 'Kit de cocina', minPay: 42, maxPay: 56, messages: ['🍜 Preparaste un turno lleno en la cocina.', '🥘 Cocinaste el menú del día para el mercado.', '🧁 Vendiste una tanda completa de postres.'] },
  { id: 'pescador', name: 'Pescador', emoji: '🎣', toolId: 'cana_pescar', toolName: 'Caña de pescar', minPay: 38, maxPay: 52, messages: ['🎣 Reparaste las redes del muelle y ordenaste la captura.', '🛶 Ayudaste a preparar las barcas para salir al lago.', '🐟 Clasificaste la pesca de la mañana para el mercado.'] },
  { id: 'ladron', name: 'Ladrón', emoji: '🦹', toolId: 'kit_ganzuas', toolName: 'Kit de ganzúas', minPay: 39, maxPay: 54, messages: ['🧤 Abriste una cerradura complicada y saliste con el botín.', '🕶️ Entregaste mercancía discreta en el mercado nocturno.', '🚗 Escapaste por los callejones sin dejar rastro.'] },
  { id: 'detective', name: 'Detective / Policía', emoji: '🕵️', toolId: 'kit_detective', toolName: 'Maletín de investigación', minPay: 41, maxPay: 56, messages: ['🔎 Seguiste las pistas y cerraste un caso vecinal.', '👮 Patrullaste el barrio y recuperaste objetos perdidos.', '🧪 Analizaste pruebas y entregaste el informe del turno.'] },
] as const;

export const businessJobs = [
  { jobId: 'minero', name: 'Mina de veta profunda', icon: '⛏️', landPrice: 1_250, buildPrice: 2_600, utilityNames: ['Electricidad', 'Seguridad minera', 'Explosivos y equipo'], utilityCosts: [18, 16, 14] },
  { jobId: 'lenador', name: 'Aserradero del bosque', icon: '🪓', landPrice: 1_100, buildPrice: 2_350, utilityNames: ['Combustible', 'Permisos forestales', 'Mantenimiento'], utilityCosts: [18, 10, 12] },
  { jobId: 'agricultor', name: 'Granja de temporada', icon: '🌾', landPrice: 1_000, buildPrice: 2_200, utilityNames: ['Agua de riego', 'Semillas', 'Fertilizante'], utilityCosts: [16, 15, 11] },
  { jobId: 'repartidor', name: 'Centro de reparto', icon: '📦', landPrice: 1_150, buildPrice: 2_450, utilityNames: ['Combustible', 'Mantenimiento de flota', 'Peajes y rutas'], utilityCosts: [21, 12, 9] },
  { jobId: 'cocinero', name: 'Restaurante de barrio', icon: '🍳', landPrice: 1_300, buildPrice: 2_750, utilityNames: ['Electricidad', 'Agua', 'Ingredientes frescos'], utilityCosts: [17, 10, 20] },
  { jobId: 'pescador', name: 'Muelle pesquero', icon: '🎣', landPrice: 1_050, buildPrice: 2_300, utilityNames: ['Combustible de barca', 'Mantenimiento', 'Hielo y conservación'], utilityCosts: [17, 11, 10] },
  { jobId: 'ladron', name: 'Casa de empeño La Sombra', icon: '🦹', landPrice: 1_150, buildPrice: 2_400, utilityNames: ['Seguridad del local', 'Transporte discreto', 'Gestoría y cobertura'], utilityCosts: [18, 15, 13] },
  { jobId: 'detective', name: 'Agencia de investigación', icon: '🕵️', landPrice: 1_250, buildPrice: 2_650, utilityNames: ['Combustible de patrulla', 'Comunicaciones', 'Laboratorio forense'], utilityCosts: [18, 12, 16] },
] as const;

export type BusinessGood = { id: string; jobId: string; name: string; emoji: string; description: string; basePrice: number; usable: boolean };
const coreBusinessGoods: BusinessGood[] = [
  { id: 'mineral_cobre', jobId: 'minero', name: 'Mineral de cobre', emoji: '🪨', description: 'Veta refinable de la mina; puedes venderla en a!vender.', basePrice: 28, usable: false },
  { id: 'geoda_azul', jobId: 'minero', name: 'Geoda azul', emoji: '🔷', description: 'Geoda poco común extraída en la mina; puedes venderla en a!vender.', basePrice: 55, usable: false },
  { id: 'racion_mineral', jobId: 'minero', name: 'Ración de mina', emoji: '🥪', description: 'Consumirla prepara tu siguiente turno de negocio y aumenta sus ingresos un 20%.', basePrice: 36, usable: true },
  { id: 'tabla_pino', jobId: 'lenador', name: 'Tablas de pino', emoji: '🪵', description: 'Madera cortada y secada en el aserradero; puedes venderla en a!vender.', basePrice: 25, usable: false },
  { id: 'resina_bosque', jobId: 'lenador', name: 'Resina de bosque', emoji: '🧴', description: 'Resina de calidad para carpintería; puedes venderla en a!vender.', basePrice: 42, usable: false },
  { id: 'termo_lenador', jobId: 'lenador', name: 'Termo de campo', emoji: '☕', description: 'Consumirlo prepara tu siguiente turno de negocio y aumenta sus ingresos un 20%.', basePrice: 35, usable: true },
  { id: 'cosecha_tomate', jobId: 'agricultor', name: 'Cosecha de tomate', emoji: '🍅', description: 'Producto fresco de la granja; puedes venderlo en a!vender.', basePrice: 22, usable: false },
  { id: 'miel_campesina', jobId: 'agricultor', name: 'Miel campesina', emoji: '🍯', description: 'Frasco de miel de temporada; puedes venderlo en a!vender.', basePrice: 48, usable: false },
  { id: 'cesta_cosecha', jobId: 'agricultor', name: 'Cesta de cosecha', emoji: '🧺', description: 'Consumirla prepara tu siguiente turno de negocio y aumenta sus ingresos un 20%.', basePrice: 40, usable: true },
  { id: 'paquete_devuelto', jobId: 'repartidor', name: 'Paquete recuperado', emoji: '📦', description: 'Paquete retornado a la tienda; puedes venderlo en a!vender.', basePrice: 24, usable: false },
  { id: 'cupon_express', jobId: 'repartidor', name: 'Cupón de ruta express', emoji: '🎟️', description: 'Cupón válido para reventa; puedes venderlo en a!vender.', basePrice: 47, usable: false },
  { id: 'snack_repartidor', jobId: 'repartidor', name: 'Snack de ruta', emoji: '🥤', description: 'Consumirlo prepara tu siguiente turno de negocio y aumenta sus ingresos un 20%.', basePrice: 34, usable: true },
  { id: 'pan_artesanal', jobId: 'cocinero', name: 'Pan artesanal', emoji: '🥖', description: 'Horneado diario del restaurante; puedes venderlo en a!vender.', basePrice: 31, usable: false },
  { id: 'platillo_del_dia', jobId: 'cocinero', name: 'Platillo del día', emoji: '🍲', description: 'Consumirlo prepara tu siguiente turno de negocio y aumenta sus ingresos un 20%.', basePrice: 44, usable: true },
  { id: 'pastel_fino', jobId: 'cocinero', name: 'Pastel fino', emoji: '🍰', description: 'Postre de especialidad del restaurante; puedes venderlo en a!vender.', basePrice: 58, usable: false },
  { id: 'captura_fresca', jobId: 'pescador', name: 'Captura fresca', emoji: '🐟', description: 'Pescado conservado en hielo; puedes venderlo en a!vender.', basePrice: 29, usable: false },
  { id: 'perla_de_muelle', jobId: 'pescador', name: 'Perla de muelle', emoji: '🦪', description: 'Hallazgo raro durante la jornada; puedes venderlo en a!vender.', basePrice: 62, usable: false },
  { id: 'almuerzo_marinero', jobId: 'pescador', name: 'Almuerzo marinero', emoji: '🍱', description: 'Consumirlo prepara tu siguiente turno de negocio y aumenta sus ingresos un 20%.', basePrice: 38, usable: true },
  { id: 'reloj_recuperado', jobId: 'ladron', name: 'Reloj recuperado', emoji: '⌚', description: 'Pieza de segunda mano lista para a!vender.', basePrice: 52, usable: false },
  { id: 'joya_sin_marca', jobId: 'ladron', name: 'Joya sin marca', emoji: '💎', description: 'Una pieza del mercado nocturno que puedes vender con a!vender.', basePrice: 68, usable: false },
  { id: 'kit_evasion', jobId: 'ladron', name: 'Kit de evasión', emoji: '🧤', description: 'Consumirlo prepara tu siguiente turno de negocio y aumenta sus ingresos un 20%.', basePrice: 44, usable: true },
  { id: 'informe_caso_resuelto', jobId: 'detective', name: 'Informe de caso resuelto', emoji: '📄', description: 'Reporte profesional que puedes vender con a!vender.', basePrice: 48, usable: false },
  { id: 'placa_conmemorativa', jobId: 'detective', name: 'Placa conmemorativa', emoji: '🏅', description: 'Insignia de una investigación destacada; puedes venderla con a!vender.', basePrice: 61, usable: false },
  { id: 'kit_huellas_portatil', jobId: 'detective', name: 'Kit portátil de huellas', emoji: '🧪', description: 'Consumirlo prepara tu siguiente turno de negocio y aumenta sus ingresos un 20%.', basePrice: 42, usable: true },
];

const supplementalBusinessGoods: Record<string, Array<[id: string, name: string, emoji: string, basePrice: number]>> = {
  minero: [
    ['veta_carbon', 'Veta de carbón', '⚫', 19], ['hierro_bruto', 'Hierro bruto', '⛓️', 32], ['geoda_roja', 'Geoda roja', '🔴', 55],
    ['cuarzo_ahumado', 'Cuarzo ahumado', '🪨', 43], ['pepita_oro', 'Pepita de oro', '🟡', 78], ['veta_plata', 'Veta de plata', '🥈', 65],
    ['cristal_profundo', 'Cristal profundo', '💠', 72], ['mineral_titanio', 'Mineral de titanio', '🪙', 83], ['polvo_amatista', 'Polvo de amatista', '🟣', 49],
    ['lingote_bronce', 'Lingote de bronce', '🟤', 46], ['opalo_caverna', 'Ópalo de caverna', '🔹', 91], ['fosil_antiguo', 'Fósil antiguo', '🦴', 68],
    ['fragmento_meteorico', 'Fragmento meteórico', '☄️', 96], ['sal_gema', 'Sal gema', '🧂', 27], ['zafiro_azul', 'Zafiro azul', '🔷', 88],
    ['piedra_afilado', 'Piedra de afilado', '🪨', 35], ['cristal_lunar', 'Cristal lunar', '🌙', 100],
  ],
  lenador: [
    ['tronco_roble', 'Tronco de roble', '🪵', 38], ['tabla_nogal', 'Tabla de nogal', '🪚', 49], ['corteza_medicinal', 'Corteza medicinal', '🌿', 42],
    ['resina_ambar', 'Resina ámbar', '🟠', 59], ['carbon_vegetal', 'Carbón vegetal', '⚫', 23], ['astilla_aromatica', 'Astilla aromática', '🌲', 31],
    ['bambu_flexible', 'Bambú flexible', '🎋', 34], ['tronco_cedro', 'Tronco de cedro', '🌳', 47], ['tabla_caoba', 'Tabla de caoba', '🪵', 72],
    ['lena_seca', 'Leña seca', '🔥', 25], ['semillas_forestales', 'Semillas forestales', '🌰', 37], ['corcho_natural', 'Corcho natural', '🟫', 29],
    ['pulpa_celulosa', 'Pulpa de celulosa', '📜', 33], ['madera_petrificada', 'Madera petrificada', '🪨', 81], ['rama_sauce', 'Rama de sauce', '🌿', 28],
    ['tinte_vegetal', 'Tinte vegetal', '🎨', 44], ['tabla_abedul', 'Tabla de abedul', '🪚', 41],
  ],
  agricultor: [
    ['maiz_dorado', 'Maíz dorado', '🌽', 27], ['trigo_integral', 'Trigo integral', '🌾', 26], ['calabaza_otono', 'Calabaza de otoño', '🎃', 39],
    ['papa_campo', 'Papa de campo', '🥔', 21], ['manzana_roja', 'Manzana roja', '🍎', 25], ['arroz_riego', 'Arroz de riego', '🍚', 29],
    ['fresa_madura', 'Fresa madura', '🍓', 36], ['algodon_cosecha', 'Algodón cosechado', '☁️', 42], ['cafe_grano', 'Grano de café', '☕', 47],
    ['cacao_campo', 'Cacao de campo', '🍫', 52], ['queso_granjero', 'Queso de granja', '🧀', 45], ['huevo_campo', 'Huevo de campo', '🥚', 24],
    ['hierbas_cultivo', 'Hierbas de cultivo', '🌱', 31], ['lino_cosechado', 'Lino cosechado', '🧵', 40], ['chile_serrano', 'Chile serrano', '🌶️', 33],
    ['frijol_negro', 'Frijol negro', '🫘', 28], ['semilla_calabaza', 'Semillas de calabaza', '🎃', 30],
  ],
  repartidor: [
    ['envio_express', 'Envío exprés', '🚚', 42], ['caja_fragil', 'Caja frágil', '📦', 31], ['guia_sellada', 'Guía sellada', '🧾', 28],
    ['paquete_retorno', 'Paquete de retorno', '📬', 25], ['sobre_prioritario', 'Sobre prioritario', '✉️', 37], ['lote_paquetes', 'Lote de paquetes', '🗃️', 52],
    ['entrega_farmacia', 'Entrega de farmacia', '💊', 44], ['paquete_refrigerado', 'Paquete refrigerado', '🧊', 58], ['recibo_comercio', 'Recibo de comercio', '🧾', 22],
    ['repuesto_urgente', 'Repuesto urgente', '🛠️', 63], ['carta_certificada', 'Carta certificada', '📩', 40], ['envio_internacional', 'Envío internacional', '🌐', 76],
    ['paquete_regalo', 'Paquete de regalo', '🎁', 45], ['ruta_optima', 'Mapa de ruta óptima', '🗺️', 54], ['pedido_restaurante', 'Pedido de restaurante', '🥡', 36],
    ['caja_sorpresa', 'Caja sorpresa', '🎊', 49], ['sello_aduana', 'Sello de aduana', '🔖', 34],
  ],
  cocinero: [
    ['galleta_mantequilla', 'Galleta de mantequilla', '🍪', 32], ['sopa_calabaza', 'Sopa de calabaza', '🥣', 39], ['tarta_frutos', 'Tarta de frutos rojos', '🥧', 56],
    ['empanada_casera', 'Empanada casera', '🥟', 35], ['cafe_molido', 'Café molido', '☕', 33], ['mermelada_artesanal', 'Mermelada artesanal', '🍓', 45],
    ['queso_fundido', 'Queso fundido', '🫕', 42], ['salsa_chef', 'Salsa del chef', '🫙', 38], ['brioche_horneado', 'Brioche horneado', '🍞', 47],
    ['brownie_chocolate', 'Brownie de chocolate', '🍫', 41], ['ensalada_fresca', 'Ensalada fresca', '🥗', 34], ['caldo_casero', 'Caldo casero', '🍲', 37],
    ['pasta_fresca', 'Pasta fresca', '🍝', 44], ['helado_barrio', 'Helado del barrio', '🍨', 48], ['taco_especial', 'Taco especial', '🌮', 40],
    ['merengue_limon', 'Merengue de limón', '🍋', 52], ['mole_casero', 'Mole casero', '🍛', 61],
  ],
  pescador: [
    ['atun_azul', 'Atún azul', '🐟', 49], ['sardina_plata', 'Sardina plateada', '🐟', 25], ['camaron_rio', 'Camarón de río', '🦐', 43],
    ['trucha_arcoiris', 'Trucha arcoíris', '🐠', 48], ['langosta_muelle', 'Langosta del muelle', '🦞', 91], ['pulpo_costero', 'Pulpo costero', '🐙', 73],
    ['cangrejo_rojo', 'Cangrejo rojo', '🦀', 64], ['almeja_perla', 'Almeja perla', '🐚', 52], ['calamar_fresco', 'Calamar fresco', '🦑', 45],
    ['bacalao_norte', 'Bacalao del norte', '🐟', 57], ['pez_espada', 'Pez espada', '🗡️', 82], ['carpa_dorada', 'Carpa dorada', '🐠', 70],
    ['mejillon_azul', 'Mejillón azul', '🦪', 33], ['salmon_ahumado', 'Salmón ahumado', '🍣', 77], ['hueva_pescado', 'Hueva de pescado', '🫧', 55],
    ['ostion_grande', 'Ostión grande', '🦪', 62], ['camaron_cristalino', 'Camarón cristalino', '🦐', 68],
  ],
  ladron: [
    ['ticket_empeno', 'Ticket de empeño', '🎟️', 29], ['llave_rehecha', 'Llave rehecha', '🗝️', 34], ['cartera_recuperada', 'Cartera recuperada', '👛', 31],
    ['bolsa_discreta', 'Bolsa discreta', '👜', 37], ['moneda_antigua', 'Moneda antigua', '🪙', 45], ['guantes_cuero', 'Guantes de cuero', '🧤', 38],
    ['mapa_callejones', 'Mapa de callejones', '🗺️', 41], ['gemelos_plata', 'Gemelos de plata', '🔘', 52], ['reloj_bolsillo', 'Reloj de bolsillo', '⌚', 58],
    ['tarjeta_acceso', 'Tarjeta de acceso', '💳', 47], ['caja_fuerte_vacia', 'Caja fuerte vacía', '🔐', 25], ['radio_escucha', 'Radio de escucha', '📻', 64],
    ['camara_desactivada', 'Cámara desactivada', '📷', 55], ['plano_boveda', 'Plano de bóveda', '📜', 76], ['sello_comprador', 'Sello de comprador', '🔖', 35],
    ['lote_antiguedades', 'Lote de antigüedades', '🏺', 82], ['diamante_sin_talla', 'Diamante sin tallar', '💠', 95],
  ],
  detective: [
    ['huellas_catalogadas', 'Huellas catalogadas', '🖐️', 28], ['fotografia_escena', 'Fotografía de escena', '📸', 31], ['copia_expediente', 'Copia de expediente', '📁', 45],
    ['croquis_delito', 'Croquis del caso', '🗺️', 33], ['muestra_fibra', 'Muestra de fibra', '🧵', 39], ['residuo_polvora', 'Residuo de pólvora', '🧪', 56],
    ['registro_patrullaje', 'Registro de patrullaje', '📋', 26], ['grabacion_camara', 'Grabación de cámara', '📼', 60], ['mapa_incidentes', 'Mapa de incidentes', '🗺️', 44],
    ['cinta_perimetral', 'Cinta perimetral', '🚧', 22], ['acta_recuperacion', 'Acta de recuperación', '📝', 47], ['maletin_evidencias', 'Maletín de evidencias', '🧳', 71],
    ['nota_testigo', 'Nota de testigo', '🗒️', 35], ['analisis_quimico', 'Análisis químico', '⚗️', 80], ['placa_duplicada', 'Placa conmemorativa', '🏅', 64],
    ['boletin_seguridad', 'Boletín de seguridad', '📰', 30], ['llave_deposito', 'Llave del depósito', '🗝️', 52],
  ],
};

export const businessGoods: BusinessGood[] = [
  ...coreBusinessGoods,
  ...Object.entries(supplementalBusinessGoods).flatMap(([jobId, goods]) => goods.map(([id, name, emoji, basePrice]) => ({
    id, jobId, name, emoji, basePrice, usable: false,
    description: `Producto del oficio que puedes vender con a!vender ${id}.`,
  }))),
];

export type EconomyJob = typeof economyJobs[number];
export type ActiveJobProgress = { job: EconomyJob; level: number; xp: number; xpToNext: number };
export type JobRosterEntry = ActiveJobProgress & { active: boolean };
export type JobRoster = { jobs: JobRosterEntry[]; activeCount: number; slotLimit: 1 | 2; secondSlotUnlocked: boolean; primaryJobId?: string };
export type JobToolStatus = {
  toolId: string; toolName: string; emoji: string; jobId: string; jobName: string; jobLevel: number;
  durability: number; maxDurability: number; upgradeLevel: number;
};
export type JobToolUpgradeQuote = JobToolStatus & { nextUpgradeLevel: number; price: number; material: string };

export function jobProductCategorySize(): number {
  return storeItems.filter((item) => item.category === 'jobs').length + economyJobs.length * MAX_JOB_TOOL_UPGRADE;
}

function jobXpToNext(level: number): number { return level >= MAX_JOB_LEVEL ? 0 : 100 + (level - 1) * 25; }
function maxJobToolDurability(jobLevel: number, upgradeLevel: number): number {
  return BASE_JOB_TOOL_DURABILITY + Math.max(0, jobLevel - 1) * JOB_TOOL_DURABILITY_PER_LEVEL + upgradeLevel * JOB_TOOL_DURABILITY_PER_UPGRADE;
}
export function jobToolMaterial(upgradeLevel: number): string {
  return ['Hierro', 'Cobre', 'Plata', 'Oro'][clamp(Math.trunc(upgradeLevel), 0, MAX_JOB_TOOL_UPGRADE)]!;
}
function toolUpgradeProductId(toolId: string, nextLevel: number): string { return `upgrade_${toolId}_${nextLevel}`; }
function toolUpgradeBasePrice(item: (typeof storeItems)[number], currentUpgradeLevel: number): number {
  return item.cost * [2, 4, 7][currentUpgradeLevel]!;
}
type JobToolState = { durability: number; maxDurability: number; upgradeLevel: number };
type JobToolStateRow = { durability: number; maxDurability: number; upgradeLevel: number };

async function ensureJobToolStateMysql(connection: PoolConnection, guildId: string, userId: string, toolId: string, jobLevel: number): Promise<JobToolState> {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT durability,max_durability AS maxDurability,upgrade_level AS upgradeLevel FROM economy_tool_state WHERE guild_id=? AND user_id=? AND tool_id=? FOR UPDATE', [guildId, userId, toolId]);
  if (!rows[0]) {
    const maxDurability = maxJobToolDurability(jobLevel, 0);
    await connection.execute('INSERT INTO economy_tool_state(guild_id,user_id,tool_id,durability,max_durability,upgrade_level,updated_at) VALUES(?,?,?,?,?,0,?)', [guildId, userId, toolId, maxDurability, maxDurability, nowSeconds()]);
    return { durability: maxDurability, maxDurability, upgradeLevel: 0 };
  }
  return { durability: Number(rows[0].durability), maxDurability: Number(rows[0].maxDurability), upgradeLevel: clamp(Number(rows[0].upgradeLevel), 0, MAX_JOB_TOOL_UPGRADE) };
}

function ensureJobToolStateSqlite(guildId: string, userId: string, toolId: string, jobLevel: number): JobToolState {
  const row = db.prepare('SELECT durability,max_durability AS maxDurability,upgrade_level AS upgradeLevel FROM economy_tool_state WHERE guild_id=? AND user_id=? AND tool_id=?')
    .get(guildId, userId, toolId) as JobToolStateRow | undefined;
  if (!row) {
    const maxDurability = maxJobToolDurability(jobLevel, 0);
    db.prepare('INSERT INTO economy_tool_state(guild_id,user_id,tool_id,durability,max_durability,upgrade_level,updated_at) VALUES(?,?,?,?,?,0,?)').run(guildId, userId, toolId, maxDurability, maxDurability, nowSeconds());
    return { durability: maxDurability, maxDurability, upgradeLevel: 0 };
  }
  return { durability: Number(row.durability), maxDurability: Number(row.maxDurability), upgradeLevel: clamp(Number(row.upgradeLevel), 0, MAX_JOB_TOOL_UPGRADE) };
}

async function restoreJobToolMysql(connection: PoolConnection, guildId: string, userId: string, toolId: string, at: number): Promise<void> {
  const job = economyJobs.find((entry) => entry.toolId === toolId);
  if (!job) return;
  const [levels] = await connection.execute<RowDataPacket[]>('SELECT level FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?', [guildId, userId, job.id]);
  const state = await ensureJobToolStateMysql(connection, guildId, userId, toolId, Number(levels[0]?.level ?? 1));
  const maxDurability = maxJobToolDurability(Number(levels[0]?.level ?? 1), state.upgradeLevel);
  await connection.execute('UPDATE economy_tool_state SET durability=?,max_durability=?,updated_at=? WHERE guild_id=? AND user_id=? AND tool_id=?', [maxDurability, maxDurability, at, guildId, userId, toolId]);
}

function restoreJobToolSqlite(guildId: string, userId: string, toolId: string, at: number): void {
  const job = economyJobs.find((entry) => entry.toolId === toolId);
  if (!job) return;
  const level = db.prepare('SELECT level FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?').get(guildId, userId, job.id) as { level: number } | undefined;
  const jobLevel = Number(level?.level ?? 1);
  const state = ensureJobToolStateSqlite(guildId, userId, toolId, jobLevel);
  const maxDurability = maxJobToolDurability(jobLevel, state.upgradeLevel);
  db.prepare('UPDATE economy_tool_state SET durability=?,max_durability=?,updated_at=? WHERE guild_id=? AND user_id=? AND tool_id=?').run(maxDurability, maxDurability, at, guildId, userId, toolId);
}

type ToolWearResult = JobToolState & { worn: boolean; broke: boolean };

async function wearJobToolMysql(connection: PoolConnection, guildId: string, userId: string, job: EconomyJob, jobLevel: number, reference: string, at: number): Promise<ToolWearResult> {
  const state = await ensureJobToolStateMysql(connection, guildId, userId, job.toolId, jobLevel);
  const maxDurability = Math.max(state.maxDurability, maxJobToolDurability(jobLevel, state.upgradeLevel));
  let durability = Math.min(maxDurability, state.durability + Math.max(0, maxDurability - state.maxDurability));
  const wearChance = clamp(100 - Math.max(0, jobLevel - 1) * 3 - state.upgradeLevel * 5, 25, 100);
  const worn = randomInt(100) < wearChance;
  if (worn) durability = Math.max(0, durability - 1);
  const broke = durability === 0;
  await connection.execute('UPDATE economy_tool_state SET durability=?,max_durability=?,updated_at=? WHERE guild_id=? AND user_id=? AND tool_id=?', [durability, maxDurability, at, guildId, userId, job.toolId]);
  if (broke) {
    await connection.execute('UPDATE economy_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?', [guildId, userId, job.toolId]);
    await connection.execute('DELETE FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity<=0', [guildId, userId, job.toolId]);
    await insertItemLedger(connection, { guildId, userId, itemId: job.toolId, quantityDelta: -1, reason: 'tool_broken', reference: `${reference}:tool-break`, createdAt: at });
  }
  return { durability, maxDurability, upgradeLevel: state.upgradeLevel, worn, broke };
}

function wearJobToolSqlite(guildId: string, userId: string, job: EconomyJob, jobLevel: number, reference: string, at: number): ToolWearResult {
  const state = ensureJobToolStateSqlite(guildId, userId, job.toolId, jobLevel);
  const maxDurability = Math.max(state.maxDurability, maxJobToolDurability(jobLevel, state.upgradeLevel));
  let durability = Math.min(maxDurability, state.durability + Math.max(0, maxDurability - state.maxDurability));
  const wearChance = clamp(100 - Math.max(0, jobLevel - 1) * 3 - state.upgradeLevel * 5, 25, 100);
  const worn = randomInt(100) < wearChance;
  if (worn) durability = Math.max(0, durability - 1);
  const broke = durability === 0;
  db.prepare('UPDATE economy_tool_state SET durability=?,max_durability=?,updated_at=? WHERE guild_id=? AND user_id=? AND tool_id=?').run(durability, maxDurability, at, guildId, userId, job.toolId);
  if (broke) {
    db.prepare('UPDATE economy_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?').run(guildId, userId, job.toolId);
    db.prepare('DELETE FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity<=0').run(guildId, userId, job.toolId);
    db.prepare('INSERT INTO economy_item_ledger(guild_id,user_id,item_id,quantity_delta,reason,reference,created_at) VALUES(?,?,?,?,?,?,?)').run(guildId, userId, job.toolId, -1, 'tool_broken', `${reference}:tool-break`, at);
  }
  return { durability, maxDurability, upgradeLevel: state.upgradeLevel, worn, broke };
}

function makeJobProgress(jobId: string, level: number, xp: number): ActiveJobProgress | undefined {
  const job = economyJobs.find((candidate) => candidate.id === jobId);
  return job ? { job, level, xp, xpToNext: jobXpToNext(level) } : undefined;
}

type AccountRow = {
  balance: number;
  bankBalance: number;
  premiumBalance: number;
  lastDailyAt: number | null;
  lastWorkAt: number | null;
  lastFishAt: number | null;
  lastRobAt: number | null;
  lastCrimeAt: number | null;
  lastBankInterestAt: number | null;
  bankInterestRemainder: number;
  robProtectedUntil: number | null;
};
type MysqlAccountRow = RowDataPacket & AccountRow;
type BlackjackCard = { rank: string; suit: string; value: number };
type BlackjackState = {
  deck: BlackjackCard[];
  playerCards: BlackjackCard[];
  dealerCards: BlackjackCard[];
  status: 'active' | 'finished';
  outcome?: 'win' | 'lose' | 'push';
  payout: number;
  resultText?: string;
};
export type BlackjackView = {
  gameId: string;
  bet: number;
  balance: number;
  playerCards: string[];
  playerCardValues: number[];
  lastDrawnCard?: string;
  dealerCards: string[];
  playerTotal: number;
  dealerTotal?: number;
  status: 'active' | 'finished';
  outcome?: 'win' | 'lose' | 'push';
  payout: number;
  resultText?: string;
};
type MysqlGameRow = RowDataPacket & { id: string; bet: number; state_json: string; status: string };

const fishCommon = ['mojarra', 'trucha', 'carpa', 'sardina', 'bagre', 'tilapia', 'robalo', 'lisa'];
const fishRare = ['salmón plateado', 'atún gigante', 'pez dorado', 'lucio legendario', 'carpa koi'];
const fishCatchLines = [
  'La caña se dobló y sacaste un **{fish}**.',
  '¡Buena pesca! Un **{fish}** mordió el anzuelo.',
  'Después de esperar junto al agua, atrapaste un **{fish}**.',
  'Tu paciencia rindió frutos: apareció un **{fish}**.',
  'El agua salpicó por todos lados cuando sacaste un **{fish}**.',
  '¡La suerte estuvo de tu lado! Pescaste un **{fish}**.',
  'El pescador del muelle se quedó con tu **{fish}**.',
  'Una captura fresca: **{fish}**.',
  'La red volvió pesada. Entre la pesca había un **{fish}**.',
  'El anzuelo encontró dueño: un **{fish}**.',
  'Tuviste una mañana productiva y sacaste un **{fish}**.',
  'El mercado recibió con gusto tu **{fish}**.',
  '¡Captura limpia! Un **{fish}** cayó en la cubeta.',
  'Un **{fish}** saltó directo a la cubeta.',
  'Volviste del río con un **{fish}** en el cubo.',
  'El agua estaba tranquila hasta que picó un **{fish}**.',
  'El puesto de la plaza recibió tu **{fish}**.',
  '¡Qué buen ejemplar! Sacaste un **{fish}**.',
  'Una vuelta más al lago valió la pena: apareció un **{fish}**.',
  'El pescador vecino te envidió la captura: un **{fish}**.',
];
const fishMissLines = [
  'Un pez mordió el anzuelo y escapó justo antes de subirlo. Hoy no hubo venta.',
  'Sacaste una bota vieja. El mercado no aceptó la mercancía.',
  'El viento se llevó la carnada. Te quedaste sin captura, pero con una buena historia.',
  'La caña se movió… era una rama. No ganaste monedas esta vez.',
  'El lago estaba tranquilo y los peces también. Vuelve a intentarlo más tarde.',
  'Un cangrejo robó tu carnada y desapareció entre las piedras.',
  'La red regresó vacía. Al menos disfrutaste la vista.',
  'Se rompió el sedal antes de la captura. Hoy la pesca no pagó.',
  'Un pez enorme pasó frente a ti y siguió nadando. Mala suerte.',
  'El anzuelo volvió sin carnada y sin peces.',
  'La lluvia espantó a los peces. Tu bolsillo quedó igual.',
  'El cubo terminó lleno de agua, pero sin pesca que vender.',
];
const robSuccessLines = [
  'Te moviste entre las sombras y escapaste sin que {target} lo notara.',
  'El plan salió perfecto: {target} no alcanzó a reaccionar.',
  'Un descuido de {target} te dejó vía libre.',
  'Hiciste el cambio de bolsillo sin que nadie lo notara.',
  'La huida fue limpia. Te alejaste de {target} a tiempo.',
  'Tu disfraz funcionó y {target} no sospechó nada.',
  'El golpe fue rápido y silencioso.', 'Te mezclaste con la multitud y desapareciste.',
  'Una distracción, un paso y listo.', 'El plan maestro funcionó por una vez.',
];
const robFailLines = [
  '{target} te vio venir. Tocó pagar la multa.', 'El guardia apareció de la nada y la huida salió cara.',
  'Te resbalaste antes de llegar al botín. Qué timing.', '{target} te atrapó con las manos en la masa.',
  'Tu plan falló por un ruido inoportuno.', 'La bolsa tenía una campanita. Mala elección.',
  'La alarma sonó y tuviste que salir corriendo.', 'Te confundiste de bolsillo y todo salió al revés.',
  'El intento fue detectado.', 'La mala suerte ganó esta ronda.',
];
const robFailNoFineLines = [
  'El intento salió mal, pero escapaste sin multa.',
  'La alarma te frenó antes de llegar al botín; esta vez no hubo cargo.',
  'Te detectaron a tiempo. El intento falló, pero tu billetera salió intacta.',
  'El plan se vino abajo y tuviste que retirarte sin llevarte nada.',
];
const rouletteWinLines = [
  '¡La bola cayó donde dijiste!', 'La ruleta te sonrió.', 'Apuesta acertada. El casino paga.',
  'La mesa quedó en silencio: ¡acertaste!', 'Tu predicción fue exacta.',
  'La suerte giró a tu favor.', '¡Color ganador!', 'La bola se detuvo en tu color.',
];
const rouletteLoseLines = [
  'La bola cayó en otro color. Esta ronda se queda en la mesa.',
  'La ruleta no coincidió con tu apuesta. Prueba otra vez cuando quieras.',
  'Esta vez el casino tuvo suerte. La apuesta se perdió.',
  'La bola pasó de largo tu color. No hubo premio.',
  'Casi aciertas, pero no. La siguiente puede ser tuya.',
  'El giro terminó en otro color. Apuesta liquidada.',
  'La mesa se llevó la apuesta. No persigas las pérdidas; vuelve cuando quieras.',
  'El resultado no coincidió con tu elección. Sin premio en esta ronda.',
];
const blackjackWinLines = ['¡21! La mesa paga tu victoria.', 'Mano ganadora. Cobraste el premio.', 'El crupier se pasó. Esta ronda es tuya.', 'Buena mano: venciste al crupier.'];
const blackjackLoseLines = ['El crupier ganó esta mano.', 'Te pasaste de 21. La apuesta se perdió.', 'La mesa se lleva esta ronda.', 'No alcanzó para vencer al crupier.'];

function nowSeconds(): number { return Math.floor(Date.now() / 1000); }
function pick<T>(items: readonly T[]): T { return items[randomInt(items.length)]!; }
function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

function robFailureMessage(targetName: string, amount: number, robberBalance: number, robberBankBalance: number, victimWallet: number, bankrupt: boolean): string {
  if (amount > 0) {
    const fineText = bankrupt
      ? `💸 La multa completa de **${money.format(amount)} monedas** se cargó a tu billetera. Saldo actual: **${money.format(robberBalance)} monedas**; los ahorros del banco no se tocaron.`
      : `💸 La multa de **${money.format(amount)} monedas** salió solo de tu billetera; los saldos del banco no se tocan.`;
    return `${formatMessage(pick(robFailLines), { amount, target: targetName })}\n\n${fineText}\n\n🫠 ${moneyLossRemark(robberBalance + robberBankBalance)}`;
  }
  const reason = victimWallet <= 0
    ? `La billetera de ${targetName} estaba vacía; no se cobró multa. Los fondos del banco están protegidos.`
    : 'Tu billetera estaba vacía; no se cobró multa ni se tocaron los saldos del banco.';
  return `${pick(robFailNoFineLines)}\n\n💵 ${reason}`;
}

function sqliteEnsureAccount(guildId: string, userId: string): AccountRow {
  const now = nowSeconds();
  db.prepare('INSERT OR IGNORE INTO economy_accounts (guild_id, user_id, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(guildId, userId, ECONOMY_STARTING_BALANCE, now, now);
  const row = db.prepare(`SELECT balance, bank_balance AS bankBalance, premium_balance AS premiumBalance,
      last_daily_at AS lastDailyAt, last_work_at AS lastWorkAt,
      last_fish_at AS lastFishAt, last_rob_at AS lastRobAt, last_crime_at AS lastCrimeAt,
      last_bank_interest_at AS lastBankInterestAt, bank_interest_remainder AS bankInterestRemainder,
      rob_protected_until AS robProtectedUntil
    FROM economy_accounts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as AccountRow;
  return row;
}

async function mysqlRows<T extends RowDataPacket[]>(
  connection: PoolConnection,
  sql: string,
  values: unknown[] = [],
): Promise<T> {
  const [rows] = await connection.execute<T>(sql, values as never[]);
  return rows;
}

async function mysqlEnsureAccount(connection: PoolConnection, guildId: string, userId: string, lock = false): Promise<AccountRow> {
  const now = nowSeconds();
  await connection.execute(
    'INSERT IGNORE INTO economy_accounts (guild_id, user_id, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [guildId, userId, ECONOMY_STARTING_BALANCE, now, now],
  );
  const rows = await mysqlRows<MysqlAccountRow[]>(connection,
    `SELECT balance, bank_balance AS bankBalance, premium_balance AS premiumBalance,
       last_daily_at AS lastDailyAt, last_work_at AS lastWorkAt,
       last_fish_at AS lastFishAt, last_rob_at AS lastRobAt, last_crime_at AS lastCrimeAt,
       last_bank_interest_at AS lastBankInterestAt, bank_interest_remainder AS bankInterestRemainder,
       rob_protected_until AS robProtectedUntil
     FROM economy_accounts WHERE guild_id = ? AND user_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [guildId, userId],
  );
  const row = rows[0];
  if (!row) throw new Error('No pude cargar la cuenta de economía.');
  return {
    balance: Number(row.balance),
    bankBalance: Number(row.bankBalance),
    premiumBalance: Number(row.premiumBalance),
    lastDailyAt: row.lastDailyAt === null ? null : Number(row.lastDailyAt),
    lastWorkAt: row.lastWorkAt === null ? null : Number(row.lastWorkAt),
    lastFishAt: row.lastFishAt === null ? null : Number(row.lastFishAt),
    lastRobAt: row.lastRobAt === null ? null : Number(row.lastRobAt),
    lastCrimeAt: row.lastCrimeAt === null ? null : Number(row.lastCrimeAt),
    lastBankInterestAt: row.lastBankInterestAt === null ? null : Number(row.lastBankInterestAt),
    bankInterestRemainder: Number(row.bankInterestRemainder),
    robProtectedUntil: row.robProtectedUntil === null ? null : Number(row.robProtectedUntil),
  };
}

async function mysqlAddLedger(connection: PoolConnection, guildId: string, userId: string, amount: number, reason: string, reference: string | null, at = nowSeconds()): Promise<void> {
  await insertLedger(connection, { guildId, userId, amount, reason, reference, createdAt: at });
}

export async function getAccountBalances(guildId: string, userId: string): Promise<{ wallet: number; bank: number; total: number; premium: number }> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) {
    const connection = await economyPool.getConnection();
    try {
      const account = await mysqlEnsureAccount(connection, guildId, userId);
      return { wallet: account.balance, bank: account.bankBalance, total: account.balance + account.bankBalance, premium: account.premiumBalance };
    }
    finally { connection.release(); }
  }
  const account = sqliteEnsureAccount(guildId, userId);
  return { wallet: account.balance, bank: account.bankBalance, total: account.balance + account.bankBalance, premium: account.premiumBalance };
}

export async function getBalance(guildId: string, userId: string): Promise<number> {
  guildId = GLOBAL_SCOPE_ID;
  return (await getAccountBalances(guildId, userId)).wallet;
}

export async function adjustPremiumCurrency(guildId: string, userId: string, amount: number, adminId: string, reference: string): Promise<
  | { ok: true; balance: number }
  | { ok: false; reason: 'invalid_amount' | 'insufficient_premium'; balance: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return { ok: false, reason: 'invalid_amount', balance: 0 };
  const at = nowSeconds();
  const reason = `premium_admin:${adminId}`;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (amount < 0 && account.premiumBalance < -amount) return { ok: false as const, reason: 'insufficient_premium' as const, balance: account.premiumBalance };
    await connection.execute('UPDATE economy_accounts SET premium_balance=premium_balance+?,updated_at=? WHERE guild_id=? AND user_id=?', [amount, at, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, amount, reason, reference, at);
    return { ok: true as const, balance: account.premiumBalance + amount };
  });
  const run = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (amount < 0 && account.premiumBalance < -amount) return { ok: false as const, reason: 'insufficient_premium' as const, balance: account.premiumBalance };
    db.prepare('UPDATE economy_accounts SET premium_balance=premium_balance+?,updated_at=? WHERE guild_id=? AND user_id=?').run(amount, at, guildId, userId);
    db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)').run(guildId, userId, amount, reason, reference, at);
    return { ok: true as const, balance: account.premiumBalance + amount };
  });
  return run.immediate();
}

type BankAction = 'view' | 'deposit' | 'withdraw';
export type BankResult = {
  ok: boolean;
  reason?: 'invalid_amount' | 'insufficient_wallet' | 'insufficient_bank';
  balance: number;
  bankBalance: number;
  interestEarned: number;
  interestRateBps: number;
  nextInterestAt: number;
  nextRateRebalanceAt: number;
};

type BankInterestPolicy = { rateBps: number; lastRebalancedAt: number; nextRebalanceAt: number };
type BankInterestRateRow = { effectiveAt: number; rateBps: number };
type BankJobMixEntry = { jobId: string; name: string; workers: number; averageLevel: number; payroll30d: number; shifts30d: number };
type BankMarketSnapshot = {
  totalMoney: number; savings: number; deposits: number; withdrawals: number; netIssuance30d: number;
  purchaseVolume30d: number; payroll30d: number; workShifts30d: number; activeWorkers: number;
  jobs: BankJobMixEntry[]; botMoneyGrowthBps: number; purchaseVelocityBps: number; savingsShareBps: number;
  projectedMoneySupply30d: number; targetAprBps: number; issuancePressureBps: number; purchasesPressureBps: number;
  savingsPressureBps: number; liquidityPressureBps: number; laborPressureBps: number;
};
export type BankMarketObservation = {
  observedAt: number; nominalAprBps: number; effectiveAnnualBps: number; targetAprBps: number; targetEffectiveAnnualBps: number;
  botMoneyGrowthBps: number; purchaseVelocityBps: number; savingsShareBps: number; projectedMoneySupply30d: number;
  moneySupply: number; savings: number; netIssuance30d: number;
  purchaseVolume30d: number; payroll30d: number; workShifts30d: number; activeWorkers: number;
  deposits24h: number; withdrawals24h: number; issuancePressureBps: number; purchasesPressureBps: number;
  savingsPressureBps: number; liquidityPressureBps: number; laborPressureBps: number; jobs: BankJobMixEntry[];
};
export type BankInterestDashboard = { current: BankMarketObservation; history: BankMarketObservation[]; live: BankMarketObservation };
type BankInterestAccount = { userId: string; bankBalance: number; lastBankInterestAt: number | null; bankInterestRemainder: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function effectiveAnnualYieldBps(aprBps: number): number {
  const periodYield = Math.max(0, aprBps) / BANK_INTEREST_REMAINDER_DENOMINATOR;
  return Math.round((Math.pow(1 + periodYield, BANK_PERIODS_PER_YEAR) - 1) * 10_000);
}

function clampBankApr(rateBps: number): number {
  return clamp(Math.round(rateBps), BANK_APR_FLOOR_BPS, BANK_APR_CEILING_BPS);
}

function preserveHistoricalBankApr(rateBps: number): number {
  // Rates paid before the policy change remain part of matured-interest calculations.
  return clamp(Math.round(rateBps), 1, 100_000);
}

function buildBankMarketSnapshot(
  moneySupply: number, savings: number, flow: { deposits: number; withdrawals: number; netIssuance30d: number; purchaseVolume30d: number; payroll30d: number; workShifts30d: number },
  activeJobs: Array<{ jobId: string; level: number; userId?: string }>, historicalJobs: Array<{ jobId: string; payroll: number; shifts: number }>,
): BankMarketSnapshot {
  const jobsById = new Map<string, BankJobMixEntry>();
  for (const job of historicalJobs) {
    const knownJob = economyJobs.find((candidate) => candidate.id === job.jobId);
    jobsById.set(job.jobId, { jobId: job.jobId, name: knownJob?.name ?? (job.jobId === 'legacy' ? 'Trabajo general' : job.jobId),
      workers: 0, averageLevel: 0, payroll30d: Number(job.payroll), shifts30d: Number(job.shifts) });
  }
  const activeJobLevelTotals = new Map<string, { workers: number; levelTotal: number }>();
  for (const job of activeJobs) {
    const knownJob = economyJobs.find((candidate) => candidate.id === job.jobId);
    if (!jobsById.has(job.jobId)) jobsById.set(job.jobId, { jobId: job.jobId, name: knownJob?.name ?? job.jobId, workers: 0, averageLevel: 0, payroll30d: 0, shifts30d: 0 });
    const current = activeJobLevelTotals.get(job.jobId) ?? { workers: 0, levelTotal: 0 };
    current.workers++;
    current.levelTotal += Number(job.level);
    activeJobLevelTotals.set(job.jobId, current);
  }
  for (const [jobId, totals] of activeJobLevelTotals) {
    const entry = jobsById.get(jobId)!;
    entry.workers = totals.workers;
    entry.averageLevel = Math.round((totals.levelTotal / totals.workers) * 100) / 100;
  }
  const jobs = [...jobsById.values()].sort((a, b) => b.payroll30d - a.payroll30d || a.name.localeCompare(b.name));
  const activeWorkers = new Set(activeJobs.map((job, index) => job.userId ?? `${job.jobId}:${index}`)).size;
  const savingsShare = moneySupply > 0 ? savings / moneySupply : 0;
  const moneyGrowthBps = Math.round((flow.netIssuance30d / Math.max(moneySupply, 1)) * 10_000);
  const purchaseVelocityBps = Math.max(0, Math.round((flow.purchaseVolume30d / Math.max(moneySupply, 1)) * 10_000));
  const savingsShareBps = Math.round(savingsShare * 10_000);
  // This is a depositor reward policy, not a lending rate: excess issuance lowers rewards
  // so interest does not amplify the same money growth it is supposed to stabilize.
  const issuancePressureBps = clamp(Math.round(-moneyGrowthBps * 0.1), -1_000, 750);
  const purchasesPressureBps = clamp(Math.round(-purchaseVelocityBps * 0.015), -300, 0);
  const savingsPressureBps = clamp(Math.round((BANK_TARGET_SAVINGS_SHARE - savingsShare) * 10_000 * 0.04), -300, 300);
  const liquidityPressureBps = clamp(Math.round(((flow.withdrawals - flow.deposits) / Math.max(moneySupply, 1)) * 10_000 * 0.015), -200, 200);
  const activePay = activeJobs.reduce((sum, job) => {
    const definition = economyJobs.find((candidate) => candidate.id === job.jobId);
    return sum + (definition ? (definition.minPay + definition.maxPay) / 2 + Math.min(Math.max(job.level - 1, 0), MAX_JOB_LEVEL - 1) * 3 : 47);
  }, 0);
  const averageJobPay = activeJobs.length ? activePay / activeJobs.length : 47;
  const wagePressure = clamp(-Math.round(((averageJobPay / 47) - 1) * 500), -150, 150);
  const activeJobShiftCount = jobs.reduce((sum, job) => sum + job.shifts30d, 0);
  const jobActivityPressure = activeWorkers ? -Math.round(Math.min(1, activeJobShiftCount / (activeWorkers * 12)) * 250) : 0;
  const payrollPressure = clamp(-Math.round((flow.payroll30d / Math.max(moneySupply, 1)) * 10_000 * 0.025), -300, 0);
  const laborPressureBps = wagePressure + jobActivityPressure + payrollPressure;
  const targetAprBps = clamp(BANK_BASE_APR_BPS + issuancePressureBps + purchasesPressureBps + savingsPressureBps + liquidityPressureBps + laborPressureBps,
    BANK_APR_FLOOR_BPS, BANK_APR_CEILING_BPS);
  return { totalMoney: moneySupply, savings, deposits: flow.deposits, withdrawals: flow.withdrawals,
    netIssuance30d: flow.netIssuance30d, purchaseVolume30d: flow.purchaseVolume30d, payroll30d: flow.payroll30d,
    workShifts30d: flow.workShifts30d, activeWorkers, jobs, botMoneyGrowthBps: moneyGrowthBps, purchaseVelocityBps,
    savingsShareBps, projectedMoneySupply30d: Math.max(0, moneySupply + flow.netIssuance30d), targetAprBps,
    issuancePressureBps, purchasesPressureBps, savingsPressureBps, liquidityPressureBps, laborPressureBps };
}

function mergeBankJobPayrollRows(rows: Array<{ reason: string; payroll: number; shifts: number }>): Array<{ jobId: string; payroll: number; shifts: number }> {
  const byJob = new Map<string, { jobId: string; payroll: number; shifts: number }>();
  for (const row of rows) {
    const jobId = row.reason === 'work_reward' ? 'legacy' : row.reason.split(':')[1] ?? 'legacy';
    const entry = byJob.get(jobId) ?? { jobId, payroll: 0, shifts: 0 };
    entry.payroll += Number(row.payroll);
    entry.shifts += Number(row.shifts);
    byJob.set(jobId, entry);
  }
  return [...byJob.values()];
}

async function mysqlBankMarketSnapshot(connection: PoolConnection, now: number): Promise<BankMarketSnapshot> {
  const [accounts] = await connection.execute<RowDataPacket[]>(
    'SELECT COALESCE(SUM(balance+bank_balance),0) AS totalMoney,COALESCE(SUM(bank_balance),0) AS savings FROM economy_accounts WHERE guild_id=?', [GLOBAL_SCOPE_ID]);
  const [flowRows] = await connection.execute<RowDataPacket[]>(`SELECT
    COALESCE(SUM(CASE WHEN created_at>=? AND reason='bank:deposit:vault' AND amount>0 THEN amount ELSE 0 END),0) AS deposits,
    COALESCE(SUM(CASE WHEN created_at>=? AND reason='bank:withdraw:vault' AND amount<0 THEN -amount ELSE 0 END),0) AS withdrawals,
    COALESCE(SUM(CASE WHEN reason IN ('bank:deposit:wallet','bank:deposit:vault','bank:withdraw:wallet','bank:withdraw:vault') OR reason LIKE 'transfer:%' OR reason LIKE 'rob:from:%' OR reason LIKE 'rob:to:%' THEN 0 ELSE amount END),0) AS netIssuance30d,
    COALESCE(SUM(CASE WHEN amount<0 AND (reason LIKE 'store:%' OR reason LIKE 'tool_upgrade:%' OR reason='rpg_shop' OR reason LIKE 'rpg_shop:%' OR reason='rpg_training' OR reason LIKE 'profile_shop:%' OR reason LIKE 'business:land%' OR reason IN ('business:construction','business:upgrade','business:hire:npc','business:utilities','business:debt_payment','business:npc_wage','business:theft','business:reopen_fine','business:pest_control')) THEN -amount ELSE 0 END),0) AS purchaseVolume30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN amount ELSE 0 END),0) AS payroll30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN 1 ELSE 0 END),0) AS workShifts30d
    FROM economy_ledger WHERE guild_id=? AND created_at>=? AND created_at<=?`,
  [now - BANK_POLICY_REBALANCE_SECONDS, now - BANK_POLICY_REBALANCE_SECONDS, GLOBAL_SCOPE_ID, now - BANK_ACTIVITY_WINDOW_SECONDS, now]);
  const [activeRows] = await connection.execute<RowDataPacket[]>('SELECT user_id AS userId,job_id AS jobId,level FROM economy_jobs WHERE guild_id=? AND is_active=1', [GLOBAL_SCOPE_ID]);
  const [jobPayrollRows] = await connection.execute<RowDataPacket[]>(`SELECT reason,COALESCE(SUM(amount),0) AS payroll,COUNT(*) AS shifts FROM economy_ledger
    WHERE guild_id=? AND created_at>=? AND created_at<=? AND amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') GROUP BY reason`,
  [GLOBAL_SCOPE_ID, now - BANK_ACTIVITY_WINDOW_SECONDS, now]);
  const activeJobs = activeRows.map((row) => ({ userId: String(row.userId), jobId: String(row.jobId), level: Number(row.level) }));
  const historicalJobs = mergeBankJobPayrollRows(jobPayrollRows.map((row) => ({ reason: String(row.reason), payroll: Number(row.payroll), shifts: Number(row.shifts) })));
  const flow = flowRows[0] ?? ({} as RowDataPacket);
  return buildBankMarketSnapshot(Number(accounts[0]?.totalMoney ?? 0), Number(accounts[0]?.savings ?? 0), {
    deposits: Number(flow.deposits ?? 0), withdrawals: Number(flow.withdrawals ?? 0), netIssuance30d: Number(flow.netIssuance30d ?? 0),
    purchaseVolume30d: Number(flow.purchaseVolume30d ?? 0), payroll30d: Number(flow.payroll30d ?? 0), workShifts30d: Number(flow.workShifts30d ?? 0),
  }, activeJobs, historicalJobs);
}

function sqliteBankMarketSnapshot(now: number): BankMarketSnapshot {
  const accounts = db.prepare('SELECT COALESCE(SUM(balance+bank_balance),0) AS totalMoney,COALESCE(SUM(bank_balance),0) AS savings FROM economy_accounts WHERE guild_id=?').get(GLOBAL_SCOPE_ID) as { totalMoney: number; savings: number };
  const flow = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN created_at>=? AND reason='bank:deposit:vault' AND amount>0 THEN amount ELSE 0 END),0) AS deposits,
    COALESCE(SUM(CASE WHEN created_at>=? AND reason='bank:withdraw:vault' AND amount<0 THEN -amount ELSE 0 END),0) AS withdrawals,
    COALESCE(SUM(CASE WHEN reason IN ('bank:deposit:wallet','bank:deposit:vault','bank:withdraw:wallet','bank:withdraw:vault') OR reason LIKE 'transfer:%' OR reason LIKE 'rob:from:%' OR reason LIKE 'rob:to:%' THEN 0 ELSE amount END),0) AS netIssuance30d,
    COALESCE(SUM(CASE WHEN amount<0 AND (reason LIKE 'store:%' OR reason LIKE 'tool_upgrade:%' OR reason='rpg_shop' OR reason LIKE 'rpg_shop:%' OR reason='rpg_training' OR reason LIKE 'profile_shop:%' OR reason LIKE 'business:land%' OR reason IN ('business:construction','business:upgrade','business:hire:npc','business:utilities','business:debt_payment','business:npc_wage','business:theft','business:reopen_fine','business:pest_control')) THEN -amount ELSE 0 END),0) AS purchaseVolume30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN amount ELSE 0 END),0) AS payroll30d,
    COALESCE(SUM(CASE WHEN amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') THEN 1 ELSE 0 END),0) AS workShifts30d
    FROM economy_ledger WHERE guild_id=? AND created_at>=? AND created_at<=?`)
    .get(now - BANK_POLICY_REBALANCE_SECONDS, now - BANK_POLICY_REBALANCE_SECONDS, GLOBAL_SCOPE_ID, now - BANK_ACTIVITY_WINDOW_SECONDS, now) as { deposits: number; withdrawals: number; netIssuance30d: number; purchaseVolume30d: number; payroll30d: number; workShifts30d: number };
  const activeJobs = db.prepare('SELECT user_id AS userId,job_id AS jobId,level FROM economy_jobs WHERE guild_id=? AND is_active=1').all(GLOBAL_SCOPE_ID) as Array<{ userId: string; jobId: string; level: number }>;
  const jobPayrollRows = db.prepare(`SELECT reason,COALESCE(SUM(amount),0) AS payroll,COUNT(*) AS shifts FROM economy_ledger
    WHERE guild_id=? AND created_at>=? AND created_at<=? AND amount>0 AND (reason='work_reward' OR reason LIKE 'work_reward:%') GROUP BY reason`)
    .all(GLOBAL_SCOPE_ID, now - BANK_ACTIVITY_WINDOW_SECONDS, now) as Array<{ reason: string; payroll: number; shifts: number }>;
  const historicalJobs = mergeBankJobPayrollRows(jobPayrollRows.map((row) => ({ reason: String(row.reason), payroll: Number(row.payroll), shifts: Number(row.shifts) })));
  return buildBankMarketSnapshot(Number(accounts.totalMoney), Number(accounts.savings), {
    deposits: Number(flow.deposits), withdrawals: Number(flow.withdrawals), netIssuance30d: Number(flow.netIssuance30d),
    purchaseVolume30d: Number(flow.purchaseVolume30d), payroll30d: Number(flow.payroll30d), workShifts30d: Number(flow.workShifts30d),
  }, activeJobs.map((job) => ({ userId: String(job.userId), jobId: String(job.jobId), level: Number(job.level) })), historicalJobs);
}

function nextBankApr(currentAprBps: number, targetAprBps: number, firstObservation = false): number {
  const target = clampBankApr(targetAprBps);
  if (firstObservation) return target;
  const delta = target - currentAprBps;
  return clampBankApr(currentAprBps + Math.sign(delta) * Math.min(Math.abs(delta), BANK_MAX_DAILY_APR_STEP_BPS));
}

type BankPolicyRow = { rateBps: number; lastRebalancedAt: number; modelVersion: number };

function observationFromSnapshot(snapshot: BankMarketSnapshot, rateBps: number, observedAt: number): BankMarketObservation {
  const effectiveAnnualBps = effectiveAnnualYieldBps(rateBps);
  return {
    observedAt, nominalAprBps: rateBps, effectiveAnnualBps, targetAprBps: snapshot.targetAprBps,
    targetEffectiveAnnualBps: effectiveAnnualYieldBps(snapshot.targetAprBps),
    botMoneyGrowthBps: snapshot.botMoneyGrowthBps, purchaseVelocityBps: snapshot.purchaseVelocityBps,
    savingsShareBps: snapshot.savingsShareBps, projectedMoneySupply30d: snapshot.projectedMoneySupply30d,
    moneySupply: snapshot.totalMoney, savings: snapshot.savings, netIssuance30d: snapshot.netIssuance30d,
    purchaseVolume30d: snapshot.purchaseVolume30d, payroll30d: snapshot.payroll30d, workShifts30d: snapshot.workShifts30d,
    activeWorkers: snapshot.activeWorkers, deposits24h: snapshot.deposits, withdrawals24h: snapshot.withdrawals,
    issuancePressureBps: snapshot.issuancePressureBps, purchasesPressureBps: snapshot.purchasesPressureBps,
    savingsPressureBps: snapshot.savingsPressureBps, liquidityPressureBps: snapshot.liquidityPressureBps,
    laborPressureBps: snapshot.laborPressureBps, jobs: snapshot.jobs,
  };
}

async function mysqlInsertMarketObservation(connection: PoolConnection, observation: BankMarketObservation): Promise<void> {
  await connection.execute(`INSERT INTO economy_bank_market_history (observed_at,nominal_apr_bps,effective_annual_bps,real_yield_bps,target_real_bps,
    inflation_reference_bps,issuance_pressure_bps,purchases_pressure_bps,savings_pressure_bps,liquidity_pressure_bps,labor_pressure_bps,
    money_supply,savings,net_issuance_30d,purchase_volume_30d,payroll_30d,work_shifts_30d,active_workers,deposits_24h,withdrawals_24h,job_mix_json,
    bot_money_growth_bps,purchase_velocity_bps,savings_share_bps,projected_money_supply_30d,target_apr_bps)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nominal_apr_bps=VALUES(nominal_apr_bps),effective_annual_bps=VALUES(effective_annual_bps),
    real_yield_bps=VALUES(real_yield_bps),target_real_bps=VALUES(target_real_bps),inflation_reference_bps=VALUES(inflation_reference_bps),
    issuance_pressure_bps=VALUES(issuance_pressure_bps),purchases_pressure_bps=VALUES(purchases_pressure_bps),savings_pressure_bps=VALUES(savings_pressure_bps),
    liquidity_pressure_bps=VALUES(liquidity_pressure_bps),labor_pressure_bps=VALUES(labor_pressure_bps),money_supply=VALUES(money_supply),savings=VALUES(savings),
    net_issuance_30d=VALUES(net_issuance_30d),purchase_volume_30d=VALUES(purchase_volume_30d),payroll_30d=VALUES(payroll_30d),work_shifts_30d=VALUES(work_shifts_30d),
    active_workers=VALUES(active_workers),deposits_24h=VALUES(deposits_24h),withdrawals_24h=VALUES(withdrawals_24h),job_mix_json=VALUES(job_mix_json),
    bot_money_growth_bps=VALUES(bot_money_growth_bps),purchase_velocity_bps=VALUES(purchase_velocity_bps),savings_share_bps=VALUES(savings_share_bps),
    projected_money_supply_30d=VALUES(projected_money_supply_30d),target_apr_bps=VALUES(target_apr_bps)`,
  [observation.observedAt, observation.nominalAprBps, observation.effectiveAnnualBps, 0, 0,
    0, observation.issuancePressureBps, observation.purchasesPressureBps, observation.savingsPressureBps,
    observation.liquidityPressureBps, observation.laborPressureBps, observation.moneySupply, observation.savings, observation.netIssuance30d,
    observation.purchaseVolume30d, observation.payroll30d, observation.workShifts30d, observation.activeWorkers, observation.deposits24h,
    observation.withdrawals24h, JSON.stringify(observation.jobs), observation.botMoneyGrowthBps, observation.purchaseVelocityBps,
    observation.savingsShareBps, observation.projectedMoneySupply30d, observation.targetAprBps]);
}

function sqliteInsertMarketObservation(observation: BankMarketObservation): void {
  db.prepare(`INSERT INTO economy_bank_market_history (observed_at,nominal_apr_bps,effective_annual_bps,real_yield_bps,target_real_bps,
    inflation_reference_bps,issuance_pressure_bps,purchases_pressure_bps,savings_pressure_bps,liquidity_pressure_bps,labor_pressure_bps,
    money_supply,savings,net_issuance_30d,purchase_volume_30d,payroll_30d,work_shifts_30d,active_workers,deposits_24h,withdrawals_24h,job_mix_json,
    bot_money_growth_bps,purchase_velocity_bps,savings_share_bps,projected_money_supply_30d,target_apr_bps)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(observed_at) DO UPDATE SET nominal_apr_bps=excluded.nominal_apr_bps,
    effective_annual_bps=excluded.effective_annual_bps,real_yield_bps=excluded.real_yield_bps,target_real_bps=excluded.target_real_bps,
    inflation_reference_bps=excluded.inflation_reference_bps,issuance_pressure_bps=excluded.issuance_pressure_bps,purchases_pressure_bps=excluded.purchases_pressure_bps,
    savings_pressure_bps=excluded.savings_pressure_bps,liquidity_pressure_bps=excluded.liquidity_pressure_bps,labor_pressure_bps=excluded.labor_pressure_bps,
    money_supply=excluded.money_supply,savings=excluded.savings,net_issuance_30d=excluded.net_issuance_30d,purchase_volume_30d=excluded.purchase_volume_30d,
    payroll_30d=excluded.payroll_30d,work_shifts_30d=excluded.work_shifts_30d,active_workers=excluded.active_workers,deposits_24h=excluded.deposits_24h,
    withdrawals_24h=excluded.withdrawals_24h,job_mix_json=excluded.job_mix_json,bot_money_growth_bps=excluded.bot_money_growth_bps,
    purchase_velocity_bps=excluded.purchase_velocity_bps,savings_share_bps=excluded.savings_share_bps,
    projected_money_supply_30d=excluded.projected_money_supply_30d,target_apr_bps=excluded.target_apr_bps`).run(
    observation.observedAt, observation.nominalAprBps, observation.effectiveAnnualBps, 0, 0,
    0, observation.issuancePressureBps, observation.purchasesPressureBps, observation.savingsPressureBps,
    observation.liquidityPressureBps, observation.laborPressureBps, observation.moneySupply, observation.savings, observation.netIssuance30d,
    observation.purchaseVolume30d, observation.payroll30d, observation.workShifts30d, observation.activeWorkers, observation.deposits24h,
    observation.withdrawals24h, JSON.stringify(observation.jobs), observation.botMoneyGrowthBps, observation.purchaseVelocityBps,
    observation.savingsShareBps, observation.projectedMoneySupply30d, observation.targetAprBps);
}

async function rebalanceBankInterestMysql(connection: PoolConnection, now: number): Promise<BankInterestPolicy> {
  await connection.execute('INSERT IGNORE INTO economy_bank_policy (policy_id,interest_rate_bps,last_rebalanced_at,model_version) VALUES (1,?,?,?)', [BANK_BASE_APR_BPS, 0, BANK_MODEL_VERSION]);
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT interest_rate_bps AS rateBps,last_rebalanced_at AS lastRebalancedAt,model_version AS modelVersion FROM economy_bank_policy WHERE policy_id=1 FOR UPDATE');
  const row = rows[0] as BankPolicyRow | undefined;
  if (!row) throw new Error('No pude cargar la política de interés del banco.');
  const currentRate = clampBankApr(Number(row.rateBps));
  const lastRebalancedAt = Number(row.lastRebalancedAt);
  const modelVersion = Number(row.modelVersion);
  if (modelVersion < BANK_MODEL_VERSION) {
    // v2 already stores annual APR and uses this remainder denominator. Preserve that
    // history when changing only the policy model; only v1 needs conversion from per-cut rates.
    if (modelVersion < 2) {
      await connection.execute('UPDATE economy_accounts SET bank_interest_remainder=LEAST(?,GREATEST(0,bank_interest_remainder)*?),last_bank_interest_at=CASE WHEN bank_balance>0 THEN ? ELSE last_bank_interest_at END WHERE bank_balance>0',
        [BANK_INTEREST_REMAINDER_DENOMINATOR - 1, BANK_PERIODS_PER_YEAR, now]);
      await connection.execute('DELETE FROM economy_bank_rate_history');
    }
    if (modelVersion < 3) await connection.execute('DELETE FROM economy_bank_market_history');
    const snapshot = await mysqlBankMarketSnapshot(connection, now);
    const newRate = snapshot.targetAprBps;
    const observation = observationFromSnapshot(snapshot, newRate, now);
    await connection.execute('UPDATE economy_bank_policy SET interest_rate_bps=?,last_rebalanced_at=?,model_version=? WHERE policy_id=1', [newRate, now, BANK_MODEL_VERSION]);
    await connection.execute('INSERT INTO economy_bank_rate_history (effective_at,interest_rate_bps) VALUES (?,?) ON DUPLICATE KEY UPDATE interest_rate_bps=VALUES(interest_rate_bps)', [now, newRate]);
    await mysqlInsertMarketObservation(connection, observation);
    return { rateBps: newRate, lastRebalancedAt: now, nextRebalanceAt: now + BANK_POLICY_REBALANCE_SECONDS };
  }
  if (lastRebalancedAt > 0 && now - lastRebalancedAt < BANK_POLICY_REBALANCE_SECONDS) {
    return { rateBps: currentRate, lastRebalancedAt, nextRebalanceAt: lastRebalancedAt + BANK_POLICY_REBALANCE_SECONDS };
  }
  const snapshot = await mysqlBankMarketSnapshot(connection, now);
  const firstObservation = lastRebalancedAt <= 0;
  const newRate = nextBankApr(currentRate, snapshot.targetAprBps, firstObservation);
  const observation = observationFromSnapshot(snapshot, newRate, now);
  await connection.execute('UPDATE economy_bank_policy SET interest_rate_bps=?,last_rebalanced_at=?,model_version=? WHERE policy_id=1', [newRate, now, BANK_MODEL_VERSION]);
  await connection.execute('INSERT INTO economy_bank_rate_history (effective_at,interest_rate_bps) VALUES (?,?) ON DUPLICATE KEY UPDATE interest_rate_bps=VALUES(interest_rate_bps)', [now, newRate]);
  await mysqlInsertMarketObservation(connection, observation);
  return { rateBps: newRate, lastRebalancedAt: now, nextRebalanceAt: now + BANK_POLICY_REBALANCE_SECONDS };
}

function rebalanceBankInterestSqlite(now: number): BankInterestPolicy {
  db.prepare('INSERT OR IGNORE INTO economy_bank_policy (policy_id,interest_rate_bps,last_rebalanced_at,model_version) VALUES (1,?,?,?)').run(BANK_BASE_APR_BPS, 0, BANK_MODEL_VERSION);
  const row = db.prepare('SELECT interest_rate_bps AS rateBps,last_rebalanced_at AS lastRebalancedAt,model_version AS modelVersion FROM economy_bank_policy WHERE policy_id=1').get() as BankPolicyRow;
  const currentRate = clampBankApr(Number(row.rateBps));
  const lastRebalancedAt = Number(row.lastRebalancedAt);
  if (Number(row.modelVersion) < BANK_MODEL_VERSION) {
    if (Number(row.modelVersion) < 2) {
      db.prepare('UPDATE economy_accounts SET bank_interest_remainder=MIN(?,MAX(0,bank_interest_remainder)*?),last_bank_interest_at=CASE WHEN bank_balance>0 THEN ? ELSE last_bank_interest_at END WHERE bank_balance>0')
        .run(BANK_INTEREST_REMAINDER_DENOMINATOR - 1, BANK_PERIODS_PER_YEAR, now);
      db.prepare('DELETE FROM economy_bank_rate_history').run();
    }
    if (Number(row.modelVersion) < 3) db.prepare('DELETE FROM economy_bank_market_history').run();
    const snapshot = sqliteBankMarketSnapshot(now);
    const newRate = snapshot.targetAprBps;
    const observation = observationFromSnapshot(snapshot, newRate, now);
    db.prepare('UPDATE economy_bank_policy SET interest_rate_bps=?,last_rebalanced_at=?,model_version=? WHERE policy_id=1').run(newRate, now, BANK_MODEL_VERSION);
    db.prepare('INSERT INTO economy_bank_rate_history (effective_at,interest_rate_bps) VALUES (?,?) ON CONFLICT(effective_at) DO UPDATE SET interest_rate_bps=excluded.interest_rate_bps').run(now, newRate);
    sqliteInsertMarketObservation(observation);
    return { rateBps: newRate, lastRebalancedAt: now, nextRebalanceAt: now + BANK_POLICY_REBALANCE_SECONDS };
  }
  if (lastRebalancedAt > 0 && now - lastRebalancedAt < BANK_POLICY_REBALANCE_SECONDS) {
    return { rateBps: currentRate, lastRebalancedAt, nextRebalanceAt: lastRebalancedAt + BANK_POLICY_REBALANCE_SECONDS };
  }
  const snapshot = sqliteBankMarketSnapshot(now);
  const firstObservation = lastRebalancedAt <= 0;
  const newRate = nextBankApr(currentRate, snapshot.targetAprBps, firstObservation);
  const observation = observationFromSnapshot(snapshot, newRate, now);
  db.prepare('UPDATE economy_bank_policy SET interest_rate_bps=?,last_rebalanced_at=?,model_version=? WHERE policy_id=1').run(newRate, now, BANK_MODEL_VERSION);
  db.prepare('INSERT INTO economy_bank_rate_history (effective_at,interest_rate_bps) VALUES (?,?) ON CONFLICT(effective_at) DO UPDATE SET interest_rate_bps=excluded.interest_rate_bps').run(now, newRate);
  sqliteInsertMarketObservation(observation);
  return { rateBps: newRate, lastRebalancedAt: now, nextRebalanceAt: now + BANK_POLICY_REBALANCE_SECONDS };
}

export async function rebalanceBankInterest(now = nowSeconds()): Promise<BankInterestPolicy> {
  if (economyPool) return withEconomyTransaction((connection) => rebalanceBankInterestMysql(connection, now));
  return db.transaction(() => rebalanceBankInterestSqlite(now)).immediate();
}

type BankMarketDbRow = {
  observedAt: number; nominalAprBps: number; effectiveAnnualBps: number; moneySupply: number; savings: number;
  netIssuance30d: number; purchaseVolume30d: number; targetAprBps: number; targetEffectiveAnnualBps: number;
  botMoneyGrowthBps: number; purchaseVelocityBps: number; savingsShareBps: number; projectedMoneySupply30d: number;
  payroll30d: number; workShifts30d: number; activeWorkers: number; deposits24h: number; withdrawals24h: number;
  issuancePressureBps: number; purchasesPressureBps: number; savingsPressureBps: number; liquidityPressureBps: number;
  laborPressureBps: number; jobMixJson: string;
};

function bankObservationFromRow(row: BankMarketDbRow): BankMarketObservation {
  let jobs: BankJobMixEntry[] = [];
  try {
    const parsed: unknown = JSON.parse(row.jobMixJson);
    if (Array.isArray(parsed)) jobs = parsed as BankJobMixEntry[];
  } catch { /* ignore malformed historical metadata and keep the financial observation */ }
  return {
    observedAt: Number(row.observedAt), nominalAprBps: Number(row.nominalAprBps), effectiveAnnualBps: Number(row.effectiveAnnualBps),
    targetAprBps: Number(row.targetAprBps), targetEffectiveAnnualBps: effectiveAnnualYieldBps(Number(row.targetAprBps)),
    botMoneyGrowthBps: Number(row.botMoneyGrowthBps), purchaseVelocityBps: Number(row.purchaseVelocityBps),
    savingsShareBps: Number(row.savingsShareBps), projectedMoneySupply30d: Number(row.projectedMoneySupply30d),
    moneySupply: Number(row.moneySupply), savings: Number(row.savings), netIssuance30d: Number(row.netIssuance30d),
    purchaseVolume30d: Number(row.purchaseVolume30d), payroll30d: Number(row.payroll30d), workShifts30d: Number(row.workShifts30d),
    activeWorkers: Number(row.activeWorkers), deposits24h: Number(row.deposits24h), withdrawals24h: Number(row.withdrawals24h),
    issuancePressureBps: Number(row.issuancePressureBps), purchasesPressureBps: Number(row.purchasesPressureBps),
    savingsPressureBps: Number(row.savingsPressureBps), liquidityPressureBps: Number(row.liquidityPressureBps),
    laborPressureBps: Number(row.laborPressureBps), jobs,
  };
}

export async function getBankInterestDashboard(now = nowSeconds()): Promise<BankInterestDashboard> {
  const policy = await rebalanceBankInterest(now);
  const select = `SELECT observed_at AS observedAt,nominal_apr_bps AS nominalAprBps,effective_annual_bps AS effectiveAnnualBps,
    target_apr_bps AS targetAprBps,bot_money_growth_bps AS botMoneyGrowthBps,purchase_velocity_bps AS purchaseVelocityBps,
    savings_share_bps AS savingsShareBps,projected_money_supply_30d AS projectedMoneySupply30d,
    money_supply AS moneySupply,savings,net_issuance_30d AS netIssuance30d,purchase_volume_30d AS purchaseVolume30d,
    payroll_30d AS payroll30d,work_shifts_30d AS workShifts30d,active_workers AS activeWorkers,deposits_24h AS deposits24h,
    withdrawals_24h AS withdrawals24h,issuance_pressure_bps AS issuancePressureBps,purchases_pressure_bps AS purchasesPressureBps,
    savings_pressure_bps AS savingsPressureBps,liquidity_pressure_bps AS liquidityPressureBps,labor_pressure_bps AS laborPressureBps,job_mix_json AS jobMixJson
    FROM economy_bank_market_history ORDER BY observed_at DESC LIMIT 30`;
  let rows: BankMarketDbRow[];
  if (economyPool) {
    const [result] = await economyPool.execute<RowDataPacket[]>(select);
    rows = result as BankMarketDbRow[];
  } else {
    rows = db.prepare(select).all() as BankMarketDbRow[];
  }
  const history = rows.map(bankObservationFromRow).reverse();
  const current = history.at(-1);
  if (!current) throw new Error('Todavía no hay una observación guardada para mostrar del mercado bancario.');
  const liveSnapshot = economyPool
    ? await economyPool.getConnection().then(async (connection) => {
      try { return await mysqlBankMarketSnapshot(connection, now); }
      finally { connection.release(); }
    })
    : sqliteBankMarketSnapshot(now);
  const live = observationFromSnapshot(liveSnapshot, policy.rateBps, now);
  return { current, history, live };
}

async function mysqlBankInterestRateHistory(connection: PoolConnection, after: number, now: number): Promise<BankInterestRateRow[]> {
  const [earlierRows] = await connection.execute<RowDataPacket[]>('SELECT effective_at AS effectiveAt,interest_rate_bps AS rateBps FROM economy_bank_rate_history WHERE effective_at<=? ORDER BY effective_at DESC LIMIT 1', [after]);
  const [laterRows] = await connection.execute<RowDataPacket[]>('SELECT effective_at AS effectiveAt,interest_rate_bps AS rateBps FROM economy_bank_rate_history WHERE effective_at>? AND effective_at<=? ORDER BY effective_at ASC', [after, now]);
  const rows = [...(earlierRows as Array<{ effectiveAt: number; rateBps: number }>), ...(laterRows as Array<{ effectiveAt: number; rateBps: number }>)];
  return rows.map((entry) => ({ effectiveAt: Number(entry.effectiveAt), rateBps: preserveHistoricalBankApr(Number(entry.rateBps)) }));
}

function sqliteBankInterestRateHistory(after: number, now: number): BankInterestRateRow[] {
  const earlier = db.prepare('SELECT effective_at AS effectiveAt,interest_rate_bps AS rateBps FROM economy_bank_rate_history WHERE effective_at<=? ORDER BY effective_at DESC LIMIT 1').get(after) as BankInterestRateRow | undefined;
  const later = db.prepare('SELECT effective_at AS effectiveAt,interest_rate_bps AS rateBps FROM economy_bank_rate_history WHERE effective_at>? AND effective_at<=? ORDER BY effective_at ASC').all(after, now) as BankInterestRateRow[];
  return [...(earlier ? [{ effectiveAt: Number(earlier.effectiveAt), rateBps: preserveHistoricalBankApr(Number(earlier.rateBps)) }] : []), ...later.map((entry) => ({ effectiveAt: Number(entry.effectiveAt), rateBps: preserveHistoricalBankApr(Number(entry.rateBps)) }))];
}

function calculateBankInterest(account: Pick<AccountRow, 'bankBalance' | 'lastBankInterestAt' | 'bankInterestRemainder'>, now: number, rates: BankInterestRateRow[]) {
  const rawLastAt = account.lastBankInterestAt === null ? now : Number(account.lastBankInterestAt);
  // Older versions stored zero for untouched accounts; Discord rendered that as “57 years ago”.
  const lastAt = !Number.isSafeInteger(rawLastAt) || rawLastAt <= 0 || rawLastAt > now + 60 ? now : rawLastAt;
  const periods = Math.max(0, Math.floor((now - lastAt) / BANK_INTEREST_INTERVAL_SECONDS));
  let bankBalance = account.bankBalance;
  let remainder = clamp(Math.trunc(account.bankInterestRemainder), 0, BANK_INTEREST_REMAINDER_DENOMINATOR - 1);
  let rateIndex = 0;
  let currentRate = rates[0]?.rateBps ?? BANK_BASE_APR_BPS;
  for (let period = 0; period < periods; period++) {
    const dueAt = lastAt + (period + 1) * BANK_INTEREST_INTERVAL_SECONDS;
    while (rateIndex + 1 < rates.length && rates[rateIndex + 1]!.effectiveAt <= dueAt) {
      rateIndex++;
      currentRate = rates[rateIndex]!.rateBps;
    }
    const numerator = bankBalance * currentRate + remainder;
    const earned = Math.floor(numerator / BANK_INTEREST_REMAINDER_DENOMINATOR);
    remainder = numerator % BANK_INTEREST_REMAINDER_DENOMINATOR;
    bankBalance += earned;
  }
  const nextInterestAt = lastAt + periods * BANK_INTEREST_INTERVAL_SECONDS;
  return { periods, bankBalance, remainder, interestEarned: bankBalance - account.bankBalance, nextInterestAt };
}

function minimumInterestAnchor(accounts: BankInterestAccount[], now: number): number {
  return accounts.reduce((earliest, account) => {
    const value = account.lastBankInterestAt === null ? now : Number(account.lastBankInterestAt);
    const anchor = !Number.isSafeInteger(value) || value <= 0 || value > now + 60 ? now : value;
    return Math.min(earliest, anchor);
  }, now);
}

export async function accrueMaturedBankInterest(now = nowSeconds()): Promise<{ accountsProcessed: number; totalInterest: number }> {
  const dueBefore = now - BANK_INTEREST_INTERVAL_SECONDS;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    await rebalanceBankInterestMysql(connection, now);
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT user_id AS userId,bank_balance AS bankBalance,
      last_bank_interest_at AS lastBankInterestAt,bank_interest_remainder AS bankInterestRemainder
      FROM economy_accounts WHERE guild_id=? AND bank_balance>0
      AND (last_bank_interest_at IS NULL OR last_bank_interest_at<=?) ORDER BY user_id FOR UPDATE`, [GLOBAL_SCOPE_ID, dueBefore]);
    const accounts = rows.map((row) => ({ userId: String(row.userId), bankBalance: Number(row.bankBalance),
      lastBankInterestAt: row.lastBankInterestAt === null ? null : Number(row.lastBankInterestAt),
      bankInterestRemainder: Number(row.bankInterestRemainder) }));
    if (!accounts.length) return { accountsProcessed: 0, totalInterest: 0 };
    const rates = await mysqlBankInterestRateHistory(connection, minimumInterestAnchor(accounts, now), now);
    let totalInterest = 0;
    for (const account of accounts) {
      const accrued = calculateBankInterest(account, now, rates);
      await connection.execute(`UPDATE economy_accounts SET bank_balance=?,bank_interest_remainder=?,last_bank_interest_at=?,updated_at=? WHERE guild_id=? AND user_id=?`,
        [accrued.bankBalance, accrued.remainder, accrued.nextInterestAt, now, GLOBAL_SCOPE_ID, account.userId]);
      if (accrued.interestEarned > 0) {
        await mysqlAddLedger(connection, GLOBAL_SCOPE_ID, account.userId, accrued.interestEarned, 'bank:interest',
          `bank-interest:${GLOBAL_SCOPE_ID}:${account.userId}:${accrued.nextInterestAt}`, now);
        totalInterest += accrued.interestEarned;
      }
    }
    return { accountsProcessed: accounts.length, totalInterest };
  });

  const processSqlite = db.transaction(() => {
    rebalanceBankInterestSqlite(now);
    const rows = db.prepare(`SELECT user_id AS userId,bank_balance AS bankBalance,
      last_bank_interest_at AS lastBankInterestAt,bank_interest_remainder AS bankInterestRemainder
      FROM economy_accounts WHERE guild_id=? AND bank_balance>0
      AND (last_bank_interest_at IS NULL OR last_bank_interest_at<=?) ORDER BY user_id`)
      .all(GLOBAL_SCOPE_ID, dueBefore) as BankInterestAccount[];
    if (!rows.length) return { accountsProcessed: 0, totalInterest: 0 };
    const rates = sqliteBankInterestRateHistory(minimumInterestAnchor(rows, now), now);
    let totalInterest = 0;
    for (const account of rows) {
      const accrued = calculateBankInterest(account, now, rates);
      db.prepare('UPDATE economy_accounts SET bank_balance=?,bank_interest_remainder=?,last_bank_interest_at=?,updated_at=? WHERE guild_id=? AND user_id=?')
        .run(accrued.bankBalance, accrued.remainder, accrued.nextInterestAt, now, GLOBAL_SCOPE_ID, account.userId);
      if (accrued.interestEarned > 0) {
        db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)')
          .run(GLOBAL_SCOPE_ID, account.userId, accrued.interestEarned, 'bank:interest',
            `bank-interest:${GLOBAL_SCOPE_ID}:${account.userId}:${accrued.nextInterestAt}`, now);
        totalInterest += accrued.interestEarned;
      }
    }
    return { accountsProcessed: rows.length, totalInterest };
  });
  return processSqlite.immediate();
}

async function accrueBankInterestMysql(connection: PoolConnection, guildId: string, userId: string, account: AccountRow, now: number) {
  const anchor = account.lastBankInterestAt === null || Number(account.lastBankInterestAt) <= 0 || Number(account.lastBankInterestAt) > now + 60 ? now : Number(account.lastBankInterestAt);
  const rates = await mysqlBankInterestRateHistory(connection, anchor, now);
  const accrued = calculateBankInterest(account, now, rates);
  await connection.execute(`UPDATE economy_accounts SET bank_balance = ?, bank_interest_remainder = ?,
    last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`,
  [accrued.bankBalance, accrued.remainder, accrued.nextInterestAt, now, guildId, userId]);
  if (accrued.interestEarned > 0) {
    await mysqlAddLedger(connection, guildId, userId, accrued.interestEarned, 'bank:interest',
      `bank-interest:${guildId}:${userId}:${accrued.nextInterestAt}`, now);
  }
  return accrued;
}

function accrueBankInterestSqlite(guildId: string, userId: string, account: AccountRow, now: number) {
  const anchor = account.lastBankInterestAt === null || Number(account.lastBankInterestAt) <= 0 || Number(account.lastBankInterestAt) > now + 60 ? now : Number(account.lastBankInterestAt);
  const accrued = calculateBankInterest(account, now, sqliteBankInterestRateHistory(anchor, now));
  db.prepare(`UPDATE economy_accounts SET bank_balance = ?, bank_interest_remainder = ?,
    last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?`)
    .run(accrued.bankBalance, accrued.remainder, accrued.nextInterestAt, now, guildId, userId);
  if (accrued.interestEarned > 0) {
    db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, userId, accrued.interestEarned, 'bank:interest',
        `bank-interest:${guildId}:${userId}:${accrued.nextInterestAt}`, now);
  }
  return accrued;
}

export async function bankAction(guildId: string, userId: string, action: BankAction, amount = 0, reference = ''): Promise<BankResult> {
  guildId = GLOBAL_SCOPE_ID;
  if (action !== 'view' && (!Number.isSafeInteger(amount) || amount <= 0)) {
    const now = nowSeconds();
    return { ok: false, reason: 'invalid_amount', balance: 0, bankBalance: 0, interestEarned: 0,
      interestRateBps: BANK_BASE_APR_BPS, nextInterestAt: now + BANK_INTEREST_INTERVAL_SECONDS,
      nextRateRebalanceAt: now + BANK_POLICY_REBALANCE_SECONDS };
  }
  const now = nowSeconds();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const policy = await rebalanceBankInterestMysql(connection, now);
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const accrued = await accrueBankInterestMysql(connection, guildId, userId, account, now);
    const bankBalance = accrued.bankBalance;
    let balance = account.balance;
    let nextBankBalance = bankBalance;
    if (action === 'deposit') {
      if (balance < amount) return { ok: false, reason: 'insufficient_wallet', balance, bankBalance, interestEarned: accrued.interestEarned,
        interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS, nextRateRebalanceAt: policy.nextRebalanceAt };
      balance -= amount;
      nextBankBalance += amount;
      await connection.execute('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
        [balance, nextBankBalance, accrued.nextInterestAt, now, guildId, userId]);
      await mysqlAddLedger(connection, guildId, userId, -amount, 'bank:deposit:wallet', `${reference}:wallet`, now);
      await mysqlAddLedger(connection, guildId, userId, amount, 'bank:deposit:vault', `${reference}:vault`, now);
    } else if (action === 'withdraw') {
      if (bankBalance < amount) return { ok: false, reason: 'insufficient_bank', balance, bankBalance, interestEarned: accrued.interestEarned,
        interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS, nextRateRebalanceAt: policy.nextRebalanceAt };
      balance += amount;
      nextBankBalance -= amount;
      await connection.execute('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
        [balance, nextBankBalance, accrued.nextInterestAt, now, guildId, userId]);
      await mysqlAddLedger(connection, guildId, userId, amount, 'bank:withdraw:wallet', `${reference}:wallet`, now);
      await mysqlAddLedger(connection, guildId, userId, -amount, 'bank:withdraw:vault', `${reference}:vault`, now);
    }
    return { ok: true, balance, bankBalance: nextBankBalance, interestEarned: accrued.interestEarned,
      interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS,
      nextRateRebalanceAt: policy.nextRebalanceAt };
  });

  const operate = db.transaction(() => {
    const policy = rebalanceBankInterestSqlite(now);
    const account = sqliteEnsureAccount(guildId, userId);
    const accrued = accrueBankInterestSqlite(guildId, userId, account, now);
    const bankBalance = accrued.bankBalance;
    let balance = account.balance;
    let nextBankBalance = bankBalance;
    if (action === 'deposit') {
      if (balance < amount) return { ok: false, reason: 'insufficient_wallet' as const, balance, bankBalance, interestEarned: accrued.interestEarned,
        interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS, nextRateRebalanceAt: policy.nextRebalanceAt };
      balance -= amount;
      nextBankBalance += amount;
      db.prepare('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?')
        .run(balance, nextBankBalance, accrued.nextInterestAt, now, guildId, userId);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, -amount, 'bank:deposit:wallet', `${reference}:wallet`, now);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, amount, 'bank:deposit:vault', `${reference}:vault`, now);
    } else if (action === 'withdraw') {
      if (bankBalance < amount) return { ok: false, reason: 'insufficient_bank' as const, balance, bankBalance, interestEarned: accrued.interestEarned,
        interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS, nextRateRebalanceAt: policy.nextRebalanceAt };
      balance += amount;
      nextBankBalance -= amount;
      db.prepare('UPDATE economy_accounts SET balance = ?, bank_balance = ?, last_bank_interest_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?')
        .run(balance, nextBankBalance, accrued.nextInterestAt, now, guildId, userId);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, amount, 'bank:withdraw:wallet', `${reference}:wallet`, now);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, -amount, 'bank:withdraw:vault', `${reference}:vault`, now);
    }
    return { ok: true, balance, bankBalance: nextBankBalance, interestEarned: accrued.interestEarned,
      interestRateBps: policy.rateBps, nextInterestAt: accrued.nextInterestAt + BANK_INTEREST_INTERVAL_SECONDS,
      nextRateRebalanceAt: policy.nextRebalanceAt };
  });
  return operate.immediate();
}

const PERSONAL_LOAN_MIN = 100;
const PERSONAL_LOAN_MAX = 10_000;
const PERSONAL_LOAN_TERM_SECONDS = 7 * 24 * 60 * 60;
const PERSONAL_LOAN_LATE_PERIOD_SECONDS = 24 * 60 * 60;
const PERSONAL_LOAN_RISK_SPREAD_BPS = 1_800;
const PERSONAL_LOAN_BANKRUPTCY_GRACE_SECONDS = 7 * 24 * 60 * 60;
const PERSONAL_LOAN_FORECLOSURE_SECONDS = 30 * 24 * 60 * 60;
const PERSONAL_LOAN_COLLATERAL_HAIRCUT_BPS = 6_000;

export type PersonalLoan = {
  principal: number;
  balanceDue: number;
  originationFee: number;
  interestAmount: number;
  aprBps: number;
  createdAt: number;
  dueAt: number;
  lateFeePeriods: number;
  bankruptAt: number | null;
  foreclosureAt: number | null;
  foreclosedAt: number | null;
  collateralValue: number;
};

export type PersonalLoanOverview = {
  walletBalance: number;
  bankBalance: number;
  creditLimit: number;
  referenceAprBps: number;
  loan: PersonalLoan | null;
  foreclosureNotice: { jobId: string; collateralValue: number; appliedToDebt: number; cashSurplus: number; foreclosedAt: number } | null;
};

type PersonalLoanDbRow = RowDataPacket & PersonalLoan;

function personalLoanCreditLimit(account: Pick<AccountRow, 'balance' | 'bankBalance'>): number {
  return Math.min(PERSONAL_LOAN_MAX, Math.max(500, Math.floor((account.balance + account.bankBalance) * 0.5)));
}

function loanFromDbRow(row: PersonalLoanDbRow): PersonalLoan {
  return {
    principal: Number(row.principal), balanceDue: Number(row.balanceDue), originationFee: Number(row.originationFee),
    interestAmount: Number(row.interestAmount), aprBps: Number(row.aprBps), createdAt: Number(row.createdAt),
    dueAt: Number(row.dueAt), lateFeePeriods: Number(row.lateFeePeriods),
    bankruptAt: row.bankruptAt === null ? null : Number(row.bankruptAt),
    foreclosureAt: row.foreclosureAt === null ? null : Number(row.foreclosureAt),
    foreclosedAt: row.foreclosedAt === null ? null : Number(row.foreclosedAt), collateralValue: Number(row.collateralValue),
  };
}

function fallbackBusinessInvestment(jobId: string, level: number, status: string): number {
  const business = businessJobs.find((entry) => entry.jobId === jobId);
  if (!business) return 0;
  let value = business.landPrice;
  if (status !== 'land') {
    value += business.buildPrice;
    for (let priorLevel = 1; priorLevel < level; priorLevel++) {
      value += Math.round(650 + (priorLevel - 1) * 430 + (priorLevel - 1) ** 2 * 85);
    }
  }
  return value;
}

function accruePersonalLoanLateFees(loan: PersonalLoan, now: number): { loan: PersonalLoan; feeAdded: number } {
  const elapsedPeriods = Math.max(0, Math.min(10, Math.floor((now - loan.dueAt) / PERSONAL_LOAN_LATE_PERIOD_SECONDS)));
  const additionalPeriods = Math.max(0, elapsedPeriods - loan.lateFeePeriods);
  if (additionalPeriods === 0) return { loan, feeAdded: 0 };
  const feeCap = Math.max(1, Math.floor(loan.principal * 0.1));
  const feePerDay = Math.max(1, Math.ceil(loan.principal * 0.01));
  const currentFee = Math.min(feeCap, feePerDay * loan.lateFeePeriods);
  const nextFee = Math.min(feeCap, feePerDay * elapsedPeriods);
  const feeAdded = Math.max(0, nextFee - currentFee);
  return { loan: { ...loan, balanceDue: loan.balanceDue + feeAdded, lateFeePeriods: elapsedPeriods }, feeAdded };
}

async function mysqlLoadPersonalLoan(connection: PoolConnection, guildId: string, userId: string, lock: boolean): Promise<PersonalLoan | null> {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT principal,balance_due AS balanceDue,origination_fee AS originationFee,
    interest_amount AS interestAmount,apr_bps AS aprBps,created_at AS createdAt,due_at AS dueAt,late_fee_periods AS lateFeePeriods,
    bankrupt_at AS bankruptAt,foreclosure_at AS foreclosureAt,foreclosed_at AS foreclosedAt,collateral_value AS collateralValue
    FROM economy_loans WHERE guild_id=? AND user_id=?${lock ? ' FOR UPDATE' : ''}`, [guildId, userId]);
  return rows[0] ? loanFromDbRow(rows[0] as PersonalLoanDbRow) : null;
}

function sqliteLoadPersonalLoan(guildId: string, userId: string): PersonalLoan | null {
  const row = db.prepare(`SELECT principal,balance_due AS balanceDue,origination_fee AS originationFee,
    interest_amount AS interestAmount,apr_bps AS aprBps,created_at AS createdAt,due_at AS dueAt,late_fee_periods AS lateFeePeriods,
    bankrupt_at AS bankruptAt,foreclosure_at AS foreclosureAt,foreclosed_at AS foreclosedAt,collateral_value AS collateralValue
    FROM economy_loans WHERE guild_id=? AND user_id=?`).get(guildId, userId) as PersonalLoanDbRow | undefined;
  return row ? loanFromDbRow(row) : null;
}

const isPersonalLoanBankrupt = (loan: PersonalLoan | null): boolean => loan !== null && loan.bankruptAt !== null;

async function mysqlPersistPersonalLoanLateFees(connection: PoolConnection, guildId: string, userId: string, loan: PersonalLoan, now: number): Promise<PersonalLoan> {
  const accrued = accruePersonalLoanLateFees(loan, now);
  if (accrued.feeAdded > 0) await connection.execute('UPDATE economy_loans SET balance_due=?,late_fee_periods=? WHERE guild_id=? AND user_id=?',
    [accrued.loan.balanceDue, accrued.loan.lateFeePeriods, guildId, userId]);
  return accrued.loan;
}

function sqlitePersistPersonalLoanLateFees(guildId: string, userId: string, loan: PersonalLoan, now: number): PersonalLoan {
  const accrued = accruePersonalLoanLateFees(loan, now);
  if (accrued.feeAdded > 0) db.prepare('UPDATE economy_loans SET balance_due=?,late_fee_periods=? WHERE guild_id=? AND user_id=?')
    .run(accrued.loan.balanceDue, accrued.loan.lateFeePeriods, guildId, userId);
  return accrued.loan;
}

async function reconcilePersonalLoanMysql(connection: PoolConnection, guildId: string, userId: string, now: number, lockedAccount?: AccountRow): Promise<PersonalLoan | null> {
  const account = lockedAccount ?? await mysqlEnsureAccount(connection, guildId, userId, true);
  const current = await mysqlLoadPersonalLoan(connection, guildId, userId, true);
  if (!current) return null;
  let loan = await mysqlPersistPersonalLoanLateFees(connection, guildId, userId, current, now);
  if (loan.bankruptAt === null && now >= loan.dueAt + PERSONAL_LOAN_BANKRUPTCY_GRACE_SECONDS
      && account.balance + account.bankBalance < loan.balanceDue) {
    const [businessRows] = await connection.execute<RowDataPacket[]>(`SELECT job_id AS jobId,status,level,
      investment_value AS investmentValue,mortgaged_at AS mortgagedAt FROM economy_businesses
      WHERE guild_id=? AND owner_id=? FOR UPDATE`, [guildId, userId]);
    const business = businessRows[0];
    const investment = business ? Math.max(Number(business.investmentValue ?? 0), fallbackBusinessInvestment(String(business.jobId), Number(business.level), String(business.status))) : 0;
    const collateralValue = Math.floor(investment * PERSONAL_LOAN_COLLATERAL_HAIRCUT_BPS / 10_000);
    const foreclosureAt = business ? now + PERSONAL_LOAN_FORECLOSURE_SECONDS : null;
    await connection.execute('UPDATE economy_loans SET bankrupt_at=?,foreclosure_at=?,collateral_value=? WHERE guild_id=? AND user_id=?',
      [now, foreclosureAt, collateralValue, guildId, userId]);
    if (business) await connection.execute('UPDATE economy_businesses SET mortgaged_at=?,updated_at=? WHERE guild_id=? AND owner_id=?', [now, now, guildId, userId]);
    loan = { ...loan, bankruptAt: now, foreclosureAt, collateralValue };
  }
  if (loan.bankruptAt !== null && loan.foreclosureAt !== null && loan.foreclosedAt === null && now >= loan.foreclosureAt) {
    const [businessRows] = await connection.execute<RowDataPacket[]>('SELECT job_id AS jobId,mortgaged_at AS mortgagedAt FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE', [guildId, userId]);
    const hasMortgagedProperty = businessRows[0]?.mortgagedAt !== null && businessRows[0]?.mortgagedAt !== undefined;
    if (hasMortgagedProperty) {
      const recovered = Math.min(loan.balanceDue, loan.collateralValue);
      const remaining = loan.balanceDue - recovered;
      const surplus = Math.max(0, loan.collateralValue - recovered);
      const reference = `loan-foreclosure:${guildId}:${userId}:${loan.createdAt}`;
      await connection.execute(`INSERT IGNORE INTO economy_loan_foreclosures(guild_id,user_id,loan_created_at,job_id,collateral_value,applied_to_debt,cash_surplus,foreclosed_at)
        VALUES(?,?,?,?,?,?,?,?)`, [guildId, userId, loan.createdAt, String(businessRows[0]!.jobId), loan.collateralValue, recovered, surplus, now]);
      if (recovered > 0) await mysqlAddLedger(connection, guildId, userId, -recovered, 'loan:collateral_recovery', `${reference}:recovery`, now);
      if (surplus > 0) {
        await connection.execute('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?', [surplus, now, guildId, userId]);
        await mysqlAddLedger(connection, guildId, userId, surplus, 'loan:collateral_surplus', `${reference}:surplus`, now);
      }
      await connection.execute('DELETE FROM economy_business_events WHERE guild_id=? AND owner_id=?', [guildId, userId]);
      await connection.execute('DELETE FROM economy_business_employees WHERE guild_id=? AND owner_id=?', [guildId, userId]);
      await connection.execute('DELETE FROM economy_business_buffs WHERE guild_id=? AND user_id=?', [guildId, userId]);
      await connection.execute('DELETE FROM economy_businesses WHERE guild_id=? AND owner_id=?', [guildId, userId]);
      if (remaining === 0) {
        await connection.execute('DELETE FROM economy_loans WHERE guild_id=? AND user_id=?', [guildId, userId]);
        return null;
      }
      loan = { ...loan, balanceDue: remaining, foreclosedAt: now };
      await connection.execute('UPDATE economy_loans SET balance_due=?,foreclosed_at=? WHERE guild_id=? AND user_id=?', [remaining, now, guildId, userId]);
    } else {
      loan = { ...loan, foreclosedAt: now };
      await connection.execute('UPDATE economy_loans SET foreclosed_at=? WHERE guild_id=? AND user_id=?', [now, guildId, userId]);
    }
  }
  return loan;
}

type WorkLoanPayment = { payout: number; withheld: number; remaining: number };

async function applyBankruptcyWorkPaymentMysql(connection: PoolConnection, guildId: string, userId: string, loan: PersonalLoan | null, gross: number, reference: string, now: number): Promise<WorkLoanPayment> {
  if (!loan || loan.bankruptAt === null || gross <= 0) return { payout: gross, withheld: 0, remaining: loan?.balanceDue ?? 0 };
  const withheld = Math.min(gross, loan.balanceDue);
  const remaining = loan.balanceDue - withheld;
  if (remaining === 0) {
    await connection.execute('DELETE FROM economy_loans WHERE guild_id=? AND user_id=?', [guildId, userId]);
    await connection.execute('UPDATE economy_businesses SET mortgaged_at=NULL,updated_at=? WHERE guild_id=? AND owner_id=?', [now, guildId, userId]);
  } else {
    await connection.execute('UPDATE economy_loans SET balance_due=? WHERE guild_id=? AND user_id=?', [remaining, guildId, userId]);
  }
  if (withheld > 0) await mysqlAddLedger(connection, guildId, userId, -withheld, 'loan:work_repayment', `${reference}:loan-payment`, now);
  return { payout: gross - withheld, withheld, remaining };
}

function applyBankruptcyWorkPaymentSqlite(guildId: string, userId: string, loan: PersonalLoan | null, gross: number, reference: string, now: number): WorkLoanPayment {
  if (!loan || loan.bankruptAt === null || gross <= 0) return { payout: gross, withheld: 0, remaining: loan?.balanceDue ?? 0 };
  const withheld = Math.min(gross, loan.balanceDue);
  const remaining = loan.balanceDue - withheld;
  if (remaining === 0) {
    db.prepare('DELETE FROM economy_loans WHERE guild_id=? AND user_id=?').run(guildId, userId);
    db.prepare('UPDATE economy_businesses SET mortgaged_at=NULL,updated_at=? WHERE guild_id=? AND owner_id=?').run(now, guildId, userId);
  } else {
    db.prepare('UPDATE economy_loans SET balance_due=? WHERE guild_id=? AND user_id=?').run(remaining, guildId, userId);
  }
  if (withheld > 0) db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)')
    .run(guildId, userId, -withheld, 'loan:work_repayment', `${reference}:loan-payment`, now);
  return { payout: gross - withheld, withheld, remaining };
}

function workLoanPaymentText(payment: WorkLoanPayment): string {
  if (!payment.withheld) return '';
  return payment.remaining === 0
    ? `\n🏦 El banco retuvo **${money.format(payment.withheld)}** de este turno y liquidaste el préstamo. La hipoteca quedó liberada.`
    : `\n🏦 El banco aplicó **${money.format(payment.withheld)}** de este turno a tu deuda; quedan **${money.format(payment.remaining)}**. La hipoteca sigue activa.`;
}

function reconcilePersonalLoanSqlite(guildId: string, userId: string, now: number, lockedAccount?: AccountRow): PersonalLoan | null {
  const account = lockedAccount ?? sqliteEnsureAccount(guildId, userId);
  const current = sqliteLoadPersonalLoan(guildId, userId);
  if (!current) return null;
  let loan = sqlitePersistPersonalLoanLateFees(guildId, userId, current, now);
  if (loan.bankruptAt === null && now >= loan.dueAt + PERSONAL_LOAN_BANKRUPTCY_GRACE_SECONDS
      && account.balance + account.bankBalance < loan.balanceDue) {
    const business = db.prepare('SELECT job_id AS jobId,status,level,investment_value AS investmentValue,mortgaged_at AS mortgagedAt FROM economy_businesses WHERE guild_id=? AND owner_id=?')
      .get(guildId, userId) as { jobId: string; status: string; level: number; investmentValue: number; mortgagedAt: number | null } | undefined;
    const investment = business ? Math.max(Number(business.investmentValue ?? 0), fallbackBusinessInvestment(business.jobId, Number(business.level), business.status)) : 0;
    const collateralValue = Math.floor(investment * PERSONAL_LOAN_COLLATERAL_HAIRCUT_BPS / 10_000);
    const foreclosureAt = business ? now + PERSONAL_LOAN_FORECLOSURE_SECONDS : null;
    db.prepare('UPDATE economy_loans SET bankrupt_at=?,foreclosure_at=?,collateral_value=? WHERE guild_id=? AND user_id=?').run(now, foreclosureAt, collateralValue, guildId, userId);
    if (business) db.prepare('UPDATE economy_businesses SET mortgaged_at=?,updated_at=? WHERE guild_id=? AND owner_id=?').run(now, now, guildId, userId);
    loan = { ...loan, bankruptAt: now, foreclosureAt, collateralValue };
  }
  if (loan.bankruptAt !== null && loan.foreclosureAt !== null && loan.foreclosedAt === null && now >= loan.foreclosureAt) {
    const business = db.prepare('SELECT job_id AS jobId,mortgaged_at AS mortgagedAt FROM economy_businesses WHERE guild_id=? AND owner_id=?')
      .get(guildId, userId) as { jobId: string; mortgagedAt: number | null } | undefined;
    if (business?.mortgagedAt !== null && business?.mortgagedAt !== undefined) {
      const recovered = Math.min(loan.balanceDue, loan.collateralValue);
      const remaining = loan.balanceDue - recovered;
      const surplus = Math.max(0, loan.collateralValue - recovered);
      const reference = `loan-foreclosure:${guildId}:${userId}:${loan.createdAt}`;
      db.prepare(`INSERT OR IGNORE INTO economy_loan_foreclosures(guild_id,user_id,loan_created_at,job_id,collateral_value,applied_to_debt,cash_surplus,foreclosed_at)
        VALUES(?,?,?,?,?,?,?,?)`).run(guildId, userId, loan.createdAt, business.jobId, loan.collateralValue, recovered, surplus, now);
      if (recovered > 0) db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -recovered, 'loan:collateral_recovery', `${reference}:recovery`, now);
      if (surplus > 0) {
        db.prepare('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?').run(surplus, now, guildId, userId);
        db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, surplus, 'loan:collateral_surplus', `${reference}:surplus`, now);
      }
      db.prepare('DELETE FROM economy_business_events WHERE guild_id=? AND owner_id=?').run(guildId, userId);
      db.prepare('DELETE FROM economy_business_employees WHERE guild_id=? AND owner_id=?').run(guildId, userId);
      db.prepare('DELETE FROM economy_business_buffs WHERE guild_id=? AND user_id=?').run(guildId, userId);
      db.prepare('DELETE FROM economy_businesses WHERE guild_id=? AND owner_id=?').run(guildId, userId);
      if (remaining === 0) {
        db.prepare('DELETE FROM economy_loans WHERE guild_id=? AND user_id=?').run(guildId, userId);
        return null;
      }
      loan = { ...loan, balanceDue: remaining, foreclosedAt: now };
      db.prepare('UPDATE economy_loans SET balance_due=?,foreclosed_at=? WHERE guild_id=? AND user_id=?').run(remaining, now, guildId, userId);
    } else {
      loan = { ...loan, foreclosedAt: now };
      db.prepare('UPDATE economy_loans SET foreclosed_at=? WHERE guild_id=? AND user_id=?').run(now, guildId, userId);
    }
  }
  return loan;
}

async function mysqlIsPersonalLoanBankrupt(connection: PoolConnection, guildId: string, userId: string): Promise<boolean> {
  return isPersonalLoanBankrupt(await reconcilePersonalLoanMysql(connection, guildId, userId, nowSeconds()));
}

function sqliteIsPersonalLoanBankrupt(guildId: string, userId: string): boolean {
  return isPersonalLoanBankrupt(reconcilePersonalLoanSqlite(guildId, userId, nowSeconds()));
}

export async function reconcilePersonalLoans(now = nowSeconds()): Promise<{ loansReviewed: number; bankruptcies: number; foreclosures: number }> {
  const rows = economyPool
    ? (await economyPool.execute<RowDataPacket[]>('SELECT user_id AS userId FROM economy_loans WHERE guild_id=?', [GLOBAL_SCOPE_ID]))[0]
    : db.prepare('SELECT user_id AS userId FROM economy_loans WHERE guild_id=?').all(GLOBAL_SCOPE_ID) as Array<{ userId: string }>;
  let bankruptcies = 0; let foreclosures = 0;
  for (const row of rows) {
    const userId = String(row.userId);
    if (economyPool) {
      await withEconomyTransaction(async (connection) => {
        const account = await mysqlEnsureAccount(connection, GLOBAL_SCOPE_ID, userId, true);
        const before = await mysqlLoadPersonalLoan(connection, GLOBAL_SCOPE_ID, userId, true);
        if (before?.bankruptAt === null && now >= before.dueAt + PERSONAL_LOAN_BANKRUPTCY_GRACE_SECONDS && account.balance + account.bankBalance < before.balanceDue) bankruptcies++;
        if (before?.foreclosedAt === null && before?.foreclosureAt !== null && now >= before.foreclosureAt) foreclosures++;
        await reconcilePersonalLoanMysql(connection, GLOBAL_SCOPE_ID, userId, now, account);
      });
    } else {
      const before = sqliteLoadPersonalLoan(GLOBAL_SCOPE_ID, userId);
      const account = sqliteEnsureAccount(GLOBAL_SCOPE_ID, userId);
      if (before?.bankruptAt === null && now >= before.dueAt + PERSONAL_LOAN_BANKRUPTCY_GRACE_SECONDS && account.balance + account.bankBalance < before.balanceDue) bankruptcies++;
      if (before?.foreclosedAt === null && before?.foreclosureAt !== null && now >= before.foreclosureAt) foreclosures++;
      db.transaction(() => { reconcilePersonalLoanSqlite(GLOBAL_SCOPE_ID, userId, now, account); }).immediate();
    }
  }
  return { loansReviewed: rows.length, bankruptcies, foreclosures };
}

export async function getPersonalLoanOverview(guildId: string, userId: string, now = nowSeconds()): Promise<PersonalLoanOverview> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const policy = await rebalanceBankInterestMysql(connection, now);
    const accountBeforeReconcile = await mysqlEnsureAccount(connection, guildId, userId, true);
    const loan = await reconcilePersonalLoanMysql(connection, guildId, userId, now, accountBeforeReconcile);
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [notices] = await connection.execute<RowDataPacket[]>('SELECT job_id AS jobId,collateral_value AS collateralValue,applied_to_debt AS appliedToDebt,cash_surplus AS cashSurplus,foreclosed_at AS foreclosedAt FROM economy_loan_foreclosures WHERE guild_id=? AND user_id=? AND foreclosed_at>=? ORDER BY foreclosed_at DESC LIMIT 1', [guildId, userId, now - 30 * 24 * 60 * 60]);
    const notice = notices[0];
    return { walletBalance: account.balance, bankBalance: account.bankBalance,
      creditLimit: personalLoanCreditLimit(account), referenceAprBps: policy.rateBps, loan,
      foreclosureNotice: notice ? { jobId: String(notice.jobId), collateralValue: Number(notice.collateralValue), appliedToDebt: Number(notice.appliedToDebt), cashSurplus: Number(notice.cashSurplus), foreclosedAt: Number(notice.foreclosedAt) } : null };
  });

  const read = db.transaction(() => {
    const policy = rebalanceBankInterestSqlite(now);
    sqliteEnsureAccount(guildId, userId);
    const loan = reconcilePersonalLoanSqlite(guildId, userId, now);
    const account = sqliteEnsureAccount(guildId, userId);
    const notice = db.prepare('SELECT job_id AS jobId,collateral_value AS collateralValue,applied_to_debt AS appliedToDebt,cash_surplus AS cashSurplus,foreclosed_at AS foreclosedAt FROM economy_loan_foreclosures WHERE guild_id=? AND user_id=? AND foreclosed_at>=? ORDER BY foreclosed_at DESC LIMIT 1')
      .get(guildId, userId, now - 30 * 24 * 60 * 60) as { jobId: string; collateralValue: number; appliedToDebt: number; cashSurplus: number; foreclosedAt: number } | undefined;
    return { walletBalance: account.balance, bankBalance: account.bankBalance,
      creditLimit: personalLoanCreditLimit(account), referenceAprBps: policy.rateBps, loan,
      foreclosureNotice: notice ? { jobId: notice.jobId, collateralValue: Number(notice.collateralValue), appliedToDebt: Number(notice.appliedToDebt), cashSurplus: Number(notice.cashSurplus), foreclosedAt: Number(notice.foreclosedAt) } : null };
  });
  return read.immediate();
}

export type RequestPersonalLoanResult =
  | { ok: true; loan: PersonalLoan; walletBalance: number; creditLimit: number }
  | { ok: false; reason: 'invalid_amount' | 'above_limit' | 'active_loan'; loan: PersonalLoan | null; creditLimit: number };

function personalLoanTerms(principal: number, referenceAprBps: number) {
  const aprBps = clamp(referenceAprBps + PERSONAL_LOAN_RISK_SPREAD_BPS, 2_000, 4_500);
  const originationFee = Math.max(1, Math.ceil(principal * 0.02));
  const interestAmount = Math.max(1, Math.ceil(principal * aprBps * 7 / (10_000 * 365)));
  return { aprBps, originationFee, interestAmount };
}

export async function requestPersonalLoan(guildId: string, userId: string, principal: number, reference: string, now = nowSeconds()): Promise<RequestPersonalLoanResult> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(principal) || principal < PERSONAL_LOAN_MIN || principal > PERSONAL_LOAN_MAX) {
    return { ok: false, reason: 'invalid_amount', loan: null, creditLimit: 0 };
  }
  const issue = async (connection: PoolConnection): Promise<RequestPersonalLoanResult> => {
    const policy = await rebalanceBankInterestMysql(connection, now);
    const accountBeforeReconcile = await mysqlEnsureAccount(connection, guildId, userId, true);
    const currentLoan = await reconcilePersonalLoanMysql(connection, guildId, userId, now, accountBeforeReconcile);
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const creditLimit = personalLoanCreditLimit(account);
    if (currentLoan) return { ok: false, reason: 'active_loan', loan: currentLoan, creditLimit };
    if (principal > creditLimit) return { ok: false, reason: 'above_limit', loan: null, creditLimit };
    const terms = personalLoanTerms(principal, policy.rateBps);
    const balanceDue = principal + terms.originationFee + terms.interestAmount;
    const loan: PersonalLoan = { principal, balanceDue, ...terms, createdAt: now, dueAt: now + PERSONAL_LOAN_TERM_SECONDS, lateFeePeriods: 0,
      bankruptAt: null, foreclosureAt: null, foreclosedAt: null, collateralValue: 0 };
    await connection.execute(`INSERT INTO economy_loans (guild_id,user_id,principal,balance_due,origination_fee,interest_amount,apr_bps,created_at,due_at,late_fee_periods,reference)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [guildId, userId, principal, balanceDue, terms.originationFee, terms.interestAmount,
      terms.aprBps, now, loan.dueAt, 0, `loan:${guildId}:${userId}:${reference}`]);
    await connection.execute('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?', [principal, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, principal, 'loan:disbursement', `loan-disbursement:${guildId}:${userId}:${reference}`, now);
    return { ok: true, loan, walletBalance: account.balance + principal, creditLimit };
  };
  if (economyPool) return withEconomyTransaction(issue);

  const create = db.transaction((): RequestPersonalLoanResult => {
    const policy = rebalanceBankInterestSqlite(now);
    sqliteEnsureAccount(guildId, userId);
    const currentLoan = reconcilePersonalLoanSqlite(guildId, userId, now);
    const account = sqliteEnsureAccount(guildId, userId);
    const creditLimit = personalLoanCreditLimit(account);
    if (currentLoan) return { ok: false, reason: 'active_loan', loan: currentLoan, creditLimit };
    if (principal > creditLimit) return { ok: false, reason: 'above_limit', loan: null, creditLimit };
    const terms = personalLoanTerms(principal, policy.rateBps);
    const balanceDue = principal + terms.originationFee + terms.interestAmount;
    const loan: PersonalLoan = { principal, balanceDue, ...terms, createdAt: now, dueAt: now + PERSONAL_LOAN_TERM_SECONDS, lateFeePeriods: 0,
      bankruptAt: null, foreclosureAt: null, foreclosedAt: null, collateralValue: 0 };
    db.prepare(`INSERT INTO economy_loans (guild_id,user_id,principal,balance_due,origination_fee,interest_amount,apr_bps,created_at,due_at,late_fee_periods,reference)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(guildId, userId, principal, balanceDue, terms.originationFee, terms.interestAmount,
      terms.aprBps, now, loan.dueAt, 0, `loan:${guildId}:${userId}:${reference}`);
    db.prepare('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?').run(principal, now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)')
      .run(guildId, userId, principal, 'loan:disbursement', `loan-disbursement:${guildId}:${userId}:${reference}`, now);
    return { ok: true, loan, walletBalance: account.balance + principal, creditLimit };
  });
  return create.immediate();
}

export type RepayPersonalLoanResult =
  | { ok: true; paid: number; remaining: number; walletBalance: number; cleared: boolean }
  | { ok: false; reason: 'no_loan' | 'invalid_amount' | 'insufficient_wallet'; walletBalance: number; amountDue: number };

export async function repayPersonalLoan(guildId: string, userId: string, amount: number, reference: string, now = nowSeconds()): Promise<RepayPersonalLoanResult> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount', walletBalance: 0, amountDue: 0 };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const accountBeforeReconcile = await mysqlEnsureAccount(connection, guildId, userId, true);
    const loan = await reconcilePersonalLoanMysql(connection, guildId, userId, now, accountBeforeReconcile);
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (!loan) return { ok: false, reason: 'no_loan', walletBalance: account.balance, amountDue: 0 };
    if (amount > loan.balanceDue) return { ok: false, reason: 'invalid_amount', walletBalance: account.balance, amountDue: loan.balanceDue };
    if (account.balance < amount) return { ok: false, reason: 'insufficient_wallet', walletBalance: account.balance, amountDue: loan.balanceDue };
    const walletBalance = account.balance - amount;
    const remaining = loan.balanceDue - amount;
    await connection.execute('UPDATE economy_accounts SET balance=?,updated_at=? WHERE guild_id=? AND user_id=?', [walletBalance, now, guildId, userId]);
    if (remaining === 0) {
      await connection.execute('DELETE FROM economy_loans WHERE guild_id=? AND user_id=?', [guildId, userId]);
      await connection.execute('UPDATE economy_businesses SET mortgaged_at=NULL,updated_at=? WHERE guild_id=? AND owner_id=?', [now, guildId, userId]);
    }
    else await connection.execute('UPDATE economy_loans SET balance_due=? WHERE guild_id=? AND user_id=?', [remaining, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -amount, 'loan:repayment', `loan-repayment:${guildId}:${userId}:${reference}`, now);
    return { ok: true, paid: amount, remaining, walletBalance, cleared: remaining === 0 };
  });

  const pay = db.transaction((): RepayPersonalLoanResult => {
    sqliteEnsureAccount(guildId, userId);
    const loan = reconcilePersonalLoanSqlite(guildId, userId, now);
    const account = sqliteEnsureAccount(guildId, userId);
    if (!loan) return { ok: false, reason: 'no_loan', walletBalance: account.balance, amountDue: 0 };
    if (amount > loan.balanceDue) return { ok: false, reason: 'invalid_amount', walletBalance: account.balance, amountDue: loan.balanceDue };
    if (account.balance < amount) return { ok: false, reason: 'insufficient_wallet', walletBalance: account.balance, amountDue: loan.balanceDue };
    const walletBalance = account.balance - amount;
    const remaining = loan.balanceDue - amount;
    db.prepare('UPDATE economy_accounts SET balance=?,updated_at=? WHERE guild_id=? AND user_id=?').run(walletBalance, now, guildId, userId);
    if (remaining === 0) {
      db.prepare('DELETE FROM economy_loans WHERE guild_id=? AND user_id=?').run(guildId, userId);
      db.prepare('UPDATE economy_businesses SET mortgaged_at=NULL,updated_at=? WHERE guild_id=? AND owner_id=?').run(now, guildId, userId);
    }
    else db.prepare('UPDATE economy_loans SET balance_due=? WHERE guild_id=? AND user_id=?').run(remaining, guildId, userId);
    db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)')
      .run(guildId, userId, -amount, 'loan:repayment', `loan-repayment:${guildId}:${userId}:${reference}`, now);
    return { ok: true, paid: amount, remaining, walletBalance, cleared: remaining === 0 };
  });
  return pay.immediate();
}

export async function claimDaily(guildId: string, userId: string, reference: string): Promise<
  | { ok: true; balance: number; amount: number }
  | { ok: false; secondsRemaining: number; reason?: 'bankrupt' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (await mysqlIsPersonalLoanBankrupt(connection, guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const, secondsRemaining: 0 };
    const now = nowSeconds();
    const nextClaimAt = (account.lastDailyAt ?? 0) + DAILY_COOLDOWN_SECONDS;
    if (now < nextClaimAt) return { ok: false as const, secondsRemaining: nextClaimAt - now };
    await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_daily_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [DAILY_AMOUNT, now, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, DAILY_AMOUNT, 'daily_reward', reference, now);
    return { ok: true as const, balance: account.balance + DAILY_AMOUNT, amount: DAILY_AMOUNT };
  });

  const claim = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (sqliteIsPersonalLoanBankrupt(guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const, secondsRemaining: 0 };
    const now = nowSeconds();
    const nextClaimAt = (account.lastDailyAt ?? 0) + DAILY_COOLDOWN_SECONDS;
    if (now < nextClaimAt) return { ok: false as const, secondsRemaining: nextClaimAt - now };
    db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_daily_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(DAILY_AMOUNT, now, now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, DAILY_AMOUNT, 'daily_reward', reference, now);
    return { ok: true as const, balance: account.balance + DAILY_AMOUNT, amount: DAILY_AMOUNT };
  });
  return claim.immediate();
}

export async function purchaseItem(guildId: string, userId: string, itemId: string, reference: string): Promise<
  | { ok: true; balance: number; quantity: number; price: number }
  | { ok: false; balance: number; reason: 'insufficient_funds' | 'invalid_item' | 'already_owned' }
> {
  guildId = GLOBAL_SCOPE_ID;
  const item = storeItems.find((candidate) => candidate.id === itemId);
  if (!item) return { ok: false, balance: 0, reason: 'invalid_item' };
  const category = item.category === 'jobs' ? 'economy:jobs' : 'economy';
  const categorySize = category === 'economy:jobs' ? jobProductCategorySize() : storeItems.filter((candidate) => candidate.category !== 'jobs').length;
  const quote = await getProductPriceQuote({ kind: 'economy', id: itemId, category, basePrice: item.cost, categorySize });
  const cost = quote.price;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (item.repeatable === false) {
      const [owned] = await connection.execute<RowDataPacket[]>(
        'SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE',
        [guildId, userId, itemId],
      );
      if (Number(owned[0]?.quantity ?? 0) > 0) return { ok: false as const, balance: account.balance, reason: 'already_owned' as const };
    }
    if (account.balance < cost) return { ok: false as const, balance: account.balance, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    await connection.execute('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [cost, now, guildId, userId]);
    await connection.execute(`INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity, acquired_at) VALUES (?, ?, ?, 1, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + 1`, [guildId, userId, itemId, now]);
    if (item.category === 'jobs') await restoreJobToolMysql(connection, guildId, userId, itemId, now);
    await mysqlAddLedger(connection, guildId, userId, -cost, `store:${itemId}`, reference, now);
    await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: 1, reason: 'store_purchase', reference: `${reference}:item`, createdAt: now });
    await recordProductSaleMysql(connection, { userId, kind: 'economy', id: itemId, category, quantity: 1, unitPrice: cost, reference, soldAt: now });
    return { ok: true as const, balance: account.balance - cost, quantity: (await getInventoryQuantityMysql(connection, guildId, userId, itemId)), price: cost };
  });

  const purchase = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (item.repeatable === false) {
      const owned = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?')
        .get(guildId, userId, itemId) as { quantity: number } | undefined;
      if ((owned?.quantity ?? 0) > 0) return { ok: false as const, balance: account.balance, reason: 'already_owned' as const };
    }
    if (account.balance < cost) return { ok: false as const, balance: account.balance, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    db.prepare('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(cost, now, guildId, userId);
    db.prepare(`INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity, acquired_at) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = quantity + 1`).run(guildId, userId, itemId, now);
    if (item.category === 'jobs') restoreJobToolSqlite(guildId, userId, itemId, now);
    db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, -cost, `store:${itemId}`, reference, now);
    db.prepare('INSERT INTO economy_item_ledger (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(guildId, userId, itemId, 1, 'store_purchase', `${reference}:item`, now);
    recordProductSaleSqlite({ userId, kind: 'economy', id: itemId, category, quantity: 1, unitPrice: cost, reference, soldAt: now });
    const inventory = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?').get(guildId, userId, itemId) as { quantity: number };
    return { ok: true as const, balance: account.balance - cost, quantity: inventory.quantity, price: cost };
  });
  return purchase.immediate();
}

async function getInventoryQuantityMysql(connection: PoolConnection, guildId: string, userId: string, itemId: string): Promise<number> {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
  return Number(rows[0]?.quantity ?? 0);
}

export async function getActiveJob(guildId: string, userId: string): Promise<ActiveJobProgress | undefined> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>(
      'SELECT job_id AS jobId, level, xp FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1',
      [guildId, userId],
    );
    const row = rows[0];
    return row ? makeJobProgress(String(row.jobId), Number(row.level), Number(row.xp)) : undefined;
  }
  const row = db.prepare('SELECT job_id AS jobId, level, xp FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1')
    .get(guildId, userId) as { jobId: string; level: number; xp: number } | undefined;
  return row ? makeJobProgress(row.jobId, row.level, row.xp) : undefined;
}

export async function getJobRoster(guildId: string, userId: string): Promise<JobRoster> {
  guildId = GLOBAL_SCOPE_ID;
  type JobRow = { jobId: string; level: number; xp: number; active: number | boolean };
  let rows: JobRow[];
  if (economyPool) {
    const [result] = await economyPool.execute<RowDataPacket[]>(
      'SELECT job_id AS jobId,level,xp,is_active AS active FROM economy_jobs WHERE guild_id=? AND user_id=? ORDER BY updated_at DESC,job_id ASC',
      [guildId, userId],
    );
    rows = result.map((row) => ({ jobId: String(row.jobId), level: Number(row.level), xp: Number(row.xp), active: Number(row.active) }));
  } else {
    rows = db.prepare('SELECT job_id AS jobId,level,xp,is_active AS active FROM economy_jobs WHERE guild_id=? AND user_id=? ORDER BY updated_at DESC,job_id ASC')
      .all(guildId, userId) as JobRow[];
  }
  const progressById = new Map<string, JobRow>(rows.map((row) => [row.jobId, row] as const));
  const secondSlotUnlocked = rows.some((row) => row.level >= MAX_JOB_LEVEL);
  const jobs = economyJobs.map((job) => {
    const saved = progressById.get(job.id);
    return { ...makeJobProgress(job.id, saved?.level ?? 1, saved?.xp ?? 0)!, active: Boolean(saved?.active) };
  });
  const primaryJobId = rows.find((row) => Boolean(row.active))?.jobId;
  return { jobs, activeCount: jobs.filter((job) => job.active).length, slotLimit: secondSlotUnlocked ? 2 : 1, secondSlotUnlocked,
    ...(primaryJobId ? { primaryJobId } : {}) };
}

export async function getJobToolStatuses(guildId: string, userId: string): Promise<JobToolStatus[]> {
  guildId = GLOBAL_SCOPE_ID;
  const [inventory, roster] = await Promise.all([getInventory(guildId, userId), getJobRoster(guildId, userId)]);
  const owned = new Set(inventory.filter((entry) => entry.quantity > 0).map((entry) => entry.itemId));
  let stateRows: Array<{ toolId: string; durability: number; maxDurability: number; upgradeLevel: number }>;
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>('SELECT tool_id AS toolId,durability,max_durability AS maxDurability,upgrade_level AS upgradeLevel FROM economy_tool_state WHERE guild_id=? AND user_id=?', [guildId, userId]);
    stateRows = rows.map((row) => ({ toolId: String(row.toolId), durability: Number(row.durability), maxDurability: Number(row.maxDurability), upgradeLevel: Number(row.upgradeLevel) }));
  } else {
    stateRows = db.prepare('SELECT tool_id AS toolId,durability,max_durability AS maxDurability,upgrade_level AS upgradeLevel FROM economy_tool_state WHERE guild_id=? AND user_id=?').all(guildId, userId) as typeof stateRows;
  }
  const byTool = new Map(stateRows.map((state) => [state.toolId, state]));
  return economyJobs.flatMap((job) => {
    if (!owned.has(job.toolId)) return [];
    const progress = roster.jobs.find((entry) => entry.job.id === job.id);
    const jobLevel = progress?.level ?? 1;
    const saved = byTool.get(job.toolId);
    const upgradeLevel = clamp(Number(saved?.upgradeLevel ?? 0), 0, MAX_JOB_TOOL_UPGRADE);
    const maxDurability = Math.max(Number(saved?.maxDurability ?? 0), maxJobToolDurability(jobLevel, upgradeLevel));
    const item = storeItems.find((entry) => entry.id === job.toolId);
    return [{ toolId: job.toolId, toolName: item?.name ?? job.toolName, emoji: item?.emoji ?? job.emoji, jobId: job.id, jobName: job.name,
      jobLevel, durability: saved ? Math.min(maxDurability, Number(saved.durability)) : maxDurability, maxDurability, upgradeLevel }];
  });
}

export async function getJobToolUpgradeQuote(guildId: string, userId: string, toolId: string): Promise<JobToolUpgradeQuote | undefined> {
  const status = (await getJobToolStatuses(guildId, userId)).find((entry) => entry.toolId === toolId);
  if (!status || status.upgradeLevel >= MAX_JOB_TOOL_UPGRADE) return undefined;
  const item = storeItems.find((entry) => entry.id === toolId && entry.category === 'jobs');
  if (!item) return undefined;
  const nextUpgradeLevel = status.upgradeLevel + 1;
  const categorySize = jobProductCategorySize();
  const quote = await getProductPriceQuote({ kind: 'economy', id: toolUpgradeProductId(toolId, nextUpgradeLevel), category: 'economy:jobs',
    basePrice: toolUpgradeBasePrice(item, status.upgradeLevel), categorySize });
  return { ...status, nextUpgradeLevel, price: quote.price, material: jobToolMaterial(nextUpgradeLevel) };
}

export async function upgradeJobTool(guildId: string, userId: string, toolId: string, reference: string): Promise<
  | { ok: true; balance: number; price: number; status: JobToolStatus; material: string }
  | { ok: false; reason: 'missing_tool' | 'max_level' | 'changed' | 'insufficient'; balance: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  const quote = await getJobToolUpgradeQuote(guildId, userId, toolId);
  if (!quote) {
    const balance = await getBalance(guildId, userId);
    const owned = (await getJobToolStatuses(guildId, userId)).some((entry) => entry.toolId === toolId);
    return { ok: false, reason: owned ? 'max_level' : 'missing_tool', balance };
  }
  const job = economyJobs.find((entry) => entry.toolId === toolId);
  const item = storeItems.find((entry) => entry.id === toolId);
  if (!job || !item) return { ok: false, reason: 'missing_tool', balance: await getBalance(guildId, userId) };
  const sale = { userId, kind: 'economy' as const, id: toolUpgradeProductId(toolId, quote.nextUpgradeLevel), category: 'economy:jobs', quantity: 1,
    unitPrice: quote.price, reference, soldAt: nowSeconds() };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [tools] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, toolId]);
    if (Number(tools[0]?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_tool' as const, balance: account.balance };
    const [jobs] = await connection.execute<RowDataPacket[]>('SELECT level FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?', [guildId, userId, job.id]);
    const jobLevel = Number(jobs[0]?.level ?? 1);
    const state = await ensureJobToolStateMysql(connection, guildId, userId, toolId, jobLevel);
    if (state.upgradeLevel !== quote.upgradeLevel) return { ok: false as const, reason: 'changed' as const, balance: account.balance };
    if (account.balance < quote.price) return { ok: false as const, reason: 'insufficient' as const, balance: account.balance };
    const maxDurability = maxJobToolDurability(jobLevel, quote.nextUpgradeLevel);
    const at = nowSeconds();
    await connection.execute('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?', [quote.price, at, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -quote.price, `tool_upgrade:${toolId}:${quote.nextUpgradeLevel}`, reference, at);
    await connection.execute('UPDATE economy_tool_state SET durability=?,max_durability=?,upgrade_level=?,updated_at=? WHERE guild_id=? AND user_id=? AND tool_id=?', [maxDurability, maxDurability, quote.nextUpgradeLevel, at, guildId, userId, toolId]);
    await recordProductSaleMysql(connection, { ...sale, soldAt: at });
    return { ok: true as const, balance: account.balance - quote.price, price: quote.price,
      status: { ...quote, durability: maxDurability, maxDurability, upgradeLevel: quote.nextUpgradeLevel }, material: quote.material };
  });

  const run = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    const tools = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, toolId) as { quantity: number } | undefined;
    if (Number(tools?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_tool' as const, balance: account.balance };
    const jobs = db.prepare('SELECT level FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?').get(guildId, userId, job.id) as { level: number } | undefined;
    const jobLevel = Number(jobs?.level ?? 1);
    const state = ensureJobToolStateSqlite(guildId, userId, toolId, jobLevel);
    if (state.upgradeLevel !== quote.upgradeLevel) return { ok: false as const, reason: 'changed' as const, balance: account.balance };
    if (account.balance < quote.price) return { ok: false as const, reason: 'insufficient' as const, balance: account.balance };
    const maxDurability = maxJobToolDurability(jobLevel, quote.nextUpgradeLevel);
    const at = nowSeconds();
    db.prepare('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?').run(quote.price, at, guildId, userId);
    db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -quote.price, `tool_upgrade:${toolId}:${quote.nextUpgradeLevel}`, reference, at);
    db.prepare('UPDATE economy_tool_state SET durability=?,max_durability=?,upgrade_level=?,updated_at=? WHERE guild_id=? AND user_id=? AND tool_id=?').run(maxDurability, maxDurability, quote.nextUpgradeLevel, at, guildId, userId, toolId);
    recordProductSaleSqlite({ ...sale, soldAt: at });
    return { ok: true as const, balance: account.balance - quote.price, price: quote.price,
      status: { ...quote, durability: maxDurability, maxDurability, upgradeLevel: quote.nextUpgradeLevel }, material: quote.material };
  });
  return run.immediate();
}

type ActiveJobRow = { jobId: string; level: number };
type ResignJobFailure =
  | { ok: false; reason: 'invalid_job' | 'no_active_job' }
  | { ok: false; reason: 'choose_job'; activeJobs: EconomyJob[] }
  | { ok: false; reason: 'not_active'; job: EconomyJob };
type JobResignationPlan = ResignJobFailure | { ok: true; job: EconomyJob; level: number; remainingJobs: EconomyJob[]; jobId: string };
export type ResignJobResult = ResignJobFailure | { ok: true; job: EconomyJob; level: number; remainingJobs: EconomyJob[] };

function planJobResignation(rows: ActiveJobRow[], requestedJobId?: string): JobResignationPlan {
  const activeJobs = rows.flatMap((row) => {
    const job = economyJobs.find((candidate) => candidate.id === row.jobId);
    return job ? [{ job, level: Number(row.level), jobId: row.jobId }] : [];
  });
  if (!activeJobs.length) return { ok: false, reason: 'no_active_job' };
  const selected = requestedJobId
    ? activeJobs.find((entry) => entry.jobId === requestedJobId)
    : activeJobs.length === 1 ? activeJobs[0] : undefined;
  if (!selected) {
    if (requestedJobId) {
      const job = economyJobs.find((candidate) => candidate.id === requestedJobId);
      return job ? { ok: false, reason: 'not_active', job } : { ok: false, reason: 'invalid_job' };
    }
    return { ok: false, reason: 'choose_job', activeJobs: activeJobs.map((entry) => entry.job) };
  }
  return { ok: true, job: selected.job, level: selected.level, remainingJobs: activeJobs.filter((entry) => entry.jobId !== selected.jobId).map((entry) => entry.job), jobId: selected.jobId };
}

export async function resignJob(guildId: string, userId: string, requestedJobId?: string): Promise<ResignJobResult> {
  guildId = GLOBAL_SCOPE_ID;
  if (requestedJobId && !economyJobs.some((job) => job.id === requestedJobId)) return { ok: false, reason: 'invalid_job' };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const [result] = await connection.execute<RowDataPacket[]>(
      'SELECT job_id AS jobId,level FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC FOR UPDATE',
      [guildId, userId],
    );
    const plan = planJobResignation(result.map((row) => ({ jobId: String(row.jobId), level: Number(row.level) })), requestedJobId);
    if (!plan.ok) return plan;
    await connection.execute('UPDATE economy_jobs SET is_active=0 WHERE guild_id=? AND user_id=? AND job_id=? AND is_active=1', [guildId, userId, plan.jobId]);
    return { ok: true as const, job: plan.job, level: plan.level, remainingJobs: plan.remainingJobs };
  });
  const run = db.transaction(() => {
    const rows = db.prepare('SELECT job_id AS jobId,level FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC')
      .all(guildId, userId) as ActiveJobRow[];
    const plan = planJobResignation(rows, requestedJobId);
    if (!plan.ok) return plan;
    db.prepare('UPDATE economy_jobs SET is_active=0 WHERE guild_id=? AND user_id=? AND job_id=? AND is_active=1').run(guildId, userId, plan.jobId);
    return { ok: true as const, job: plan.job, level: plan.level, remainingJobs: plan.remainingJobs };
  });
  return run.immediate();
}

type JobSelectionRow = { jobId: string; level: number; xp: number; active: number | boolean; updatedAt: number };

function planActiveJobs(rows: JobSelectionRow[], selectedJobId: string) {
  const secondSlotUnlocked = rows.some((row) => Number(row.level) >= MAX_JOB_LEVEL);
  const slotLimit: 1 | 2 = secondSlotUnlocked ? 2 : 1;
  const activeRows = rows.filter((row) => Boolean(row.active) && row.jobId !== selectedJobId);
  // Keep a maxed job and the most recently used other job when an occupied slot must be replaced.
  activeRows.sort((a, b) => Number(b.level >= MAX_JOB_LEVEL) - Number(a.level >= MAX_JOB_LEVEL) || Number(b.updatedAt) - Number(a.updatedAt));
  return { activeJobIds: [selectedJobId, ...activeRows.slice(0, slotLimit - 1).map((row) => row.jobId)], slotLimit, secondSlotUnlocked };
}

export async function selectJob(guildId: string, userId: string, jobId: string): Promise<
  | { ok: true; progress: ActiveJobProgress; activeJobIds: string[]; slotLimit: 1 | 2; secondSlotUnlocked: boolean }
  | { ok: false; reason: 'invalid_job' }
> {
  guildId = GLOBAL_SCOPE_ID;
  const job = economyJobs.find((candidate) => candidate.id === jobId);
  if (!job) return { ok: false, reason: 'invalid_job' };
  const now = nowSeconds();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    await mysqlEnsureAccount(connection, guildId, userId, true);
    const [savedRows] = await connection.execute<RowDataPacket[]>(
      'SELECT job_id AS jobId,level,xp,is_active AS active,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=? FOR UPDATE',
      [guildId, userId],
    );
    const rows: JobSelectionRow[] = savedRows.map((row) => ({ jobId: String(row.jobId), level: Number(row.level), xp: Number(row.xp), active: Number(row.active), updatedAt: Number(row.updatedAt) }));
    const plan = planActiveJobs(rows, jobId);
    const selectedAt = Math.max(now, ...rows.map((row) => row.updatedAt + 1));
    await connection.execute(`INSERT INTO economy_jobs (guild_id,user_id,job_id,level,xp,is_active,created_at,updated_at)
      VALUES (?,?,?,1,0,1,?,?) ON DUPLICATE KEY UPDATE is_active=1,updated_at=VALUES(updated_at)`, [guildId, userId, jobId, selectedAt, selectedAt]);
    await connection.execute('UPDATE economy_jobs SET is_active=0 WHERE guild_id=? AND user_id=?', [guildId, userId]);
    for (const activeJobId of plan.activeJobIds) {
      await connection.execute('UPDATE economy_jobs SET is_active=1,updated_at=IF(job_id=?, ?, updated_at) WHERE guild_id=? AND user_id=? AND job_id=?',
        [jobId, selectedAt, guildId, userId, activeJobId]);
    }
    const [jobProgressRows] = await connection.execute<RowDataPacket[]>('SELECT level,xp FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?', [guildId, userId, jobId]);
    const row = jobProgressRows[0];
    return { ok: true as const, progress: makeJobProgress(job.id, Number(row?.level ?? 1), Number(row?.xp ?? 0))!, ...plan };
  });

  const select = db.transaction(() => {
    sqliteEnsureAccount(guildId, userId);
    const rows = db.prepare('SELECT job_id AS jobId,level,xp,is_active AS active,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=?')
      .all(guildId, userId) as JobSelectionRow[];
    const plan = planActiveJobs(rows, jobId);
    const selectedAt = Math.max(now, ...rows.map((row) => row.updatedAt + 1));
    db.prepare(`INSERT INTO economy_jobs (guild_id,user_id,job_id,level,xp,is_active,created_at,updated_at)
      VALUES (?,?,?,1,0,1,?,?) ON CONFLICT(guild_id,user_id,job_id) DO UPDATE SET is_active=1,updated_at=excluded.updated_at`).run(guildId, userId, jobId, selectedAt, selectedAt);
    db.prepare('UPDATE economy_jobs SET is_active=0 WHERE guild_id=? AND user_id=?').run(guildId, userId);
    for (const activeJobId of plan.activeJobIds) {
      db.prepare('UPDATE economy_jobs SET is_active=1,updated_at=CASE WHEN job_id=? THEN ? ELSE updated_at END WHERE guild_id=? AND user_id=? AND job_id=?')
        .run(jobId, selectedAt, guildId, userId, activeJobId);
    }
    const row = db.prepare('SELECT level,xp FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?')
      .get(guildId, userId, jobId) as { level: number; xp: number };
    return { ok: true as const, progress: makeJobProgress(job.id, row.level, row.xp)!, ...plan };
  });
  return select.immediate();
}

export type WorkResult =
  | { ok: true; amount: number; balance: number; message: string; jobName: string; level: number; levelUp: boolean }
  | { ok: false; reason: 'no_job' | 'missing_tool' | 'cooldown' | 'business_funds' | 'business_closed' | 'business_pest'; secondsRemaining?: number; job?: EconomyJob };

function addJobExperience(level: number, xp: number, xpGain = JOB_XP_PER_SHIFT): { level: number; xp: number; levelUp: boolean } {
  if (level >= MAX_JOB_LEVEL) return { level: MAX_JOB_LEVEL, xp: 0, levelUp: false };
  let nextLevel = level;
  let nextXp = xp + xpGain;
  while (nextLevel < MAX_JOB_LEVEL && nextXp >= jobXpToNext(nextLevel)) {
    nextXp -= jobXpToNext(nextLevel);
    nextLevel++;
  }
  if (nextLevel >= MAX_JOB_LEVEL) nextXp = 0;
  return { level: nextLevel, xp: nextXp, levelUp: nextLevel > level };
}

export async function work(guildId: string, userId: string, reference: string): Promise<WorkResult> {
  guildId = GLOBAL_SCOPE_ID;

  const loanOverview = await getPersonalLoanOverview(guildId, userId);
  const isBankrupt = Boolean(loanOverview.loan && loanOverview.loan.bankruptAt !== null);
  const businessRoute = await getBusinessWorkRoute(guildId, userId);
  if (businessRoute && (!businessRoute.blocked || !isBankrupt)) {
    const businessResult = await workBusinessShift(guildId, userId, reference, businessRoute);
    if (!isBankrupt || businessResult.ok || businessResult.reason !== 'business_funds') return businessResult;
  }

  if (economyPool) return withEconomyTransaction(async (connection) => {
    const accountBeforeReconcile = await mysqlEnsureAccount(connection, guildId, userId, true);
    const loan = await reconcilePersonalLoanMysql(connection, guildId, userId, nowSeconds(), accountBeforeReconcile);
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [jobRows] = await connection.execute<RowDataPacket[]>(
      'SELECT job_id AS jobId,level,xp,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1 FOR UPDATE',
      [guildId, userId],
    );
    const current = jobRows[0];
    if (!current) return { ok: false as const, reason: 'no_job' as const };
    const job = economyJobs.find((candidate) => candidate.id === String(current.jobId));
    if (!job) return { ok: false as const, reason: 'no_job' as const };
    const [tools] = await connection.execute<RowDataPacket[]>(
      'SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE',
      [guildId, userId, job.toolId],
    );
    if (Number(tools[0]?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_tool' as const, job };
    const now = nowSeconds();
    const selectedAt = Math.max(now, Number(current.updatedAt ?? 0) + 1);
    const nextWorkAt = (account.lastWorkAt ?? 0) + WORK_COOLDOWN_SECONDS;
    if (now < nextWorkAt) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: nextWorkAt - now, job };
    const level = Number(current.level);
    const xp = Number(current.xp);
    const amount = job.minPay + randomInt(job.maxPay - job.minPay + 1) + Math.min(level - 1, MAX_JOB_LEVEL - 1) * 3;
    const progress = addJobExperience(level, xp);
    const toolWear = await wearJobToolMysql(connection, guildId, userId, job, progress.level, reference, now);
    const loanPayment = await applyBankruptcyWorkPaymentMysql(connection, guildId, userId, loan, amount, reference, now);
    await connection.execute('UPDATE economy_jobs SET level=?,xp=?,updated_at=? WHERE guild_id=? AND user_id=? AND job_id=?', [progress.level, progress.xp, selectedAt, guildId, userId, job.id]);
    await connection.execute('UPDATE economy_accounts SET balance=balance+?,last_work_at=?,updated_at=? WHERE guild_id=? AND user_id=?', [loanPayment.payout, now, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, amount, `work_reward:${job.id}:lv${level}`, reference, now);
    const xpText = progress.level >= MAX_JOB_LEVEL ? ' · nivel máximo' : ` · ${progress.xp}/${jobXpToNext(progress.level)} XP`;
    const levelText = progress.levelUp ? `\n🎉 **${job.name} subió al nivel ${progress.level}.**` : '';
    const toolDisplayName = job.toolId === 'kit_cocinero'
      ? toolWear.upgradeLevel === 0 ? 'Kit básico (cuchillo y espátula)' : `Cuchillo y espátula de ${jobToolMaterial(toolWear.upgradeLevel).toLowerCase()}`
      : `${job.toolName} ${jobToolMaterial(toolWear.upgradeLevel)}`;
    const toolText = toolWear.broke ? `\n💥 **${toolDisplayName} se rompió.** Recompra otra herramienta en la tienda para seguir trabajando; las mejoras de material se conservan.`
      : `\n🧰 ${toolDisplayName} · durabilidad **${toolWear.durability}/${toolWear.maxDurability}**${toolWear.worn ? '' : ' · tu experiencia evitó el desgaste'}`;
    return { ok: true as const, amount: loanPayment.payout, balance: account.balance + loanPayment.payout, jobName: job.name, level: progress.level, levelUp: progress.levelUp,
      message: `${pick(job.messages)}\n**${job.name} · nivel ${progress.level}**${workLoanPaymentText(loanPayment)}${xpText}${levelText}${toolText}` };
  });

  const earn = db.transaction((): WorkResult => {
    sqliteEnsureAccount(guildId, userId);
    const loan = reconcilePersonalLoanSqlite(guildId, userId, nowSeconds());
    const account = sqliteEnsureAccount(guildId, userId);
    const current = db.prepare('SELECT job_id AS jobId,level,xp,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1')
      .get(guildId, userId) as { jobId: string; level: number; xp: number; updatedAt: number } | undefined;
    if (!current) return { ok: false, reason: 'no_job' };
    const job = economyJobs.find((candidate) => candidate.id === current.jobId);
    if (!job) return { ok: false, reason: 'no_job' };
    const tools = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?')
      .get(guildId, userId, job.toolId) as { quantity: number } | undefined;
    if (!tools || tools.quantity < 1) return { ok: false, reason: 'missing_tool', job };
    const now = nowSeconds();
    const selectedAt = Math.max(now, Number(current.updatedAt ?? 0) + 1);
    const nextWorkAt = (account.lastWorkAt ?? 0) + WORK_COOLDOWN_SECONDS;
    if (now < nextWorkAt) return { ok: false, reason: 'cooldown', secondsRemaining: nextWorkAt - now, job };
    const amount = job.minPay + randomInt(job.maxPay - job.minPay + 1) + Math.min(current.level - 1, MAX_JOB_LEVEL - 1) * 3;
    const progress = addJobExperience(current.level, current.xp);
    const toolWear = wearJobToolSqlite(guildId, userId, job, progress.level, reference, now);
    const loanPayment = applyBankruptcyWorkPaymentSqlite(guildId, userId, loan, amount, reference, now);
    db.prepare('UPDATE economy_jobs SET level=?,xp=?,updated_at=? WHERE guild_id=? AND user_id=? AND job_id=?')
      .run(progress.level, progress.xp, selectedAt, guildId, userId, job.id);
    db.prepare('UPDATE economy_accounts SET balance=balance+?,last_work_at=?,updated_at=? WHERE guild_id=? AND user_id=?')
      .run(loanPayment.payout, now, now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)')
      .run(guildId, userId, amount, `work_reward:${job.id}:lv${current.level}`, reference, now);
    const xpText = progress.level >= MAX_JOB_LEVEL ? ' · nivel máximo' : ` · ${progress.xp}/${jobXpToNext(progress.level)} XP`;
    const levelText = progress.levelUp ? `\n🎉 **${job.name} subió al nivel ${progress.level}.**` : '';
    const toolDisplayName = job.toolId === 'kit_cocinero'
      ? toolWear.upgradeLevel === 0 ? 'Kit básico (cuchillo y espátula)' : `Cuchillo y espátula de ${jobToolMaterial(toolWear.upgradeLevel).toLowerCase()}`
      : `${job.toolName} ${jobToolMaterial(toolWear.upgradeLevel)}`;
    const toolText = toolWear.broke ? `\n💥 **${toolDisplayName} se rompió.** Recompra otra herramienta en la tienda para seguir trabajando; las mejoras de material se conservan.`
      : `\n🧰 ${toolDisplayName} · durabilidad **${toolWear.durability}/${toolWear.maxDurability}**${toolWear.worn ? '' : ' · tu experiencia evitó el desgaste'}`;
    return { ok: true, amount: loanPayment.payout, balance: account.balance + loanPayment.payout, jobName: job.name, level: progress.level, levelUp: progress.levelUp,
      message: `${pick(job.messages)}\n**${job.name} · nivel ${progress.level}**${workLoanPaymentText(loanPayment)}${xpText}${levelText}${toolText}` };
  });
  return earn.immediate();
}

export type BusinessEventType = 'closure' | 'pest';
export type BusinessEvent = { type: BusinessEventType; amount: number; createdAt: number };
type BusinessWorkRoute = { ownerId: string; isOwner: boolean; blocked?: 'closed' | 'pest' };
export type BusinessEmployee = { key: string; userId: string | null; name: string; kind: 'npc' | 'real'; status: 'pending' | 'active'; lastWorkAt: number | null };
export type BusinessOverview = {
  ownerId: string;
  job: EconomyJob;
  name: string;
  status: 'land' | 'construction' | 'active' | 'closed';
  level: number;
  createdAt: number;
  constructionCompleteAt: number | null;
  debt: number;
  investmentValue: number;
  mortgagedAt: number | null;
  foreclosureAt: number | null;
  collateralValue: number;
  loanBalanceDue: number | null;
  employees: BusinessEmployee[];
  income30d: number;
  expenses30d: number;
  wages30d: number;
  profit30d: number;
  lastWorkAt: number | null;
  events: BusinessEvent[];
  recommendedStaff: number;
  staffLimit: number;
};
export type BusinessSaleQuote = {
  investedValue: number;
  basisValue: number;
  marketValue: number;
  appreciation: number;
  ageDays: number;
  mortgagePayoff: number;
  operatingDebt: number;
  netProceeds: number;
};
const BUSINESS_PROPERTY_APPRECIATION_RATE = 0.04;
const BUSINESS_YEAR_SECONDS = 365.25 * 24 * 60 * 60;
export function calculateBusinessSaleQuote(overview: Pick<BusinessOverview, 'job' | 'status' | 'level' | 'investmentValue' | 'createdAt' | 'debt' | 'mortgagedAt' | 'loanBalanceDue'> & { pendingEventDebt?: number }, now = businessNow()): BusinessSaleQuote {
  const config = businessJobs.find((entry) => entry.jobId === overview.job.id);
  const fallbackValue = fallbackBusinessInvestment(overview.job.id, overview.level, overview.status);
  const investedValue = Math.max(0, Number(overview.investmentValue) || fallbackValue);
  const landBasis = Math.min(investedValue, config?.landPrice ?? investedValue);
  const basisValue = overview.status === 'construction'
    ? landBasis + Math.round(Math.max(0, investedValue - landBasis) * 0.65)
    : investedValue;
  const ageSeconds = Math.max(0, now - overview.createdAt);
  const marketValue = Math.max(0, Math.round(basisValue * (1 + BUSINESS_PROPERTY_APPRECIATION_RATE) ** (ageSeconds / BUSINESS_YEAR_SECONDS)));
  const mortgagePayoff = overview.mortgagedAt === null ? 0 : Math.min(marketValue, Math.max(0, overview.loanBalanceDue ?? 0));
  const operatingDebt = Math.max(0, overview.debt) + Math.max(0, overview.pendingEventDebt ?? 0);
  return {
    investedValue,
    basisValue,
    marketValue,
    appreciation: Math.max(0, marketValue - basisValue),
    ageDays: Math.floor(ageSeconds / (24 * 60 * 60)),
    mortgagePayoff,
    operatingDebt,
    netProceeds: marketValue - mortgagePayoff - operatingDebt,
  };
}
function businessPropertySaleMessage(name: string, quote: BusinessSaleQuote, remainingMortgage: number | null): string {
  const mortgageText = quote.mortgagePayoff
    ? remainingMortgage === 0
      ? ` El banco recibió **${money.format(quote.mortgagePayoff)} monedas** y la hipoteca quedó liquidada.`
      : ` Se aplicaron **${money.format(quote.mortgagePayoff)} monedas** al préstamo; aún debes **${money.format(remainingMortgage ?? 0)} monedas**.`
    : '';
  const debtText = quote.operatingDebt ? ` Se liquidaron **${money.format(quote.operatingDebt)} monedas** de facturas y multas pendientes del negocio.` : '';
  const proceedsText = quote.netProceeds > 0
    ? ` Recibiste **${money.format(quote.netProceeds)} monedas netas** en tu billetera.`
    : quote.netProceeds < 0
      ? ` Las facturas superaron el efectivo de la venta; **${money.format(-quote.netProceeds)} monedas** quedaron como saldo negativo en tu billetera.`
      : ' El precio de venta se absorbió entre las deudas y no quedó efectivo libre.';
  return `Vendiste **${name}** por **${money.format(quote.marketValue)} monedas**. La propiedad acumuló **${money.format(quote.appreciation)} monedas** de plusvalía.${mortgageText}${debtText}${proceedsText} El negocio, sus contratos y eventos pendientes se cerraron; tus productos ya obtenidos siguen en tu inventario.`;
}
export type BusinessActionResult =
  | { ok: true; price?: number; grossPrice?: number; commission?: number; commissionRateBps?: number; balance: number; message?: string; debt?: number }
  | { ok: false; reason: 'no_job' | 'already_owned' | 'not_found' | 'not_ready' | 'max_level' | 'staff_limit' | 'employee_busy' | 'wrong_job' | 'insufficient_funds' | 'no_debt' | 'no_items' | 'invalid_item' | 'quantity' | 'no_event' | 'loan_active' | 'mortgaged' | 'bankrupt'; balance: number; debt?: number };

const BUSINESS_MARKET_CATEGORY = 'economy:business_assets';
const BUSINESS_GOODS_CATEGORY = 'economy:business_goods';
const BUSINESS_MARKET_SIZE = businessJobs.length * 4 + 16;
const businessNow = () => nowSeconds();
const businessByJob = (jobId: string) => businessJobs.find((entry) => entry.jobId === jobId);
const businessName = (jobId: string) => businessByJob(jobId)?.name ?? economyJobs.find((entry) => entry.id === jobId)?.name ?? 'Negocio';
const businessUtilityTotal = (jobId: string, level: number) => {
  const business = businessByJob(jobId);
  return business ? business.utilityCosts.reduce((sum, cost) => sum + Math.ceil(cost * (1 + (level - 1) * 0.025)), 0) : 0;
};
const businessStaffLimit = (level: number) => BUSINESS_MAX_STAFF_BY_LEVEL[Math.max(0, Math.min(9, level - 1))]!;
const businessRecommendedStaff = (level: number) => Math.ceil(Math.max(1, Math.min(10, level)) / 3);
const businessWorkforceMultiplier = (level: number, activeStaff: number) => Math.min(1, (businessRecommendedStaff(level) + 1) / Math.max(1, activeStaff + 1)) ** 2;
const businessEventFine = (type: BusinessEventType, jobId: string, level: number) => {
  const operatingCost = businessUtilityTotal(jobId, level);
  return type === 'closure' ? Math.max(60, Math.round(operatingCost * 2.25 + level * 12)) : Math.max(45, Math.round(operatingCost * 1.6));
};
type BusinessSettlement = { gross: number; wagesDue: number; theft: number; utilitiesPaid: number; debt: number; net: number };
function settleBusinessRevenue(args: { jobId: string; businessLevel: number; baseAmount: number; hasBuff: boolean; isOwner: boolean; activeStaff: number; npcCount: number; previousDebt: number }): BusinessSettlement | undefined {
  const { jobId, businessLevel, baseAmount, hasBuff, isOwner, activeStaff, npcCount, previousDebt } = args;
  const staffing = businessWorkforceMultiplier(businessLevel, activeStaff);
  const multiplier = ((isOwner ? 4.2 : 3.2) + (businessLevel - 1) * 0.14 + (hasBuff ? 0.2 : 0)) * staffing;
  const gross = Math.max(1, Math.round(baseAmount * multiplier));
  const wagesDue = isOwner
    ? npcCount * Math.max(10, Math.round(baseAmount * 0.75))
    : Math.max(10, Math.round(baseAmount * (0.65 + Math.min(0.18, (businessLevel - 1) * 0.02))));
  // A shift only runs when its own sales can pay every worker in full.
  if (gross < wagesDue) return undefined;
  const afterPayroll = gross - wagesDue;
  const theft = afterPayroll > 0 && randomInt(10_000) < 650
    ? Math.min(afterPayroll, Math.max(1, Math.round(gross * (0.08 + randomInt(13) / 100))))
    : 0;
  const utilityDue = businessUtilityTotal(jobId, businessLevel);
  const payableUtilities = Math.max(0, afterPayroll - theft);
  const utilitiesPaid = Math.min(payableUtilities, Math.max(0, previousDebt) + utilityDue);
  const debt = Math.max(0, previousDebt + utilityDue - utilitiesPaid);
  const net = Math.max(0, payableUtilities - utilitiesPaid);
  return { gross, wagesDue, theft, utilitiesPaid, debt, net };
}

async function createPestEventMysql(connection: PoolConnection, guildId: string, ownerId: string, jobId: string, level: number, reference: string, now: number): Promise<number | undefined> {
  if (randomInt(10_000) >= 300) return undefined;
  const [pending] = await connection.execute<RowDataPacket[]>("SELECT id FROM economy_business_events WHERE guild_id=? AND owner_id=? AND event_type='pest' AND status='pending' LIMIT 1 FOR UPDATE", [guildId, ownerId]);
  if (pending[0]) return undefined;
  const amount = businessEventFine('pest', jobId, level);
  await connection.execute("INSERT INTO economy_business_events(guild_id,owner_id,event_type,status,amount,created_at,reference) VALUES(?,?,'pest','pending',?,?,?)", [guildId, ownerId, amount, now, `${reference}:event:pest`]);
  return amount;
}

function createPestEventSqlite(guildId: string, ownerId: string, jobId: string, level: number, reference: string, now: number): number | undefined {
  if (randomInt(10_000) >= 300) return undefined;
  const pending = db.prepare("SELECT id FROM economy_business_events WHERE guild_id=? AND owner_id=? AND event_type='pest' AND status='pending' LIMIT 1").get(guildId, ownerId);
  if (pending) return undefined;
  const amount = businessEventFine('pest', jobId, level);
  db.prepare("INSERT INTO economy_business_events(guild_id,owner_id,event_type,status,amount,created_at,reference) VALUES(?,?,'pest','pending',?,?,?)").run(guildId, ownerId, amount, now, `${reference}:event:pest`);
  return amount;
}

export const businessCooldownSeconds = (level: number) => BUSINESS_WORK_COOLDOWN_SECONDS - (level - 1) * BUSINESS_WORK_COOLDOWN_REDUCTION_PER_LEVEL;
const businessProductRequest = (id: string, basePrice: number) => ({ kind: 'economy' as const, id, category: BUSINESS_MARKET_CATEGORY, basePrice, categorySize: BUSINESS_MARKET_SIZE });

async function refreshBusinessLifecycle(guildId: string, ownerId: string, now = businessNow()): Promise<void> {
  if (economyPool) {
    await withEconomyTransaction(async (connection) => {
      const [rows] = await connection.execute<RowDataPacket[]>('SELECT job_id AS jobId,status,level,construction_complete_at AS constructionCompleteAt,created_at AS createdAt,updated_at AS updatedAt FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE', [guildId, ownerId]);
      const row = rows[0];
      if (!row) return;
      if (String(row.status) === 'construction' && Number(row.constructionCompleteAt ?? 0) <= now) {
        await connection.execute("UPDATE economy_businesses SET status='active',updated_at=? WHERE guild_id=? AND owner_id=?", [now, guildId, ownerId]);
        return;
      }
      if (String(row.status) !== 'active') return;
      const [activityRows] = await connection.execute<RowDataPacket[]>('SELECT COALESCE(MAX(worked_at),0) AS lastWorkAt FROM economy_business_shifts WHERE guild_id=? AND owner_id=?', [guildId, ownerId]);
      const lastActivity = Math.max(Number(row.createdAt), Number(row.updatedAt), Number(row.constructionCompleteAt ?? 0), Number(activityRows[0]?.lastWorkAt ?? 0));
      if (now - lastActivity < BUSINESS_INACTIVITY_SECONDS) return;
      const [pending] = await connection.execute<RowDataPacket[]>("SELECT id FROM economy_business_events WHERE guild_id=? AND owner_id=? AND event_type='closure' AND status='pending' LIMIT 1 FOR UPDATE", [guildId, ownerId]);
      if (pending[0]) return;
      const amount = businessEventFine('closure', String(row.jobId), Number(row.level));
      await connection.execute("INSERT INTO economy_business_events(guild_id,owner_id,event_type,status,amount,created_at,reference) VALUES(?,?,'closure','pending',?,?,?)", [guildId, ownerId, amount, now, `business:event:closure:${guildId}:${ownerId}:${now}`]);
      await connection.execute("UPDATE economy_businesses SET status='closed',updated_at=? WHERE guild_id=? AND owner_id=?", [now, guildId, ownerId]);
    });
    return;
  }
  db.transaction(() => {
    const row = db.prepare('SELECT job_id AS jobId,status,level,construction_complete_at AS constructionCompleteAt,created_at AS createdAt,updated_at AS updatedAt FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, ownerId) as { jobId: string; status: string; level: number; constructionCompleteAt: number | null; createdAt: number; updatedAt: number } | undefined;
    if (!row) return;
    if (row.status === 'construction' && Number(row.constructionCompleteAt ?? 0) <= now) {
      db.prepare("UPDATE economy_businesses SET status='active',updated_at=? WHERE guild_id=? AND owner_id=?").run(now, guildId, ownerId);
      return;
    }
    if (row.status !== 'active') return;
    const activity = db.prepare('SELECT COALESCE(MAX(worked_at),0) AS lastWorkAt FROM economy_business_shifts WHERE guild_id=? AND owner_id=?').get(guildId, ownerId) as { lastWorkAt: number };
    const lastActivity = Math.max(row.createdAt, row.updatedAt, Number(row.constructionCompleteAt ?? 0), Number(activity.lastWorkAt ?? 0));
    if (now - lastActivity < BUSINESS_INACTIVITY_SECONDS) return;
    const pending = db.prepare("SELECT id FROM economy_business_events WHERE guild_id=? AND owner_id=? AND event_type='closure' AND status='pending' LIMIT 1").get(guildId, ownerId);
    if (pending) return;
    const amount = businessEventFine('closure', row.jobId, Number(row.level));
    db.prepare("INSERT INTO economy_business_events(guild_id,owner_id,event_type,status,amount,created_at,reference) VALUES(?,?,'closure','pending',?,?,?)").run(guildId, ownerId, amount, now, `business:event:closure:${guildId}:${ownerId}:${now}`);
    db.prepare("UPDATE economy_businesses SET status='closed',updated_at=? WHERE guild_id=? AND owner_id=?").run(now, guildId, ownerId);
  })();
}

async function getBusinessWorkRoute(guildId: string, userId: string): Promise<BusinessWorkRoute | undefined> {
  const now = businessNow();
  await refreshBusinessLifecycle(guildId, userId, now);
  let employerId: string | undefined;
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>(`SELECT b.owner_id AS ownerId FROM economy_business_employees e
      JOIN economy_businesses b ON b.guild_id=e.guild_id AND b.owner_id=e.owner_id
      JOIN economy_jobs j ON j.guild_id=e.guild_id AND j.user_id=e.employee_user_id AND j.job_id=b.job_id AND j.is_active=1
      WHERE e.guild_id=? AND e.employee_user_id=? AND e.kind='real' AND e.status='active' AND b.status IN ('active','closed')
      ORDER BY j.updated_at DESC LIMIT 1`, [guildId, userId]);
    employerId = rows[0] ? String(rows[0].ownerId) : undefined;
  } else {
    const row = db.prepare(`SELECT b.owner_id AS ownerId FROM economy_business_employees e
      JOIN economy_businesses b ON b.guild_id=e.guild_id AND b.owner_id=e.owner_id
      JOIN economy_jobs j ON j.guild_id=e.guild_id AND j.user_id=e.employee_user_id AND j.job_id=b.job_id AND j.is_active=1
      WHERE e.guild_id=? AND e.employee_user_id=? AND e.kind='real' AND e.status='active' AND b.status IN ('active','closed')
      ORDER BY j.updated_at DESC LIMIT 1`).get(guildId, userId) as { ownerId: string } | undefined;
    employerId = row?.ownerId;
  }
  if (employerId) await refreshBusinessLifecycle(guildId, employerId, now);
  if (economyPool) return withEconomyTransaction(async (connection) => {
    await connection.execute("UPDATE economy_businesses SET status='active',updated_at=? WHERE guild_id=? AND status='construction' AND construction_complete_at<=?", [now, guildId, now]);
    const [jobs] = await connection.execute<RowDataPacket[]>('SELECT job_id AS jobId FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1', [guildId, userId]);
    const jobId = String(jobs[0]?.jobId ?? '');
    if (!jobId) return undefined;
    const [owned] = await connection.execute<RowDataPacket[]>("SELECT owner_id AS ownerId,status FROM economy_businesses WHERE guild_id=? AND owner_id=? AND job_id=? AND status IN ('active','closed') LIMIT 1", [guildId, userId, jobId]);
    if (owned[0]) {
      if (String(owned[0].status) === 'closed') return { ownerId: userId, isOwner: true, blocked: 'closed' };
      const [pests] = await connection.execute<RowDataPacket[]>("SELECT id FROM economy_business_events WHERE guild_id=? AND owner_id=? AND event_type='pest' AND status='pending' LIMIT 1", [guildId, userId]);
      return { ownerId: userId, isOwner: true, ...(pests[0] ? { blocked: 'pest' as const } : {}) };
    }
    const [staff] = await connection.execute<RowDataPacket[]>(`SELECT e.owner_id AS ownerId FROM economy_business_employees e
      JOIN economy_businesses b ON b.guild_id=e.guild_id AND b.owner_id=e.owner_id
      WHERE e.guild_id=? AND e.employee_user_id=? AND e.status='active' AND e.kind='real' AND b.status IN ('active','closed') AND b.job_id=? LIMIT 1`, [guildId, userId, jobId]);
    if (!staff[0]) return undefined;
    const ownerId = String(staff[0].ownerId);
    const [business] = await connection.execute<RowDataPacket[]>('SELECT status FROM economy_businesses WHERE guild_id=? AND owner_id=?', [guildId, ownerId]);
    if (String(business[0]?.status) === 'closed') return { ownerId, isOwner: false, blocked: 'closed' };
    const [pests] = await connection.execute<RowDataPacket[]>("SELECT id FROM economy_business_events WHERE guild_id=? AND owner_id=? AND event_type='pest' AND status='pending' LIMIT 1", [guildId, ownerId]);
    return { ownerId, isOwner: false, ...(pests[0] ? { blocked: 'pest' as const } : {}) };
  });
  const resolve = db.transaction((): BusinessWorkRoute | undefined => {
    db.prepare("UPDATE economy_businesses SET status='active',updated_at=? WHERE guild_id=? AND status='construction' AND construction_complete_at<=?").run(now, guildId, now);
    const job = db.prepare('SELECT job_id AS jobId FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1').get(guildId, userId) as { jobId: string } | undefined;
    if (!job) return undefined;
    const owned = db.prepare("SELECT owner_id AS ownerId,status FROM economy_businesses WHERE guild_id=? AND owner_id=? AND job_id=? AND status IN ('active','closed') LIMIT 1").get(guildId, userId, job.jobId) as { ownerId: string; status: string } | undefined;
    if (owned) {
      if (owned.status === 'closed') return { ownerId: userId, isOwner: true, blocked: 'closed' };
      const pest = db.prepare("SELECT id FROM economy_business_events WHERE guild_id=? AND owner_id=? AND event_type='pest' AND status='pending' LIMIT 1").get(guildId, userId);
      return { ownerId: userId, isOwner: true, ...(pest ? { blocked: 'pest' as const } : {}) };
    }
    const staff = db.prepare(`SELECT e.owner_id AS ownerId FROM economy_business_employees e
      JOIN economy_businesses b ON b.guild_id=e.guild_id AND b.owner_id=e.owner_id
      WHERE e.guild_id=? AND e.employee_user_id=? AND e.status='active' AND e.kind='real' AND b.status IN ('active','closed') AND b.job_id=? LIMIT 1`).get(guildId, userId, job.jobId) as { ownerId: string } | undefined;
    if (!staff) return undefined;
    const business = db.prepare('SELECT status FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, staff.ownerId) as { status: string } | undefined;
    if (business?.status === 'closed') return { ownerId: staff.ownerId, isOwner: false, blocked: 'closed' };
    const pest = db.prepare("SELECT id FROM economy_business_events WHERE guild_id=? AND owner_id=? AND event_type='pest' AND status='pending' LIMIT 1").get(guildId, staff.ownerId);
    return { ownerId: staff.ownerId, isOwner: false, ...(pest ? { blocked: 'pest' as const } : {}) };
  });
  return resolve.immediate();
}

function grantBusinessGoodSqlite(guildId: string, userId: string, itemId: string, quantity: number, reference: string, at: number): void {
  db.prepare(`INSERT INTO economy_inventory(guild_id,user_id,item_id,quantity,acquired_at) VALUES(?,?,?,?,?)
    ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity,acquired_at=excluded.acquired_at`).run(guildId, userId, itemId, quantity, at);
  db.prepare('INSERT INTO economy_item_ledger(guild_id,user_id,item_id,quantity_delta,reason,reference,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(guildId, userId, itemId, quantity, 'business_work_product', `${reference}:item:${itemId}`, at);
}

async function grantBusinessGoodMysql(connection: PoolConnection, guildId: string, userId: string, itemId: string, quantity: number, reference: string, at: number): Promise<void> {
  await connection.execute(`INSERT INTO economy_inventory(guild_id,user_id,item_id,quantity,acquired_at) VALUES(?,?,?,?,?)
    ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=VALUES(acquired_at)`, [guildId, userId, itemId, quantity, at]);
  await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: quantity, reason: 'business_work_product', reference: `${reference}:item:${itemId}`, createdAt: at });
}

async function workBusinessShift(guildId: string, userId: string, reference: string, route: BusinessWorkRoute): Promise<WorkResult> {
  if (route.blocked === 'closed') return { ok: false, reason: 'business_closed' };
  if (route.blocked === 'pest') return { ok: false, reason: 'business_pest' };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const ownerAccountBeforeReconcile = await mysqlEnsureAccount(connection, guildId, route.ownerId, true);
    const ownerLoan = await reconcilePersonalLoanMysql(connection, guildId, route.ownerId, nowSeconds(), ownerAccountBeforeReconcile);
    let workerLoan = ownerLoan;
    if (route.ownerId !== userId) {
      const workerAccountBeforeReconcile = await mysqlEnsureAccount(connection, guildId, userId, true);
      workerLoan = await reconcilePersonalLoanMysql(connection, guildId, userId, nowSeconds(), workerAccountBeforeReconcile);
    }
    const ownerAccount = await mysqlEnsureAccount(connection, guildId, route.ownerId, true);
    const workerAccount = route.ownerId === userId ? ownerAccount : await mysqlEnsureAccount(connection, guildId, userId, true);
    const [jobs] = await connection.execute<RowDataPacket[]>('SELECT job_id AS jobId,level,xp,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1 FOR UPDATE', [guildId, userId]);
    const current = jobs[0];
    if (!current) return { ok: false as const, reason: 'no_job' as const };
    const job = economyJobs.find((candidate) => candidate.id === String(current.jobId));
    if (!job) return { ok: false as const, reason: 'no_job' as const };
    const [businessRows] = await connection.execute<RowDataPacket[]>("SELECT job_id AS jobId,status,level,debt FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE", [guildId, route.ownerId]);
    const business = businessRows[0];
    if (!business || String(business.status) !== 'active' || String(business.jobId) !== job.id) return { ok: false as const, reason: 'no_job' as const };
    if (!route.isOwner) {
      const [employment] = await connection.execute<RowDataPacket[]>("SELECT employee_key FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND employee_user_id=? AND kind='real' AND status='active' FOR UPDATE", [guildId, route.ownerId, userId]);
      if (!employment[0]) return { ok: false as const, reason: 'no_job' as const };
    }
    const [tools] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, job.toolId]);
    if (Number(tools[0]?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_tool' as const, job };
    const now = businessNow();
    const level = Number(current.level);
    const businessLevel = Math.max(1, Number(business.level));
    const cooldown = businessCooldownSeconds(businessLevel);
    const nextWorkAt = (workerAccount.lastWorkAt ?? 0) + cooldown;
    if (now < nextWorkAt) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: nextWorkAt - now, job };
    const baseAmount = job.minPay + randomInt(job.maxPay - job.minPay + 1) + Math.min(level - 1, MAX_JOB_LEVEL - 1) * 3;
    const [buffRows] = await connection.execute<RowDataPacket[]>('SELECT uses FROM economy_business_buffs WHERE guild_id=? AND user_id=? FOR UPDATE', [guildId, userId]);
    const hasBuff = Number(buffRows[0]?.uses ?? 0) > 0;
    const previousDebt = Number(business.debt ?? 0);
    const [staffRows] = await connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS staffCount,COALESCE(SUM(CASE WHEN kind='npc' THEN 1 ELSE 0 END),0) AS npcCount FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND status='active'", [guildId, route.ownerId]);
    const npcCount = Number(staffRows[0]?.npcCount ?? 0);
    const settlement = settleBusinessRevenue({ jobId: job.id, businessLevel, baseAmount, hasBuff, isOwner: route.isOwner, activeStaff: Number(staffRows[0]?.staffCount ?? 0), npcCount, previousDebt });
    if (!settlement) return { ok: false as const, reason: 'business_funds' as const, job };
    if (hasBuff) await connection.execute('UPDATE economy_business_buffs SET uses=uses-1,updated_at=? WHERE guild_id=? AND user_id=?', [now, guildId, userId]);
    const { gross, wagesDue: wagesPaid, theft, utilitiesPaid, debt: newDebt, net } = settlement;
    const ownerLoanPayment = await applyBankruptcyWorkPaymentMysql(connection, guildId, route.ownerId, ownerLoan, net, `${reference}:owner`, now);
    const workerLoanPayment = route.ownerId === userId ? ownerLoanPayment
      : await applyBankruptcyWorkPaymentMysql(connection, guildId, userId, workerLoan, wagesPaid, `${reference}:worker`, now);
    const nextOwnerBalance = ownerAccount.balance + ownerLoanPayment.payout;
    const progress = addJobExperience(level, Number(current.xp));
    const toolWear = await wearJobToolMysql(connection, guildId, userId, job, progress.level, reference, now);
    const selectedAt = Math.max(now, Number(current.updatedAt ?? 0) + 1);
    await connection.execute('UPDATE economy_jobs SET level=?,xp=?,updated_at=? WHERE guild_id=? AND user_id=? AND job_id=?', [progress.level, progress.xp, selectedAt, guildId, userId, job.id]);
    if (route.isOwner) await connection.execute('UPDATE economy_accounts SET balance=?,last_work_at=?,updated_at=? WHERE guild_id=? AND user_id=?', [nextOwnerBalance, now, now, guildId, route.ownerId]);
    else await connection.execute('UPDATE economy_accounts SET balance=?,updated_at=? WHERE guild_id=? AND user_id=?', [nextOwnerBalance, now, guildId, route.ownerId]);
    await mysqlAddLedger(connection, guildId, route.ownerId, gross, `work_reward:business:${job.id}`, `${reference}:revenue`, now);
    if (wagesPaid) {
      await mysqlAddLedger(connection, guildId, route.ownerId, -wagesPaid, route.isOwner ? 'business:npc_wage' : 'business:employee_wage', `${reference}:wage:out`, now);
      if (!route.isOwner) {
        await connection.execute('UPDATE economy_accounts SET balance=balance+?,last_work_at=?,updated_at=? WHERE guild_id=? AND user_id=?', [workerLoanPayment.payout, now, now, guildId, userId]);
        await mysqlAddLedger(connection, guildId, userId, wagesPaid, 'business:employee_wage', `${reference}:wage:in`, now);
      }
    }
    if (theft) await mysqlAddLedger(connection, guildId, route.ownerId, -theft, 'business:theft', `${reference}:theft`, now);
    if (utilitiesPaid) await mysqlAddLedger(connection, guildId, route.ownerId, -utilitiesPaid, 'business:utilities', `${reference}:utilities`, now);
    await connection.execute('UPDATE economy_businesses SET debt=?,updated_at=? WHERE guild_id=? AND owner_id=?', [newDebt, now, guildId, route.ownerId]);
    await connection.execute(`INSERT INTO economy_business_shifts(guild_id,owner_id,worker_id,gross,utilities_due,utilities_paid,wages_paid,net,worked_at)
      VALUES(?,?,?,?,?,?,?,?,?)`, [guildId, route.ownerId, userId, gross, businessUtilityTotal(job.id, businessLevel), utilitiesPaid, wagesPaid, net, now]);
    const pestFine = await createPestEventMysql(connection, guildId, route.ownerId, job.id, businessLevel, reference, now);
    const goods = businessGoods.filter((item) => item.jobId === job.id);
    const produced = [pick(goods)!, ...(route.isOwner ? Array.from({ length: Math.min(2, npcCount) }, () => pick(goods)!) : [])];
    const goodsCounts = new Map<string, number>();
    for (const item of produced) goodsCounts.set(item.id, (goodsCounts.get(item.id) ?? 0) + 1);
    for (const [itemId, quantity] of goodsCounts) await grantBusinessGoodMysql(connection, guildId, userId, itemId, quantity, reference, now);
    const employeeNames = produced.map((item) => `${item.emoji} **${item.name}**`).join(', ');
    const progressText = progress.levelUp ? `\n🎉 Tu oficio subió al nivel ${progress.level}.` : ` · ${progress.level >= MAX_JOB_LEVEL ? 'nivel máximo' : `${progress.xp}/${jobXpToNext(progress.level)} XP`}`;
    const businessText = `\n🏪 Venta bruta: **${money.format(gross)}** · nómina: **${money.format(wagesPaid)}** · servicios abonados: **${money.format(utilitiesPaid)}** · beneficio del turno: **${money.format(net)}** · deuda de servicios: **${money.format(newDebt)}**.`
      + (theft ? `\n🕵️ Un robo inesperado se llevó **${money.format(theft)}** monedas de las ventas.` : '')
      + (pestFine ? `\n🐀 ¡Plaga detectada! El negocio queda pausado hasta pagar **${money.format(pestFine)}** por el exterminio en el panel del terreno.` : '');
    const buffText = hasBuff ? '\n✨ El consumible de negocio aumentó 20% los ingresos de este turno.' : '';
    const toolText = toolWear.broke ? `\n💥 ${job.toolName} se rompió; recompra otra para seguir trabajando.` : `\n🧰 ${job.toolName} · ${toolWear.durability}/${toolWear.maxDurability} de durabilidad.`;
    const paymentText = route.isOwner ? workLoanPaymentText(ownerLoanPayment) : workLoanPaymentText(workerLoanPayment);
    const amount = route.isOwner ? ownerLoanPayment.payout : workerLoanPayment.payout;
    const balance = route.isOwner ? nextOwnerBalance : workerAccount.balance + workerLoanPayment.payout;
    const message = `${pick(job.messages)}\n**${businessName(job.id)} · nivel ${businessLevel}**${businessText}${paymentText}\n📦 Producto guardado en tu inventario: ${employeeNames}.${buffText}${progressText}${toolText}`;
    return { ok: true as const, amount, balance, jobName: job.name, level: progress.level, levelUp: progress.levelUp, message };
  });

  const result = db.transaction((): WorkResult => {
    sqliteEnsureAccount(guildId, route.ownerId);
    const ownerLoan = reconcilePersonalLoanSqlite(guildId, route.ownerId, nowSeconds());
    const workerLoan = route.ownerId === userId ? ownerLoan : reconcilePersonalLoanSqlite(guildId, userId, nowSeconds());
    const ownerAccount = sqliteEnsureAccount(guildId, route.ownerId);
    const workerAccount = route.ownerId === userId ? ownerAccount : sqliteEnsureAccount(guildId, userId);
    const current = db.prepare('SELECT job_id AS jobId,level,xp,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1').get(guildId, userId) as { jobId: string; level: number; xp: number; updatedAt: number } | undefined;
    if (!current) return { ok: false, reason: 'no_job' };
    const job = economyJobs.find((candidate) => candidate.id === current.jobId);
    if (!job) return { ok: false, reason: 'no_job' };
    const business = db.prepare('SELECT job_id AS jobId,status,level,debt FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, route.ownerId) as { jobId: string; status: string; level: number; debt: number } | undefined;
    if (!business || business.status !== 'active' || business.jobId !== job.id) return { ok: false, reason: 'no_job' };
    if (!route.isOwner) {
      const employment = db.prepare("SELECT employee_key FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND employee_user_id=? AND kind='real' AND status='active'").get(guildId, route.ownerId, userId);
      if (!employment) return { ok: false, reason: 'no_job' };
    }
    const tools = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, job.toolId) as { quantity: number } | undefined;
    if (!tools || tools.quantity < 1) return { ok: false, reason: 'missing_tool', job };
    const now = businessNow();
    const level = Number(current.level);
    const businessLevel = Math.max(1, Number(business.level));
    const cooldown = businessCooldownSeconds(businessLevel);
    const nextWorkAt = (workerAccount.lastWorkAt ?? 0) + cooldown;
    if (now < nextWorkAt) return { ok: false, reason: 'cooldown', secondsRemaining: nextWorkAt - now, job };
    const baseAmount = job.minPay + randomInt(job.maxPay - job.minPay + 1) + Math.min(level - 1, MAX_JOB_LEVEL - 1) * 3;
    const buff = db.prepare('SELECT uses FROM economy_business_buffs WHERE guild_id=? AND user_id=?').get(guildId, userId) as { uses: number } | undefined;
    const hasBuff = Number(buff?.uses ?? 0) > 0;
    const previousDebt = Number(business.debt ?? 0);
    const staffCounts = db.prepare("SELECT COUNT(*) AS staffCount,COALESCE(SUM(CASE WHEN kind='npc' THEN 1 ELSE 0 END),0) AS npcCount FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND status='active'").get(guildId, route.ownerId) as { staffCount: number; npcCount: number };
    const npcCount = Number(staffCounts.npcCount);
    const settlement = settleBusinessRevenue({ jobId: job.id, businessLevel, baseAmount, hasBuff, isOwner: route.isOwner, activeStaff: Number(staffCounts.staffCount), npcCount, previousDebt });
    if (!settlement) return { ok: false, reason: 'business_funds', job };
    if (hasBuff) db.prepare('UPDATE economy_business_buffs SET uses=uses-1,updated_at=? WHERE guild_id=? AND user_id=?').run(now, guildId, userId);
    const { gross, wagesDue: wagesPaid, theft, utilitiesPaid, debt: newDebt, net } = settlement;
    const ownerLoanPayment = applyBankruptcyWorkPaymentSqlite(guildId, route.ownerId, ownerLoan, net, `${reference}:owner`, now);
    const workerLoanPayment = route.ownerId === userId ? ownerLoanPayment
      : applyBankruptcyWorkPaymentSqlite(guildId, userId, workerLoan, wagesPaid, `${reference}:worker`, now);
    const nextOwnerBalance = ownerAccount.balance + ownerLoanPayment.payout;
    const progress = addJobExperience(level, Number(current.xp));
    const toolWear = wearJobToolSqlite(guildId, userId, job, progress.level, reference, now);
    const selectedAt = Math.max(now, Number(current.updatedAt ?? 0) + 1);
    db.prepare('UPDATE economy_jobs SET level=?,xp=?,updated_at=? WHERE guild_id=? AND user_id=? AND job_id=?').run(progress.level, progress.xp, selectedAt, guildId, userId, job.id);
    if (route.isOwner) db.prepare('UPDATE economy_accounts SET balance=?,last_work_at=?,updated_at=? WHERE guild_id=? AND user_id=?').run(nextOwnerBalance, now, now, guildId, route.ownerId);
    else db.prepare('UPDATE economy_accounts SET balance=?,updated_at=? WHERE guild_id=? AND user_id=?').run(nextOwnerBalance, now, guildId, route.ownerId);
    db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, route.ownerId, gross, `work_reward:business:${job.id}`, `${reference}:revenue`, now);
    if (wagesPaid) {
      db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, route.ownerId, -wagesPaid, route.isOwner ? 'business:npc_wage' : 'business:employee_wage', `${reference}:wage:out`, now);
      if (!route.isOwner) {
        db.prepare('UPDATE economy_accounts SET balance=balance+?,last_work_at=?,updated_at=? WHERE guild_id=? AND user_id=?').run(workerLoanPayment.payout, now, now, guildId, userId);
        db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, wagesPaid, 'business:employee_wage', `${reference}:wage:in`, now);
      }
    }
    if (theft) db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, route.ownerId, -theft, 'business:theft', `${reference}:theft`, now);
    if (utilitiesPaid) db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, route.ownerId, -utilitiesPaid, 'business:utilities', `${reference}:utilities`, now);
    db.prepare('UPDATE economy_businesses SET debt=?,updated_at=? WHERE guild_id=? AND owner_id=?').run(newDebt, now, guildId, route.ownerId);
    db.prepare(`INSERT INTO economy_business_shifts(guild_id,owner_id,worker_id,gross,utilities_due,utilities_paid,wages_paid,net,worked_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(guildId, route.ownerId, userId, gross, businessUtilityTotal(job.id, businessLevel), utilitiesPaid, wagesPaid, net, now);
    const pestFine = createPestEventSqlite(guildId, route.ownerId, job.id, businessLevel, reference, now);
    const goods = businessGoods.filter((item) => item.jobId === job.id);
    const produced = [pick(goods)!, ...(route.isOwner ? Array.from({ length: Math.min(2, npcCount) }, () => pick(goods)!) : [])];
    const goodsCounts = new Map<string, number>();
    for (const item of produced) goodsCounts.set(item.id, (goodsCounts.get(item.id) ?? 0) + 1);
    for (const [itemId, quantity] of goodsCounts) grantBusinessGoodSqlite(guildId, userId, itemId, quantity, reference, now);
    const goodsText = produced.map((item) => `${item.emoji} **${item.name}**`).join(', ');
    const progressText = progress.levelUp ? `\n🎉 Tu oficio subió al nivel ${progress.level}.` : ` · ${progress.level >= MAX_JOB_LEVEL ? 'nivel máximo' : `${progress.xp}/${jobXpToNext(progress.level)} XP`}`;
    const businessText = `\n🏪 Venta bruta: **${money.format(gross)}** · nómina: **${money.format(wagesPaid)}** · servicios abonados: **${money.format(utilitiesPaid)}** · beneficio del turno: **${money.format(net)}** · deuda de servicios: **${money.format(newDebt)}**.`
      + (theft ? `\n🕵️ Un robo inesperado se llevó **${money.format(theft)}** monedas de las ventas.` : '')
      + (pestFine ? `\n🐀 ¡Plaga detectada! El negocio queda pausado hasta pagar **${money.format(pestFine)}** por el exterminio en el panel del terreno.` : '');
    const message = `${pick(job.messages)}\n**${businessName(job.id)} · nivel ${businessLevel}**${businessText}\n📦 Producto guardado en tu inventario: ${goodsText}.${hasBuff ? '\n✨ El consumible de negocio aumentó 20% los ingresos de este turno.' : ''}${progressText}\n🧰 ${toolWear.broke ? `${job.toolName} se rompió; recompra otra para seguir trabajando.` : `${job.toolName} · ${toolWear.durability}/${toolWear.maxDurability} de durabilidad.`}`;
    const paymentText = route.isOwner ? workLoanPaymentText(ownerLoanPayment) : workLoanPaymentText(workerLoanPayment);
    return { ok: true, amount: route.isOwner ? ownerLoanPayment.payout : workerLoanPayment.payout, balance: route.isOwner ? nextOwnerBalance : workerAccount.balance + workerLoanPayment.payout, jobName: job.name, level: progress.level, levelUp: progress.levelUp, message: message.replace(`${businessText}`, `${businessText}${paymentText}`) };
  });
  return result.immediate();
}

export async function getBusinessOverview(guildId: string, ownerId: string): Promise<BusinessOverview | undefined> {
  guildId = GLOBAL_SCOPE_ID;
  const now = businessNow();
  await refreshBusinessLifecycle(guildId, ownerId, now);
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>(`SELECT b.owner_id AS ownerId,b.job_id AS jobId,b.status,b.level,b.created_at AS createdAt,b.construction_complete_at AS constructionCompleteAt,b.debt,
      b.investment_value AS investmentValue,b.mortgaged_at AS mortgagedAt,l.foreclosure_at AS foreclosureAt,l.collateral_value AS collateralValue,l.balance_due AS loanBalanceDue
      FROM economy_businesses b LEFT JOIN economy_loans l ON l.guild_id=b.guild_id AND l.user_id=b.owner_id WHERE b.guild_id=? AND b.owner_id=?`, [guildId, ownerId]);
    const row = rows[0];
    if (!row) return undefined;
    const [staff] = await economyPool.execute<RowDataPacket[]>(`SELECT e.employee_key AS \`key\`,e.employee_user_id AS userId,e.employee_name AS name,e.kind,e.status,a.last_work_at AS lastWorkAt
      FROM economy_business_employees e LEFT JOIN economy_accounts a ON a.guild_id=e.guild_id AND a.user_id=e.employee_user_id
      WHERE e.guild_id=? AND e.owner_id=? ORDER BY e.created_at`, [guildId, ownerId]);
    const [stats] = await economyPool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(gross),0) AS income30d,COALESCE(SUM(utilities_paid),0) AS expenses30d,
      COALESCE(SUM(wages_paid),0) AS wages30d,COALESCE(SUM(net),0) AS profit30d FROM economy_business_shifts WHERE guild_id=? AND owner_id=? AND worked_at>=?`, [guildId, ownerId, now - 30 * 24 * 60 * 60]);
    const [activityRows] = await economyPool.execute<RowDataPacket[]>('SELECT MAX(worked_at) AS lastWorkAt FROM economy_business_shifts WHERE guild_id=? AND owner_id=?', [guildId, ownerId]);
    const [eventRows] = await economyPool.execute<RowDataPacket[]>("SELECT event_type AS type,amount,created_at AS createdAt FROM economy_business_events WHERE guild_id=? AND owner_id=? AND status='pending' ORDER BY created_at", [guildId, ownerId]);
    const job = economyJobs.find((entry) => entry.id === String(row.jobId));
    if (!job) return undefined;
    return { ownerId, job, name: businessName(job.id), status: String(row.status) as BusinessOverview['status'], level: Number(row.level), createdAt: Number(row.createdAt),
      constructionCompleteAt: row.constructionCompleteAt === null ? null : Number(row.constructionCompleteAt), debt: Number(row.debt),
      investmentValue: Number(row.investmentValue ?? 0), mortgagedAt: row.mortgagedAt === null || row.mortgagedAt === undefined ? null : Number(row.mortgagedAt),
      foreclosureAt: row.foreclosureAt === null || row.foreclosureAt === undefined ? null : Number(row.foreclosureAt), collateralValue: Number(row.collateralValue ?? 0),
      loanBalanceDue: row.loanBalanceDue === null || row.loanBalanceDue === undefined ? null : Number(row.loanBalanceDue),
      employees: staff.map((entry) => ({ key: String(entry.key), userId: entry.userId ? String(entry.userId) : null, name: String(entry.name), kind: String(entry.kind) as BusinessEmployee['kind'], status: String(entry.status) as BusinessEmployee['status'], lastWorkAt: entry.lastWorkAt === null || entry.lastWorkAt === undefined ? null : Number(entry.lastWorkAt) })),
      income30d: Number(stats[0]?.income30d ?? 0), expenses30d: Number(stats[0]?.expenses30d ?? 0), wages30d: Number(stats[0]?.wages30d ?? 0), profit30d: Number(stats[0]?.profit30d ?? 0),
      lastWorkAt: activityRows[0]?.lastWorkAt === null || activityRows[0]?.lastWorkAt === undefined ? null : Number(activityRows[0].lastWorkAt),
      events: eventRows.map((entry) => ({ type: String(entry.type) as BusinessEventType, amount: Number(entry.amount), createdAt: Number(entry.createdAt) })),
      recommendedStaff: businessRecommendedStaff(Number(row.level)), staffLimit: businessStaffLimit(Number(row.level)) };
  }
  const row = db.prepare(`SELECT b.owner_id AS ownerId,b.job_id AS jobId,b.status,b.level,b.created_at AS createdAt,b.construction_complete_at AS constructionCompleteAt,b.debt,
    b.investment_value AS investmentValue,b.mortgaged_at AS mortgagedAt,l.foreclosure_at AS foreclosureAt,l.collateral_value AS collateralValue,l.balance_due AS loanBalanceDue
    FROM economy_businesses b LEFT JOIN economy_loans l ON l.guild_id=b.guild_id AND l.user_id=b.owner_id WHERE b.guild_id=? AND b.owner_id=?`).get(guildId, ownerId) as {
      ownerId: string; jobId: string; status: string; level: number; createdAt: number; constructionCompleteAt: number | null; debt: number; investmentValue: number;
      mortgagedAt: number | null; foreclosureAt: number | null; collateralValue: number; loanBalanceDue: number | null;
    } | undefined;
  if (!row) return undefined;
  const staff = db.prepare(`SELECT e.employee_key AS \`key\`,e.employee_user_id AS userId,e.employee_name AS name,e.kind,e.status,a.last_work_at AS lastWorkAt
    FROM economy_business_employees e LEFT JOIN economy_accounts a ON a.guild_id=e.guild_id AND a.user_id=e.employee_user_id
    WHERE e.guild_id=? AND e.owner_id=? ORDER BY e.created_at`).all(guildId, ownerId) as Array<{ key: string; userId: string | null; name: string; kind: string; status: string; lastWorkAt: number | null }>;
  const stats = db.prepare(`SELECT COALESCE(SUM(gross),0) AS income30d,COALESCE(SUM(utilities_paid),0) AS expenses30d,
    COALESCE(SUM(wages_paid),0) AS wages30d,COALESCE(SUM(net),0) AS profit30d FROM economy_business_shifts WHERE guild_id=? AND owner_id=? AND worked_at>=?`).get(guildId, ownerId, now - 30 * 24 * 60 * 60) as { income30d: number; expenses30d: number; wages30d: number; profit30d: number };
  const activity = db.prepare('SELECT MAX(worked_at) AS lastWorkAt FROM economy_business_shifts WHERE guild_id=? AND owner_id=?').get(guildId, ownerId) as { lastWorkAt: number | null };
  const events = db.prepare("SELECT event_type AS type,amount,created_at AS createdAt FROM economy_business_events WHERE guild_id=? AND owner_id=? AND status='pending' ORDER BY created_at").all(guildId, ownerId) as Array<{ type: string; amount: number; createdAt: number }>;
  const job = economyJobs.find((entry) => entry.id === row.jobId);
  if (!job) return undefined;
  return { ownerId, job, name: businessName(job.id), status: row.status as BusinessOverview['status'], level: Number(row.level), createdAt: Number(row.createdAt), constructionCompleteAt: row.constructionCompleteAt === null ? null : Number(row.constructionCompleteAt), debt: Number(row.debt),
    investmentValue: Number(row.investmentValue ?? 0), mortgagedAt: row.mortgagedAt === null ? null : Number(row.mortgagedAt), foreclosureAt: row.foreclosureAt === null ? null : Number(row.foreclosureAt),
    collateralValue: Number(row.collateralValue ?? 0), loanBalanceDue: row.loanBalanceDue === null ? null : Number(row.loanBalanceDue),
    employees: staff.map((entry) => ({ ...entry, userId: entry.userId ?? null, kind: entry.kind as BusinessEmployee['kind'], status: entry.status as BusinessEmployee['status'], lastWorkAt: entry.lastWorkAt ?? null })), income30d: Number(stats.income30d), expenses30d: Number(stats.expenses30d), wages30d: Number(stats.wages30d), profit30d: Number(stats.profit30d), lastWorkAt: activity.lastWorkAt ?? null,
    events: events.map((entry) => ({ type: entry.type as BusinessEventType, amount: Number(entry.amount), createdAt: Number(entry.createdAt) })), recommendedStaff: businessRecommendedStaff(Number(row.level)), staffLimit: businessStaffLimit(Number(row.level)) };
}

export async function getBusinessOverviewForUser(guildId: string, userId: string): Promise<BusinessOverview | undefined> {
  guildId = GLOBAL_SCOPE_ID;
  const owned = await getBusinessOverview(guildId, userId);
  if (owned) return owned;
  let activeJobId: string | undefined;
  if (economyPool) {
    const [jobs] = await economyPool.execute<RowDataPacket[]>('SELECT job_id AS jobId FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1', [guildId, userId]);
    activeJobId = jobs[0] ? String(jobs[0].jobId) : undefined;
  } else {
    const row = db.prepare('SELECT job_id AS jobId FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1').get(guildId, userId) as { jobId: string } | undefined;
    activeJobId = row?.jobId;
  }
  if (!activeJobId) return undefined;
  let employerId: string | undefined;
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>(`SELECT e.owner_id AS ownerId FROM economy_business_employees e
      JOIN economy_businesses b ON b.guild_id=e.guild_id AND b.owner_id=e.owner_id
      WHERE e.guild_id=? AND e.employee_user_id=? AND e.kind='real' AND e.status='active' AND b.job_id=? AND b.status IN ('active','closed') LIMIT 1`, [guildId, userId, activeJobId]);
    employerId = rows[0] ? String(rows[0].ownerId) : undefined;
  } else {
    const row = db.prepare(`SELECT e.owner_id AS ownerId FROM economy_business_employees e
      JOIN economy_businesses b ON b.guild_id=e.guild_id AND b.owner_id=e.owner_id
      WHERE e.guild_id=? AND e.employee_user_id=? AND e.kind='real' AND e.status='active' AND b.job_id=? AND b.status IN ('active','closed') LIMIT 1`).get(guildId, userId, activeJobId) as { ownerId: string } | undefined;
    employerId = row?.ownerId;
  }
  return employerId ? getBusinessOverview(guildId, employerId) : undefined;
}

export async function buyBusinessLand(guildId: string, userId: string, jobId: string, reference: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const business = businessByJob(jobId);
  if (!business) return { ok: false, reason: 'no_job', balance: await getBalance(guildId, userId) };
  const quote = await getProductPriceQuote(businessProductRequest(`business_land_${jobId}`, business.landPrice));
  const now = businessNow();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const loan = await mysqlLoadPersonalLoan(connection, guildId, userId, true);
    if (loan?.bankruptAt !== null && loan) return { ok: false as const, reason: 'bankrupt' as const, balance: account.balance };
    const [jobs] = await connection.execute<RowDataPacket[]>('SELECT job_id FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=? AND is_active=1 FOR UPDATE', [guildId, userId, jobId]);
    if (!jobs[0]) return { ok: false as const, reason: 'no_job' as const, balance: account.balance };
    const [employment] = await connection.execute<RowDataPacket[]>('SELECT owner_id FROM economy_business_employees WHERE guild_id=? AND employee_user_id=?', [guildId, userId]);
    if (employment[0]) return { ok: false as const, reason: 'employee_busy' as const, balance: account.balance };
    const [owned] = await connection.execute<RowDataPacket[]>('SELECT owner_id FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE', [guildId, userId]);
    if (owned[0]) return { ok: false as const, reason: 'already_owned' as const, balance: account.balance };
    if (account.balance < quote.price) return { ok: false as const, reason: 'insufficient_funds' as const, balance: account.balance };
    await connection.execute('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?', [quote.price, now, guildId, userId]);
    await connection.execute("INSERT INTO economy_businesses(guild_id,owner_id,job_id,status,level,debt,investment_value,created_at,updated_at) VALUES(?,?,?,'land',1,0,?,?,?)", [guildId, userId, jobId, quote.price, now, now]);
    await mysqlAddLedger(connection, guildId, userId, -quote.price, 'business:land', reference, now);
    await recordProductSaleMysql(connection, { userId, kind: 'economy', id: `business_land_${jobId}`, category: BUSINESS_MARKET_CATEGORY, quantity: 1, unitPrice: quote.price, reference, soldAt: now });
    return { ok: true as const, price: quote.price, balance: account.balance - quote.price, message: `Compraste el terreno para **${business.name}**.` };
  });
  const purchase = db.transaction((): BusinessActionResult => {
    const account = sqliteEnsureAccount(guildId, userId);
    const loan = sqliteLoadPersonalLoan(guildId, userId);
    if (loan?.bankruptAt !== null && loan) return { ok: false, reason: 'bankrupt', balance: account.balance };
    const job = db.prepare('SELECT job_id FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=? AND is_active=1').get(guildId, userId, jobId);
    if (!job) return { ok: false, reason: 'no_job', balance: account.balance };
    const employment = db.prepare('SELECT owner_id FROM economy_business_employees WHERE guild_id=? AND employee_user_id=?').get(guildId, userId);
    if (employment) return { ok: false, reason: 'employee_busy', balance: account.balance };
    const owned = db.prepare('SELECT owner_id FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, userId);
    if (owned) return { ok: false, reason: 'already_owned', balance: account.balance };
    if (account.balance < quote.price) return { ok: false, reason: 'insufficient_funds', balance: account.balance };
    db.prepare('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?').run(quote.price, now, guildId, userId);
    db.prepare("INSERT INTO economy_businesses(guild_id,owner_id,job_id,status,level,debt,investment_value,created_at,updated_at) VALUES(?,?,?,'land',1,0,?,?,?)").run(guildId, userId, jobId, quote.price, now, now);
    db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -quote.price, 'business:land', reference, now);
    recordProductSaleSqlite({ userId, kind: 'economy', id: `business_land_${jobId}`, category: BUSINESS_MARKET_CATEGORY, quantity: 1, unitPrice: quote.price, reference, soldAt: now });
    return { ok: true, price: quote.price, balance: account.balance - quote.price, message: `Compraste el terreno para **${business.name}**.` };
  });
  return purchase.immediate();
}

export async function sellBusinessProperty(guildId: string, userId: string, reference: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const now = businessNow();
  await refreshBusinessLifecycle(guildId, userId, now);
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT job_id AS jobId,status,level,debt,investment_value AS investmentValue,
      mortgaged_at AS mortgagedAt,created_at AS createdAt FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE`, [guildId, userId]);
    const row = rows[0];
    if (!row) return { ok: false as const, reason: 'not_found' as const, balance: account.balance };
    const job = economyJobs.find((entry) => entry.id === String(row.jobId));
    if (!job) return { ok: false as const, reason: 'not_found' as const, balance: account.balance };
    const mortgagedAt = row.mortgagedAt === null || row.mortgagedAt === undefined ? null : Number(row.mortgagedAt);
    const loan = mortgagedAt === null ? null : await mysqlLoadPersonalLoan(connection, guildId, userId, true);
    const [pendingEvents] = await connection.execute<RowDataPacket[]>("SELECT amount FROM economy_business_events WHERE guild_id=? AND owner_id=? AND status='pending' FOR UPDATE", [guildId, userId]);
    const pendingEventDebt = pendingEvents.reduce((sum, event) => sum + Number(event.amount), 0);
    const quote = calculateBusinessSaleQuote({
      job, status: String(row.status) as BusinessOverview['status'], level: Number(row.level), investmentValue: Number(row.investmentValue ?? 0),
      createdAt: Number(row.createdAt), debt: Number(row.debt), mortgagedAt, loanBalanceDue: loan?.balanceDue ?? null, pendingEventDebt,
    }, now);
    const remainingMortgage = loan && mortgagedAt !== null ? Math.max(0, loan.balanceDue - quote.mortgagePayoff) : null;
    const balance = account.balance + quote.netProceeds;
    await connection.execute('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?', [quote.netProceeds, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, quote.marketValue, 'business:property_sale', `${reference}:sale`, now);
    if (quote.mortgagePayoff) {
      await mysqlAddLedger(connection, guildId, userId, -quote.mortgagePayoff, 'loan:property_sale_repayment', `${reference}:mortgage`, now);
      if (remainingMortgage === 0) await connection.execute('DELETE FROM economy_loans WHERE guild_id=? AND user_id=?', [guildId, userId]);
      else if (loan) await connection.execute('UPDATE economy_loans SET balance_due=?,foreclosure_at=NULL,collateral_value=0 WHERE guild_id=? AND user_id=?', [remainingMortgage, guildId, userId]);
    } else if (loan && mortgagedAt !== null) {
      await connection.execute('UPDATE economy_loans SET foreclosure_at=NULL,collateral_value=0 WHERE guild_id=? AND user_id=?', [guildId, userId]);
    }
    if (quote.operatingDebt) await mysqlAddLedger(connection, guildId, userId, -quote.operatingDebt, 'business:property_sale_debt', `${reference}:business-debt`, now);
    await connection.execute('DELETE FROM economy_business_events WHERE guild_id=? AND owner_id=?', [guildId, userId]);
    await connection.execute('DELETE FROM economy_business_employees WHERE guild_id=? AND owner_id=?', [guildId, userId]);
    await connection.execute('DELETE FROM economy_business_buffs WHERE guild_id=? AND user_id=?', [guildId, userId]);
    await connection.execute('DELETE FROM economy_businesses WHERE guild_id=? AND owner_id=?', [guildId, userId]);
    return { ok: true as const, price: quote.marketValue, balance, message: businessPropertySaleMessage(businessName(job.id), quote, remainingMortgage) };
  });

  const sale = db.transaction((): BusinessActionResult => {
    const account = sqliteEnsureAccount(guildId, userId);
    const row = db.prepare(`SELECT job_id AS jobId,status,level,debt,investment_value AS investmentValue,mortgaged_at AS mortgagedAt,created_at AS createdAt
      FROM economy_businesses WHERE guild_id=? AND owner_id=?`).get(guildId, userId) as {
        jobId: string; status: string; level: number; debt: number; investmentValue: number; mortgagedAt: number | null; createdAt: number;
      } | undefined;
    if (!row) return { ok: false, reason: 'not_found', balance: account.balance };
    const job = economyJobs.find((entry) => entry.id === row.jobId);
    if (!job) return { ok: false, reason: 'not_found', balance: account.balance };
    const loan = row.mortgagedAt === null ? null : sqliteLoadPersonalLoan(guildId, userId);
    const pendingEvents = db.prepare("SELECT amount FROM economy_business_events WHERE guild_id=? AND owner_id=? AND status='pending'").all(guildId, userId) as Array<{ amount: number }>;
    const pendingEventDebt = pendingEvents.reduce((sum, event) => sum + Number(event.amount), 0);
    const quote = calculateBusinessSaleQuote({
      job, status: row.status as BusinessOverview['status'], level: Number(row.level), investmentValue: Number(row.investmentValue ?? 0),
      createdAt: Number(row.createdAt), debt: Number(row.debt), mortgagedAt: row.mortgagedAt === null ? null : Number(row.mortgagedAt), loanBalanceDue: loan?.balanceDue ?? null, pendingEventDebt,
    }, now);
    const remainingMortgage = loan && row.mortgagedAt !== null ? Math.max(0, loan.balanceDue - quote.mortgagePayoff) : null;
    const balance = account.balance + quote.netProceeds;
    db.prepare('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?').run(quote.netProceeds, now, guildId, userId);
    const ledger = db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)');
    ledger.run(guildId, userId, quote.marketValue, 'business:property_sale', `${reference}:sale`, now);
    if (quote.mortgagePayoff) {
      ledger.run(guildId, userId, -quote.mortgagePayoff, 'loan:property_sale_repayment', `${reference}:mortgage`, now);
      if (remainingMortgage === 0) db.prepare('DELETE FROM economy_loans WHERE guild_id=? AND user_id=?').run(guildId, userId);
      else if (loan) db.prepare('UPDATE economy_loans SET balance_due=?,foreclosure_at=NULL,collateral_value=0 WHERE guild_id=? AND user_id=?').run(remainingMortgage, guildId, userId);
    } else if (loan && row.mortgagedAt !== null) {
      db.prepare('UPDATE economy_loans SET foreclosure_at=NULL,collateral_value=0 WHERE guild_id=? AND user_id=?').run(guildId, userId);
    }
    if (quote.operatingDebt) ledger.run(guildId, userId, -quote.operatingDebt, 'business:property_sale_debt', `${reference}:business-debt`, now);
    db.prepare('DELETE FROM economy_business_events WHERE guild_id=? AND owner_id=?').run(guildId, userId);
    db.prepare('DELETE FROM economy_business_employees WHERE guild_id=? AND owner_id=?').run(guildId, userId);
    db.prepare('DELETE FROM economy_business_buffs WHERE guild_id=? AND user_id=?').run(guildId, userId);
    db.prepare('DELETE FROM economy_businesses WHERE guild_id=? AND owner_id=?').run(guildId, userId);
    return { ok: true, price: quote.marketValue, balance, message: businessPropertySaleMessage(businessName(job.id), quote, remainingMortgage) };
  });
  return sale.immediate();
}

export async function startBusinessConstruction(guildId: string, userId: string, reference: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const overview = await getBusinessOverview(guildId, userId);
  const jobBusiness = overview && businessByJob(overview.job.id);
  if (!overview || !jobBusiness) return { ok: false, reason: 'not_found', balance: await getBalance(guildId, userId) };
  if (overview.mortgagedAt !== null) return { ok: false, reason: 'mortgaged', balance: await getBalance(guildId, userId) };
  const quote = await getProductPriceQuote(businessProductRequest(`business_build_${overview.job.id}`, jobBusiness.buildPrice));
  const now = businessNow();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT status,job_id AS jobId FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE', [guildId, userId]);
    if (!rows[0]) return { ok: false as const, reason: 'not_found' as const, balance: account.balance };
    if (String(rows[0].status) !== 'land') return { ok: false as const, reason: 'not_ready' as const, balance: account.balance };
    if (account.balance < quote.price) return { ok: false as const, reason: 'insufficient_funds' as const, balance: account.balance };
    const completeAt = now + BUSINESS_CONSTRUCTION_SECONDS;
    await connection.execute("UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?", [quote.price, now, guildId, userId]);
    await connection.execute("UPDATE economy_businesses SET status='construction',construction_complete_at=?,investment_value=investment_value+?,updated_at=? WHERE guild_id=? AND owner_id=?", [completeAt, quote.price, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -quote.price, 'business:construction', reference, now);
    await recordProductSaleMysql(connection, { userId, kind: 'economy', id: `business_build_${overview.job.id}`, category: BUSINESS_MARKET_CATEGORY, quantity: 1, unitPrice: quote.price, reference, soldAt: now });
    return { ok: true as const, price: quote.price, balance: account.balance - quote.price, message: `Inició la construcción de **${businessName(overview.job.id)}**. Estará lista en 6 horas.` };
  });
  const build = db.transaction((): BusinessActionResult => {
    const account = sqliteEnsureAccount(guildId, userId);
    const row = db.prepare('SELECT status,job_id AS jobId FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, userId) as { status: string; jobId: string } | undefined;
    if (!row) return { ok: false, reason: 'not_found', balance: account.balance };
    if (row.status !== 'land') return { ok: false, reason: 'not_ready', balance: account.balance };
    if (account.balance < quote.price) return { ok: false, reason: 'insufficient_funds', balance: account.balance };
    db.prepare('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?').run(quote.price, now, guildId, userId);
    db.prepare("UPDATE economy_businesses SET status='construction',construction_complete_at=?,investment_value=investment_value+?,updated_at=? WHERE guild_id=? AND owner_id=?").run(now + BUSINESS_CONSTRUCTION_SECONDS, quote.price, now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -quote.price, 'business:construction', reference, now);
    recordProductSaleSqlite({ userId, kind: 'economy', id: `business_build_${overview.job.id}`, category: BUSINESS_MARKET_CATEGORY, quantity: 1, unitPrice: quote.price, reference, soldAt: now });
    return { ok: true, price: quote.price, balance: account.balance - quote.price, message: `Inició la construcción de **${businessName(row.jobId)}**. Estará lista en 6 horas.` };
  });
  return build.immediate();
}

export async function upgradeBusiness(guildId: string, userId: string, reference: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const overview = await getBusinessOverview(guildId, userId);
  if (!overview) return { ok: false, reason: 'not_found', balance: await getBalance(guildId, userId) };
  if (overview.mortgagedAt !== null) return { ok: false, reason: 'mortgaged', balance: await getBalance(guildId, userId) };
  if (overview.status !== 'active') return { ok: false, reason: 'not_ready', balance: await getBalance(guildId, userId) };
  if (overview.level >= 10) return { ok: false, reason: 'max_level', balance: await getBalance(guildId, userId) };
  const basePrice = Math.round(650 + (overview.level - 1) * 430 + (overview.level - 1) ** 2 * 85);
  const quote = await getProductPriceQuote(businessProductRequest(`business_upgrade_${overview.job.id}_${overview.level + 1}`, basePrice));
  const now = businessNow();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT status,level,job_id AS jobId FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE', [guildId, userId]);
    const row = rows[0];
    if (!row || String(row.status) !== 'active') return { ok: false as const, reason: 'not_ready' as const, balance: account.balance };
    if (Number(row.level) >= 10) return { ok: false as const, reason: 'max_level' as const, balance: account.balance };
    if (account.balance < quote.price) return { ok: false as const, reason: 'insufficient_funds' as const, balance: account.balance };
    const level = Number(row.level) + 1;
    await connection.execute('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?', [quote.price, now, guildId, userId]);
    await connection.execute('UPDATE economy_businesses SET level=?,investment_value=investment_value+?,updated_at=? WHERE guild_id=? AND owner_id=?', [level, quote.price, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -quote.price, 'business:upgrade', reference, now);
    await recordProductSaleMysql(connection, { userId, kind: 'economy', id: `business_upgrade_${overview.job.id}_${level}`, category: BUSINESS_MARKET_CATEGORY, quantity: 1, unitPrice: quote.price, reference, soldAt: now });
    return { ok: true as const, price: quote.price, balance: account.balance - quote.price, message: `Negocio mejorado al **nivel ${level}/10**.` };
  });
  const improve = db.transaction((): BusinessActionResult => {
    const account = sqliteEnsureAccount(guildId, userId);
    const row = db.prepare('SELECT status,level,job_id AS jobId FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, userId) as { status: string; level: number; jobId: string } | undefined;
    if (!row || row.status !== 'active') return { ok: false, reason: 'not_ready', balance: account.balance };
    if (row.level >= 10) return { ok: false, reason: 'max_level', balance: account.balance };
    if (account.balance < quote.price) return { ok: false, reason: 'insufficient_funds', balance: account.balance };
    const level = row.level + 1;
    db.prepare('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?').run(quote.price, now, guildId, userId);
    db.prepare('UPDATE economy_businesses SET level=?,investment_value=investment_value+?,updated_at=? WHERE guild_id=? AND owner_id=?').run(level, quote.price, now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -quote.price, 'business:upgrade', reference, now);
    recordProductSaleSqlite({ userId, kind: 'economy', id: `business_upgrade_${overview.job.id}_${level}`, category: BUSINESS_MARKET_CATEGORY, quantity: 1, unitPrice: quote.price, reference, soldAt: now });
    return { ok: true, price: quote.price, balance: account.balance - quote.price, message: `Negocio mejorado al **nivel ${level}/10**.` };
  });
  return improve.immediate();
}

export async function hireBusinessNpc(guildId: string, userId: string, reference: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const overview = await getBusinessOverview(guildId, userId);
  if (!overview) return { ok: false, reason: 'not_found', balance: await getBalance(guildId, userId) };
  if (overview.mortgagedAt !== null) return { ok: false, reason: 'mortgaged', balance: await getBalance(guildId, userId) };
  if (overview.status !== 'active') return { ok: false, reason: 'not_ready', balance: await getBalance(guildId, userId) };
  const count = overview.employees.filter((employee) => employee.status !== 'pending').length;
  if (count >= businessStaffLimit(overview.level)) return { ok: false, reason: 'staff_limit', balance: await getBalance(guildId, userId) };
  const basePrice = 450 + overview.level * 180;
  const quote = await getProductPriceQuote(businessProductRequest(`business_npc_${overview.job.id}_${overview.level}`, basePrice));
  const now = businessNow();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [staff] = await connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS amount FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND status<>'declined'", [guildId, userId]);
    if (Number(staff[0]?.amount ?? 0) >= businessStaffLimit(overview.level)) return { ok: false as const, reason: 'staff_limit' as const, balance: account.balance };
    if (account.balance < quote.price) return { ok: false as const, reason: 'insufficient_funds' as const, balance: account.balance };
    const key = `npc_${now}_${Number(staff[0]?.amount ?? 0)}`;
    await connection.execute('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?', [quote.price, now, guildId, userId]);
    await connection.execute("INSERT INTO economy_business_employees(guild_id,owner_id,employee_key,employee_user_id,employee_name,kind,status,created_at) VALUES(?,?,?,NULL,?,'npc','active',?)", [guildId, userId, key, `Ayudante ${Number(staff[0]?.amount ?? 0) + 1}`, now]);
    await mysqlAddLedger(connection, guildId, userId, -quote.price, 'business:hire:npc', reference, now);
    await recordProductSaleMysql(connection, { userId, kind: 'economy', id: `business_npc_${overview.job.id}_${overview.level}`, category: BUSINESS_MARKET_CATEGORY, quantity: 1, unitPrice: quote.price, reference, soldAt: now });
    return { ok: true as const, price: quote.price, balance: account.balance - quote.price, message: `Contrataste a un ayudante NPC. Cada turno añade un producto y descuenta su nómina.` };
  });
  const hire = db.transaction((): BusinessActionResult => {
    const account = sqliteEnsureAccount(guildId, userId);
    const staff = db.prepare("SELECT COUNT(*) AS amount FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND status<>'declined'").get(guildId, userId) as { amount: number };
    if (Number(staff.amount) >= businessStaffLimit(overview.level)) return { ok: false, reason: 'staff_limit', balance: account.balance };
    if (account.balance < quote.price) return { ok: false, reason: 'insufficient_funds', balance: account.balance };
    const key = `npc_${now}_${Number(staff.amount)}`;
    db.prepare('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?').run(quote.price, now, guildId, userId);
    db.prepare("INSERT INTO economy_business_employees(guild_id,owner_id,employee_key,employee_user_id,employee_name,kind,status,created_at) VALUES(?,?,?,NULL,?,'npc','active',?)").run(guildId, userId, key, `Ayudante ${Number(staff.amount) + 1}`, now);
    db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -quote.price, 'business:hire:npc', reference, now);
    recordProductSaleSqlite({ userId, kind: 'economy', id: `business_npc_${overview.job.id}_${overview.level}`, category: BUSINESS_MARKET_CATEGORY, quantity: 1, unitPrice: quote.price, reference, soldAt: now });
    return { ok: true, price: quote.price, balance: account.balance - quote.price, message: 'Contrataste a un ayudante NPC. Cada turno añade un producto y descuenta su nómina.' };
  });
  return hire.immediate();
}

export async function removeBusinessNpc(guildId: string, userId: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const balance = await getBalance(guildId, userId);
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>("SELECT employee_key AS employeeKey FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND kind='npc' AND status='active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [guildId, userId]);
    if (!rows[0]) return { ok: false as const, reason: 'not_found' as const, balance };
    await connection.execute('DELETE FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND employee_key=?', [guildId, userId, String(rows[0].employeeKey)]);
    return { ok: true as const, balance, message: 'Retiraste al último ayudante NPC contratado.' };
  });
  const remove = db.transaction((): BusinessActionResult => {
    const row = db.prepare("SELECT employee_key AS employeeKey FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND kind='npc' AND status='active' ORDER BY created_at DESC LIMIT 1").get(guildId, userId) as { employeeKey: string } | undefined;
    if (!row) return { ok: false, reason: 'not_found', balance };
    db.prepare('DELETE FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND employee_key=?').run(guildId, userId, row.employeeKey);
    return { ok: true, balance, message: 'Retiraste al último ayudante NPC contratado.' };
  });
  return remove.immediate();
}

export async function requestBusinessEmployee(guildId: string, ownerId: string, employeeId: string, employeeName: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  if (ownerId === employeeId) return { ok: false, reason: 'employee_busy', balance: await getBalance(guildId, ownerId) };
  const overview = await getBusinessOverview(guildId, ownerId);
  if (!overview) return { ok: false, reason: 'not_found', balance: await getBalance(guildId, ownerId) };
  if (overview.status !== 'active') return { ok: false, reason: 'not_ready', balance: await getBalance(guildId, ownerId) };
  const now = businessNow();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, ownerId, true);
    const [levelRows] = await connection.execute<RowDataPacket[]>('SELECT level FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE', [guildId, ownerId]);
    const [jobRows] = await connection.execute<RowDataPacket[]>('SELECT job_id FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1', [guildId, employeeId]);
    if (!jobRows.some((row) => String(row.job_id) === overview.job.id)) return { ok: false as const, reason: 'wrong_job' as const, balance: account.balance };
    const [existing] = await connection.execute<RowDataPacket[]>('SELECT owner_id FROM economy_business_employees WHERE guild_id=? AND employee_user_id=?', [guildId, employeeId]);
    if (existing[0]) return { ok: false as const, reason: 'employee_busy' as const, balance: account.balance };
    const [ownBusiness] = await connection.execute<RowDataPacket[]>('SELECT owner_id FROM economy_businesses WHERE guild_id=? AND owner_id=?', [guildId, employeeId]);
    if (ownBusiness[0]) return { ok: false as const, reason: 'employee_busy' as const, balance: account.balance };
    const [staff] = await connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS amount FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND status<>'declined'", [guildId, ownerId]);
    if (Number(staff[0]?.amount ?? 0) >= businessStaffLimit(Number(levelRows[0]?.level ?? overview.level))) return { ok: false as const, reason: 'staff_limit' as const, balance: account.balance };
    await connection.execute("INSERT INTO economy_business_employees(guild_id,owner_id,employee_key,employee_user_id,employee_name,kind,status,created_at) VALUES(?,?,?,?,?,'real','pending',?)", [guildId, ownerId, employeeId, employeeId, employeeName.slice(0, 80), now]);
    return { ok: true as const, balance: account.balance, message: `Invitación de empleo enviada a <@${employeeId}>.` };
  });
  const request = db.transaction((): BusinessActionResult => {
    const account = sqliteEnsureAccount(guildId, ownerId);
    const jobs = db.prepare('SELECT job_id FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1').all(guildId, employeeId) as Array<{ job_id: string }>;
    if (!jobs.some((row) => row.job_id === overview.job.id)) return { ok: false, reason: 'wrong_job', balance: account.balance };
    const existing = db.prepare('SELECT owner_id FROM economy_business_employees WHERE guild_id=? AND employee_user_id=?').get(guildId, employeeId);
    if (existing) return { ok: false, reason: 'employee_busy', balance: account.balance };
    const ownBusiness = db.prepare('SELECT owner_id FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, employeeId);
    if (ownBusiness) return { ok: false, reason: 'employee_busy', balance: account.balance };
    const staff = db.prepare("SELECT COUNT(*) AS amount FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND status<>'declined'").get(guildId, ownerId) as { amount: number };
    if (Number(staff.amount) >= businessStaffLimit(overview.level)) return { ok: false, reason: 'staff_limit', balance: account.balance };
    db.prepare("INSERT INTO economy_business_employees(guild_id,owner_id,employee_key,employee_user_id,employee_name,kind,status,created_at) VALUES(?,?,?,?,?,'real','pending',?)").run(guildId, ownerId, employeeId, employeeId, employeeName.slice(0, 80), now);
    return { ok: true, balance: account.balance, message: `Invitación de empleo enviada a <@${employeeId}>.` };
  });
  return request.immediate();
}

export async function respondBusinessEmployment(guildId: string, ownerId: string, employeeId: string, accept: boolean): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const balance = await getBalance(guildId, employeeId);
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT employee_key AS employeeKey,status FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND employee_user_id=? AND kind=\'real\' FOR UPDATE', [guildId, ownerId, employeeId]);
    const row = rows[0];
    if (!row || String(row.status) !== 'pending') return { ok: false as const, reason: 'not_found' as const, balance };
    const [business] = await connection.execute<RowDataPacket[]>('SELECT job_id AS jobId,level,status FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE', [guildId, ownerId]);
    const [jobs] = await connection.execute<RowDataPacket[]>('SELECT job_id FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1', [guildId, employeeId]);
    const [ownBusiness] = await connection.execute<RowDataPacket[]>('SELECT owner_id FROM economy_businesses WHERE guild_id=? AND owner_id=?', [guildId, employeeId]);
    if (accept && ownBusiness[0]) return { ok: false as const, reason: 'employee_busy' as const, balance };
    if (accept) {
      const businessRow = business[0];
      if (!businessRow || String(businessRow.status) !== 'active' || !jobs.some((job) => String(job.job_id) === String(businessRow.jobId))) return { ok: false as const, reason: 'wrong_job' as const, balance };
      const [staff] = await connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS amount FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND status<>'declined'", [guildId, ownerId]);
      if (Number(staff[0]?.amount ?? 0) > businessStaffLimit(Number(businessRow.level))) return { ok: false as const, reason: 'staff_limit' as const, balance };
      await connection.execute("UPDATE economy_business_employees SET status='active' WHERE guild_id=? AND owner_id=? AND employee_user_id=?", [guildId, ownerId, employeeId]);
      return { ok: true as const, balance, message: `Aceptaste el empleo en **${businessName(String(businessRow.jobId))}**.` };
    }
    await connection.execute('DELETE FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND employee_user_id=?', [guildId, ownerId, employeeId]);
    return { ok: true as const, balance, message: 'Rechazaste la invitación de empleo.' };
  });
  const respond = db.transaction((): BusinessActionResult => {
    const row = db.prepare("SELECT employee_key AS employeeKey,status FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND employee_user_id=? AND kind='real'").get(guildId, ownerId, employeeId) as { employeeKey: string; status: string } | undefined;
    if (!row || row.status !== 'pending') return { ok: false, reason: 'not_found', balance };
    const business = db.prepare('SELECT job_id AS jobId,level,status FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, ownerId) as { jobId: string; level: number; status: string } | undefined;
    const jobs = db.prepare('SELECT job_id FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1').all(guildId, employeeId) as Array<{ job_id: string }>;
    const ownBusiness = db.prepare('SELECT owner_id FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, employeeId);
    if (accept && ownBusiness) return { ok: false, reason: 'employee_busy', balance };
    if (accept && (!business || business.status !== 'active' || !jobs.some((job) => job.job_id === business.jobId))) return { ok: false, reason: 'wrong_job', balance };
    if (accept) {
      const staff = db.prepare("SELECT COUNT(*) AS amount FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND status<>'declined'").get(guildId, ownerId) as { amount: number };
      if (Number(staff.amount) > businessStaffLimit(Number(business?.level ?? 1))) return { ok: false, reason: 'staff_limit', balance };
      db.prepare("UPDATE economy_business_employees SET status='active' WHERE guild_id=? AND owner_id=? AND employee_user_id=?").run(guildId, ownerId, employeeId);
    } else db.prepare('DELETE FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND employee_user_id=?').run(guildId, ownerId, employeeId);
    return { ok: true, balance, message: accept ? `Aceptaste el empleo en **${businessName(business!.jobId)}**.` : 'Rechazaste la invitación de empleo.' };
  });
  return respond.immediate();
}

export async function removeBusinessEmployee(guildId: string, ownerId: string, employeeId: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const balance = await getBalance(guildId, ownerId);
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const [result] = await connection.execute('DELETE FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND employee_user_id=? AND kind=\'real\'', [guildId, ownerId, employeeId]);
    return (result as { affectedRows: number }).affectedRows ? { ok: true as const, balance, message: `Terminaste el contrato de <@${employeeId}>.` } : { ok: false as const, reason: 'not_found' as const, balance };
  });
  const result = db.prepare("DELETE FROM economy_business_employees WHERE guild_id=? AND owner_id=? AND employee_user_id=? AND kind='real'").run(guildId, ownerId, employeeId);
  return result.changes ? { ok: true, balance, message: `Terminaste el contrato de <@${employeeId}>.` } : { ok: false, reason: 'not_found', balance };
}

export async function payBusinessDebt(guildId: string, userId: string, reference: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const now = businessNow();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT debt FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE', [guildId, userId]);
    if (!rows[0]) return { ok: false as const, reason: 'not_found' as const, balance: account.balance };
    const debt = Number(rows[0].debt);
    if (debt <= 0) return { ok: false as const, reason: 'no_debt' as const, balance: account.balance, debt: 0 };
    const paid = Math.min(debt, account.balance);
    if (!paid) return { ok: false as const, reason: 'insufficient_funds' as const, balance: account.balance, debt };
    await connection.execute('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?', [paid, now, guildId, userId]);
    await connection.execute('UPDATE economy_businesses SET debt=debt-?,updated_at=? WHERE guild_id=? AND owner_id=?', [paid, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -paid, 'business:debt_payment', reference, now);
    return { ok: true as const, balance: account.balance - paid, debt: debt - paid, message: `Pagaste **${money.format(paid)}** monedas de servicios atrasados.` };
  });
  const pay = db.transaction((): BusinessActionResult => {
    const account = sqliteEnsureAccount(guildId, userId);
    const row = db.prepare('SELECT debt FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, userId) as { debt: number } | undefined;
    if (!row) return { ok: false, reason: 'not_found', balance: account.balance };
    if (row.debt <= 0) return { ok: false, reason: 'no_debt', balance: account.balance, debt: 0 };
    const paid = Math.min(row.debt, account.balance);
    if (!paid) return { ok: false, reason: 'insufficient_funds', balance: account.balance, debt: row.debt };
    db.prepare('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?').run(paid, now, guildId, userId);
    db.prepare('UPDATE economy_businesses SET debt=debt-?,updated_at=? WHERE guild_id=? AND owner_id=?').run(paid, now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -paid, 'business:debt_payment', reference, now);
    return { ok: true, balance: account.balance - paid, debt: row.debt - paid, message: `Pagaste **${money.format(paid)}** monedas de servicios atrasados.` };
  });
  return pay.immediate();
}

export async function resolveBusinessEvent(guildId: string, userId: string, type: BusinessEventType, reference: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const now = businessNow();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [businessRows] = await connection.execute<RowDataPacket[]>('SELECT status FROM economy_businesses WHERE guild_id=? AND owner_id=? FOR UPDATE', [guildId, userId]);
    if (!businessRows[0]) return { ok: false as const, reason: 'not_found' as const, balance: account.balance };
    const [events] = await connection.execute<RowDataPacket[]>("SELECT id,amount FROM economy_business_events WHERE guild_id=? AND owner_id=? AND event_type=? AND status='pending' ORDER BY created_at LIMIT 1 FOR UPDATE", [guildId, userId, type]);
    if (!events[0]) return { ok: false as const, reason: 'no_event' as const, balance: account.balance };
    const amount = Number(events[0].amount);
    if (account.balance < amount) return { ok: false as const, reason: 'insufficient_funds' as const, balance: account.balance, debt: amount };
    await connection.execute('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?', [amount, now, guildId, userId]);
    await connection.execute("UPDATE economy_business_events SET status='resolved',resolved_at=? WHERE id=? AND guild_id=? AND owner_id=? AND status='pending'", [now, events[0].id, guildId, userId]);
    if (type === 'closure') await connection.execute("UPDATE economy_businesses SET status='active',updated_at=? WHERE guild_id=? AND owner_id=? AND status='closed'", [now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -amount, type === 'closure' ? 'business:reopen_fine' : 'business:pest_control', reference, now);
    const message = type === 'closure' ? `Pagaste la multa de **${money.format(amount)}** y tu negocio volvió a abrir.` : `Pagaste **${money.format(amount)}** por exterminar la plaga. El negocio puede operar de nuevo.`;
    return { ok: true as const, balance: account.balance - amount, price: amount, message };
  });
  const resolve = db.transaction((): BusinessActionResult => {
    const account = sqliteEnsureAccount(guildId, userId);
    const business = db.prepare('SELECT status FROM economy_businesses WHERE guild_id=? AND owner_id=?').get(guildId, userId) as { status: string } | undefined;
    if (!business) return { ok: false, reason: 'not_found', balance: account.balance };
    const event = db.prepare("SELECT id,amount FROM economy_business_events WHERE guild_id=? AND owner_id=? AND event_type=? AND status='pending' ORDER BY created_at LIMIT 1").get(guildId, userId, type) as { id: number; amount: number } | undefined;
    if (!event) return { ok: false, reason: 'no_event', balance: account.balance };
    if (account.balance < event.amount) return { ok: false, reason: 'insufficient_funds', balance: account.balance, debt: event.amount };
    db.prepare('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?').run(event.amount, now, guildId, userId);
    db.prepare("UPDATE economy_business_events SET status='resolved',resolved_at=? WHERE id=? AND guild_id=? AND owner_id=? AND status='pending'").run(now, event.id, guildId, userId);
    if (type === 'closure') db.prepare("UPDATE economy_businesses SET status='active',updated_at=? WHERE guild_id=? AND owner_id=? AND status='closed'").run(now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -event.amount, type === 'closure' ? 'business:reopen_fine' : 'business:pest_control', reference, now);
    const message = type === 'closure' ? `Pagaste la multa de **${money.format(event.amount)}** y tu negocio volvió a abrir.` : `Pagaste **${money.format(event.amount)}** por exterminar la plaga. El negocio puede operar de nuevo.`;
    return { ok: true, balance: account.balance - event.amount, price: event.amount, message };
  });
  return resolve.immediate();
}

export async function consumeBusinessGood(guildId: string, userId: string, itemId: string, reference: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const item = businessGoods.find((entry) => entry.id === itemId && entry.usable);
  const accountBalance = await getBalance(guildId, userId);
  if (!item) return { ok: false, reason: 'invalid_item', balance: accountBalance };
  let overview = await getBusinessOverview(guildId, userId);
  if (!overview || overview.status !== 'active' || overview.job.id !== item.jobId) {
    let employerId: string | undefined;
    if (economyPool) {
      const [rows] = await economyPool.execute<RowDataPacket[]>(`SELECT b.owner_id AS ownerId FROM economy_business_employees e
        JOIN economy_businesses b ON b.guild_id=e.guild_id AND b.owner_id=e.owner_id
        WHERE e.guild_id=? AND e.employee_user_id=? AND e.kind='real' AND e.status='active' AND b.job_id=? AND b.status='active' LIMIT 1`, [guildId, userId, item.jobId]);
      employerId = rows[0] ? String(rows[0].ownerId) : undefined;
    } else {
      const row = db.prepare(`SELECT b.owner_id AS ownerId FROM economy_business_employees e
        JOIN economy_businesses b ON b.guild_id=e.guild_id AND b.owner_id=e.owner_id
        WHERE e.guild_id=? AND e.employee_user_id=? AND e.kind='real' AND e.status='active' AND b.job_id=? AND b.status='active' LIMIT 1`).get(guildId, userId, item.jobId) as { ownerId: string } | undefined;
      employerId = row?.ownerId;
    }
    overview = employerId ? await getBusinessOverview(guildId, employerId) : undefined;
  }
  if (!overview || overview.status !== 'active' || overview.job.id !== item.jobId) return { ok: false, reason: 'not_ready', balance: accountBalance };
  const now = businessNow();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    await mysqlEnsureAccount(connection, guildId, userId, true);
    const [buffs] = await connection.execute<RowDataPacket[]>('SELECT uses FROM economy_business_buffs WHERE guild_id=? AND user_id=? FOR UPDATE', [guildId, userId]);
    if (Number(buffs[0]?.uses ?? 0) >= 2) return { ok: false as const, reason: 'staff_limit' as const, balance: accountBalance };
    const [items] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, itemId]);
    if (Number(items[0]?.quantity ?? 0) < 1) return { ok: false as const, reason: 'no_items' as const, balance: accountBalance };
    await connection.execute('UPDATE economy_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?', [guildId, userId, itemId]);
    await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'business_consumable', reference: `${reference}:item`, createdAt: now });
    await connection.execute(`INSERT INTO economy_business_buffs(guild_id,user_id,uses,updated_at) VALUES(?,?,1,?)
      ON DUPLICATE KEY UPDATE uses=uses+1,updated_at=VALUES(updated_at)`, [guildId, userId, now]);
    return { ok: true as const, balance: accountBalance, message: `Consumiste **${item.name}**. Uno de tus próximos dos turnos de negocio recibirá +20% de ingreso.` };
  });
  const consume = db.transaction((): BusinessActionResult => {
    const buffs = db.prepare('SELECT uses FROM economy_business_buffs WHERE guild_id=? AND user_id=?').get(guildId, userId) as { uses: number } | undefined;
    if (Number(buffs?.uses ?? 0) >= 2) return { ok: false, reason: 'staff_limit', balance: accountBalance };
    const items = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, itemId) as { quantity: number } | undefined;
    if (!items || items.quantity < 1) return { ok: false, reason: 'no_items', balance: accountBalance };
    db.prepare('UPDATE economy_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?').run(guildId, userId, itemId);
    db.prepare('INSERT INTO economy_item_ledger(guild_id,user_id,item_id,quantity_delta,reason,reference,created_at) VALUES(?,?,?,?,?,?,?)').run(guildId, userId, itemId, -1, 'business_consumable', `${reference}:item`, now);
    db.prepare(`INSERT INTO economy_business_buffs(guild_id,user_id,uses,updated_at) VALUES(?,?,1,?)
      ON CONFLICT(guild_id,user_id) DO UPDATE SET uses=uses+1,updated_at=excluded.updated_at`).run(guildId, userId, now);
    return { ok: true, balance: accountBalance, message: `Consumiste **${item.name}**. Uno de tus próximos dos turnos de negocio recibirá +20% de ingreso.` };
  });
  return consume.immediate();
}

export async function sellBusinessGood(guildId: string, userId: string, itemId: string, quantity: number, reference: string): Promise<BusinessActionResult> {
  guildId = GLOBAL_SCOPE_ID;
  const item = businessGoods.find((entry) => entry.id === itemId);
  const accountBalance = await getBalance(guildId, userId);
  if (!item) return { ok: false, reason: 'invalid_item', balance: accountBalance };
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) return { ok: false, reason: 'quantity', balance: accountBalance };
  const quote = await getProductPriceQuote({ kind: 'economy', id: item.id, category: BUSINESS_GOODS_CATEGORY, basePrice: item.basePrice, categorySize: businessGoods.length });
  const sale = calculateProductSaleCommission(quote, quantity);
  const { grossAmount, commissionAmount, netAmount } = sale;
  const demandIndex = (quote.demandIndexBps / 100).toFixed(1);
  const bankIndex = (quote.globalIndexBps / 100).toFixed(1);
  const effectiveRate = (sale.effectiveCommissionBps / 100).toFixed(2);
  const bankComment = quote.demandIndexBps >= 10_500
    ? 'La demanda está ardiendo; el banco olió negocio y sacó la calculadora. 🔥'
    : quote.demandIndexBps <= 9_750
      ? 'La demanda anda dormida, así que el banco te dejó una tarifa ligera. 🧊'
      : 'Mercado tranquilo: el banco cobró su parte sin pedir propina. 😌';
  const message = `Vendiste **${quantity} × ${item.name}** a **${money.format(quote.price)} c/u**: **${money.format(grossAmount)}** monedas brutas.\n🏦 Comisión dinámica del Banco Central: **−${money.format(commissionAmount)}** (${effectiveRate}% efectivo; demanda ${demandIndex}% · índice económico ${bankIndex}%).\n✅ Recibiste **${money.format(netAmount)} monedas netas**. ${bankComment}`;
  const now = businessNow();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (await mysqlLoadPersonalLoan(connection, guildId, userId, true)) return { ok: false as const, reason: 'loan_active' as const, balance: account.balance };
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, itemId]);
    if (Number(rows[0]?.quantity ?? 0) < quantity) return { ok: false as const, reason: 'no_items' as const, balance: account.balance };
    await connection.execute('UPDATE economy_inventory SET quantity=quantity-? WHERE guild_id=? AND user_id=? AND item_id=?', [quantity, guildId, userId, itemId]);
    await connection.execute('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?', [netAmount, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, grossAmount, `business:goods_sale:${itemId}`, reference, now);
    if (commissionAmount > 0) await mysqlAddLedger(connection, guildId, userId, -commissionAmount, `business:sale_commission:${itemId}`, `${reference}:commission`, now);
    await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -quantity, reason: 'business_goods_sale', reference: `${reference}:item`, createdAt: now });
    await recordProductSaleMysql(connection, { userId, kind: 'economy', id: itemId, category: BUSINESS_GOODS_CATEGORY, quantity, unitPrice: quote.price, reference, soldAt: now });
    return { ok: true as const, price: netAmount, grossPrice: grossAmount, commission: commissionAmount, commissionRateBps: sale.effectiveCommissionBps, balance: account.balance + netAmount, message };
  });
  const sell = db.transaction((): BusinessActionResult => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (sqliteLoadPersonalLoan(guildId, userId)) return { ok: false, reason: 'loan_active', balance: account.balance };
    const rows = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, itemId) as { quantity: number } | undefined;
    if (Number(rows?.quantity ?? 0) < quantity) return { ok: false, reason: 'no_items', balance: account.balance };
    db.prepare('UPDATE economy_inventory SET quantity=quantity-? WHERE guild_id=? AND user_id=? AND item_id=?').run(quantity, guildId, userId, itemId);
    db.prepare('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?').run(netAmount, now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, grossAmount, `business:goods_sale:${itemId}`, reference, now);
    if (commissionAmount > 0) db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -commissionAmount, `business:sale_commission:${itemId}`, `${reference}:commission`, now);
    db.prepare('INSERT INTO economy_item_ledger(guild_id,user_id,item_id,quantity_delta,reason,reference,created_at) VALUES(?,?,?,?,?,?,?)').run(guildId, userId, itemId, -quantity, 'business_goods_sale', `${reference}:item`, now);
    recordProductSaleSqlite({ userId, kind: 'economy', id: itemId, category: BUSINESS_GOODS_CATEGORY, quantity, unitPrice: quote.price, reference, soldAt: now });
    return { ok: true, price: netAmount, grossPrice: grossAmount, commission: commissionAmount, commissionRateBps: sale.effectiveCommissionBps, balance: account.balance + netAmount, message };
  });
  return sell.immediate();
}

const crimeSuccessLines = [
  'El plan salió limpio y encontraste un buen botín.', 'La operación fue un éxito: escapaste a tiempo.',
  'Nadie sospechó de ti. El golpe salió redondo.', 'Una distracción perfecta y el botín terminó en tus manos.',
  'El guardia miró hacia otro lado.', 'El botín estaba mejor de lo esperado.',
  'Todo salió según el plan.', 'La suerte te acompañó durante la huida.',
  'Cambiaste de ruta a tiempo y saliste a salvo.', 'El golpe fue rápido y limpio.',
];
const crimeFailLines = [
  'La alarma se activó y tuviste que pagar una multa.', 'Un testigo te reconoció y tocó negociar.',
  'El plan salió mal y perdiste parte del botín en la huida.', 'Te atraparon antes de llegar al objetivo.',
  'La puerta estaba vigilada. El intento salió caro.', 'Tu coartada no convenció a nadie.',
  'Un ruido arruinó la operación.', 'La patrulla llegó justo a tiempo.',
  'El objetivo estaba vacío y acabaste pagando una multa.', 'El plan necesitaba más preparación.',
];

export async function crime(guildId: string, userId: string, reference: string): Promise<
  | { ok: true; success: boolean; amount: number; balance: number; message: string }
  | { ok: false; secondsRemaining: number; reason?: 'bankrupt' }
> {
  guildId = GLOBAL_SCOPE_ID;
  const success = randomInt(100) < 40;
  const now = nowSeconds();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const bankrupt = await mysqlIsPersonalLoanBankrupt(connection, guildId, userId);
    const nextCrimeAt = (account.lastCrimeAt ?? 0) + CRIME_COOLDOWN_SECONDS;
    if (now < nextCrimeAt) return { ok: false as const, secondsRemaining: nextCrimeAt - now };
    const rawAmount = success ? 40 + randomInt(41) : 10 + randomInt(21);
    const amount = success ? rawAmount : bankrupt ? rawAmount : Math.min(Math.max(0, account.balance), rawAmount);
    const signedAmount = success ? amount : -amount;
    const balance = account.balance + signedAmount;
    const failureRemark = bankrupt
      ? `\n\n💸 La multa completa de **${money.format(amount)} monedas** se cargó a tu billetera. Saldo actual: **${money.format(balance)} monedas**; los ahorros del banco no se tocaron.\n\n🫠 ${moneyLossRemark(balance + account.bankBalance)}`
      : `\n\n🫠 ${moneyLossRemark(balance + account.bankBalance)}`;
    const message = formatMessage(pick(success ? crimeSuccessLines : crimeFailLines), { amount }) + (success ? '' : failureRemark);
    await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_crime_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
      [signedAmount, now, now, guildId, userId]);
    if (signedAmount) await mysqlAddLedger(connection, guildId, userId, signedAmount, success ? 'crime_reward' : 'crime_fine', reference, now);
    return { ok: true as const, success, amount, balance, message };
  });

  const commitCrime = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    const bankrupt = sqliteIsPersonalLoanBankrupt(guildId, userId);
    const nextCrimeAt = (account.lastCrimeAt ?? 0) + CRIME_COOLDOWN_SECONDS;
    if (now < nextCrimeAt) return { ok: false as const, secondsRemaining: nextCrimeAt - now };
    const rawAmount = success ? 40 + randomInt(41) : 10 + randomInt(21);
    const amount = success ? rawAmount : bankrupt ? rawAmount : Math.min(Math.max(0, account.balance), rawAmount);
    const signedAmount = success ? amount : -amount;
    const balance = account.balance + signedAmount;
    const failureRemark = bankrupt
      ? `\n\n💸 La multa completa de **${money.format(amount)} monedas** se cargó a tu billetera. Saldo actual: **${money.format(balance)} monedas**; los ahorros del banco no se tocaron.\n\n🫠 ${moneyLossRemark(balance + account.bankBalance)}`
      : `\n\n🫠 ${moneyLossRemark(balance + account.bankBalance)}`;
    const message = formatMessage(pick(success ? crimeSuccessLines : crimeFailLines), { amount }) + (success ? '' : failureRemark);
    db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_crime_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?')
      .run(signedAmount, now, now, guildId, userId);
    if (signedAmount) db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(guildId, userId, signedAmount, success ? 'crime_reward' : 'crime_fine', reference, now);
    return { ok: true as const, success, amount, balance, message };
  });
  return commitCrime.immediate();
}

export async function transferCoins(guildId: string, fromUserId: string, toUserId: string, amount: number, reference: string): Promise<
  | { ok: true; fromBalance: number; toBalance: number }
  | { ok: false; reason: 'self' | 'invalid_amount' | 'insufficient_funds' | 'loan_active' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (fromUserId === toUserId) return { ok: false, reason: 'self' };
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const ids = [fromUserId, toUserId].sort();
    const accounts = new Map<string, AccountRow>();
    for (const id of ids) accounts.set(id, await mysqlEnsureAccount(connection, guildId, id, true));
    const from = accounts.get(fromUserId)!;
    const to = accounts.get(toUserId)!;
    if (await mysqlLoadPersonalLoan(connection, guildId, fromUserId, true)) return { ok: false as const, reason: 'loan_active' as const };
    if (from.balance < amount) return { ok: false as const, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    await connection.execute('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, guildId, fromUserId]);
    await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, guildId, toUserId]);
    await mysqlAddLedger(connection, guildId, fromUserId, -amount, `transfer:to:${toUserId}`, `${reference}:out`, now);
    await mysqlAddLedger(connection, guildId, toUserId, amount, `transfer:from:${fromUserId}`, `${reference}:in`, now);
    return { ok: true as const, fromBalance: from.balance - amount, toBalance: to.balance + amount };
  });

  const send = db.transaction(() => {
    const from = sqliteEnsureAccount(guildId, fromUserId);
    const to = sqliteEnsureAccount(guildId, toUserId);
    if (sqliteLoadPersonalLoan(guildId, fromUserId)) return { ok: false as const, reason: 'loan_active' as const };
    if (from.balance < amount) return { ok: false as const, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    db.prepare('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, guildId, fromUserId);
    db.prepare('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, guildId, toUserId);
    const ledger = db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    ledger.run(guildId, fromUserId, -amount, `transfer:to:${toUserId}`, `${reference}:out`, now);
    ledger.run(guildId, toUserId, amount, `transfer:from:${fromUserId}`, `${reference}:in`, now);
    return { ok: true as const, fromBalance: from.balance - amount, toBalance: to.balance + amount };
  });
  return send.immediate();
}

export async function fish(guildId: string, userId: string, reference: string): Promise<
  | { ok: true; amount: number; balance: number; message: string }
  | { ok: false; reason: 'missing_rod' | 'cooldown' | 'bankrupt'; secondsRemaining?: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  const caught = randomInt(100) < 70;
  const rare = caught && randomInt(100) < 5;
  const fishName = pick(rare ? fishRare : fishCommon);
  const amount = caught ? (rare ? 50 + randomInt(31) : 12 + randomInt(19)) : 0;
  const message = caught
    ? formatMessage(pick(fishCatchLines), { fish: fishName, amount })
    : pick(fishMissLines);

  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (await mysqlIsPersonalLoanBankrupt(connection, guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    const [rods] = await connection.execute<RowDataPacket[]>(
      'SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE',
      [guildId, userId, 'cana_pescar'],
    );
    if (Number(rods[0]?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_rod' as const };
    const now = nowSeconds();
    const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
    if (now < nextFishAt) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: nextFishAt - now };
    const fishingJob = economyJobs.find((entry) => entry.toolId === 'cana_pescar')!;
    const [jobRows] = await connection.execute<RowDataPacket[]>('SELECT level FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?', [guildId, userId, fishingJob.id]);
    const toolWear = await wearJobToolMysql(connection, guildId, userId, fishingJob, Number(jobRows[0]?.level ?? 1), `${reference}:rod`, now);
    await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
    if (amount) await mysqlAddLedger(connection, guildId, userId, amount, rare ? 'fish_rare' : 'fish', reference, now);
    const wearMessage = toolWear.broke ? '\n💥 Tu caña se rompió; necesitas comprar otra para volver a pescar o trabajar.'
      : toolWear.worn ? `\n🎣 Durabilidad de la caña: **${toolWear.durability}/${toolWear.maxDurability}**.` : '\n🎣 Tu experiencia de pescador evitó el desgaste de la caña.';
    return { ok: true as const, amount, balance: account.balance + amount, message: `${message}${wearMessage}` };
  });

  const catchFish = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (sqliteIsPersonalLoanBankrupt(guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    const rod = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?')
      .get(guildId, userId, 'cana_pescar') as { quantity: number } | undefined;
    if (!rod || rod.quantity < 1) return { ok: false as const, reason: 'missing_rod' as const };
    const now = nowSeconds();
    const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
    if (now < nextFishAt) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: nextFishAt - now };
    const fishingJob = economyJobs.find((entry) => entry.toolId === 'cana_pescar')!;
    const jobRow = db.prepare('SELECT level FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?').get(guildId, userId, fishingJob.id) as { level: number } | undefined;
    const toolWear = wearJobToolSqlite(guildId, userId, fishingJob, Number(jobRow?.level ?? 1), `${reference}:rod`, now);
    db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, now, guildId, userId);
    if (amount) db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, amount, rare ? 'fish_rare' : 'fish', reference, now);
    const wearMessage = toolWear.broke ? '\n💥 Tu caña se rompió; necesitas comprar otra para volver a pescar o trabajar.'
      : toolWear.worn ? `\n🎣 Durabilidad de la caña: **${toolWear.durability}/${toolWear.maxDurability}**.` : '\n🎣 Tu experiencia de pescador evitó el desgaste de la caña.';
    return { ok: true as const, amount, balance: account.balance + amount, message: `${message}${wearMessage}` };
  });
  return catchFish.immediate();
}

type RobItemSource = 'economy' | 'rpg';
type RobItemCandidate = { itemId: string; source: RobItemSource };
type RobbedItem = { itemId: string; source: RobItemSource; name: string; emoji: string };
const legacyCosmeticItemIds = new Set(['marco_neon', 'tema_nocturno', 'insignia_dj']);
const profileCosmeticItemIds = new Set([...profileShopItems.map((item) => item.id), ...legacyCosmeticItemIds]);

function robItemDetails(candidate: RobItemCandidate): RobbedItem | undefined {
  if (candidate.source === 'economy') {
    if (profileCosmeticItemIds.has(candidate.itemId)) return undefined;
    const item = storeItems.find((entry) => entry.id === candidate.itemId);
    return item ? { ...candidate, name: item.name, emoji: item.emoji } : undefined;
  }
  const item = rpgItems.find((entry) => entry.id === candidate.itemId);
  return item ? { ...candidate, name: item.name, emoji: item.emoji } : undefined;
}

async function transferRobItemMysql(connection: PoolConnection, guildId: string, fromId: string, toId: string, item: RobbedItem, reference: string, at: number): Promise<void> {
  if (item.source === 'economy') {
    await connection.execute('UPDATE economy_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=? AND quantity>0', [guildId, fromId, item.itemId]);
    await connection.execute('DELETE FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity<=0', [guildId, fromId, item.itemId]);
    await connection.execute('INSERT INTO economy_inventory(guild_id,user_id,item_id,quantity,acquired_at) VALUES(?,?,?,1,?) ON DUPLICATE KEY UPDATE quantity=quantity+1', [guildId, toId, item.itemId, at]);
  } else {
    await connection.execute('UPDATE rpg_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=? AND quantity>0', [guildId, fromId, item.itemId]);
    await connection.execute('INSERT INTO rpg_inventory(guild_id,user_id,item_id,quantity) VALUES(?,?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [guildId, toId, item.itemId]);
  }
  const ledgerItemId = item.source === 'rpg' ? `rpg:${item.itemId}` : item.itemId;
  await insertItemLedger(connection, { guildId, userId: fromId, itemId: ledgerItemId, quantityDelta: -1, reason: 'rob_item_lost', reference: `${reference}:item:out`, createdAt: at });
  await insertItemLedger(connection, { guildId, userId: toId, itemId: ledgerItemId, quantityDelta: 1, reason: 'rob_item_gained', reference: `${reference}:item:in`, createdAt: at });
}

function transferRobItemSqlite(guildId: string, fromId: string, toId: string, item: RobbedItem, reference: string, at: number): void {
  if (item.source === 'economy') {
    db.prepare('UPDATE economy_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=? AND quantity>0').run(guildId, fromId, item.itemId);
    db.prepare('DELETE FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity<=0').run(guildId, fromId, item.itemId);
    db.prepare('INSERT INTO economy_inventory(guild_id,user_id,item_id,quantity,acquired_at) VALUES(?,?,?,1,?) ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+1').run(guildId, toId, item.itemId, at);
  } else {
    db.prepare('UPDATE rpg_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=? AND quantity>0').run(guildId, fromId, item.itemId);
    db.prepare('INSERT INTO rpg_inventory(guild_id,user_id,item_id,quantity) VALUES(?,?,?,1) ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+1').run(guildId, toId, item.itemId);
  }
  const ledgerItemId = item.source === 'rpg' ? `rpg:${item.itemId}` : item.itemId;
  insertItemLedgerSqlite(guildId, fromId, ledgerItemId, -1, 'rob_item_lost', `${reference}:item:out`, at);
  insertItemLedgerSqlite(guildId, toId, ledgerItemId, 1, 'rob_item_gained', `${reference}:item:in`, at);
}

function insertItemLedgerSqlite(guildId: string, userId: string, itemId: string, quantityDelta: number, reason: string, reference: string, at: number): void {
  db.prepare('INSERT INTO economy_item_ledger(guild_id,user_id,item_id,quantity_delta,reason,reference,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(guildId, userId, itemId, quantityDelta, reason, reference, at);
}

export async function robPlayer(guildId: string, userId: string, targetId: string, targetName: string, reference: string): Promise<
  | { ok: true; success: boolean; protected?: boolean; amount: number; balance: number; message: string; stolenItem?: RobbedItem }
  | { ok: false; reason: 'self' | 'cooldown' | 'target_empty' | 'loan_active'; secondsRemaining?: number }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (userId === targetId) return { ok: false, reason: 'self' };
  const success = randomInt(100) < 40;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const ids = [userId, targetId].sort();
    const accounts = new Map<string, AccountRow>();
    for (const id of ids) accounts.set(id, await mysqlEnsureAccount(connection, guildId, id, true));
    const now = nowSeconds();
    const robber = accounts.get(userId)!;
    const victim = accounts.get(targetId)!;
    const robberLoan = await reconcilePersonalLoanMysql(connection, guildId, userId, now, robber);
    const victimLoan = await mysqlLoadPersonalLoan(connection, guildId, targetId, true);
    const bankrupt = isPersonalLoanBankrupt(robberLoan);
    if (victimLoan || (robberLoan && !bankrupt)) return { ok: false as const, reason: 'loan_active' as const };
    const victimWallet = Math.max(0, Math.floor(victim.balance));
    const nextRobAt = (robber.lastRobAt ?? 0) + ROB_COOLDOWN_SECONDS;
    if (now < nextRobAt) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: nextRobAt - now };
    if ((victim.robProtectedUntil ?? 0) > now) {
      await connection.execute('UPDATE economy_accounts SET last_rob_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [now, now, guildId, userId]);
      return { ok: true as const, success: false, protected: true, amount: 0, balance: robber.balance,
        message: `🛡️ ${targetName} tenía un escudo activo. El intento de robo de monedas y artículos fue bloqueado.` };
    }
    const [economyRows] = await connection.execute<RowDataPacket[]>('SELECT item_id AS itemId FROM economy_inventory WHERE guild_id=? AND user_id=? AND quantity>0 FOR UPDATE', [guildId, targetId]);
    const [rpgRows] = await connection.execute<RowDataPacket[]>('SELECT item_id AS itemId FROM rpg_inventory WHERE guild_id=? AND user_id=? AND quantity>0 FOR UPDATE', [guildId, targetId]);
    const [robberRows] = await connection.execute<RowDataPacket[]>('SELECT item_id AS itemId FROM economy_inventory WHERE guild_id=? AND user_id=? AND quantity>0 FOR UPDATE', [guildId, userId]);
    const robberItems = new Set(robberRows.map((row) => String(row.itemId)));
    const candidates = [
      ...economyRows.map((row) => ({ itemId: String(row.itemId), source: 'economy' as const })),
      ...rpgRows.map((row) => ({ itemId: String(row.itemId), source: 'rpg' as const })),
    ].flatMap((candidate) => {
      const detail = robItemDetails(candidate);
      const isUniqueTool = detail?.source === 'economy' && storeItems.find((entry) => entry.id === detail.itemId)?.category === 'jobs';
      return detail && !(isUniqueTool && robberItems.has(detail.itemId)) ? [detail] : [];
    });
    if (victimWallet <= 0 && candidates.length === 0) return { ok: false as const, reason: 'target_empty' as const };
    if (success) {
      const stolenItem = candidates.length && (victimWallet <= 0 || randomInt(100) < 45)
        ? candidates[randomInt(candidates.length)] : undefined;
      if (stolenItem) {
        await transferRobItemMysql(connection, guildId, targetId, userId, stolenItem, reference, now);
        await connection.execute('UPDATE economy_accounts SET last_rob_at=?,updated_at=? WHERE guild_id=? AND user_id=?', [now, now, guildId, userId]);
        return { ok: true as const, success: true, amount: 0, balance: robber.balance, stolenItem,
          message: `🎒 Robaste ${stolenItem.emoji} **${stolenItem.name} ×1** del inventario de ${targetName}. No se movieron monedas ni se tocaron los saldos del banco.` };
      }
      const amount = Math.min(victimWallet, 200, Math.max(1, Math.floor(victimWallet * (5 + randomInt(11)) / 100)));
      const message = `${formatMessage(pick(robSuccessLines), { amount, target: targetName })}\n\n💵 Las **${money.format(amount)} monedas** salieron solo de la billetera de ${targetName}; sus ahorros del banco quedan intactos.`;
      await connection.execute('UPDATE economy_accounts SET balance=balance+?,last_rob_at=?,updated_at=? WHERE guild_id=? AND user_id=?', [amount, now, now, guildId, userId]);
      await connection.execute('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?', [amount, now, guildId, targetId]);
      await mysqlAddLedger(connection, guildId, userId, amount, `rob:from:${targetId}`, `${reference}:in`, now);
      await mysqlAddLedger(connection, guildId, targetId, -amount, `rob:to:${userId}`, `${reference}:out`, now);
      return { ok: true as const, success: true, amount, balance: robber.balance + amount, message };
    }
    const amount = bankrupt
      ? 10 + randomInt(21)
      : victimWallet > 0 ? Math.min(Math.max(0, robber.balance), Math.max(1, Math.floor(Math.max(0, robber.balance) * 0.05))) : 0;
    const balance = robber.balance - amount;
    const message = robFailureMessage(targetName, amount, balance, robber.bankBalance, victimWallet, bankrupt);
    await connection.execute('UPDATE economy_accounts SET balance=balance-?,last_rob_at=?,updated_at=? WHERE guild_id=? AND user_id=?', [amount, now, now, guildId, userId]);
    if (amount) await mysqlAddLedger(connection, guildId, userId, -amount, 'rob_fine', `${reference}:fine`, now);
    return { ok: true as const, success: false, amount, balance, message };
  });

  const attempt = db.transaction(() => {
    const accounts = new Map<string, AccountRow>();
    for (const id of [userId, targetId].sort()) accounts.set(id, sqliteEnsureAccount(guildId, id));
    const now = nowSeconds();
    const robber = accounts.get(userId)!;
    const victim = accounts.get(targetId)!;
    const robberLoan = reconcilePersonalLoanSqlite(guildId, userId, now, robber);
    const victimLoan = sqliteLoadPersonalLoan(guildId, targetId);
    const bankrupt = isPersonalLoanBankrupt(robberLoan);
    if (victimLoan || (robberLoan && !bankrupt)) return { ok: false as const, reason: 'loan_active' as const };
    const victimWallet = Math.max(0, Math.floor(victim.balance));
    const nextRobAt = (robber.lastRobAt ?? 0) + ROB_COOLDOWN_SECONDS;
    if (now < nextRobAt) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: nextRobAt - now };
    if ((victim.robProtectedUntil ?? 0) > now) {
      db.prepare('UPDATE economy_accounts SET last_rob_at=?,updated_at=? WHERE guild_id=? AND user_id=?').run(now, now, guildId, userId);
      return { ok: true as const, success: false, protected: true, amount: 0, balance: robber.balance,
        message: `🛡️ ${targetName} tenía un escudo activo. El intento de robo de monedas y artículos fue bloqueado.` };
    }
    const economyRows = db.prepare('SELECT item_id AS itemId FROM economy_inventory WHERE guild_id=? AND user_id=? AND quantity>0').all(guildId, targetId) as Array<{ itemId: string }>;
    const rpgRows = db.prepare('SELECT item_id AS itemId FROM rpg_inventory WHERE guild_id=? AND user_id=? AND quantity>0').all(guildId, targetId) as Array<{ itemId: string }>;
    const robberRows = db.prepare('SELECT item_id AS itemId FROM economy_inventory WHERE guild_id=? AND user_id=? AND quantity>0').all(guildId, userId) as Array<{ itemId: string }>;
    const robberItems = new Set(robberRows.map((row) => String(row.itemId)));
    const candidates = [
      ...economyRows.map((row) => ({ itemId: String(row.itemId), source: 'economy' as const })),
      ...rpgRows.map((row) => ({ itemId: String(row.itemId), source: 'rpg' as const })),
    ].flatMap((candidate) => {
      const detail = robItemDetails(candidate);
      const isUniqueTool = detail?.source === 'economy' && storeItems.find((entry) => entry.id === detail.itemId)?.category === 'jobs';
      return detail && !(isUniqueTool && robberItems.has(detail.itemId)) ? [detail] : [];
    });
    if (victimWallet <= 0 && candidates.length === 0) return { ok: false as const, reason: 'target_empty' as const };
    if (success) {
      const stolenItem = candidates.length && (victimWallet <= 0 || randomInt(100) < 45)
        ? candidates[randomInt(candidates.length)] : undefined;
      if (stolenItem) {
        transferRobItemSqlite(guildId, targetId, userId, stolenItem, reference, now);
        db.prepare('UPDATE economy_accounts SET last_rob_at=?,updated_at=? WHERE guild_id=? AND user_id=?').run(now, now, guildId, userId);
        return { ok: true as const, success: true, amount: 0, balance: robber.balance, stolenItem,
          message: `🎒 Robaste ${stolenItem.emoji} **${stolenItem.name} ×1** del inventario de ${targetName}. No se movieron monedas ni se tocaron los saldos del banco.` };
      }
      const amount = Math.min(victimWallet, 200, Math.max(1, Math.floor(victimWallet * (5 + randomInt(11)) / 100)));
      const message = `${formatMessage(pick(robSuccessLines), { amount, target: targetName })}\n\n💵 Las **${money.format(amount)} monedas** salieron solo de la billetera de ${targetName}; sus ahorros del banco quedan intactos.`;
      db.prepare('UPDATE economy_accounts SET balance=balance+?,last_rob_at=?,updated_at=? WHERE guild_id=? AND user_id=?').run(amount, now, now, guildId, userId);
      db.prepare('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?').run(amount, now, guildId, targetId);
      const ledger = db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)');
      ledger.run(guildId, userId, amount, `rob:from:${targetId}`, `${reference}:in`, now);
      ledger.run(guildId, targetId, -amount, `rob:to:${userId}`, `${reference}:out`, now);
      return { ok: true as const, success: true, amount, balance: robber.balance + amount, message };
    }
    const amount = bankrupt
      ? 10 + randomInt(21)
      : victimWallet > 0 ? Math.min(Math.max(0, robber.balance), Math.max(1, Math.floor(Math.max(0, robber.balance) * 0.05))) : 0;
    const balance = robber.balance - amount;
    const message = robFailureMessage(targetName, amount, balance, robber.bankBalance, victimWallet, bankrupt);
    db.prepare('UPDATE economy_accounts SET balance=balance-?,last_rob_at=?,updated_at=? WHERE guild_id=? AND user_id=?').run(amount, now, now, guildId, userId);
    if (amount) db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)').run(guildId, userId, -amount, 'rob_fine', `${reference}:fine`, now);
    return { ok: true as const, success: false, amount, balance, message };
  });
  return attempt.immediate();
}

export type RouletteColor = 'rojo' | 'negro' | 'verde';
const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export async function playRoulette(guildId: string, userId: string, bet: number, choice: RouletteColor, reference: string): Promise<
  | { ok: true; balance: number; bet: number; choice: RouletteColor; number: number; result: RouletteColor; payout: number; message: string }
  | { ok: false; reason: 'invalid_bet' | 'insufficient_funds' | 'bankrupt' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET) return { ok: false, reason: 'invalid_bet' };
  const number = randomInt(37);
  const result: RouletteColor = number === 0 ? 'verde' : redNumbers.has(number) ? 'rojo' : 'negro';
  const won = choice === result;
  const payout = won ? bet * (choice === 'verde' ? 36 : 2) : 0;
  const baseMessage = won
    ? formatMessage(pick(rouletteWinLines), { payout })
    : pick(rouletteLoseLines);

  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (await mysqlIsPersonalLoanBankrupt(connection, guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    const balance = account.balance - bet + payout;
    const message = won ? baseMessage : `${baseMessage}\n\n🫠 ${moneyLossRemark(balance + account.bankBalance)}`;
    await connection.execute('UPDATE economy_accounts SET balance = balance - ? + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [bet, payout, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -bet, `roulette:${choice}:bet`, `${reference}:bet`, now);
    if (payout) await mysqlAddLedger(connection, guildId, userId, payout, `roulette:${choice}:payout`, `${reference}:payout`, now);
    return { ok: true as const, balance, bet, choice, number, result, payout, message };
  });

  const spin = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (sqliteIsPersonalLoanBankrupt(guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    const now = nowSeconds();
    const balance = account.balance - bet + payout;
    const message = won ? baseMessage : `${baseMessage}\n\n🫠 ${moneyLossRemark(balance + account.bankBalance)}`;
    db.prepare('UPDATE economy_accounts SET balance = balance - ? + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(bet, payout, now, guildId, userId);
    const ledger = db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    ledger.run(guildId, userId, -bet, `roulette:${choice}:bet`, `${reference}:bet`, now);
    if (payout) ledger.run(guildId, userId, payout, `roulette:${choice}:payout`, `${reference}:payout`, now);
    return { ok: true as const, balance, bet, choice, number, result, payout, message };
  });
  return spin.immediate();
}

type RoosterProgress = { name: string; streak: number; bestStreak: number; wins: number; losses: number };
type RoosterRound = { balance: number; bet: number; won: boolean; chance: number; payout: number; streak: number; nextChance: number; bestStreak: number; roosterName: string; message: string };
export type RoosterDuelStatus = 'pending' | 'accepted' | 'declined' | 'expired';
type RoosterDuelState = {
  challengerUsername: string; defenderUsername: string; challengerRooster: string; defenderRooster: string;
  resultMessage?: string; winnerId?: string; winnerPayout?: number; challengerBalance?: number; defenderBalance?: number;
};
type RoosterDuelDbRow = { id: string; guildId: string; challengerId: string; defenderId: string; bet: number; status: RoosterDuelStatus; expiresAt: number; stateJson: string };
export type RoosterDuelView = RoosterDuelDbRow & RoosterDuelState;
const emptyRoosterProgress: RoosterProgress = { name: 'Tu gallo', streak: 0, bestStreak: 0, wins: 0, losses: 0 };
function normalizeRoosterName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 24 && !/[\r\n@<>`*_~|]/.test(name) ? name : undefined;
}
function roosterProgress(value: unknown): RoosterProgress {
  try {
    const parsed = JSON.parse(String(value ?? '{}')) as Partial<RoosterProgress>;
    return {
      name: normalizeRoosterName(parsed.name) ?? emptyRoosterProgress.name,
      streak: Math.max(0, Math.min(20, Math.floor(Number(parsed.streak) || 0))),
      bestStreak: Math.max(0, Math.floor(Number(parsed.bestStreak) || 0)),
      wins: Math.max(0, Math.floor(Number(parsed.wins) || 0)),
      losses: Math.max(0, Math.floor(Number(parsed.losses) || 0)),
    };
  } catch { return { ...emptyRoosterProgress }; }
}

function roosterDuelState(value: unknown): Partial<RoosterDuelState> {
  try {
    const parsed = JSON.parse(String(value ?? '{}')) as Partial<RoosterDuelState>;
    const challengerRooster = normalizeRoosterName(parsed.challengerRooster);
    const defenderRooster = normalizeRoosterName(parsed.defenderRooster);
    return {
      ...(typeof parsed.challengerUsername === 'string' ? { challengerUsername: parsed.challengerUsername } : {}),
      ...(typeof parsed.defenderUsername === 'string' ? { defenderUsername: parsed.defenderUsername } : {}),
      ...(challengerRooster ? { challengerRooster } : {}), ...(defenderRooster ? { defenderRooster } : {}),
      ...(typeof parsed.resultMessage === 'string' ? { resultMessage: parsed.resultMessage } : {}),
      ...(typeof parsed.winnerId === 'string' ? { winnerId: parsed.winnerId } : {}),
      ...(Number.isSafeInteger(parsed.winnerPayout) ? { winnerPayout: Number(parsed.winnerPayout) } : {}),
      ...(Number.isSafeInteger(parsed.challengerBalance) ? { challengerBalance: Number(parsed.challengerBalance) } : {}),
      ...(Number.isSafeInteger(parsed.defenderBalance) ? { defenderBalance: Number(parsed.defenderBalance) } : {}),
    };
  } catch { return {}; }
}

function roosterDuelView(row: RoosterDuelDbRow): RoosterDuelView {
  return { ...row, ...roosterDuelState(row.stateJson), bet: Number(row.bet), expiresAt: Number(row.expiresAt) } as RoosterDuelView;
}

function roosterDuelMoment(winner: string, loser: string): string {
  return pick([
    `Tras un intercambio de picotazos, **${winner}** logró acorralar a **${loser}**.`,
    `**${winner}** esquivó el último ataque y respondió con un picotazo decisivo contra **${loser}**.`,
    `La pelea estuvo pareja hasta que **${winner}** tomó ventaja y **${loser}** cedió el terreno.`,
  ]);
}

export async function setRoosterName(guildId: string, userId: string, requestedName: string): Promise<{ ok: true; name: string } | { ok: false; reason: 'invalid_name' }> {
  guildId = GLOBAL_SCOPE_ID;
  const name = normalizeRoosterName(requestedName);
  if (!name) return { ok: false, reason: 'invalid_name' };
  const gameId = `rooster_${userId}`;
  const at = nowSeconds();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    await mysqlEnsureAccount(connection, guildId, userId, true);
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT state_json AS stateJson FROM economy_games WHERE id=? AND guild_id=? AND user_id=? AND game_type='rooster_stats' FOR UPDATE",
      [gameId, guildId, userId],
    );
    const state = { ...roosterProgress(rows[0]?.stateJson), name };
    await connection.execute(
      "INSERT INTO economy_games (id,guild_id,user_id,game_type,bet,status,state_json,created_at,updated_at) VALUES (?,?,?,'rooster_stats',0,'saved',?,?,?) ON DUPLICATE KEY UPDATE state_json=VALUES(state_json),updated_at=VALUES(updated_at)",
      [gameId, guildId, userId, JSON.stringify(state), at, at],
    );
    return { ok: true as const, name };
  });
  const run = db.transaction(() => {
    sqliteEnsureAccount(guildId, userId);
    const row = db.prepare("SELECT state_json AS stateJson FROM economy_games WHERE id=? AND guild_id=? AND user_id=? AND game_type='rooster_stats'")
      .get(gameId, guildId, userId) as { stateJson: string } | undefined;
    const state = { ...roosterProgress(row?.stateJson), name };
    db.prepare("INSERT INTO economy_games (id,guild_id,user_id,game_type,bet,status,state_json,created_at,updated_at) VALUES (?,?,?,'rooster_stats',0,'saved',?,?,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at")
      .run(gameId, guildId, userId, JSON.stringify(state), at, at);
    return { ok: true as const, name };
  });
  return run.immediate();
}

function settleRoosterRound(balance: number, bet: number, progress: RoosterProgress, totalBalance = balance): { round: RoosterRound; progress: RoosterProgress } {
  const chance = Math.min(70, 50 + progress.streak);
  const won = randomInt(100) < chance;
  // The gross prize scales down with the rising win chance (about 90% RTP throughout the streak).
  const payout = won ? Math.floor((bet * 90) / chance) : 0;
  const streak = won ? Math.min(20, progress.streak + 1) : 0;
  const nextProgress: RoosterProgress = {
    name: progress.name,
    streak,
    bestStreak: Math.max(progress.bestStreak, streak),
    wins: progress.wins + (won ? 1 : 0),
    losses: progress.losses + (won ? 0 : 1),
  };
  const nextChance = Math.min(70, 50 + streak);
  const message = won
    ? `🐓 ¡Victoria! **${progress.name}** ganó con **${chance}%** de probabilidad y recibió **${payout.toLocaleString('es-MX')} monedas**. Racha: **${streak}** · próxima probabilidad: **${nextChance}%**.`
    : `🐓 Esta vez **${progress.name}** perdió. Tu racha vuelve a cero y la próxima pelea empieza en **50%** de probabilidad.\n\n🫠 ${moneyLossRemark(totalBalance - bet)}`;
  return {
    round: { balance: balance - bet + payout, bet, won, chance, payout, streak, nextChance, bestStreak: nextProgress.bestStreak, roosterName: progress.name, message },
    progress: nextProgress,
  };
}

export async function playRoosterFight(guildId: string, userId: string, bet: number, reference: string): Promise<
  | ({ ok: true } & RoosterRound)
  | { ok: false; reason: 'invalid_bet' | 'insufficient_funds' | 'bankrupt' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET) return { ok: false, reason: 'invalid_bet' };
  const gameId = `rooster_${userId}`;
  const at = nowSeconds();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (await mysqlIsPersonalLoanBankrupt(connection, guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    const [statsRows] = await connection.execute<RowDataPacket[]>(
      "SELECT state_json AS stateJson FROM economy_games WHERE id=? AND guild_id=? AND user_id=? AND game_type='rooster_stats' FOR UPDATE",
      [gameId, guildId, userId],
    );
    const progress = roosterProgress(statsRows[0]?.stateJson);
    const settled = settleRoosterRound(account.balance, bet, progress, account.balance + account.bankBalance);
    await connection.execute('UPDATE economy_accounts SET balance=balance-?+?,updated_at=? WHERE guild_id=? AND user_id=?', [bet, settled.round.payout, at, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -bet, 'rooster:bet', `${reference}:bet`, at);
    if (settled.round.payout) await mysqlAddLedger(connection, guildId, userId, settled.round.payout, 'rooster:payout', `${reference}:payout`, at);
    await connection.execute(
      "INSERT INTO economy_games (id,guild_id,user_id,game_type,bet,status,state_json,created_at,updated_at) VALUES (?,?,?,'rooster_stats',0,'saved',?,?,?) ON DUPLICATE KEY UPDATE state_json=VALUES(state_json),updated_at=VALUES(updated_at)",
      [gameId, guildId, userId, JSON.stringify(settled.progress), at, at],
    );
    return { ok: true as const, ...settled.round };
  });
  const play = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (sqliteIsPersonalLoanBankrupt(guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    const stats = db.prepare("SELECT state_json AS stateJson FROM economy_games WHERE id=? AND guild_id=? AND user_id=? AND game_type='rooster_stats'")
      .get(gameId, guildId, userId) as { stateJson: string } | undefined;
    const settled = settleRoosterRound(account.balance, bet, roosterProgress(stats?.stateJson), account.balance + account.bankBalance);
    db.prepare('UPDATE economy_accounts SET balance=balance-?+?,updated_at=? WHERE guild_id=? AND user_id=?').run(bet, settled.round.payout, at, guildId, userId);
    const ledger = db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)');
    ledger.run(guildId, userId, -bet, 'rooster:bet', `${reference}:bet`, at);
    if (settled.round.payout) ledger.run(guildId, userId, settled.round.payout, 'rooster:payout', `${reference}:payout`, at);
    db.prepare("INSERT INTO economy_games (id,guild_id,user_id,game_type,bet,status,state_json,created_at,updated_at) VALUES (?,?,?,'rooster_stats',0,'saved',?,?,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at")
      .run(gameId, guildId, userId, JSON.stringify(settled.progress), at, at);
    return { ok: true as const, ...settled.round };
  });
  return play.immediate();
}

export async function createRoosterDuel(guildId: string, challengerId: string, challengerName: string, defenderId: string, defenderName: string, bet: number): Promise<
  | { ok: true; duel: RoosterDuelView }
  | { ok: false; reason: 'self' | 'invalid_bet' | 'insufficient_funds' | 'busy' | 'loan_active' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (challengerId === defenderId) return { ok: false, reason: 'self' };
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET) return { ok: false, reason: 'invalid_bet' };
  const now = nowSeconds();
  const id = `rd_${randomBytes(10).toString('hex')}`;
  const expiresAt = now + ROOSTER_DUEL_TTL_SECONDS;
  const playerIds = [challengerId, defenderId].sort();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const accounts = new Map<string, AccountRow>();
    for (const playerId of playerIds) accounts.set(playerId, await mysqlEnsureAccount(connection, guildId, playerId, true));
    for (const playerId of playerIds) if (await mysqlLoadPersonalLoan(connection, guildId, playerId, true)) return { ok: false as const, reason: 'loan_active' as const };
    if (accounts.get(challengerId)!.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    await connection.execute("UPDATE economy_rooster_duels SET status='expired',updated_at=? WHERE guild_id=? AND status='pending' AND expires_at<=?", [now, guildId, now]);
    await connection.execute("DELETE FROM economy_rooster_duels WHERE guild_id=? AND status<>'pending' AND updated_at<?", [guildId, now - 30 * 24 * 60 * 60]);
    const [busyRows] = await connection.execute<RowDataPacket[]>("SELECT id FROM economy_rooster_duels WHERE guild_id=? AND status='pending' AND expires_at>? AND (challenger_id IN (?,?) OR defender_id IN (?,?)) LIMIT 1 FOR UPDATE", [guildId, now, challengerId, defenderId, challengerId, defenderId]);
    if (busyRows.length) return { ok: false as const, reason: 'busy' as const };
    const names = new Map<string, string>();
    for (const playerId of playerIds) {
      const [rows] = await connection.execute<RowDataPacket[]>("SELECT state_json AS stateJson FROM economy_games WHERE id=? AND guild_id=? AND user_id=? AND game_type='rooster_stats' FOR UPDATE", [`rooster_${playerId}`, guildId, playerId]);
      names.set(playerId, roosterProgress(rows[0]?.stateJson).name);
    }
    const state: RoosterDuelState = { challengerUsername: challengerName, defenderUsername: defenderName,
      challengerRooster: names.get(challengerId) ?? emptyRoosterProgress.name, defenderRooster: names.get(defenderId) ?? emptyRoosterProgress.name };
    await connection.execute('INSERT INTO economy_rooster_duels(id,guild_id,challenger_id,defender_id,bet,status,expires_at,state_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [id, guildId, challengerId, defenderId, bet, 'pending', expiresAt, JSON.stringify(state), now, now]);
    return { ok: true as const, duel: roosterDuelView({ id, guildId, challengerId, defenderId, bet, status: 'pending', expiresAt, stateJson: JSON.stringify(state) }) };
  });

  const create = db.transaction(() => {
    const accounts = new Map<string, AccountRow>();
    for (const playerId of playerIds) accounts.set(playerId, sqliteEnsureAccount(guildId, playerId));
    for (const playerId of playerIds) if (sqliteLoadPersonalLoan(guildId, playerId)) return { ok: false as const, reason: 'loan_active' as const };
    if (accounts.get(challengerId)!.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    db.prepare("UPDATE economy_rooster_duels SET status='expired',updated_at=? WHERE guild_id=? AND status='pending' AND expires_at<=?").run(now, guildId, now);
    db.prepare("DELETE FROM economy_rooster_duels WHERE guild_id=? AND status<>'pending' AND updated_at<?").run(guildId, now - 30 * 24 * 60 * 60);
    const busy = db.prepare("SELECT id FROM economy_rooster_duels WHERE guild_id=? AND status='pending' AND expires_at>? AND (challenger_id IN (?,?) OR defender_id IN (?,?)) LIMIT 1")
      .get(guildId, now, challengerId, defenderId, challengerId, defenderId);
    if (busy) return { ok: false as const, reason: 'busy' as const };
    const names = new Map<string, string>();
    for (const playerId of playerIds) {
      const row = db.prepare("SELECT state_json AS stateJson FROM economy_games WHERE id=? AND guild_id=? AND user_id=? AND game_type='rooster_stats'")
        .get(`rooster_${playerId}`, guildId, playerId) as { stateJson: string } | undefined;
      names.set(playerId, roosterProgress(row?.stateJson).name);
    }
    const state: RoosterDuelState = { challengerUsername: challengerName, defenderUsername: defenderName,
      challengerRooster: names.get(challengerId) ?? emptyRoosterProgress.name, defenderRooster: names.get(defenderId) ?? emptyRoosterProgress.name };
    const stateJson = JSON.stringify(state);
    db.prepare('INSERT INTO economy_rooster_duels(id,guild_id,challenger_id,defender_id,bet,status,expires_at,state_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, guildId, challengerId, defenderId, bet, 'pending', expiresAt, stateJson, now, now);
    return { ok: true as const, duel: roosterDuelView({ id, guildId, challengerId, defenderId, bet, status: 'pending', expiresAt, stateJson }) };
  });
  return create.immediate();
}

export async function respondRoosterDuel(guildId: string, duelId: string, userId: string, accept: boolean): Promise<
  | { ok: true; duel: RoosterDuelView }
  | { ok: false; reason: 'not_found' | 'not_invited' | 'not_pending' | 'insufficient_funds' | 'loan_active'; duel?: RoosterDuelView }
  | { ok: false; reason: 'expired'; duel: RoosterDuelView }
> {
  guildId = GLOBAL_SCOPE_ID;
  const now = nowSeconds();
  const selectDuel = 'SELECT id,guild_id AS guildId,challenger_id AS challengerId,defender_id AS defenderId,bet,status,expires_at AS expiresAt,state_json AS stateJson FROM economy_rooster_duels WHERE id=? AND guild_id=?';
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const [initialRows] = await connection.execute<RowDataPacket[]>(selectDuel, [duelId, guildId]);
    const initial = initialRows[0] as RoosterDuelDbRow | undefined;
    if (!initial) return { ok: false as const, reason: 'not_found' as const };
    if (String(initial.defenderId) !== userId) return { ok: false as const, reason: 'not_invited' as const };
    let accounts: Map<string, AccountRow> | undefined;
    if (accept) {
      accounts = new Map<string, AccountRow>();
      for (const playerId of [String(initial.challengerId), String(initial.defenderId)].sort()) accounts.set(playerId, await mysqlEnsureAccount(connection, guildId, playerId, true));
    }
    const [lockedRows] = await connection.execute<RowDataPacket[]>(`${selectDuel} FOR UPDATE`, [duelId, guildId]);
    const row = lockedRows[0] as RoosterDuelDbRow | undefined;
    if (!row) return { ok: false as const, reason: 'not_found' as const };
    const duel = roosterDuelView(row);
    if (duel.defenderId !== userId) return { ok: false as const, reason: 'not_invited' as const };
    if (duel.status !== 'pending') return { ok: false as const, reason: 'not_pending' as const, duel };
    if (duel.expiresAt <= now) {
      duel.status = 'expired'; duel.resultMessage = '⌛ El reto venció sin respuesta. No se descontaron monedas.';
      const state = { ...roosterDuelState(duel.stateJson), resultMessage: duel.resultMessage };
      duel.stateJson = JSON.stringify(state);
      await connection.execute("UPDATE economy_rooster_duels SET status='expired',state_json=?,updated_at=? WHERE id=?", [duel.stateJson, now, duelId]);
      return { ok: false as const, reason: 'expired' as const, duel };
    }
    if (!accept) {
      duel.status = 'declined'; duel.resultMessage = `<@${userId}> rechazó el reto. No se descontaron monedas.`;
      const state = { ...roosterDuelState(duel.stateJson), resultMessage: duel.resultMessage };
      await connection.execute("UPDATE economy_rooster_duels SET status='declined',state_json=?,updated_at=? WHERE id=?", [JSON.stringify(state), now, duelId]);
      return { ok: true as const, duel };
    }
    const challengerLoan = await mysqlLoadPersonalLoan(connection, guildId, duel.challengerId, true);
    const defenderLoan = await mysqlLoadPersonalLoan(connection, guildId, duel.defenderId, true);
    if (challengerLoan || defenderLoan) {
      duel.status = 'declined'; duel.resultMessage = '🏦 El banco canceló el duelo: hay un préstamo pendiente entre los participantes. No se descontaron monedas.';
      const state = { ...roosterDuelState(duel.stateJson), resultMessage: duel.resultMessage };
      await connection.execute("UPDATE economy_rooster_duels SET status='declined',state_json=?,updated_at=? WHERE id=?", [JSON.stringify(state), now, duelId]);
      return { ok: false as const, reason: 'loan_active' as const, duel };
    }
    const challenger = accounts!.get(duel.challengerId)!;
    const defender = accounts!.get(duel.defenderId)!;
    if (challenger.balance < duel.bet || defender.balance < duel.bet) return { ok: false as const, reason: 'insufficient_funds' as const, duel };
    const winnerId = randomInt(2) === 0 ? duel.challengerId : duel.defenderId;
    const loserId = winnerId === duel.challengerId ? duel.defenderId : duel.challengerId;
    const winnerPayout = duel.bet * 2;
    const challengerBalance = challenger.balance - duel.bet + (winnerId === duel.challengerId ? winnerPayout : 0);
    const defenderBalance = defender.balance - duel.bet + (winnerId === duel.defenderId ? winnerPayout : 0);
    for (const playerId of [duel.challengerId, duel.defenderId].sort()) {
      await connection.execute('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?', [duel.bet, now, guildId, playerId]);
      await mysqlAddLedger(connection, guildId, playerId, -duel.bet, 'rooster_duel:bet', `${duel.id}:bet:${playerId}`, now);
    }
    await connection.execute('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?', [winnerPayout, now, guildId, winnerId]);
    await mysqlAddLedger(connection, guildId, winnerId, winnerPayout, 'rooster_duel:payout', `${duel.id}:payout`, now);
    const winnerRooster = winnerId === duel.challengerId ? duel.challengerRooster : duel.defenderRooster;
    const loserRooster = loserId === duel.challengerId ? duel.challengerRooster : duel.defenderRooster;
    const loserAccount = loserId === duel.challengerId ? challenger : defender;
    duel.status = 'accepted'; duel.winnerId = winnerId; duel.winnerPayout = winnerPayout;
    duel.challengerBalance = challengerBalance; duel.defenderBalance = defenderBalance;
    duel.resultMessage = `🐓 ${roosterDuelMoment(winnerRooster, loserRooster)} <@${loserId}> pierde **${duel.bet.toLocaleString('es-MX')} monedas** y <@${winnerId}> cobra el pozo de **${winnerPayout.toLocaleString('es-MX')} monedas**.\n\n🫠 ${moneyLossRemark(loserAccount.balance + loserAccount.bankBalance - duel.bet)}`;
    const state = { ...roosterDuelState(duel.stateJson), resultMessage: duel.resultMessage, winnerId, winnerPayout, challengerBalance, defenderBalance };
    await connection.execute("UPDATE economy_rooster_duels SET status='accepted',state_json=?,updated_at=? WHERE id=?", [JSON.stringify(state), now, duelId]);
    return { ok: true as const, duel };
  });

  const respond = db.transaction(() => {
    const initial = db.prepare(selectDuel).get(duelId, guildId) as RoosterDuelDbRow | undefined;
    if (!initial) return { ok: false as const, reason: 'not_found' as const };
    if (initial.defenderId !== userId) return { ok: false as const, reason: 'not_invited' as const };
    let accounts: Map<string, AccountRow> | undefined;
    if (accept) {
      accounts = new Map<string, AccountRow>();
      for (const playerId of [initial.challengerId, initial.defenderId].sort()) accounts.set(playerId, sqliteEnsureAccount(guildId, playerId));
    }
    const row = db.prepare(selectDuel).get(duelId, guildId) as RoosterDuelDbRow | undefined;
    if (!row) return { ok: false as const, reason: 'not_found' as const };
    const duel = roosterDuelView(row);
    if (duel.defenderId !== userId) return { ok: false as const, reason: 'not_invited' as const };
    if (duel.status !== 'pending') return { ok: false as const, reason: 'not_pending' as const, duel };
    if (duel.expiresAt <= now) {
      duel.status = 'expired'; duel.resultMessage = '⌛ El reto venció sin respuesta. No se descontaron monedas.';
      const state = { ...roosterDuelState(duel.stateJson), resultMessage: duel.resultMessage };
      db.prepare("UPDATE economy_rooster_duels SET status='expired',state_json=?,updated_at=? WHERE id=?").run(JSON.stringify(state), now, duelId);
      return { ok: false as const, reason: 'expired' as const, duel };
    }
    if (!accept) {
      duel.status = 'declined'; duel.resultMessage = `<@${userId}> rechazó el reto. No se descontaron monedas.`;
      const state = { ...roosterDuelState(duel.stateJson), resultMessage: duel.resultMessage };
      db.prepare("UPDATE economy_rooster_duels SET status='declined',state_json=?,updated_at=? WHERE id=?").run(JSON.stringify(state), now, duelId);
      return { ok: true as const, duel };
    }
    const challengerLoan = sqliteLoadPersonalLoan(guildId, duel.challengerId);
    const defenderLoan = sqliteLoadPersonalLoan(guildId, duel.defenderId);
    if (challengerLoan || defenderLoan) {
      duel.status = 'declined'; duel.resultMessage = '🏦 El banco canceló el duelo: hay un préstamo pendiente entre los participantes. No se descontaron monedas.';
      const state = { ...roosterDuelState(duel.stateJson), resultMessage: duel.resultMessage };
      db.prepare("UPDATE economy_rooster_duels SET status='declined',state_json=?,updated_at=? WHERE id=?").run(JSON.stringify(state), now, duelId);
      return { ok: false as const, reason: 'loan_active' as const, duel };
    }
    const challenger = accounts!.get(duel.challengerId)!;
    const defender = accounts!.get(duel.defenderId)!;
    if (challenger.balance < duel.bet || defender.balance < duel.bet) return { ok: false as const, reason: 'insufficient_funds' as const, duel };
    const winnerId = randomInt(2) === 0 ? duel.challengerId : duel.defenderId;
    const loserId = winnerId === duel.challengerId ? duel.defenderId : duel.challengerId;
    const winnerPayout = duel.bet * 2;
    const challengerBalance = challenger.balance - duel.bet + (winnerId === duel.challengerId ? winnerPayout : 0);
    const defenderBalance = defender.balance - duel.bet + (winnerId === duel.defenderId ? winnerPayout : 0);
    const ledger = db.prepare('INSERT INTO economy_ledger(guild_id,user_id,amount,reason,reference,created_at) VALUES(?,?,?,?,?,?)');
    for (const playerId of [duel.challengerId, duel.defenderId].sort()) {
      db.prepare('UPDATE economy_accounts SET balance=balance-?,updated_at=? WHERE guild_id=? AND user_id=?').run(duel.bet, now, guildId, playerId);
      ledger.run(guildId, playerId, -duel.bet, 'rooster_duel:bet', `${duel.id}:bet:${playerId}`, now);
    }
    db.prepare('UPDATE economy_accounts SET balance=balance+?,updated_at=? WHERE guild_id=? AND user_id=?').run(winnerPayout, now, guildId, winnerId);
    ledger.run(guildId, winnerId, winnerPayout, 'rooster_duel:payout', `${duel.id}:payout`, now);
    const winnerRooster = winnerId === duel.challengerId ? duel.challengerRooster : duel.defenderRooster;
    const loserRooster = loserId === duel.challengerId ? duel.challengerRooster : duel.defenderRooster;
    const loserAccount = loserId === duel.challengerId ? challenger : defender;
    duel.status = 'accepted'; duel.winnerId = winnerId; duel.winnerPayout = winnerPayout;
    duel.challengerBalance = challengerBalance; duel.defenderBalance = defenderBalance;
    duel.resultMessage = `🐓 ${roosterDuelMoment(winnerRooster, loserRooster)} <@${loserId}> pierde **${duel.bet.toLocaleString('es-MX')} monedas** y <@${winnerId}> cobra el pozo de **${winnerPayout.toLocaleString('es-MX')} monedas**.\n\n🫠 ${moneyLossRemark(loserAccount.balance + loserAccount.bankBalance - duel.bet)}`;
    const state = { ...roosterDuelState(duel.stateJson), resultMessage: duel.resultMessage, winnerId, winnerPayout, challengerBalance, defenderBalance };
    db.prepare("UPDATE economy_rooster_duels SET status='accepted',state_json=?,updated_at=? WHERE id=?").run(JSON.stringify(state), now, duelId);
    return { ok: true as const, duel };
  });
  return respond.immediate();
}

const slotSymbols = [
  { emoji: '🍒', weight: 36, multiplier: 3 },
  { emoji: '🍋', weight: 28, multiplier: 4 },
  { emoji: '🔔', weight: 20, multiplier: 7 },
  { emoji: '💎', weight: 11, multiplier: 15 },
  { emoji: '7️⃣', weight: 5, multiplier: 50 },
] as const;
type SlotSymbol = typeof slotSymbols[number];
function rollSlotSymbol(): SlotSymbol {
  let roll = randomInt(100);
  for (const symbol of slotSymbols) {
    if (roll < symbol.weight) return symbol;
    roll -= symbol.weight;
  }
  return slotSymbols[0]!;
}

export async function playSlots(guildId: string, userId: string, bet: number, reference: string): Promise<
  | { ok: true; balance: number; bet: number; reels: [string, string, string]; outcome: 'triple' | 'pair' | 'miss'; multiplier: number; payout: number; message: string }
  | { ok: false; reason: 'invalid_bet' | 'insufficient_funds' | 'bankrupt' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET) return { ok: false, reason: 'invalid_bet' };
  const symbols = [rollSlotSymbol(), rollSlotSymbol(), rollSlotSymbol()] as const;
  const isTriple = symbols[0]!.emoji === symbols[1]!.emoji && symbols[1]!.emoji === symbols[2]!.emoji;
  const isPair = !isTriple && (symbols[0]!.emoji === symbols[1]!.emoji || symbols[0]!.emoji === symbols[2]!.emoji || symbols[1]!.emoji === symbols[2]!.emoji);
  const winningSymbol = isTriple ? symbols[0]! : undefined;
  const multiplier = winningSymbol?.multiplier ?? (isPair ? 1 : 0);
  const payout = multiplier * bet;
  const outcome: 'triple' | 'pair' | 'miss' = isTriple ? 'triple' : isPair ? 'pair' : 'miss';
  const reels: [string, string, string] = [symbols[0]!.emoji, symbols[1]!.emoji, symbols[2]!.emoji];
  const baseMessage = outcome === 'triple'
    ? `🎉 ¡Tres ${winningSymbol!.emoji}! Premio total **×${multiplier}** (incluye la apuesta): **${payout.toLocaleString('es-MX')} monedas**.`
    : outcome === 'pair' ? '✨ Dos símbolos iguales: recuperas tu apuesta.' : 'Esta vez no hubo combinación. La apuesta se perdió.';
  const at = nowSeconds();
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (await mysqlIsPersonalLoanBankrupt(connection, guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    const balance = account.balance - bet + payout;
    const message = outcome === 'miss' ? `${baseMessage}\n\n🫠 ${moneyLossRemark(balance + account.bankBalance)}` : baseMessage;
    await connection.execute('UPDATE economy_accounts SET balance=balance-?+?,updated_at=? WHERE guild_id=? AND user_id=?', [bet, payout, at, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -bet, 'slots:bet', `${reference}:bet`, at);
    if (payout) await mysqlAddLedger(connection, guildId, userId, payout, `slots:${outcome}:payout`, `${reference}:payout`, at);
    return { ok: true as const, balance, bet, reels, outcome, multiplier, payout, message };
  });
  const spin = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (sqliteIsPersonalLoanBankrupt(guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    const balance = account.balance - bet + payout;
    const message = outcome === 'miss' ? `${baseMessage}\n\n🫠 ${moneyLossRemark(balance + account.bankBalance)}` : baseMessage;
    db.prepare('UPDATE economy_accounts SET balance=balance-?+?,updated_at=? WHERE guild_id=? AND user_id=?').run(bet, payout, at, guildId, userId);
    const ledger = db.prepare('INSERT INTO economy_ledger (guild_id,user_id,amount,reason,reference,created_at) VALUES (?,?,?,?,?,?)');
    ledger.run(guildId, userId, -bet, 'slots:bet', `${reference}:bet`, at);
    if (payout) ledger.run(guildId, userId, payout, `slots:${outcome}:payout`, `${reference}:payout`, at);
    return { ok: true as const, balance, bet, reels, outcome, multiplier, payout, message };
  });
  return spin.immediate();
}

export async function playItemRoulette(guildId: string, userId: string, itemId: string, choice: RouletteColor, reference: string): Promise<
  | { ok: true; itemName: string; number: number; result: RouletteColor; payout: number; balance: number; message: string }
  | { ok: false; reason: 'invalid_item' | 'missing_item' | 'bankrupt' }
> {
  guildId = GLOBAL_SCOPE_ID;
  const item = storeItems.find((candidate) => candidate.id === itemId && candidate.usable);
  if (!item) return { ok: false, reason: 'invalid_item' };
  const number = randomInt(37);
  const result: RouletteColor = number === 0 ? 'verde' : redNumbers.has(number) ? 'rojo' : 'negro';
  const payout = choice === result ? item.cost * (choice === 'verde' ? 36 : 2) : 0;
  const message = payout
    ? `La bola cayó en **${number} ${result}**. Tu **${item.name}** acertó la apuesta.`
    : `La bola cayó en **${number} ${result}**. Perdiste tu **${item.name}**; la apuesta no devuelve el artículo.`;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (await mysqlIsPersonalLoanBankrupt(connection, guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    const [items] = await connection.execute<RowDataPacket[]>(
      'SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? FOR UPDATE',
      [guildId, userId, itemId],
    );
    const quantity = Number(items[0]?.quantity ?? 0);
    if (quantity < 1) return { ok: false as const, reason: 'missing_item' as const };
    await connection.execute('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
    await connection.execute('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0', [guildId, userId, itemId]);
    const now = nowSeconds();
    await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'roulette_item_bet', reference: `${reference}:item`, createdAt: now });
    if (payout) {
      await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [payout, now, guildId, userId]);
      await mysqlAddLedger(connection, guildId, userId, payout, `roulette_item:${itemId}`, `${reference}:payout`, now);
    }
    return { ok: true as const, itemName: item.name, number, result, payout, balance: account.balance + payout, message };
  });

  const spin = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (sqliteIsPersonalLoanBankrupt(guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    const inventory = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?')
      .get(guildId, userId, itemId) as { quantity: number } | undefined;
    if (!inventory || inventory.quantity < 1) return { ok: false as const, reason: 'missing_item' as const };
    db.prepare('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?').run(guildId, userId, itemId);
    db.prepare('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0').run(guildId, userId, itemId);
    const now = nowSeconds();
    db.prepare('INSERT INTO economy_item_ledger (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(guildId, userId, itemId, -1, 'roulette_item_bet', `${reference}:item`, now);
    if (payout) {
      db.prepare('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(payout, now, guildId, userId);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, payout, `roulette_item:${itemId}`, `${reference}:payout`, now);
    }
    return { ok: true as const, itemName: item.name, number, result, payout, balance: account.balance + payout, message };
  });
  return spin.immediate();
}

export type UseItemResult =
  | { ok: true; kind: 'fish'; balance: number; amount: number; message: string }
  | { ok: true; kind: 'shield'; protectedUntil: number; message: string }
  | { ok: true; kind: 'utility'; message: string }
  | { ok: false; reason: 'invalid_item' | 'missing_item' | 'missing_rod' | 'cooldown' | 'no_job' | 'missing_tool' | 'not_needed' | 'bankrupt'; secondsRemaining?: number };

function consumeItemSqlite(guildId: string, userId: string, itemId: string, reference: string, reason: string, now: number): boolean {
  const row = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?')
    .get(guildId, userId, itemId) as { quantity: number } | undefined;
  if (!row || row.quantity < 1) return false;
  db.prepare('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?').run(guildId, userId, itemId);
  db.prepare('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0').run(guildId, userId, itemId);
  db.prepare('INSERT INTO economy_item_ledger (guild_id, user_id, item_id, quantity_delta, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(guildId, userId, itemId, -1, reason, reference, now);
  return true;
}

export async function useShopItem(guildId: string, userId: string, itemId: string, reference: string): Promise<UseItemResult> {
  guildId = GLOBAL_SCOPE_ID;
  const item = storeItems.find((candidate) => candidate.id === itemId && candidate.usable);
  if (!item) return { ok: false, reason: 'invalid_item' };
  const effect = item.effect;
  if (!effect) return { ok: false, reason: 'invalid_item' };
  const fishEffect = effect.kind === 'fish_bait' ? effect : undefined;
  const caught = fishEffect ? randomInt(100) < fishEffect.catchChance : false;
  const rare = caught && fishEffect ? randomInt(100) < fishEffect.rareChance : false;
  const fishName = pick(rare ? fishRare : fishCommon);
  const amount = caught && fishEffect ? Math.floor((rare ? 50 + randomInt(31) : 12 + randomInt(19)) * fishEffect.payoutMultiplier) : 0;
  const fishMessage = caught
    ? `¡${item.name} atrajo un **${fishName}**! Ganaste **${money.format(amount)} monedas**${rare ? ' por una captura rara' : ''}.`
    : `Usaste **${item.name}**, pero no hubo captura. Inténtalo de nuevo cuando termine el enfriamiento.`;

  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    const [items] = await connection.execute<RowDataPacket[]>(
      'SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? FOR UPDATE',
      [guildId, userId, itemId],
    );
    if (Number(items[0]?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_item' as const };
    const now = nowSeconds();
    if (effect.kind === 'tool_repair' || effect.kind === 'job_manual') {
      const [jobs] = await connection.execute<RowDataPacket[]>('SELECT job_id AS jobId,level,xp,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1 FOR UPDATE', [guildId, userId]);
      const current = jobs[0];
      if (!current) return { ok: false as const, reason: 'no_job' as const };
      const job = economyJobs.find((entry) => entry.id === String(current.jobId));
      if (!job) return { ok: false as const, reason: 'no_job' as const };
      const [tools] = await connection.execute<RowDataPacket[]>('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? FOR UPDATE', [guildId, userId, job.toolId]);
      if (Number(tools[0]?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_tool' as const };
      const jobLevel = Number(current.level);
      if (effect.kind === 'tool_repair') {
        const state = await ensureJobToolStateMysql(connection, guildId, userId, job.toolId, jobLevel);
        const maxDurability = Math.max(state.maxDurability, maxJobToolDurability(jobLevel, state.upgradeLevel));
        const durability = Math.min(maxDurability, state.durability);
        if (durability >= maxDurability) return { ok: false as const, reason: 'not_needed' as const };
        const repaired = effect.repairAmount === 'full' ? maxDurability : Math.min(maxDurability, durability + effect.repairAmount);
        await connection.execute('UPDATE economy_tool_state SET durability=?,max_durability=?,updated_at=? WHERE guild_id=? AND user_id=? AND tool_id=?', [repaired, maxDurability, now, guildId, userId, job.toolId]);
        await connection.execute('UPDATE economy_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?', [guildId, userId, itemId]);
        await connection.execute('DELETE FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity<=0', [guildId, userId, itemId]);
        await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'repair_job_tool', reference: `${reference}:item`, createdAt: now });
        return { ok: true as const, kind: 'utility' as const, message: `🧰 ${item.name} reparó **${job.toolName}**: ahora tiene **${repaired}/${maxDurability}** de durabilidad.` };
      }
      if (jobLevel >= MAX_JOB_LEVEL) return { ok: false as const, reason: 'not_needed' as const };
      const progress = addJobExperience(jobLevel, Number(current.xp), effect.xp);
      const selectedAt = Math.max(now, Number(current.updatedAt ?? 0) + 1);
      await connection.execute('UPDATE economy_jobs SET level=?,xp=?,updated_at=? WHERE guild_id=? AND user_id=? AND job_id=?', [progress.level, progress.xp, selectedAt, guildId, userId, job.id]);
      await connection.execute('UPDATE economy_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?', [guildId, userId, itemId]);
      await connection.execute('DELETE FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity<=0', [guildId, userId, itemId]);
      await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'study_job_manual', reference: `${reference}:item`, createdAt: now });
      return { ok: true as const, kind: 'utility' as const, message: `📗 Usaste **${item.name}**: **${job.name}** ganó ${effect.xp} XP${progress.levelUp ? ` y subió al nivel ${progress.level}` : ` · ${progress.xp}/${jobXpToNext(progress.level)} XP`}.` };
    }
    if (effect.kind === 'fish_bait') {
      if (await mysqlIsPersonalLoanBankrupt(connection, guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
      const [rods] = await connection.execute<RowDataPacket[]>(
        'SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? FOR UPDATE',
        [guildId, userId, 'cana_pescar'],
      );
      if (Number(rods[0]?.quantity ?? 0) < 1) return { ok: false as const, reason: 'missing_rod' as const };
      const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
      if (now < nextFishAt) return { ok: false as const, reason: 'cooldown' as const, secondsRemaining: nextFishAt - now };
      const fishingJob = economyJobs.find((entry) => entry.toolId === 'cana_pescar')!;
      const [jobRows] = await connection.execute<RowDataPacket[]>('SELECT level FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?', [guildId, userId, fishingJob.id]);
      const toolWear = await wearJobToolMysql(connection, guildId, userId, fishingJob, Number(jobRows[0]?.level ?? 1), `${reference}:rod`, now);
      await connection.execute('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
      await connection.execute('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0', [guildId, userId, itemId]);
      await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'use_premium_bait', reference: `${reference}:item`, createdAt: now });
      await connection.execute('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [amount, now, now, guildId, userId]);
      if (amount) await mysqlAddLedger(connection, guildId, userId, amount, rare ? 'fish_rare:premium_bait' : 'fish:premium_bait', `${reference}:payout`, now);
      const wearMessage = toolWear.broke ? '\n💥 Tu caña se rompió; compra otra para volver a pescar o trabajar.'
        : toolWear.worn ? `\n🎣 Durabilidad de la caña: **${toolWear.durability}/${toolWear.maxDurability}**.` : '\n🎣 Tu experiencia de pescador evitó el desgaste de la caña.';
      return { ok: true as const, kind: 'fish' as const, balance: account.balance + amount, amount, message: `${fishMessage}${wearMessage}` };
    }
    if (effect.kind !== 'rob_shield') return { ok: false as const, reason: 'invalid_item' as const };
    const protectedUntil = Math.max(account.robProtectedUntil ?? now, now) + effect.durationSeconds;
    await connection.execute('UPDATE economy_inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
    await connection.execute('DELETE FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity <= 0', [guildId, userId, itemId]);
    await insertItemLedger(connection, { guildId, userId, itemId, quantityDelta: -1, reason: 'activate_robbery_shield', reference: `${reference}:item`, createdAt: now });
    await connection.execute('UPDATE economy_accounts SET rob_protected_until = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [protectedUntil, now, guildId, userId]);
    return { ok: true as const, kind: 'shield' as const, protectedUntil,
      message: `🛡️ **${item.name}** activo hasta <t:${protectedUntil}:F>. Los intentos de robo contra ti serán bloqueados.` };
  });

  const use = db.transaction((): UseItemResult => {
    const account = sqliteEnsureAccount(guildId, userId);
    const now = nowSeconds();
    if (effect.kind === 'tool_repair' || effect.kind === 'job_manual') {
      const current = db.prepare('SELECT job_id AS jobId,level,xp,updated_at AS updatedAt FROM economy_jobs WHERE guild_id=? AND user_id=? AND is_active=1 ORDER BY updated_at DESC,job_id ASC LIMIT 1')
        .get(guildId, userId) as { jobId: string; level: number; xp: number; updatedAt: number } | undefined;
      if (!current) return { ok: false, reason: 'no_job' };
      const job = economyJobs.find((entry) => entry.id === current.jobId);
      if (!job) return { ok: false, reason: 'no_job' };
      const tools = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id=? AND user_id=? AND item_id=?').get(guildId, userId, job.toolId) as { quantity: number } | undefined;
      if (Number(tools?.quantity ?? 0) < 1) return { ok: false, reason: 'missing_tool' };
      const jobLevel = Number(current.level);
      if (effect.kind === 'tool_repair') {
        const state = ensureJobToolStateSqlite(guildId, userId, job.toolId, jobLevel);
        const maxDurability = Math.max(state.maxDurability, maxJobToolDurability(jobLevel, state.upgradeLevel));
        const durability = Math.min(maxDurability, state.durability);
        if (durability >= maxDurability) return { ok: false, reason: 'not_needed' };
        const repaired = effect.repairAmount === 'full' ? maxDurability : Math.min(maxDurability, durability + effect.repairAmount);
        db.prepare('UPDATE economy_tool_state SET durability=?,max_durability=?,updated_at=? WHERE guild_id=? AND user_id=? AND tool_id=?').run(repaired, maxDurability, now, guildId, userId, job.toolId);
        if (!consumeItemSqlite(guildId, userId, itemId, `${reference}:item`, 'repair_job_tool', now)) return { ok: false, reason: 'missing_item' };
        return { ok: true, kind: 'utility', message: `🧰 ${item.name} reparó **${job.toolName}**: ahora tiene **${repaired}/${maxDurability}** de durabilidad.` };
      }
      if (jobLevel >= MAX_JOB_LEVEL) return { ok: false, reason: 'not_needed' };
      const progress = addJobExperience(jobLevel, Number(current.xp), effect.xp);
      const selectedAt = Math.max(now, Number(current.updatedAt ?? 0) + 1);
      db.prepare('UPDATE economy_jobs SET level=?,xp=?,updated_at=? WHERE guild_id=? AND user_id=? AND job_id=?').run(progress.level, progress.xp, selectedAt, guildId, userId, job.id);
      if (!consumeItemSqlite(guildId, userId, itemId, `${reference}:item`, 'study_job_manual', now)) return { ok: false, reason: 'missing_item' };
      return { ok: true, kind: 'utility', message: `📗 Usaste **${item.name}**: **${job.name}** ganó ${effect.xp} XP${progress.levelUp ? ` y subió al nivel ${progress.level}` : ` · ${progress.xp}/${jobXpToNext(progress.level)} XP`}.` };
    }
    if (effect.kind === 'fish_bait') {
      if (sqliteIsPersonalLoanBankrupt(guildId, userId)) return { ok: false, reason: 'bankrupt' };
      const rod = db.prepare('SELECT quantity FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?')
        .get(guildId, userId, 'cana_pescar') as { quantity: number } | undefined;
      if (!rod || rod.quantity < 1) return { ok: false, reason: 'missing_rod' };
      const nextFishAt = (account.lastFishAt ?? 0) + FISH_COOLDOWN_SECONDS;
      if (now < nextFishAt) return { ok: false, reason: 'cooldown', secondsRemaining: nextFishAt - now };
      const fishingJob = economyJobs.find((entry) => entry.toolId === 'cana_pescar')!;
      const jobRow = db.prepare('SELECT level FROM economy_jobs WHERE guild_id=? AND user_id=? AND job_id=?').get(guildId, userId, fishingJob.id) as { level: number } | undefined;
      const toolWear = wearJobToolSqlite(guildId, userId, fishingJob, Number(jobRow?.level ?? 1), `${reference}:rod`, now);
      if (!consumeItemSqlite(guildId, userId, itemId, `${reference}:item`, 'use_premium_bait', now)) return { ok: false, reason: 'missing_item' };
      db.prepare('UPDATE economy_accounts SET balance = balance + ?, last_fish_at = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(amount, now, now, guildId, userId);
      if (amount) db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, amount, rare ? 'fish_rare:premium_bait' : 'fish:premium_bait', `${reference}:payout`, now);
      const wearMessage = toolWear.broke ? '\n💥 Tu caña se rompió; compra otra para volver a pescar o trabajar.'
        : toolWear.worn ? `\n🎣 Durabilidad de la caña: **${toolWear.durability}/${toolWear.maxDurability}**.` : '\n🎣 Tu experiencia de pescador evitó el desgaste de la caña.';
      return { ok: true, kind: 'fish', balance: account.balance + amount, amount, message: `${fishMessage}${wearMessage}` };
    }
    if (effect.kind !== 'rob_shield') return { ok: false, reason: 'invalid_item' };
    if (!consumeItemSqlite(guildId, userId, itemId, `${reference}:item`, 'activate_robbery_shield', now)) return { ok: false, reason: 'missing_item' };
    const protectedUntil = Math.max(account.robProtectedUntil ?? now, now) + effect.durationSeconds;
    db.prepare('UPDATE economy_accounts SET rob_protected_until = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(protectedUntil, now, guildId, userId);
    return { ok: true, kind: 'shield', protectedUntil,
      message: `🛡️ **${item.name}** activo hasta <t:${protectedUntil}:F>. Los intentos de robo contra ti serán bloqueados.` };
  });
  return use.immediate();
}

function makeDeck(): BlackjackCard[] {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = [
    { rank: 'A', value: 11 }, { rank: '2', value: 2 }, { rank: '3', value: 3 }, { rank: '4', value: 4 },
    { rank: '5', value: 5 }, { rank: '6', value: 6 }, { rank: '7', value: 7 }, { rank: '8', value: 8 },
    { rank: '9', value: 9 }, { rank: '10', value: 10 }, { rank: 'J', value: 10 }, { rank: 'Q', value: 10 }, { rank: 'K', value: 10 },
  ];
  const deck = suits.flatMap((suit) => ranks.map(({ rank, value }) => ({ rank, suit, value })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

function drawCard(state: BlackjackState): BlackjackCard {
  if (!state.deck.length) state.deck = makeDeck();
  return state.deck.pop()!;
}
function total(cards: BlackjackCard[]): number {
  let value = cards.reduce((sum, card) => sum + card.value, 0);
  let aces = cards.filter((card) => card.rank === 'A').length;
  while (value > 21 && aces > 0) { value -= 10; aces--; }
  return value;
}
function cardText(card: BlackjackCard): string { return `**${card.rank}${card.suit}**`; }
function effectiveCardValues(cards: BlackjackCard[]): number[] {
  const values = cards.map((card) => card.value);
  let sum = values.reduce((value, cardValue) => value + cardValue, 0);
  for (let index = 0; sum > 21 && index < cards.length; index++) {
    if (cards[index]?.rank === 'A') { values[index] = 1; sum -= 10; }
  }
  return values;
}
function isBlackjackFinished(state: BlackjackState): boolean { return state.status === 'finished'; }
function blackjackView(gameId: string, bet: number, balance: number, state: BlackjackState, lastDrawnCard?: BlackjackCard): BlackjackView {
  const dealerCards = state.status === 'active'
    ? [cardText(state.dealerCards[0]!), '🂠']
    : state.dealerCards.map(cardText);
  return {
    gameId, bet, balance,
    playerCards: state.playerCards.map(cardText),
    playerCardValues: effectiveCardValues(state.playerCards),
    ...(lastDrawnCard ? { lastDrawnCard: cardText(lastDrawnCard) } : {}),
    dealerCards,
    playerTotal: total(state.playerCards),
    ...(isBlackjackFinished(state) ? { dealerTotal: total(state.dealerCards) } : {}),
    status: state.status,
    ...(state.outcome ? { outcome: state.outcome } : {}),
    payout: state.payout,
    ...(state.resultText ? { resultText: state.resultText } : {}),
  };
}

function settleBlackjack(state: BlackjackState, outcome: 'win' | 'lose' | 'push', payout: number, resultText: string): void {
  state.status = 'finished'; state.outcome = outcome; state.payout = payout; state.resultText = resultText;
}
function openingBlackjackSettlement(state: BlackjackState, bet: number): void {
  const playerNatural = total(state.playerCards) === 21;
  const dealerNatural = total(state.dealerCards) === 21;
  if (playerNatural && dealerNatural) settleBlackjack(state, 'push', bet, 'Ambos abrieron con 21. Recuperas tu apuesta.');
  else if (playerNatural) settleBlackjack(state, 'win', Math.floor(bet * 2.5), '¡Blackjack natural! La mesa paga 3:2.');
  else if (dealerNatural) settleBlackjack(state, 'lose', 0, 'El crupier abrió con blackjack. Esta mano se pierde.');
}
function settleAfterTurn(state: BlackjackState, bet: number): void {
  const playerTotal = total(state.playerCards);
  if (playerTotal > 21) {
    settleBlackjack(state, 'lose', 0, `Te pasaste con **${playerTotal}**. ${pick(blackjackLoseLines)}`);
    return;
  }
  while (total(state.dealerCards) < 17) state.dealerCards.push(drawCard(state));
  const dealerTotal = total(state.dealerCards);
  if (dealerTotal > 21 || playerTotal > dealerTotal) settleBlackjack(state, 'win', bet * 2, pick(blackjackWinLines));
  else if (playerTotal === dealerTotal) settleBlackjack(state, 'push', bet, `Empate con **${playerTotal}**. Recuperas tu apuesta.`);
  else settleBlackjack(state, 'lose', 0, `${pick(blackjackLoseLines)} Tu mano: **${playerTotal}** · crupier: **${dealerTotal}**.`);
}

export async function startBlackjack(guildId: string, userId: string, bet: number, reference: string): Promise<
  | { ok: true; view: BlackjackView; existing: boolean }
  | { ok: false; reason: 'invalid_bet' | 'insufficient_funds' | 'bankrupt' }
> {
  guildId = GLOBAL_SCOPE_ID;
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > MAX_BET) return { ok: false, reason: 'invalid_bet' };
  const gameId = randomBytes(12).toString('hex');

  const begin = (account: AccountRow) => {
    const state: BlackjackState = { deck: makeDeck(), playerCards: [], dealerCards: [], status: 'active', payout: 0 };
    state.playerCards.push(drawCard(state), drawCard(state));
    state.dealerCards.push(drawCard(state), drawCard(state));
    openingBlackjackSettlement(state, bet);
    if (state.outcome === 'lose' && state.resultText) {
      state.resultText += `\n\n🫠 ${moneyLossRemark(account.balance + account.bankBalance - bet)}`;
    }
    return { account, state };
  };

  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (await mysqlIsPersonalLoanBankrupt(connection, guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    const active = await mysqlRows<MysqlGameRow[]>(connection,
      "SELECT id, bet, state_json, status FROM economy_games WHERE guild_id = ? AND user_id = ? AND game_type = 'blackjack' AND status = 'active' LIMIT 1 FOR UPDATE",
      [guildId, userId],
    );
    if (active[0]) {
      return { ok: true as const, view: blackjackView(active[0].id, Number(active[0].bet), account.balance, JSON.parse(active[0].state_json) as BlackjackState), existing: true };
    }
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    const { state } = begin(account);
    const now = nowSeconds();
    let balance = account.balance - bet;
    await connection.execute('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [bet, now, guildId, userId]);
    await mysqlAddLedger(connection, guildId, userId, -bet, 'blackjack:bet', `${reference}:bet`, now);
    if (state.payout) {
      balance += state.payout;
      await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [state.payout, now, guildId, userId]);
      await mysqlAddLedger(connection, guildId, userId, state.payout, 'blackjack:payout', `${reference}:payout`, now);
    }
    await connection.execute('INSERT INTO economy_games (id, guild_id, user_id, game_type, bet, status, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [gameId, guildId, userId, 'blackjack', bet, state.status, JSON.stringify(state), now, now]);
    return { ok: true as const, view: blackjackView(gameId, bet, balance, state), existing: false };
  });

  const start = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (sqliteIsPersonalLoanBankrupt(guildId, userId)) return { ok: false as const, reason: 'bankrupt' as const };
    const active = db.prepare("SELECT id, bet, state_json, status FROM economy_games WHERE guild_id = ? AND user_id = ? AND game_type = 'blackjack' AND status = 'active' LIMIT 1")
      .get(guildId, userId) as { id: string; bet: number; state_json: string; status: string } | undefined;
    if (active) return { ok: true as const, view: blackjackView(active.id, active.bet, account.balance, JSON.parse(active.state_json) as BlackjackState), existing: true };
    if (account.balance < bet) return { ok: false as const, reason: 'insufficient_funds' as const };
    const { state } = begin(account);
    const now = nowSeconds();
    let balance = account.balance - bet;
    db.prepare('UPDATE economy_accounts SET balance = balance - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(bet, now, guildId, userId);
    db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, -bet, 'blackjack:bet', `${reference}:bet`, now);
    if (state.payout) {
      balance += state.payout;
      db.prepare('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(state.payout, now, guildId, userId);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, state.payout, 'blackjack:payout', `${reference}:payout`, now);
    }
    db.prepare('INSERT INTO economy_games (id, guild_id, user_id, game_type, bet, status, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(gameId, guildId, userId, 'blackjack', bet, state.status, JSON.stringify(state), now, now);
    return { ok: true as const, view: blackjackView(gameId, bet, balance, state), existing: false };
  });
  return start.immediate();
}

export async function playBlackjackTurn(guildId: string, userId: string, gameId: string, action: 'hit' | 'stand'): Promise<BlackjackView | undefined> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) return withEconomyTransaction(async (connection) => {
    const account = await mysqlEnsureAccount(connection, guildId, userId, true);
    if (await mysqlIsPersonalLoanBankrupt(connection, guildId, userId)) return undefined;
    const games = await mysqlRows<MysqlGameRow[]>(connection, 'SELECT id, bet, state_json, status FROM economy_games WHERE id = ? AND guild_id = ? AND user_id = ? FOR UPDATE', [gameId, guildId, userId]);
    const game = games[0];
    if (!game) return undefined;
    const state = JSON.parse(game.state_json) as BlackjackState;
    if (game.status !== 'active' || state.status !== 'active') return blackjackView(game.id, Number(game.bet), account.balance, state);
    let lastDrawnCard: BlackjackCard | undefined;
    if (action === 'hit') { lastDrawnCard = drawCard(state); state.playerCards.push(lastDrawnCard); }
    else settleAfterTurn(state, Number(game.bet));
    if (action === 'hit' && total(state.playerCards) > 21) settleAfterTurn(state, Number(game.bet));
    if (state.outcome === 'lose' && state.resultText) {
      state.resultText += `\n\n🫠 ${moneyLossRemark(account.balance + account.bankBalance)}`;
    }
    const now = nowSeconds();
    let balance = account.balance;
    if (isBlackjackFinished(state) && state.payout) {
      balance += state.payout;
      await connection.execute('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?', [state.payout, now, guildId, userId]);
      await mysqlAddLedger(connection, guildId, userId, state.payout, 'blackjack:payout', `${game.id}:payout`, now);
    }
    await connection.execute('UPDATE economy_games SET status = ?, state_json = ?, updated_at = ? WHERE id = ?', [state.status, JSON.stringify(state), now, game.id]);
    return blackjackView(game.id, Number(game.bet), balance, state, lastDrawnCard);
  });

  const play = db.transaction(() => {
    const account = sqliteEnsureAccount(guildId, userId);
    if (sqliteIsPersonalLoanBankrupt(guildId, userId)) return undefined;
    const game = db.prepare('SELECT id, bet, state_json, status FROM economy_games WHERE id = ? AND guild_id = ? AND user_id = ?')
      .get(gameId, guildId, userId) as { id: string; bet: number; state_json: string; status: string } | undefined;
    if (!game) return undefined;
    const state = JSON.parse(game.state_json) as BlackjackState;
    if (game.status !== 'active' || state.status !== 'active') return blackjackView(game.id, game.bet, account.balance, state);
    let lastDrawnCard: BlackjackCard | undefined;
    if (action === 'hit') { lastDrawnCard = drawCard(state); state.playerCards.push(lastDrawnCard); }
    else settleAfterTurn(state, game.bet);
    if (action === 'hit' && total(state.playerCards) > 21) settleAfterTurn(state, game.bet);
    if (state.outcome === 'lose' && state.resultText) {
      state.resultText += `\n\n🫠 ${moneyLossRemark(account.balance + account.bankBalance)}`;
    }
    const now = nowSeconds();
    let balance = account.balance;
    if (isBlackjackFinished(state) && state.payout) {
      balance += state.payout;
      db.prepare('UPDATE economy_accounts SET balance = balance + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(state.payout, now, guildId, userId);
      db.prepare('INSERT INTO economy_ledger (guild_id, user_id, amount, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, state.payout, 'blackjack:payout', `${game.id}:payout`, now);
    }
    db.prepare('UPDATE economy_games SET status = ?, state_json = ?, updated_at = ? WHERE id = ?').run(state.status, JSON.stringify(state), now, game.id);
    return blackjackView(game.id, game.bet, balance, state, lastDrawnCard);
  });
  return play.immediate();
}

export async function getInventory(guildId: string, userId: string): Promise<Array<{ itemId: string; quantity: number; acquiredAt: number }>> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>('SELECT item_id AS itemId, quantity, acquired_at AS acquiredAt FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND quantity > 0 ORDER BY acquired_at DESC', [guildId, userId]);
    return rows.map((row) => ({ itemId: String(row.itemId), quantity: Number(row.quantity), acquiredAt: Number(row.acquiredAt) }));
  }
  return db.prepare('SELECT item_id AS itemId, quantity, acquired_at AS acquiredAt FROM economy_inventory WHERE guild_id = ? AND user_id = ? AND quantity > 0 ORDER BY acquired_at DESC')
    .all(guildId, userId) as Array<{ itemId: string; quantity: number; acquiredAt: number }>;
}

export async function getLeaderboard(guildId: string, limit = 10): Promise<Array<{ userId: string; balance: number }>> {
  guildId = GLOBAL_SCOPE_ID;
  if (economyPool) {
    const [rows] = await economyPool.execute<RowDataPacket[]>('SELECT user_id AS userId, balance + bank_balance AS balance FROM economy_accounts WHERE guild_id = ? ORDER BY balance + bank_balance DESC, user_id ASC LIMIT ?', [guildId, limit]);
    return rows.map((row) => ({ userId: String(row.userId), balance: Number(row.balance) }));
  }
  return db.prepare('SELECT user_id AS userId, balance + bank_balance AS balance FROM economy_accounts WHERE guild_id = ? ORDER BY balance + bank_balance DESC, user_id ASC LIMIT ?')
    .all(guildId, limit) as Array<{ userId: string; balance: number }>;
}

export function formatCooldown(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export type EconomyConsumableEffect =
  | { kind: 'rob_shield'; durationSeconds: number }
  | { kind: 'fish_bait'; catchChance: number; rareChance: number; payoutMultiplier: number }
  | { kind: 'tool_repair'; repairAmount: number | 'full' }
  | { kind: 'job_manual'; xp: number };
export type EconomyStoreItem = {
  id: string; name: string; description: string; cost: number; emoji: string; category: string;
  repeatable: boolean; usable: boolean; effect?: EconomyConsumableEffect;
};

export const storeItems: EconomyStoreItem[] = [
  { id: 'cebo_premium', name: 'Cebo premium', description: 'Duplica el premio de una pesca. Requiere una caña y respeta el enfriamiento normal.', cost: 15, emoji: '🪱', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'fish_bait', catchChance: 70, rareChance: 5, payoutMultiplier: 2 } },
  { id: 'escudo_antirrobo', name: 'Escudo antirrobo', description: 'Úsalo para bloquear robos contra ti durante 24 horas. Puedes extender la protección con otro escudo.', cost: 320, emoji: '🛡️', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'rob_shield', durationSeconds: 24 * 60 * 60 } },
  { id: 'kit_reparacion', name: 'Kit de reparación', description: 'Repara 15 puntos de durabilidad de la herramienta de tu oficio activo. No puede rescatar herramientas que ya se rompieron.', cost: 55, emoji: '🧰', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'tool_repair', repairAmount: 15 } },
  { id: 'servicio_taller', name: 'Servicio de taller', description: 'Repara por completo la herramienta de tu oficio activo. Debe conservar al menos 1 punto de durabilidad.', cost: 145, emoji: '🔧', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'tool_repair', repairAmount: 'full' } },
  { id: 'manual_oficio', name: 'Manual de oficio', description: 'Estudia y gana 75 XP para el oficio activo. Requiere tener equipada y en buen estado su herramienta.', cost: 160, emoji: '📗', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'job_manual', xp: 75 } },
  { id: 'escudo_cobre_6h', name: 'Escudo de cobre', description: 'Bloquea robos de monedas y artículos durante 6 horas. Extiende un escudo que ya esté activo.', cost: 95, emoji: '🛡️', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'rob_shield', durationSeconds: 6 * 60 * 60 } },
  { id: 'escudo_robusto_12h', name: 'Escudo reforzado', description: 'Protege monedas e inventario durante 12 horas. Su duración se suma a la protección restante.', cost: 155, emoji: '🔰', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'rob_shield', durationSeconds: 12 * 60 * 60 } },
  { id: 'escudo_acero_36h', name: 'Escudo de acero', description: 'Bloquea robos durante 36 horas y se acumula con la protección restante.', cost: 470, emoji: '🛡️', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'rob_shield', durationSeconds: 36 * 60 * 60 } },
  { id: 'escudo_oro_48h', name: 'Escudo de oro', description: 'Protege monedas y artículos contra robos durante 48 horas.', cost: 620, emoji: '🟡', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'rob_shield', durationSeconds: 48 * 60 * 60 } },
  { id: 'escudo_diamante_72h', name: 'Escudo de diamante', description: 'Protección antirrobo por 72 horas; puedes extenderla aunque ya tengas otro escudo activo.', cost: 920, emoji: '💎', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'rob_shield', durationSeconds: 72 * 60 * 60 } },
  { id: 'escudo_fortaleza_4d', name: 'Escudo de fortaleza', description: 'Bloquea robos de monedas y objetos durante 4 días completos.', cost: 1_500, emoji: '🏰', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'rob_shield', durationSeconds: 4 * 24 * 60 * 60 } },
  { id: 'boveda_portatil_7d', name: 'Bóveda portátil', description: 'El blindaje más duradero: impide robos durante 7 días y se suma al tiempo protegido que quede.', cost: 2_450, emoji: '🔐', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'rob_shield', durationSeconds: 7 * 24 * 60 * 60 } },
  { id: 'cebo_fosforescente', name: 'Cebo fosforescente', description: 'Aumenta la probabilidad de captura y duplica el pago. Necesitas una caña y respetas el cooldown de pesca.', cost: 65, emoji: '🪱', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'fish_bait', catchChance: 80, rareChance: 5, payoutMultiplier: 2 } },
  { id: 'cebo_lago', name: 'Cebo de lago', description: 'Cebo resistente: 85% de captura, premio ×1.5 y cooldown normal de pesca.', cost: 85, emoji: '🐛', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'fish_bait', catchChance: 85, rareChance: 5, payoutMultiplier: 1.5 } },
  { id: 'cebo_marino', name: 'Cebo marino', description: 'Atrae especies poco comunes: 75% de captura, 10% de pez raro y premio ×2.', cost: 150, emoji: '🦐', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'fish_bait', catchChance: 75, rareChance: 10, payoutMultiplier: 2 } },
  { id: 'cebo_calamar', name: 'Cebo de calamar', description: 'Cebo de alto rendimiento: 90% de captura, 8% de rareza y premio ×1.8.', cost: 225, emoji: '🦑', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'fish_bait', catchChance: 90, rareChance: 8, payoutMultiplier: 1.8 } },
  { id: 'cebo_legendario', name: 'Cebo legendario', description: '95% de captura, 20% de pez raro y recompensa ×2.5. Consume el cebo incluso si fallas.', cost: 390, emoji: '🌟', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'fish_bait', catchChance: 95, rareChance: 20, payoutMultiplier: 2.5 } },
  { id: 'cebo_rey_mar', name: 'Cebo rey del mar', description: '80% de captura, 35% de pez raro y recompensa ×3. Requiere caña y cooldown de pesca disponible.', cost: 680, emoji: '👑', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'fish_bait', catchChance: 80, rareChance: 35, payoutMultiplier: 3 } },
  { id: 'kit_reparacion_avanzado', name: 'Kit avanzado de reparación', description: 'Restaura 30 puntos de durabilidad a la herramienta del oficio activo.', cost: 105, emoji: '🧰', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'tool_repair', repairAmount: 30 } },
  { id: 'kit_reparacion_profesional', name: 'Kit profesional de reparación', description: 'Restaura 60 puntos de durabilidad. Requiere una herramienta que no se haya roto.', cost: 195, emoji: '🧰', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'tool_repair', repairAmount: 60 } },
  { id: 'kit_reparacion_maestro', name: 'Kit maestro de reparación', description: 'Restaura 120 puntos de durabilidad a la herramienta del oficio activo.', cost: 340, emoji: '🧰', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'tool_repair', repairAmount: 120 } },
  { id: 'lubricante_herramienta', name: 'Lubricante de herramienta', description: 'Reduce el desgaste acumulado y repara 10 puntos de durabilidad.', cost: 42, emoji: '🛢️', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'tool_repair', repairAmount: 10 } },
  { id: 'piedra_afilado_fina', name: 'Piedra de afilado fina', description: 'Afila la herramienta de trabajo y restaura 22 puntos de durabilidad.', cost: 78, emoji: '🪨', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'tool_repair', repairAmount: 22 } },
  { id: 'repuesto_herramienta', name: 'Repuesto de herramienta', description: 'Repara 40 puntos de durabilidad. No puede reparar una herramienta completamente rota.', cost: 130, emoji: '⚙️', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'tool_repair', repairAmount: 40 } },
  { id: 'kit_aleacion', name: 'Kit de aleación', description: 'Usa piezas de aleación para recuperar 85 puntos de durabilidad.', cost: 235, emoji: '🔩', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'tool_repair', repairAmount: 85 } },
  { id: 'servicio_herreria', name: 'Servicio de herrería', description: 'Restaura al máximo la herramienta activa si aún conserva al menos 1 punto de durabilidad.', cost: 260, emoji: '⚒️', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'tool_repair', repairAmount: 'full' } },
  { id: 'manual_ruta_basico', name: 'Guía práctica de oficio', description: 'Estudia 100 XP para tu oficio activo. Necesitas conservar una herramienta funcional.', cost: 195, emoji: '📘', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'job_manual', xp: 100 } },
  { id: 'manual_ruta_avanzado', name: 'Manual avanzado de oficio', description: 'Aporta 200 XP al oficio activo; requiere una herramienta funcional.', cost: 330, emoji: '📙', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'job_manual', xp: 200 } },
  { id: 'cuaderno_capataz', name: 'Cuaderno del capataz', description: 'Aporta 350 XP al oficio activo. No se puede usar al alcanzar el nivel máximo.', cost: 505, emoji: '📒', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'job_manual', xp: 350 } },
  { id: 'manual_especialista', name: 'Manual de especialista', description: 'Estudia técnicas y gana 500 XP para tu oficio activo.', cost: 720, emoji: '📕', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'job_manual', xp: 500 } },
  { id: 'atlas_profesion', name: 'Atlas profesional', description: 'Guía completa que otorga 750 XP a tu oficio activo.', cost: 990, emoji: '🗺️', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'job_manual', xp: 750 } },
  { id: 'curso_intensivo', name: 'Curso intensivo', description: 'Entrenamiento concentrado: 1,100 XP para el oficio activo.', cost: 1_340, emoji: '🎓', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'job_manual', xp: 1_100 } },
  { id: 'manual_maestria', name: 'Manual de maestría', description: 'Concede 1,600 XP al oficio activo. Requiere herramienta sin romper.', cost: 1_850, emoji: '📚', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'job_manual', xp: 1_600 } },
  { id: 'seminario_oficio', name: 'Seminario de oficio', description: 'Formación profesional de 2,300 XP para el empleo activo.', cost: 2_550, emoji: '🏅', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'job_manual', xp: 2_300 } },
  { id: 'enciclopedia_maestro', name: 'Enciclopedia del maestro', description: 'Un estudio excepcional que otorga 3,200 XP al oficio activo.', cost: 3_400, emoji: '📖', category: 'consumables', repeatable: true, usable: true, effect: { kind: 'job_manual', xp: 3_200 } },
  { id: 'cana_pescar', name: 'Caña de pescar', description: 'Herramienta con 30 puntos de durabilidad base para pescar y trabajar como pescador. La experiencia prolonga su vida; se rompe y debe recomprarse.', cost: 75, emoji: '🎣', category: 'jobs', repeatable: false, usable: false },
  { id: 'pico', name: 'Pico de minero', description: 'Herramienta con 30 puntos de durabilidad base. Se desgasta al trabajar; la experiencia y las mejoras de material aumentan su vida útil.', cost: 75, emoji: '⛏️', category: 'jobs', repeatable: false, usable: false },
  { id: 'hacha', name: 'Hacha de leñador', description: 'Herramienta con 30 puntos de durabilidad base. Se desgasta al trabajar; la experiencia y las mejoras de material aumentan su vida útil.', cost: 70, emoji: '🪓', category: 'jobs', repeatable: false, usable: false },
  { id: 'azada', name: 'Azada de agricultor', description: 'Herramienta con 30 puntos de durabilidad base. Se desgasta al trabajar; la experiencia y las mejoras de material aumentan su vida útil.', cost: 60, emoji: '🌱', category: 'jobs', repeatable: false, usable: false },
  { id: 'mochila_repartidor', name: 'Mochila de reparto', description: 'Herramienta con 30 puntos de durabilidad base. Se desgasta al trabajar; la experiencia y las mejoras de material aumentan su vida útil.', cost: 60, emoji: '🎒', category: 'jobs', repeatable: false, usable: false },
  { id: 'kit_cocinero', name: 'Kit de cocina', description: 'Cuchillo y espátula con 30 puntos de durabilidad base. Mejora su material hasta oro y aumenta su durabilidad.', cost: 70, emoji: '🍳', category: 'jobs', repeatable: false, usable: false },
  { id: 'kit_ganzuas', name: 'Kit de ganzúas', description: 'Herramienta con 30 puntos de durabilidad para trabajar como ladrón. La experiencia prolonga su vida; se rompe y debe recomprarse. Mejora sus materiales hasta oro.', cost: 80, emoji: '🗝️', category: 'jobs', repeatable: false, usable: false },
  { id: 'kit_detective', name: 'Maletín de investigación', description: 'Lupa, linterna y equipo de huellas con 30 puntos de durabilidad. La experiencia prolonga su vida; se rompe y debe recomprarse. Mejora sus materiales hasta oro.', cost: 85, emoji: '🕵️', category: 'jobs', repeatable: false, usable: false },
] as const;
