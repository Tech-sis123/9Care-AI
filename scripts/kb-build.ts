/**
 * Converts the reference documents in docs/ into small searchable files for the AI.
 *
 *   npm run kb:build
 *
 * - Guideline PDFs  -> data/knowledge/guidance_chunks.json (sections of about 200 words,
 *   each with its source, heading and page). The doctor assistant gets a few per question.
 * - Question sets (.xlsx with the 12 standard columns) -> data/ai-eval/<name>.json,
 *   used by `npm run ai:eval` and as example answers for the patient assistant.
 *
 * The PDFs and spreadsheets stay out of git; the JSON files are committed so the
 * clinical team can review exactly what the AI is given. To add a document, put it
 * in docs/ and add a line to PDF_SOURCES or QUESTION_SETS below.
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { approxTokens, mentionsDose, GuidanceChunk } from '../src/services/knowledge';

// audience 'doctor': only the doctor assistant gets it. The clinical team's view is that
// the WHO documents are reports and research for health workers, so the patient assistant
// learns from the team's own example answers instead. Use 'all' only for material written
// for patients (e.g. a leaflet the clinic has approved).
const PDF_SOURCES = [
  {
    id: 'who-anc-2016',
    file: 'docs/WHO recommendations for a positive pregnancy experience.pdf',
    source: 'WHO recommendations on antenatal care for a positive pregnancy experience (2016)',
    audience: 'doctor',
  },
  {
    id: 'who-pcpnc-2015',
    file: 'docs/Intergrated management of pregnancy and childbirth.pdf',
    source: 'WHO IMPAC Pregnancy, childbirth, postpartum and newborn care: a guide for essential practice (3rd ed., 2015)',
    audience: 'doctor',
  },
  {
    // Mostly digital-system workflows and data definitions
    id: 'who-dak-anc-2021',
    file: 'docs/DAK for Antenatal care.pdf',
    source: 'WHO Digital adaptation kit for antenatal care (2021)',
    audience: 'doctor',
  },
] as const;

const QUESTION_SETS = [
  {
    file: 'docs/CARE_AI_Obstetric_Emergency_Dataset_300_pidgin_varied.xlsx',
    sheet: 'Emergency Questions',
    out: 'data/ai-eval/emergency_triage_v1.json',
  },
];

const TARGET_WORDS = 200;
const MAX_WORDS = 320;
const MIN_WORDS = 40;

// Front and back matter that doesn't help answer questions
const SKIP_HEADING = /^(contents|table of contents|acknowledg|abbreviation|acronym|glossary|references|bibliograph|index|foreword|declaration|web annex|annex \d\.?\s*(examples of detailed persona|guidance adding))/i;

interface Line {
  text: string;
  size: number;
  page: number;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

async function readPdfLines(file: string): Promise<Line[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    let text = '';
    let size = 0;
    const flush = () => {
      // Symbol-font bullets come out as private-use characters
      const clean = text.replace(/[-]+/g, '- ').replace(/\s+/g, ' ').trim();
      if (clean) lines.push({ text: clean, size, page: p });
      text = '';
      size = 0;
    };
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string') continue;
      text += item.str;
      if (item.str.trim()) size = Math.max(size, Math.round(Math.hypot(item.transform[2], item.transform[3]) * 10) / 10);
      if (item.hasEOL) flush();
    }
    flush();
  }
  return lines;
}

/** Removes running headers/footers, page numbers and contents-page lines. */
function cleanLines(lines: Line[]): Line[] {
  const pages = new Set(lines.map((l) => l.page)).size;
  const key = (t: string) => t.toLowerCase().replace(/\d+/g, '#');
  const pagesWith = new Map<string, Set<number>>();
  for (const l of lines) {
    const k = key(l.text);
    if (!pagesWith.has(k)) pagesWith.set(k, new Set());
    pagesWith.get(k)!.add(l.page);
  }
  return lines.filter((l) => {
    if (pages > 10 && pagesWith.get(key(l.text))!.size > pages * 0.15) return false;
    if (/^[A-Z]?\d{1,3}$|^[ivxlc]+$/i.test(l.text)) return false;
    if (/\.{4,}\s*\d+$/.test(l.text)) return false;
    return true;
  });
}

/** Most common font size, weighted by text length: the body text size. */
function bodySize(lines: Line[]): number {
  const bySize = new Map<number, number>();
  for (const l of lines) bySize.set(l.size, (bySize.get(l.size) || 0) + l.text.length);
  return Array.from(bySize.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
}

const isHeading = (l: Line, body: number) =>
  l.size >= body * 1.2 && l.text.length >= 4 && l.text.length <= 110 && /[a-z]{3}/i.test(l.text) && !/[.;,]$/.test(l.text);

const isListItem = (t: string) => /^([•▪◦●○■□–\-*→✓]|\d{1,2}[.)]\s|[a-z][.)]\s)/.test(t);

/** Text that is mostly citations, numbers or data-dictionary codes isn't worth sending. */
function lowValue(text: string): boolean {
  const refs = (text.match(/\bet al\b|\bdoi\b|https?:\/\/|\bvol\.|\bpp\.\s*\d/gi) || []).length;
  const codes = (text.match(/\bANC\.[A-Z0-9.]+/g) || []).length;
  const digits = (text.match(/\d/g) || []).length / Math.max(1, text.length);
  return refs > 3 || codes > 4 || digits > 0.2;
}

