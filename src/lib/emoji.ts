export type EmojiCategoryId = 'smileys' | 'gestures' | 'symbols' | 'objects';
export type Emoji = { char: string; keywords: string[] };
export type EmojiCategory = { id: EmojiCategoryId; emojis: Emoji[] };

// One emoji per line: the character, then German and English search words.
const SOURCE: Record<EmojiCategoryId, string> = {
  smileys: `
😊 lächeln froh freundlich smile happy blush
🙂 lächeln leicht slight smile
😀 grinsen freude grin happy
😃 freude lachen smiley happy
😄 lachen strahlen laugh smile
😁 strahlen grinsen beam grin
😆 lachen laughing
😅 erleichtert schweiß puh sweat relief
😂 tränen lachen joy tears
🙃 kopfüber ironisch upside down
😉 zwinkern wink
😇 unschuldig engel innocent angel
😍 verliebt herzaugen love heart eyes
🥰 liebe herzen love hearts
😘 kuss kiss
😋 lecker yum
😎 cool sonnenbrille sunglasses
🤓 nerd brille glasses
🤔 nachdenken überlegen hmm thinking
🤨 skeptisch fragend skeptical
😐 neutral
😑 ausdruckslos expressionless
🙄 augenrollen eye roll
😏 grinsen schmunzeln smirk
😬 grimasse ups oops grimace
😌 erleichtert zufrieden relieved
😴 schlafen müde sleep tired
😷 maske krank mask sick
🤒 krank fieber sick fever
🤧 erkältet niesen sneeze cold
😮 überrascht staunen wow surprised
😲 schockiert erstaunt astonished shocked
😳 verlegen rot flushed
🥺 bitte flehen pleading
😢 traurig weinen sad cry
😭 weinen heulen sob
😤 genervt frust huff
😠 wütend böse angry
😡 sauer wut rage
🤯 überfordert explodiert mind blown
🥳 feiern party celebrate
🤗 umarmung drücken hug
`,
  gestures: `
👍 daumen hoch gut ja ok thumbs up yes
👎 daumen runter schlecht nein thumbs down no
👌 ok perfekt okay perfect
🙏 danke bitte thanks please
🤝 handschlag abgemacht deal handshake
👋 winken hallo tschüss wave hello bye
👏 klatschen applaus bravo clap
🙌 hurra hände jubel hooray celebrate
💪 stark muskel strong
✌️ peace sieg victory
🤞 daumen drücken glück fingers crossed luck
🤙 ruf an anrufen call me
✋ stopp halt hand stop
🤚 hand melden raised hand
☝️ hinweis achtung moment index
👉 rechts zeigen right point
👈 links zeigen left point
👆 oben hoch up
👇 unten runter down
✍️ schreiben unterschreiben write sign
👀 augen schauen ansehen look eyes
🤷 achselzucken weiß nicht shrug
🙋 melden frage raise hand question
🤦 facepalm oh nein
`,
  symbols: `
✅ erledigt fertig haken ja done check yes
☑️ abgehakt checkbox checked
✔️ haken richtig check
❌ nein falsch abgelehnt kreuz cross no wrong
❗ wichtig ausrufezeichen important exclamation
❓ frage fragezeichen question
⚠️ warnung achtung vorsicht warning caution
⛔ verboten stopp no entry
🚫 verboten nicht erlaubt prohibited
❤️ herz liebe rot heart love red
🧡 herz orange heart
💛 herz gelb yellow heart
💚 herz grün green heart
💙 herz blau blue heart
💜 herz lila purple heart
🖤 herz schwarz black heart
🤍 herz weiß white heart
💔 herz gebrochen broken heart
💯 hundert perfekt hundred
⭐ stern favorit star
🌟 stern glänzen glow star
✨ glitzer neu sauber sparkles new clean
🔥 feuer heiß dringend fire hot urgent
💡 idee tipp idea bulb tip
🎉 feier glückwunsch party congratulations
🎊 konfetti feier confetti
🆕 neu new
🆗 ok okay
➡️ weiter pfeil rechts arrow right next
⬅️ zurück pfeil links arrow left back
🔄 wiederholen aktualisieren repeat refresh
⏰ wecker zeit frist alarm time deadline
⏳ warten sanduhr wait hourglass
🕐 uhr uhrzeit clock time
`,
  objects: `
📅 kalender termin datum calendar date appointment
🗓️ planer kalender planner calendar
📍 ort standort adresse pin location address
🗺️ karte route map
📞 telefon anruf anrufen phone call
📱 handy smartphone mobile phone
💬 nachricht chat sprechblase message
✉️ brief post umschlag letter envelope mail
📧 email e-mail mail
📷 foto kamera bild photo camera picture
📸 foto blitz photo flash
🖼️ bild gemälde picture image
📎 anhang büroklammer attachment paperclip
📄 dokument seite datei document page file
📋 klemmbrett liste checkliste clipboard list
📝 notiz memo protokoll note
✏️ stift bearbeiten pencil edit
📌 pin anheften pushpin
🧾 rechnung beleg quittung receipt invoice
💶 euro geld preis money price
💳 karte zahlung kreditkarte card payment
💰 geld geldsack money bag
🏦 bank überweisung bank transfer
📦 paket lieferung karton package parcel box
🚚 lieferung transport abholung lkw delivery truck pickup
🚗 auto fahrt car drive
🏠 haus zuhause wohnung home house
🏢 büro firma gebäude office building
🏭 werkstatt fabrik factory workshop
🔑 schlüssel key
🧽 schwamm reinigen putzen sponge clean
🧼 seife waschen soap wash
🧹 besen fegen kehren broom sweep
🧺 korb wäsche basket laundry
🪣 eimer bucket
🧴 flasche reiniger mittel bottle cleaner
🧤 handschuhe gloves
💧 wasser tropfen nass water drop wet
🛠️ werkzeug reparatur tools repair
🔧 schraubenschlüssel werkzeug wrench tool
🧵 faden nähen thread sew
🧶 garn wolle yarn wool
📏 lineal maß messen ruler measure
☕ kaffee pause coffee break
`,
};

