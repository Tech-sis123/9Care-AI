import { describe, it, expect } from 'vitest';
import {
  Bm25Index,
  examplesFor,
  expandQuery,
  guidanceFor,
  mentionsDose,
  tokenize,
  withoutDoses,
  approxTokens,
  GuidanceChunk,
} from '../src/services/knowledge';
import { EvalCase, patientDataFor } from '../src/services/aiEval';
import chunks from '../data/knowledge/guidance_chunks.json';
import emergency from '../data/ai-eval/emergency_triage_v1.json';

describe('words and search', () => {
  it('drops Pidgin filler words and stems endings', () => {
    expect(tokenize('Wetin I go do? My belle dey pain me, bleeding since morning')).toEqual(['belle', 'pain', 'bleed', 'since', 'morn']);
  });

  it('maps everyday and Pidgin words to the words the guidelines use', () => {
    expect(expandQuery('my pikin no dey move')).toMatch(/fetal movement/);
    expect(expandQuery('water dey comot from my private part')).toMatch(/rupture membranes/);
    expect(expandQuery('my water break this morning')).toMatch(/rupture membranes/);
    expect(expandQuery('how much water I suppose drink?')).not.toMatch(/rupture/);
    // "fit" means "can" in Pidgin, not convulsions
    expect(expandQuery('I fit chop beans?')).not.toMatch(/eclampsia/);
    expect(expandQuery('she get fits')).toMatch(/eclampsia/);
  });

  it('ranks the matching document first', () => {
    const index = new Bm25Index(['iron and folic acid tablets for anaemia', 'malaria prevention with bednets', 'breastfeeding after birth']);
    expect(index.search('anaemia iron')[0].index).toBe(0);
    expect(index.search('bednet malaria')[0].index).toBe(1);
    expect(index.search('anaemia', (i) => i !== 0)).toEqual([]);
  });

  it('removes sentences that mention doses', () => {
    expect(mentionsDose('Give 60 mg of iron daily.')).toBe(true);
    expect(mentionsDose('Give iron daily.')).toBe(false);
    expect(withoutDoses('Iron prevents anaemia. Give 60 mg daily.\nTake 2 tablets.\nEat beans.')).toBe('Iron prevents anaemia.\nEat beans.');
  });
});

describe('the built reference material', () => {
  it('has WHO chunks of a sensible size with source and page', () => {
    const all = chunks as GuidanceChunk[];
    expect(all.length).toBeGreaterThan(500);
    for (const c of all) {
      expect(c.source && c.title && c.pages).toBeTruthy();
      expect(approxTokens(c.text)).toBeLessThan(700);
    }
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });

  it('gives the doctor assistant relevant WHO excerpts within budget, and patients none (they are for health workers)', () => {
    const q = 'Swollen legs and a headache that will not go away at 34 weeks';
    const picked = guidanceFor(q, { audience: 'doctor', maxTokens: 2000 });
    expect(picked.length).toBeGreaterThan(1);
    expect(picked.reduce((s, c) => s + approxTokens(c.text), 0)).toBeLessThanOrEqual(2000);
    expect(picked.some((c) => /eclampsia|blood pressure|hypertension/i.test(c.title + c.text))).toBe(true);
    expect(guidanceFor(q, { audience: 'patient', maxTokens: 700 })).toEqual([]);
  });

  it('strips doses from any excerpt that does go to patients', () => {
    const all = chunks as GuidanceChunk[];
    const withDose = all.find((c) => c.has_doses)!;
    expect(mentionsDose(withoutDoses(withDose.text))).toBe(false);
  });

  it('finds the clinical team’s answers to similar questions, hiding the one asked to', () => {
    const q = 'I dey 30 weeks, my pikin no dey move like before since morning. Wetin I go do?';
    const found = examplesFor(q, { count: 2, language: 'Nigerian Pidgin' });
    expect(found).toHaveLength(2);
    expect(found.every((e) => /move/i.test(e.question))).toBe(true);
    const hidden = examplesFor(q, { count: 2, exclude: [found[0].key] });
    expect(hidden.map((e) => e.key)).not.toContain(found[0].key);
  });
});

describe('emergency question set', () => {
  it('has 300 rows with every column filled and unique ids', () => {
    const rows = emergency as EvalCase[];
    expect(rows).toHaveLength(300);
    expect(new Set(rows.map((r) => r.id)).size).toBe(300);
    for (const r of rows) {
      for (const key of ['question', 'ideal_answer', 'must_include', 'must_not_include', 'urgency', 'language'] as const) {
        expect(String(r[key]).length, `row ${r.id} ${key}`).toBeGreaterThan(2);
      }
    }
  });

  it('turns "postpartum day N" into a delivery date, and "40+5" into 40 weeks', () => {
    const now = new Date('2026-11-09T12:00:00Z');
    const base = (emergency as EvalCase[])[0];
    expect(patientDataFor({ ...base, pregnancy_week: 'postpartum day 3' }, now).pregnancies[0].delivery_date).toEqual(new Date('2026-11-06T12:00:00Z'));
    expect(patientDataFor({ ...base, pregnancy_week: '40+5' }, now).pregnancies[0].current_ega_weeks).toBe(40);
  });
});
