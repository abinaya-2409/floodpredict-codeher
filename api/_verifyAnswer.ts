/**
 * Checking the assistant against the data it was given.
 *
 * The prompt tells the model never to invent, round or adjust a figure about
 * this city. Prompts are asked, not enforced, and the one place this
 * application cannot afford to be persuasive-but-wrong is a number an officer
 * acts on. So every answer is checked against the same snapshot the model was
 * handed, and an answer that fails is sent back to be corrected.
 *
 * Three kinds of failure, which is all that can be checked mechanically:
 *
 *   invented - a figure in a sentence about a ward that is nowhere in the data
 *   altered  - the same, but close to a real figure: a rounded or drifted one,
 *              which is the more dangerous of the two because it reads right
 *   misnamed - a ward, zone or shelter named that does not exist here
 *
 * What is deliberately NOT checked
 * --------------------------------
 * General conversation. "Chennai gets about 1,400 mm a year" is the model's
 * own knowledge, correctly offered, and has no business being measured
 * against a snapshot of one simulated afternoon. So a figure is only held to
 * the data when the sentence it sits in is about this city's wards - that is
 * the sentence where being wrong costs something. Everywhere else the model
 * is free, which is the whole reason the assistant is worth talking to.
 */

export type VerificationKind = 'invented' | 'altered' | 'misnamed';

export interface Verification {
  kind: VerificationKind;
  /** The offending text exactly as the model wrote it. */
  value: string;
  /** The nearest real figure, when there is one. Empty for invented/misnamed. */
  expected: string;
  /** The sentence it appeared in, trimmed, for the log and the retry prompt. */
  context: string;
}

/** Facts pulled out of the snapshot once, so a retry does not re-parse it. */
export interface SnapshotFacts {
  /**
   * Every name the data contains, including the city and state. Used to
   * decide whether a capitalised word is a real place here.
   */
  names: Set<string>;
  /**
   * Ward and shelter names only.
   *
   * Deliberately excludes the city and the state, which are what a general
   * remark is most likely to mention: "Tamil Nadu gets about 1,400 mm a year"
   * is the model's own knowledge, correctly offered, and must not be read as
   * a claim about the snapshot merely because it says "Tamil Nadu".
   */
  wardNames: Set<string>;
  /** Every number in the snapshot, normalised (commas stripped). */
  numbers: Set<string>;
  /** The same, as numbers, for the "is this a rounded version" test. */
  numeric: number[];
}

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

/** Words that are capitalised for reasons other than being a place here. */
const NOT_A_PLACE = new Set(
  [
    'a', 'an', 'the', 'this', 'that', 'these', 'those', 'it', 'its', 'i', 'we',
    'you', 'they', 'he', 'she', 'and', 'but', 'or', 'if', 'so', 'then', 'than',
    'there', 'their', 'here', 'when', 'where', 'while', 'with', 'without',
    'from', 'into', 'onto', 'about', 'above', 'below', 'under', 'over', 'for',
    'because', 'both', 'each', 'every', 'most', 'more', 'less', 'least',
    'first', 'second', 'third', 'next', 'last', 'now', 'today', 'tomorrow',
    'yesterday', 'tonight', 'morning', 'evening', 'night',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
    'september', 'october', 'november', 'december',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    'sunday',
    // Things the assistant legitimately talks about that are not wards here.
    'india', 'indian', 'tamil', 'nadu', 'bay', 'bengal', 'arabian', 'sea',
    'cyclone', 'monsoon', 'northeast', 'north', 'south', 'east', 'west',
    'vri', 'ndrf', 'sdrf', 'imd', 'report', 'summary', 'summarise', 'watch',
    'warning', 'advisory', 'evacuate', 'routine', 'critical', 'severe', 'high',
    'moderate', 'low', 'hazard', 'exposure', 'fragility', 'coping', 'deficit',
    'ward', 'wards', 'zone', 'zones', 'shelter', 'shelters', 'assistant',
    'floodylink',
  ].map((w) => w.toLowerCase())
);

/**
 * Whether a sentence is making a claim about this city's wards.
 *
 * Either it names one, or it uses the operational vocabulary that only makes
 * sense about the modelled situation. General weather talk trips neither.
 */
const WARD_CONTEXT_RE =
  /\b(ward|zone|catchment|shelter|evacuat\w*|dispatch\w*|inundat\w*|vri|lead time|at risk|assisted)\b/i;

function normaliseNumber(raw: string): string {
  return raw.replace(/,/g, '');
}