function parse(src: string): Emoji[] {
  return src
    .trim()
    .split('\n')
    .map((line) => {
      const [char = '', ...words] = line.trim().split(/\s+/);
      return { char, keywords: words.map(fold) };
    });
}

export const EMOJI_CATEGORIES: EmojiCategory[] = (Object.keys(SOURCE) as EmojiCategoryId[]).map(
  (id) => ({ id, emojis: parse(SOURCE[id]) }),
);

/** Lower case without diacritics, so "mude" finds "müde". */
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** Emojis whose keywords start with every word of the query (German or English). */
export function searchEmoji(query: string, categories = EMOJI_CATEGORIES): string[] {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const out: string[] = [];
  for (const cat of categories) {
    for (const e of cat.emojis) {
      if (tokens.every((tok) => e.keywords.some((k) => k.startsWith(tok)))) out.push(e.char);
    }
  }
  return out;
}

export const RECENT_EMOJI_KEY = 'chat-emoji-recent';
export const RECENT_EMOJI_MAX = 8;

/** Most recent first, no duplicates, capped. */
export function pushRecent(list: string[], char: string, max = RECENT_EMOJI_MAX): string[] {
  return [char, ...list.filter((c) => c !== char)].slice(0, max);
}

export function readRecentEmoji(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_EMOJI_KEY) ?? '[]') as unknown;
    return Array.isArray(raw)
      ? raw.filter((c): c is string => typeof c === 'string').slice(0, RECENT_EMOJI_MAX)
      : [];
  } catch {
    return [];
  }
}

export function writeRecentEmoji(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(list));
  } catch {
    // Private mode: the picker still works, it just forgets.
  }
}

export type GridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

/** Roving focus over buttons laid out in rows (sections may end mid-row): next index for a key. */
export function moveInGrid(
  positions: Array<{ x: number; y: number }>,
  index: number,
  key: GridKey,
): number {
  const last = positions.length - 1;
  if (last < 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  if (key === 'ArrowLeft') return Math.max(0, index - 1);
  if (key === 'ArrowRight') return Math.min(last, index + 1);
  const cur = positions[index];
  if (!cur) return index;
  const down = key === 'ArrowDown';
  let rowY: number | null = null;
  for (const p of positions) {
    if (down ? p.y > cur.y : p.y < cur.y) {
      if (rowY === null || (down ? p.y < rowY : p.y > rowY)) rowY = p.y;
    }
  }
  if (rowY === null) return index;
  let best = index;
  let bestDx = Infinity;
  positions.forEach((p, i) => {
    if (p.y !== rowY) return;
    const dx = Math.abs(p.x - cur.x);
    if (dx < bestDx) {
      best = i;
      bestDx = dx;
    }
  });
  return best;
}
