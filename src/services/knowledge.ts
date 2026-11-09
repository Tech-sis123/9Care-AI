import fs from 'fs';
import path from 'path';

/**
 * Picks the few pieces of reference material that matter for one question, so the
 * AI gets a small, relevant prompt instead of whole guideline documents.
 *
 * - WHO guideline chunks: data/knowledge/guidance_chunks.json, built from the PDFs
 *   in docs/ by `npm run kb:build`. Written for health workers, so they are marked
 *   for the doctor assistant only.
 * - Example answers: the clinical team's question sets in data/ai-eval/*.json
 *   (also used by `npm run ai:eval`), for the patient assistant.
 *
 * Search is BM25 keyword scoring in memory (the material is a few MB), with
 * Pidgin and everyday words mapped to the clinical words the documents use.
 */

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const GUIDANCE_FILE = path.join(DATA_DIR, 'knowledge', 'guidance_chunks.json');
const EXAMPLES_DIR = path.join(DATA_DIR, 'ai-eval');

export interface GuidanceChunk {
  id: string;
  /** Short source name, e.g. "WHO ANC recommendations (2016)" */
  source: string;
  /** Nearest heading in the document */
  title: string;
  /** Page(s) in the PDF, e.g. "45" or "45-46" */
  pages: string;
  text: string;
  /** Mentions a dose or quantity of medicine (kept out of the patient assistant's prompt) */
  has_doses: boolean;
  /** 'doctor': only for the doctor assistant (e.g. health-system and data documents) */
  audience: 'all' | 'doctor';
}

export interface ExampleAnswer {
  /** "<question set>#<id>", e.g. "emergency_triage_v1#12" */
  key: string;
  language: string;
  question: string;
  answer: string;
  urgency: string;
}

/** Rough token count (about 4 characters per token for English). */
export const approxTokens = (text: string) => Math.ceil(text.length / 4);

// ── Words ────────────────────────────────────────────────────

const STOPWORDS = new Set(
  (
    'a an the and or but if of to in on at by for from with without about into over under is are was were be been being am ' +
    'do does did done have has had having can could should would will shall may might must this that these those there here ' +
    'what which who whom whose when where why how it its i me my mine you your yours we our us they them their she her he him his ' +
    'so too very just also than then not no yes all any some more most other such only own same as up down out off again ' +
    'please pls doctor dr okay ok thanks thank hello hi ' +
    // Nigerian Pidgin function words
    'dey na wetin abi una abeg sef oya dem don wan go fit make say e im wey sha o oo ehn shey sabi'
  ).split(/\s+/)
);

/** Light stemming so "bleeding", "bleeds" and "bled" mostly meet. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/**
 * Everyday English and Pidgin words (left) -> words the guidelines use (right).
 * Matched against the question's words or phrases before searching.
 */