export function readSnapshot(snapshot: string): SnapshotFacts {
  const names = new Set<string>();
  const wardNames = new Set<string>();
  const numbers = new Set<string>();
  const numeric: number[] = [];

  const addName = (raw: string, ward: boolean) => {
    const name = raw.trim();
    if (!name) return;
    const lower = name.toLowerCase();
    // A "name" that is only a direction or a risk band is part of a ward's
    // title, not a ward. Treating "North" as one makes every mention of the
    // north-east monsoon look like a claim about this data.
    if (!NOT_A_PLACE.has(lower)) {
      names.add(lower);
      if (ward) wardNames.add(lower);
    }
    for (const word of name.split(/\s+/)) {
      const w = word.replace(/[()&,.]/g, '').toLowerCase();
      if (w.length > 2 && !NOT_A_PLACE.has(w)) {
        names.add(w);
        if (ward) wardNames.add(w);
      }
    }
  };

  /*
   * Parsed line by line rather than with one pattern over the whole text,
   * because a ward may be called "Kolathur & Perambur (North)" - brackets and
   * all - and a shelter line puts its ward in brackets too. Told apart by
   * what follows the colon: a ward line is the only one that says VRI.
   */
  for (const line of snapshot.split(/\r?\n/)) {
    if (!line.startsWith('- ')) continue;

    const ward = line.match(/^- (.+?): VRI /);
    if (ward) {
      addName(ward[1], true);
      continue;
    }

    const shelter = line.match(/^- (.+?) \(([^)]*)\): /);
    if (shelter) {
      addName(shelter[1], true);
      addName(shelter[2], true);
    }
  }

  // "CITY: Chennai, Tamil Nadu" - known places, but not ward names.
  const city = snapshot.match(/^CITY:\s*(.+)$/m);
  if (city) for (const part of city[1].split(',')) addName(part, false);

  for (const m of snapshot.matchAll(NUMBER_RE)) {
    const n = normaliseNumber(m[0]);
    numbers.add(n);
    const parsed = Number.parseFloat(n);
    if (Number.isFinite(parsed)) numeric.push(parsed);
  }

  return { names, wardNames, numbers, numeric };
}

/**
 * The nearest snapshot figure to a given value, if one is close enough to
 * suggest the model rounded or drifted rather than invented outright.
 */
function nearestReal(value: number, numeric: number[]): number | null {
  let best: number | null = null;
  let bestGap = Infinity;
  for (const real of numeric) {
    if (real === value || real === 0) continue;
    const gap = Math.abs(real - value) / Math.abs(real);
    if (gap <= 0.15 && gap < bestGap) {
      bestGap = gap;
      best = real;
    }
  }
  return best;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Check an answer against the snapshot it was supposed to be drawn from.
 *
 * Returns every problem found. An empty array means the answer made no claim
 * about this city that the data does not support - which is not the same as
 * the answer being true, only that it is not inventing figures.
 */
export function verifyAnswer(reply: string, facts: SnapshotFacts): Verification[] {
  const found: Verification[] = [];

  for (const sentence of sentences(reply)) {
    const namesHere: string[] = [];
    for (const name of facts.wardNames) {
      // Word-boundary match so "Ada" does not match inside "Adayar".
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(sentence)) namesHere.push(name);
    }

    const operational = namesHere.length > 0 || WARD_CONTEXT_RE.test(sentence);
    if (!operational) continue;

    // Figures in a sentence about this city must be the city's own figures.
    for (const m of sentence.matchAll(NUMBER_RE)) {
      const raw = m[0];
      const norm = normaliseNumber(raw);
      if (facts.numbers.has(norm)) continue;

      const value = Number.parseFloat(norm);
      if (!Number.isFinite(value)) continue;

      // Small integers are ordinals and counts far more often than they are
      // claims - "the first three wards", "both shelters". Flagging them
      // produces noise that drowns the findings that matter.
      if (Number.isInteger(value) && value <= 10) continue;

      const near = nearestReal(value, facts.numeric);
      found.push({
        kind: near === null ? 'invented' : 'altered',
        value: raw,
        expected: near === null ? '' : String(near),
        context: sentence,
      });
    }

    // Places named in an operational sentence must be places that exist here.
    if (WARD_CONTEXT_RE.test(sentence)) {
      for (const m of sentence.matchAll(/\b([A-Z][a-z]{2,})(?:\s+([A-Z][a-z]{2,}))?/g)) {
        const phrase = m[0].trim();
        const lower = phrase.toLowerCase();
        if (facts.names.has(lower)) continue;
        if (lower.split(/\s+/).every((w) => NOT_A_PLACE.has(w))) continue;
        // A capital at the start of a sentence says nothing about the word.
        if (sentence.startsWith(phrase) && !phrase.includes(' ')) continue;
        if (facts.names.has(lower.split(/\s+/)[0])) continue;
        found.push({ kind: 'misnamed', value: phrase, expected: '', context: sentence });
      }
    }
  }

  return dedupe(found);
}

function dedupe(items: Verification[]): Verification[] {
  const seen = new Set<string>();
  const out: Verification[] = [];
  for (const v of items) {
    const key = `${v.kind}:${v.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * What to tell the model so it can fix it.
 *
 * Names each problem and the figure that was actually available, because
 * "you got something wrong" produces another guess, while "you wrote 47, the
 * data says 45" produces a correction.
 */
export function correctionPrompt(problems: Verification[]): string {
  const lines = [
    'Your previous answer used figures and names that are not in the SNAPSHOT.',
    'Rewrite it. Keep the same meaning and tone, fix only what is listed here.',
    '',
  ];

  for (const p of problems) {
    if (p.kind === 'altered') {
      lines.push(`- You wrote "${p.value}". The snapshot says ${p.expected}. Use that figure.`);
    } else if (p.kind === 'invented') {
      lines.push(
        `- You wrote "${p.value}", which is not in the snapshot. Remove it, or ` +
          'replace it with a figure that is.'
      );
    } else {
      lines.push(
        `- You named "${p.value}", which is not a place in this data. Use only ` +
          'the wards and shelters listed in the snapshot.'
      );
    }
  }

  lines.push('', 'Do not add any new figure that is not in the snapshot.');
  return lines.join('\n');
}
