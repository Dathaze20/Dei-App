// utils/assistant/parseCommand.ts
//
// The LOCAL command reader: fixed sentence patterns, no AI model. It understands a short list of
// deli commands (English, and the basic Spanish ones) and says plainly when it does not
// understand; it never guesses an action from a sentence it cannot read.
//
//   add      "add two cases of Arizona green tea and one fruit punch", "put 3 pepsi on my list"
//   remove   "remove fruit punch", "take the pepsi back off", "remove that one"
//   set      "make green tea three instead", "change pepsi to 4", "set it to 2"
//   review   "show my order", "what's on the Arizona order"
//   need     "what do we need for tomorrow's Arizona delivery", "build the Arizona order"
//   usual    "what do we usually order from Arizona", "usual weekly Arizona"
//   stock    "how many fruit punch do we have", "stock of diet pepsi"
//   delivery "Arizona delivers on Tuesday and Friday"
//   weekly   "we usually take eight cases of green tea every Tuesday"
//   undo · setup ("set up my store") · photo ("look at the photo") · send (refused) · help
import { normalize } from './catalogSearch';
import { Weekday } from '../storeProfile';

export interface ItemRequest {
  /** What was said for the product, or null for "that one" / "it". */
  query: string | null;
  quantity: number | null;
  /** The word said for the unit, if any (the supplier's own unit is always used). */
  unitWord: 'case' | 'item' | null;
}

export type Intent =
  | { type: 'add'; items: ItemRequest[] }
  | { type: 'remove'; items: ItemRequest[] }
  | { type: 'set'; items: ItemRequest[] }
  | { type: 'review'; text: string }
  | { type: 'need'; text: string }
  | { type: 'usual'; text: string }
  | { type: 'stock'; query: string }
  | { type: 'delivery'; text: string; days: Weekday[] }
  | { type: 'weekly'; query: string; quantity: number; days: Weekday[] }
  | { type: 'undo' }
  | { type: 'setup' }
  | { type: 'photo' }
  | { type: 'send' }
  | { type: 'help' }
  | { type: 'unknown' }
  /** A number or words that could only mean a quantity that is not a whole number 1–999. */
  | { type: 'bad-quantity'; said: string };

const NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, couple: 2, dozen: 12,
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12,
};

const DAYS: Record<string, Weekday> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

const REFERENCE = /^(that|that one|this|this one|it|them|those|the last one|ese|esa|eso)$/;

export const daysIn = (text: string): Weekday[] =>
  [...new Set(normalize(text).split(' ').map(w => DAYS[w.replace(/s$/, '')] ?? DAYS[w]).filter((d): d is Weekday => d !== undefined))].sort((a, b) => a - b);