const LAY_TERMS: [RegExp, string][] = [
  [/\bbelle\b/, 'abdomen abdominal stomach pregnancy'],
  [/\b(pikin|baby|babies)\b/, 'baby fetal fetus newborn'],
  [/\b(move|moving|movement|kick|kicking)\b/, 'fetal movement movements'],
  [/\b(blood|bleed|bleeding|bled|spotting|spot)\b/, 'bleeding haemorrhage hemorrhage vaginal'],
  [/\b(plenty|heavy|heavily|soak\w*|clots?)\b/, 'heavy bleeding haemorrhage'],
  [/\bwater\b.*\b(break|broke|leak|comot|pour|rush)|\b(break|broke|leak|leaking)\b.*\bwater\b/, 'rupture membranes amniotic fluid prelabour'],
  [/\b(headache|head dey pain|head pain)\b/, 'headache pre-eclampsia hypertension'],
  [/\b(blur\w*|eye dey|see well|vision)\b/, 'vision blurred pre-eclampsia'],
  [/\b(swell|swelling|swollen|swole)\b/, 'oedema edema swelling pre-eclampsia'],
  // Not "fit": in Pidgin it means "can" ("I fit chop beans?")
  [/\b(fits|convuls\w*|jerk\w*|shaking|seizure\w*)\b/, 'convulsions eclampsia seizure'],
  [/\b(fever|hot body|body hot|body dey hot|temperature|shiver|chills)\b/, 'fever temperature infection malaria sepsis'],
  [/\bmalaria\b/, 'malaria IPTp sulfadoxine-pyrimethamine bednet'],
  [/\b(vomit|vomiting|throw up|throwing up|nausea|nauseous|morning sickness)\b/, 'nausea vomiting hyperemesis'],
  [/\b(urine|wee|pee|piss|toilet)\b/, 'urine urinary urination infection'],
  [/\b(low blood|blood low|blood level|anaemia|anemia|pale)\b/, 'anaemia haemoglobin iron'],
  [/\b(tired|weak|weakness|no strength)\b/, 'fatigue weakness anaemia'],
  [/\b(dizzy|dizziness|faint|fainting|collapse)\b/, 'dizziness fainting shock anaemia'],
  [/\b(labour|labor|born|push|contraction|contractions|delivery|deliver)\b/, 'labour contractions delivery childbirth'],
  [/\b(breast|breastfeed|breastfeeding|suck|milk)\b/, 'breastfeeding breast milk'],
  [/\bsugar\b/, 'diabetes glucose gestational'],
  [/\b(bp|pressure|hypertension)\b/, 'blood pressure hypertension pre-eclampsia'],
  [/\b(chop|eat|eating|food|diet|drink)\b/, 'nutrition diet food healthy eating'],
  [/\b(exercise|waka|walk|walking|gym)\b/, 'physical activity exercise'],
  [/\bscan\b/, 'ultrasound scan'],
  [/\b(heartburn|chest dey burn|chest burn)\b/, 'heartburn'],
  [/\b(constipat\w*|toilet hard|hard stool)\b/, 'constipation'],
  [/\b(itch|itching|scratch)\b/, 'itching cholestasis'],
  [/\b(discharge)\b/, 'vaginal discharge infection'],
  [/\b(leg cramp|cramp|cramps)\b/, 'leg cramps'],
  [/\b(back pain|waist pain|waist dey pain)\b/, 'low back pelvic pain'],
  [/\b(yellow|jaundice)\b/, 'jaundice'],
  [/\b(drug|medicine|tablet|tablets|herb|herbal|agbo)\b/, 'medicine medication supplement'],
  [/\b(clinic|antenatal|anc|checkup|check up)\b/, 'antenatal care contact visit'],
  [/\b(after birth|after delivery|postpartum|i born|i don born)\b/, 'postnatal postpartum'],
];

export function expandQuery(question: string): string {
  const q = question.toLowerCase();
  const extra = LAY_TERMS.filter(([re]) => re.test(q)).map(([, words]) => words);
  return [question, ...extra].join(' ');
}

// ── BM25 ─────────────────────────────────────────────────────

interface IndexedDoc {
  tf: Map<string, number>;
  length: number;
}

export class Bm25Index {
  private docs: IndexedDoc[];
  private df = new Map<string, number>();
  private avgLength: number;

  constructor(texts: string[], private k1 = 1.2, private b = 0.75) {
    this.docs = texts.map((t) => {
      const tf = new Map<string, number>();
      const words = tokenize(t);
      for (const w of words) tf.set(w, (tf.get(w) || 0) + 1);
      return { tf, length: words.length };
    });
    for (const d of this.docs) for (const w of d.tf.keys()) this.df.set(w, (this.df.get(w) || 0) + 1);
    this.avgLength = this.docs.reduce((s, d) => s + d.length, 0) / Math.max(1, this.docs.length);
  }

  /** Document indexes and scores, best first; only documents sharing a word with the query. */
  search(query: string, accept: (i: number) => boolean = () => true): { index: number; score: number }[] {
    const words = Array.from(new Set(tokenize(query)));
    const n = this.docs.length;
    const results: { index: number; score: number }[] = [];
    this.docs.forEach((d, i) => {
      if (!accept(i)) return;
      let score = 0;
      for (const w of words) {
        const f = d.tf.get(w);
        if (!f) continue;
        const df = this.df.get(w)!;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.length) / this.avgLength));
      }
      if (score > 0) results.push({ index: i, score });
    });
    return results.sort((a, b) => b.score - a.score);
  }
}

// ── Loading ──────────────────────────────────────────────────

let guidance: { chunks: GuidanceChunk[]; index: Bm25Index } | null = null;
let examples: { items: ExampleAnswer[]; index: Bm25Index } | null = null;

