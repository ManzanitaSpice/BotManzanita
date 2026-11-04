import { randomInt } from 'node:crypto';
const answers = [
    'Sí, y con bastante confianza.',
    'Todo apunta a que sí.',
    'Parece que sí, pero no lo grites todavía.',
    'Hoy las probabilidades están de tu lado.',
    'Definitivamente sí.',
    'Puedes contar con ello.',
    'Las señales son muy favorables.',
    'Sin duda.',
    'Mi respuesta es sí.',
    'Es muy probable.',
    'Sí, cuando menos lo esperes.',
    'La suerte dice que sí.',
    'No cuentes con ello.',
    'Definitivamente no.',
    'Las señales dicen que no.',
    'Mi respuesta es no.',
    'No parece buena idea.',
    'Es muy poco probable.',
    'Mejor no lo hagas.',
    'No por ahora.',
    'Las probabilidades están en tu contra.',
    'No apostaría por eso.',
    'La respuesta es un rotundo no.',
    'Hoy no se ve en tu futuro.',
    'Vuelve a preguntar más tarde.',
    'No puedo decidirlo todavía.',
    'Las señales están algo confusas.',
    'Puede que sí, puede que no.',
    'Es difícil saberlo ahora.',
    'No tengo una respuesta clara.',
    'Pregunta de nuevo cuando tengas más pistas.',
    'El futuro aún no está escrito.',
    'La bola está reconsiderando la pregunta.',
    'Mi bola de cristal necesita reiniciarse.',
    'La respuesta está detrás de otra taza de té.',
    'Pregúntale a alguien que haya dormido bien.',
    'El universo dejó el mensaje en visto.',
    'Eso depende de cuántas monedas tengas.',
    'Los astros piden más contexto.',
    'La bola dice: sorpréndeme.',
];
export function answerEightBall() {
    return answers[randomInt(answers.length)];
}
export function eightBallAnswerCount() {
    return answers.length;
}
