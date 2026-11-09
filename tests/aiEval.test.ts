import { describe, it, expect, vi, afterEach } from 'vitest';

// The AI functions skip the call when no key is set; fetch is mocked, so any value works
vi.hoisted(() => {
  process.env.GROQ_API_KEY ||= 'test-key';
});

import { groqChat, aiService, looksLikePidgin } from '../src/services/ai';
import {
  EvalCase,
  EvalResult,
  Judgement,
  parseJudgement,
  patientDataFor,
  splitCriteria,
  summarize,
  verdict,
} from '../src/services/aiEval';
import cases from '../data/ai-eval/patient_assistant_v1.json';

const row: EvalCase = (cases as EvalCase[]).find((c) => c.id === 2)!;

const okResponse = (content: string) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message: { content } }] }) }) as any;

describe('test question data', () => {
  it('has all 50 rows with every column filled in', () => {
    expect(cases).toHaveLength(50);
    for (const c of cases as EvalCase[]) {
      for (const key of ['question', 'ideal_answer', 'must_include', 'must_not_include', 'urgency', 'language'] as const) {
        expect(String(c[key]).length, `row ${c.id} ${key}`).toBeGreaterThan(2);
      }
      expect(['English', 'Nigerian Pidgin']).toContain(c.language);
    }
  });

  it('spots Pidgin questions without mistaking English ones', () => {
    const all = cases as EvalCase[];
    expect(all.filter((c) => c.language === 'English' && looksLikePidgin(c.question))).toEqual([]);
    expect(all.filter((c) => c.language === 'Nigerian Pidgin' && looksLikePidgin(c.question)).length).toBeGreaterThanOrEqual(24);
    expect(looksLikePidgin('I have pain when I pass urine')).toBe(false);
    expect(looksLikePidgin('Can I go for a walk?')).toBe(false);
    expect(looksLikePidgin('My belle dey pain me small small')).toBe(true);
  });

  it('splits criteria lists and builds the profile the app would have', () => {
    expect(splitCriteria('Appetite can change; balanced meals; nutritious snacks.')).toEqual(['Appetite can change', 'balanced meals', 'nutritious snacks']);
    expect(patientDataFor(row).pregnancies[0]).toEqual({ current_ega_weeks: 18, gravidity: 2, parity: 1 });
  });
});

describe('marking', () => {
  it('lines the marker JSON up with the row, treating anything missing as not met', () => {
    const j = parseJudgement(
      'Here you go: {"must_include":[{"met":true},{"met":"true"}],"must_not_include":[{"violated":false}],"language_matches":true,"escalation_ok":true,"clarity":9,"comment":"ok"}',
      row
    );
    expect(j.must_include.map((x) => x.met)).toEqual([true, true, false, false]);
    expect(j.must_include[0].item).toBe('Appetite can change');
    expect(j.must_not_include).toHaveLength(3);
    expect(j.clarity).toBe(5);
  });

  it('fails unsafe or wrong-language answers, passes complete ones', () => {
    const base: Judgement = {
      must_include: [{ item: 'a', met: true, reason: '' }],
      must_not_include: [{ item: 'b', violated: false, reason: '' }],
      language_matches: true,
      escalation_ok: true,
      clarity: 4,
      comment: '',
    };
    expect(verdict(base)).toBe('pass');
    expect(verdict({ ...base, must_include: [{ item: 'a', met: false, reason: '' }] })).toBe('partial');
    expect(verdict({ ...base, language_matches: false })).toBe('fail');
    expect(verdict({ ...base, must_not_include: [{ item: 'b', violated: true, reason: '' }] })).toBe('fail');
    expect(verdict({ ...base, escalation_ok: false })).toBe('fail');
  });

  it('summarises a run', () => {
    const j: Judgement = { must_include: [{ item: 'a', met: true, reason: '' }, { item: 'b', met: false, reason: '' }], must_not_include: [], language_matches: false, escalation_ok: true, clarity: 3, comment: '' };
    const results: EvalResult[] = [
      { id: 1, language: 'English', question: 'q', answer: 'a', judgement: { ...j, language_matches: true, must_include: [{ item: 'a', met: true, reason: '' }] }, verdict: 'pass' },
      { id: 2, language: 'Nigerian Pidgin', question: 'q', answer: 'a', judgement: j, verdict: 'fail' },
      { id: 3, language: 'Nigerian Pidgin', question: 'q', answer: '', judgement: null, verdict: 'error', error: 'x' },
    ];
    expect(summarize(results)).toMatchObject({ total: 3, pass: 1, fail: 1, error: 1, wrong_language: 1, must_include_met_pct: 67 });
  });
});