function loadGuidance() {
  if (guidance) return guidance;
  const chunks: GuidanceChunk[] = fs.existsSync(GUIDANCE_FILE) ? JSON.parse(fs.readFileSync(GUIDANCE_FILE, 'utf8')) : [];
  // The heading counts twice: it says what the chunk is about
  guidance = { chunks, index: new Bm25Index(chunks.map((c) => `${c.title} ${c.title} ${c.text}`)) };
  return guidance;
}

function loadExamples() {
  if (examples) return examples;
  const items: ExampleAnswer[] = [];
  if (fs.existsSync(EXAMPLES_DIR)) {
    for (const file of fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.json')).sort()) {
      const set = file.replace(/\.json$/, '');
      for (const row of JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8'))) {
        if (!row.question || !row.ideal_answer) continue;
        items.push({ key: `${set}#${row.id}`, language: row.language, question: row.question, answer: row.ideal_answer, urgency: row.urgency });
      }
    }
  }
  examples = { items, index: new Bm25Index(items.map((e) => e.question)) };
  return examples;
}

// ── Selection ────────────────────────────────────────────────

/** Matches doses and amounts of medicine: "60 mg", "400 µg", "10 IU", "2 tablets", "mg/kg". */
const DOSE_RE = /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|μg|g|iu|ml|units?|tablets?|capsules?|drops?)\b|\bmg\/kg\b/i;

export const mentionsDose = (text: string) => DOSE_RE.test(text);

/** Drops sentences and lines that mention a dose. */
export function withoutDoses(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .filter((s) => !mentionsDose(s))
        .join(' ')
    )
    .filter((line) => line.trim())
    .join('\n');
}

export interface GuidanceOptions {
  audience: 'patient' | 'doctor';
  /** Total size of the chunks returned */
  maxTokens: number;
  /** Ignore weak matches: a chunk must score at least this share of the best one */
  minRelativeScore?: number;
}

/** The best-matching guideline chunks for a question, within the token budget. */
export function guidanceFor(question: string, opts: GuidanceOptions): GuidanceChunk[] {
  const { chunks, index } = loadGuidance();
  if (!chunks.length || !question.trim()) return [];
  const hits = index.search(expandQuery(question), (i) => opts.audience === 'doctor' || chunks[i].audience !== 'doctor');
  if (!hits.length) return [];
  const floor = hits[0].score * (opts.minRelativeScore ?? 0.35);

  const picked: GuidanceChunk[] = [];
  let used = 0;
  for (const hit of hits) {
    if (hit.score < floor) break;
    const chunk = opts.audience === 'patient' && chunks[hit.index].has_doses
      ? { ...chunks[hit.index], text: withoutDoses(chunks[hit.index].text) }
      : chunks[hit.index];
    const cost = approxTokens(chunk.text);
    if (cost < 40) continue; // little left once doses are removed
    if (used + cost > opts.maxTokens) {
      if (picked.length) break;
      continue;
    }
    picked.push(chunk);
    used += cost;
  }
  return picked;
}

export interface ExampleOptions {
  count: number;
  /** Prefer examples in this language when they match about as well */
  language?: string;
  /** Example keys to leave out (the test runner hides the question being tested) */
  exclude?: string[];
}

/** The clinical team's answers to the most similar questions. */
export function examplesFor(question: string, opts: ExampleOptions): ExampleAnswer[] {
  const { items, index } = loadExamples();
  if (!items.length || !question.trim()) return [];
  const excluded = new Set(opts.exclude || []);
  const hits = index.search(expandQuery(question), (i) => !excluded.has(items[i].key));
  if (!hits.length) return [];
  const floor = hits[0].score * 0.5;
  return hits
    .filter((h) => h.score >= floor)
    .slice(0, opts.count * 3)
    .map((h) => ({ item: items[h.index], score: h.score * (opts.language && items[h.index].language === opts.language ? 1.25 : 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.count)
    .map((x) => x.item);
}

/** Guideline chunks as numbered prompt sections with their source and page. */
export function guidancePromptText(chunks: GuidanceChunk[]): string {
  return chunks.map((c, i) => `[${i + 1}] ${c.source}, p. ${c.pages}: ${c.title}\n${c.text}`).join('\n\n');
}

export function examplesPromptText(items: ExampleAnswer[]): string {
  return items.map((e) => `Question (${e.language}): ${e.question}\nAnswer: ${e.answer}`).join('\n\n');
}

/** For tests: forget loaded data so a changed file is read again. */
export function resetKnowledgeCache() {
  guidance = null;
  examples = null;
}