function chunkDocument(src: (typeof PDF_SOURCES)[number], lines: Line[]): GuidanceChunk[] {
  const body = bodySize(lines);
  const chunks: GuidanceChunk[] = [];
  let title = '';
  let skipping = false;
  let paras: string[] = [];
  let firstPage = 0;
  let lastPage = 0;

  const emit = (force: boolean) => {
    const text = paras.join('\n').replace(/(\w)- (\w)/g, '$1$2').trim();
    if (!text || (!force && words(text) < TARGET_WORDS)) return;
    if (words(text) >= MIN_WORDS && !lowValue(text)) {
      chunks.push({
        id: `${src.id}-p${firstPage}-${chunks.length + 1}`,
        source: src.source,
        title: title || src.source,
        pages: firstPage === lastPage ? String(firstPage) : `${firstPage}-${lastPage}`,
        text,
        has_doses: mentionsDose(text),
        audience: src.audience,
      });
    }
    paras = [];
  };

  const add = (l: Line) => {
    if (!paras.length) firstPage = l.page;
    lastPage = l.page;
    const prev = paras[paras.length - 1];
    // Wrapped lines of one paragraph are joined; list items and new sentences after a full stop start a line
    if (prev !== undefined && !isListItem(l.text) && !/[.:!?]$/.test(prev)) paras[paras.length - 1] = `${prev} ${l.text}`;
    else paras.push(l.text);
    // Split long paragraphs at sentence ends
    const last = paras[paras.length - 1];
    if (words(last) > MAX_WORDS) {
      const sentences = last.split(/(?<=[.!?])\s+/);
      paras[paras.length - 1] = sentences.slice(0, Math.ceil(sentences.length / 2)).join(' ');
      emit(true);
      firstPage = l.page;
      paras.push(sentences.slice(Math.ceil(sentences.length / 2)).join(' '));
    }
    if (words(paras.join(' ')) >= TARGET_WORDS) emit(false);
  };

  for (const l of lines) {
    if (isHeading(l, body)) {
      const nextSkip = SKIP_HEADING.test(l.text);
      // Keep short leftovers with the next section rather than make a tiny chunk
      if (words(paras.join(' ')) >= MIN_WORDS || skipping) emit(true);
      if (skipping) paras = [];
      skipping = nextSkip;
      title = l.text;
      continue;
    }
    if (!skipping) add(l);
  }
  emit(true);
  return chunks;
}

const COLUMNS = ['task', 'language', 'pregnancy_week', 'risk_tier', 'patient_context', 'question', 'ideal_answer', 'must_include', 'must_not_include', 'urgency', 'reviewer', 'notes'];

async function convertQuestionSet(set: (typeof QUESTION_SETS)[number]) {
  // The streaming reader: the normal one fails on some workbooks (cell comments)
  // (sheet names are only known once the whole file has been read)
  const reader: any = new ExcelJS.stream.xlsx.WorkbookReader(set.file, { worksheets: 'emit', sharedStrings: 'cache' });
  const sheets = new Map<number, any[][]>();
  for await (const ws of reader) {
    const rows: any[][] = [];
    for await (const row of ws) rows.push((row.values as any[]).slice(1));
    sheets.set(Number(ws.id), rows);
  }
  const sheetId = reader.model?.sheets?.find((s: any) => s.name === set.sheet)?.id;
  const sheetRows = sheets.get(Number(sheetId)) || [];
  if (!sheetRows.length) throw new Error(`${set.file}: no sheet named "${set.sheet}" (or it is empty)`);
  const header = sheetRows[0].map((v) => String(v ?? '').trim());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`${set.file}: missing columns ${missing.join(', ')}`);

  const rows: Record<string, unknown>[] = [];
  sheetRows.slice(1).forEach((cells) => {
    const r: Record<string, unknown> = {};
    header.forEach((h, i) => (r[h] = String(cells[i]?.text ?? cells[i]?.result ?? cells[i] ?? '').trim()));
    if (!r.question) return;
    const week = String(r.pregnancy_week);
    r.pregnancy_week = /^\d+$/.test(week) ? Number(week) : week;
    // "Emergency scenario 012; ..." keeps the spreadsheet's own numbering
    r.id = Number(String(r.notes).match(/scenario (\d+)/i)?.[1]) || rows.length + 1;
    rows.push({ id: r.id, ...Object.fromEntries(COLUMNS.map((c) => [c, r[c]])) });
  });
  fs.writeFileSync(set.out, JSON.stringify(rows, null, 2) + '\n');
  console.log(`${set.out}: ${rows.length} questions`);
}

async function main() {
  const all: GuidanceChunk[] = [];
  for (const src of PDF_SOURCES) {
    if (!fs.existsSync(src.file)) {
      console.warn(`Skipped (not found): ${src.file}`);
      continue;
    }
    const chunks = chunkDocument(src, cleanLines(await readPdfLines(src.file)));
    const tokens = chunks.reduce((s, c) => s + approxTokens(c.text), 0);
    console.log(`${path.basename(src.file)}: ${chunks.length} chunks, ~${tokens.toLocaleString()} tokens, ${chunks.filter((c) => c.has_doses).length} mention doses`);
    all.push(...chunks);
  }
  fs.mkdirSync('data/knowledge', { recursive: true });
  fs.writeFileSync('data/knowledge/guidance_chunks.json', JSON.stringify(all, null, 1) + '\n');
  console.log(`data/knowledge/guidance_chunks.json: ${all.length} chunks`);

  for (const set of QUESTION_SETS) {
    if (fs.existsSync(set.file)) await convertQuestionSet(set);
    else console.warn(`Skipped (not found): ${set.file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
