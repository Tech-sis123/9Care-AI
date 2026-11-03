/**
 * Runs the patient assistant on the clinical team's test questions and writes a report.
 *
 *   npm run ai:eval -- --label baseline
 *   npm run ai:eval -- --model openai/gpt-oss-20b --ids 1,5,20
 *
 * Options: --model (default AI_MODEL), --judge (default openai/gpt-oss-120b),
 * --data (default data/ai-eval/patient_assistant_v1.json), --ids, --limit, --label.
 * Reports go to reports/ai-eval/ (git-ignored).
 */
import fs from 'fs';
import path from 'path';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  if (arg('model')) process.env.AI_MODEL = arg('model');
  // Imported after AI_MODEL is set, because the env is read on import
  const { aiService, groqChat } = await import('../src/services/ai');
  const { env } = await import('../src/config/env');
  const ev = await import('../src/services/aiEval');

  const dataPath = arg('data') || 'data/ai-eval/patient_assistant_v1.json';
  const judge = arg('judge') || 'openai/gpt-oss-120b';
  const label = arg('label') || 'run';
  const ids = arg('ids')?.split(',').map(Number);
  let cases = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as import('../src/services/aiEval').EvalCase[];
  if (ids) cases = cases.filter((c) => ids.includes(c.id));
  if (arg('limit')) cases = cases.slice(0, Number(arg('limit')));

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const outDir = path.join('reports', 'ai-eval');
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `${stamp}-${label}`);
  const meta = { label, model: env.AI_MODEL, judge, date: new Date().toISOString().slice(0, 16).replace('T', ' '), data: dataPath };
  console.log(`Testing ${cases.length} questions | answers: ${meta.model} | marking: ${judge}`);

  const results: import('../src/services/aiEval').EvalResult[] = [];
  for (const c of cases) {
    const result: import('../src/services/aiEval').EvalResult = {
      id: c.id,
      language: c.language,
      question: c.question,
      answer: '',
      judgement: null,
      verdict: 'error',
    };
    try {
      result.answer = await aiService.answerPatientQuestion(ev.patientDataFor(c), c.question, { retries: 8 });
      if (/^I encountered an error|AI features are currently unavailable/.test(result.answer)) {
        throw new Error('The assistant returned its error message (check the server log / model name)');
      }
      const marked = await groqChat(ev.judgeMessages(c, result.answer), { model: judge, temperature: 0, maxTokens: 1200, json: true, retries: 8 });
      result.judgement = ev.parseJudgement(marked, c);
      result.verdict = ev.verdict(result.judgement);
    } catch (err: any) {
      result.error = String(err?.message || err).slice(0, 300);
    }
    results.push(result);
    console.log(`  ${c.id}. ${result.verdict.toUpperCase()}${result.error ? ` (${result.error})` : ''}`);
    // Saved after every question, so a stopped run still leaves results
    fs.writeFileSync(`${base}.json`, JSON.stringify({ meta, summary: ev.summarize(results), results }, null, 2));
  }

  fs.writeFileSync(`${base}.md`, ev.markdownReport(meta, results));
  const s = ev.summarize(results);
  console.log(`\nPass ${s.pass}/${s.total} | partly ${s.partial} | fail ${s.fail} | errors ${s.error} | required points ${s.must_include_met_pct}% | unsafe ${s.unsafe_answers} | wrong language ${s.wrong_language}`);
  console.log(`Report: ${base}.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