describe('Groq calls', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps reasoning models short and hidden, and retries after a rate limit', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'retry-after': '0' }), text: async () => '' } as any)
      .mockResolvedValueOnce(okResponse('  hello  '));
    const text = await groqChat([{ role: 'user', content: 'hi' }], { model: 'openai/gpt-oss-120b', temperature: 0, maxTokens: 100, retries: 1 });
    expect(text).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', include_reasoning: false, max_tokens: 1124 });

    fetchMock.mockResolvedValueOnce(okResponse('x'));
    await groqChat([{ role: 'user', content: 'hi' }], { model: 'qwen/qwen3.8-27b', temperature: 0, maxTokens: 100 });
    expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string)).toMatchObject({ reasoning_format: 'hidden' });
  });

  it('does not sit waiting when Groq says the daily limit is used up', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '3600' }),
      text: async () => 'tokens per day (TPD)',
    } as any);
    const started = Date.now();
    await expect(groqChat([{ role: 'user', content: 'hi' }], { temperature: 0, maxTokens: 10, retries: 3, maxWaitSeconds: 15 })).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('throws on API errors so callers can show their fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404, headers: new Headers(), text: async () => 'model_not_found' } as any);
    await expect(groqChat([{ role: 'user', content: 'hi' }], { temperature: 0, maxTokens: 10 })).rejects.toThrow(/404/);
  });

  it('tells the patient assistant to answer in her language, briefly, without doses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('Yes, e normal.'));
    const reply = await aiService.answerPatientQuestion({ language_preference: 'pidgin', pregnancies: [{ current_ega_weeks: 18 }] }, row.question);
    expect(reply).toBe('Yes, e normal.');
    const prompt = JSON.parse(fetchMock.mock.calls[0][1]!.body as string).messages[1].content as string;
    expect(prompt).toContain(row.question);
    expect(prompt).toMatch(/reply in natural, everyday Nigerian Pidgin/);
    expect(prompt).toMatch(/If you cannot tell, use Nigerian Pidgin/);
    expect(prompt).toMatch(/Her question is written in Nigerian Pidgin/);
    expect(prompt).toMatch(/4 to 7 sentences/);
    expect(prompt).toMatch(/never give doses/);
  });

  it('adds the clinical team’s answers to similar questions (not WHO text), except the hidden one or when switched off', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('ok'));
    const promptOf = (i: number) => JSON.parse(fetchMock.mock.calls[i][1]!.body as string).messages[1].content as string;

    await aiService.answerPatientQuestion({ pregnancies: [{ current_ega_weeks: 18 }] }, row.question, { excludeExamples: [`patient_assistant_v1#${row.id}`] });
    expect(promptOf(0)).toMatch(/How the clinic's team answered similar questions/);
    expect(promptOf(0)).not.toMatch(/Background from WHO guidance/);
    expect(promptOf(0)).not.toContain(row.ideal_answer);

    await aiService.answerPatientQuestion({ pregnancies: [{ current_ega_weeks: 18 }] }, row.question, { context: false });
    expect(promptOf(1)).not.toMatch(/answered similar questions/);
  });

  it('gives the doctor assistant WHO excerpts with source and page', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('ok'));
    await aiService.answerDoctorQuestion('Management of severe pre-eclampsia at 34 weeks');
    const prompt = JSON.parse(fetchMock.mock.calls[0][1]!.body as string).messages[1].content as string;
    expect(prompt).toMatch(/WHO guideline excerpts picked for this question/);
    expect(prompt).toMatch(/\[1\] WHO .*, p\. \d+/);
  });
});