/** "two cases of green tea" → { quantity 2, unitWord 'case', query 'green tea' }. */
const readItem = (raw: string): ItemRequest | { bad: string } => {
  let text = raw.trim().replace(/^(and|also|plus|y|tambien)\s+/, '');
  let quantity: number | null = null;
  const first = text.split(' ')[0];
  if (/^\d+(\.\d+)?$/.test(first)) {
    const n = Number(first);
    if (!Number.isInteger(n) || n < 1 || n > 999) return { bad: first };
    quantity = n;
    text = text.slice(first.length).trim();
  } else if (first in NUMBERS && !(first === 'a' && /^a (lot|few)\b/.test(text))) {
    quantity = NUMBERS[first];
    text = text.slice(first.length).trim();
    if (first === 'couple' || text.startsWith('of ')) text = text.replace(/^of\s+/, '');
  } else if (/^(zero|0|none|ninguna|cero)$/.test(first)) return { bad: first };
  let unitWord: ItemRequest['unitWord'] = null;
  const unit = text.match(/^(cases?|boxes?|cajas?|items?|pieces?|unidades?)\b\s*(of|de)?\s*/);
  if (unit) {
    unitWord = /^(item|piece|unidad)/.test(unit[1]) ? 'item' : 'case';
    text = text.slice(unit[0].length);
  }
  text = text.replace(/\b(cases?|cajas?)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return { query: REFERENCE.test(text) || text === '' ? null : text, quantity, unitWord };
};

const splitItems = (text: string): string[] =>
  text
    .split(/\s*(?:,|\band also\b|\band then\b|\bplus\b|\band\b(?=\s+(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple|dozen)\b)|\by\b(?=\s+(?:\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b))\s*/)
    .filter(Boolean);

const items = (text: string): ItemRequest[] | { bad: string } => {
  const out: ItemRequest[] = [];
  for (const part of splitItems(text)) {
    const item = readItem(part);
    if ('bad' in item) return item;
    out.push(item);
  }
  return out;
};

const trailing = /\s*(to|on|onto|in|into|from|off|of)?\s*(the|my|our|this)?\s*(list|order|draft|pedido|lista)\b.*$/;

export const parseCommand = (input: string): Intent => {
  // Commas separate products like "and" does ("two green tea, one fruit punch").
  const text = normalize(input.replace(/,/g, ' and ')).replace(/\b(please|por favor|can you|could you|i want to|i need you to|let s|lets)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { type: 'unknown' };
  // Spoken fillers in front of a command: "now add…", "ok, take the pepsi off".
  const filler = /^(now|ok|okay|alright|and|also|then|so|hey|um|uh|y|ahora|bueno|entonces)\s+/;
  let stripped = text;
  while (filler.test(stripped)) stripped = stripped.replace(filler, '');
  if (stripped !== text) return parseCommand(stripped);

  if (/^(undo|undo that|deshacer|go back|take that back)$/.test(text)) return { type: 'undo' };
  if (/^(help|what can you do|que puedes hacer|ayuda)\b/.test(text)) return { type: 'help' };
  if (/\b(set ?up|setup|configure|teach you|learn) (my |the |our )?(store|deli|shop)\b|\bconfigurar (mi )?(tienda|deli)/.test(text)) return { type: 'setup' };
  if (/\b(photo|picture|foto|image|camera)\b/.test(text) && /\b(look|see|check|analy[sz]e|read|count|mira|revisa)\b/.test(text)) return { type: 'photo' };
  if (/\b(send|text|email|share|submit|place|envia|enviar|manda)\b.*\b(order|list|pedido|it|that)\b/.test(text) && !/\bdon ?t\b|\bdo not\b|\bno\b/.test(text)) return { type: 'send' };

  // Teaching: "we usually take eight cases of green tea every tuesday"
  const weekly = text.match(/^(?:we |i )?(?:usually|normally|typically|always)? ?(?:take|order|get|buy|sell|use|need|pedimos|compramos) (.+?)(?: (?:every|each|a|per|cada|por) (week|weekly|semana|sunday|monday|tuesday|wednesday|thursday|friday|saturday|lunes|martes|miercoles|jueves|viernes|sabado|domingo)s?)(.*)$/);
  if (weekly && /\b(usually|normally|typically|always|every|each|per|cada)\b/.test(text)) {
    const read = readItem(weekly[1]);
    if ('bad' in read) return { type: 'bad-quantity', said: read.bad };
    if (read.query && read.quantity !== null) return { type: 'weekly', query: read.query, quantity: read.quantity, days: daysIn(`${weekly[2]} ${weekly[3]}`) };
  }
  // "Arizona delivers (on) Tuesday and Friday"
  if (/\b(deliver|delivers|delivery|deliveries|comes|come|entrega|viene)\b/.test(text) && daysIn(text).length && !/\bwhat|when|which|cuando|que\b/.test(text)) {
    return { type: 'delivery', text, days: daysIn(text) };
  }

  if (/\b(how (many|much)|cuant[oa]s?)\b.*\b(have|left|got|stock|hay|tenemos|on hand|in stock)\b|^(stock|inventory) (of|for) /.test(text)) {
    const query = text
      .replace(/\b(how (many|much)|cuant[oa]s?|do|we|i|have|left|got|in stock|on hand|stock|of|for|hay|tenemos|inventory|is|are|there|the)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return query ? { type: 'stock', query } : { type: 'unknown' };
  }
  if (/\b(usual|usually|normally|typical|typically|regular|each week|every week|weekly|siempre|normalmente)\b/.test(text) && /\b(order|ordered|quantit|take|get|buy|pedimos|pedido|cases|how much|how many)\b/.test(text)) return { type: 'usual', text };
  if (/\b(what do we need|what should (we|i) order|suggest|recommend|build|prepare|draft|what s low|whats low|que necesitamos|sugiere)\b/.test(text)) return { type: 'need', text };
  if (/^(show|review|open|see|check|read|what s on|whats on|what is on|muestra|ver)\b.*\b(order|list|draft|pedido|lista)\b|^(my )?(order|list)$/.test(text)) return { type: 'review', text };

  const add = text.match(/^(?:add|put|get|throw|order|i need|we need|need|anade|agrega|agregar|anadir|pon|ponme)\s+(.+)$/);
  if (add) {
    const body = add[1].replace(trailing, '').replace(/\s+(on|to|in|en|a) (it|there)$/, '').trim();
    const read = items(body);
    if ('bad' in read) return { type: 'bad-quantity', said: read.bad };
    return read.length ? { type: 'add', items: read } : { type: 'unknown' };
  }
  const remove = text.match(/^(?:remove|delete|drop|cancel|take|scratch|quita|quitar|elimina|eliminar|borra|saca)\s+(.+)$/);
  if (remove) {
    const body = remove[1].replace(/\b(back )?(off|out)\b.*$/, '').replace(trailing, '').replace(/\s+(back|from it)$/, '').trim();
    const read = items(body);
    if ('bad' in read) return { type: 'bad-quantity', said: read.bad };
    return { type: 'remove', items: read.length ? read : [{ query: null, quantity: null, unitWord: null }] };
  }
  // "make green tea three instead", "change pepsi to 4", "set it to 2", "green tea 3 instead"
  const set =
    text.match(/^(?:make|change|set|update|cambia|pon)\s+(.+?)\s+(?:to\s+|a\s+)?(\d+(?:\.\d+)?|[a-z]+)\s*(?:cases?|items?|cajas?)?\s*(?:instead|en vez)?$/) ??
    text.match(/^(.+?)\s+(\d+(?:\.\d+)?|[a-z]+)\s*(?:cases?|cajas?)?\s+(?:instead|en vez)$/);
  if (set) {
    const word = set[2];
    const n = /^\d/.test(word) ? Number(word) : NUMBERS[word];
    if (n !== undefined) {
      if (!Number.isInteger(n) || n < 1 || n > 999) return { type: 'bad-quantity', said: word };
      const query = set[1].replace(/\b(the|my)\b/g, ' ').replace(/\s+/g, ' ').trim();
      return { type: 'set', items: [{ query: REFERENCE.test(query) ? null : query, quantity: n, unitWord: null }] };
    }
  }
  return { type: 'unknown' };
};
