import { env } from '../config/env';
import { logger } from '../utils/logger';
import { riskGuidelineText } from '../modules/risk/conditions';
import { doctorGuidanceText, patientGuidanceText } from './clinicalGuidance';
import { deliverySummary } from '../utils/delivery';

/** Tells the model she has already delivered, so it answers about postpartum care, not pregnancy weeks. */
function deliveryContext(pregnancy: any): string {
  const delivery = deliverySummary(pregnancy);
  if (!delivery.delivered) return '';
  const parts = [
    `- Delivered on ${delivery.delivery_date} (${delivery.postpartum?.label}). She is no longer pregnant: answer about postpartum recovery and newborn care, not gestational age.`,
    `- Delivery: ${delivery.mode_label || 'mode not given'}; baby: ${delivery.outcome_label || 'not given'}; complications: ${delivery.complications.map((c) => c.label).join(', ') || 'none'}.`,
  ];
  if (delivery.outcome === 'stillbirth') parts.push('- Her baby died at birth. Be especially gentle and do not give newborn-care tips.');
  return parts.join('\n');
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature: number;
  /** Tokens for the visible answer; reasoning models get extra room for their hidden thinking */
  maxTokens: number;
  model?: string;
  json?: boolean;
  /** Retries after a rate limit (429), waiting as long as Groq asks (up to maxWaitSeconds each time) */
  retries?: number;
  maxWaitSeconds?: number;
}

// Live requests: ride out a short rate-limit spike rather than show the patient an error
const LIVE_RETRY = { retries: 2, maxWaitSeconds: 15 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REQUEST_TIMEOUT_MS = 60000;

/** One chat completion from Groq; returns the answer text ('' if none). Throws on API errors. */
export async function groqChat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const model = opts.model || env.AI_MODEL;
  const body: Record<string, unknown> = { model, messages, temperature: opts.temperature, max_tokens: opts.maxTokens };
  // Reasoning models think before answering; keep it short and out of the reply
  if (/gpt-oss/i.test(model)) {
    Object.assign(body, { reasoning_effort: 'low', include_reasoning: false, max_tokens: opts.maxTokens + 1024 });
  } else if (/qwen3/i.test(model)) {
    Object.assign(body, { reasoning_format: 'hidden', max_tokens: opts.maxTokens + 1024 });
  }
  if (opts.json) body.response_format = { type: 'json_object' };

  for (let attempt = 0; ; attempt++) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify(body),
      // A stalled connection would otherwise leave the patient waiting forever
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 429 && attempt < (opts.retries ?? 0)) {
      const header = response.headers.get('retry-after');
      const wait = header !== null && header.trim() !== '' && !Number.isNaN(Number(header)) ? Number(header) : 10;
      // A long wait means a daily limit, not a short spike: fail now rather than retry for nothing
      if (wait <= (opts.maxWaitSeconds ?? 120)) {
        await sleep(wait * 1000 + 500);
        continue;
      }
    }
    if (!response.ok) {
      throw new Error(`Groq API responded with status ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const data = (await response.json()) as any;
    return String(data.choices?.[0]?.message?.content || '').trim();
  }
}

// Common Nigerian Pidgin words and phrases. Models often answer near-English Pidgin
// ("How much water I suppose drink?") in English, so the prompt says it plainly when these appear.
const PIDGIN_RE =
  /\b(dey|wetin|abi|una|chop|don|wan|pikin|belle|sabi|wahala|abeg|sef|oya|dem|suppose|fit|na)\b|\bgo (start|happen|be|come|reach|know|fit|do)\b|\bneed (take|chop|go|drink|do|eat)\b|\bsmall pass\b/i;

export const looksLikePidgin = (text: string) => PIDGIN_RE.test(text);

interface GenerateLessonParams {
  patientName: string;
  age: number;
  weekNumber: number;
  riskTier: string;
  doctorRole?: string;
  languagePreference?: string | null;
}

export const aiService = {
  /**
   * Generates a dynamic, highly-personalized clinical antenatal lesson using OpenAI.
   * Gracefully returns null if OpenAI key is missing or API errors.
   */
  async generatePersonalizedLesson(params: GenerateLessonParams): Promise<{ summary: string; transcript: string } | null> {
    const { patientName, age, weekNumber, doctorRole, languagePreference } = params;

    if (!env.GROQ_API_KEY || env.GROQ_API_KEY === 'your_groq_api_key_here' || env.GROQ_API_KEY === '') {
      logger.info('Groq API Key is missing or default. Skipping AI personalization (graceful degradation).');
      return null;
    }

    try {
      logger.info({ patientName, weekNumber, languagePreference }, 'Requesting personalized AI antenatal lesson from Groq...');
      
      const roleStr = doctorRole ? `a ${doctorRole}` : 'an empathetic, clinical midwife';
      const langStr = languagePreference === 'pidgin' ? 'friendly, encouraging Nigerian Pidgin' : 'plain, reassuring English';

      const prompt = `You are ${roleStr} at the University of Benin Teaching Hospital (UBTH), Nigeria. 
Your patient is ${patientName}, age ${age}, in Week ${weekNumber} of pregnancy.
Write a highly personalized, warm antenatal lesson for her current week of pregnancy entirely in ${langStr}.
Write in very simple, conversational, everyday words that a mother with zero medical background can easily understand. Avoid technical clinical jargon (like 'parasympathetic', 'nuchal fold', 'hemoglobin', 'edema', 'gestational age'); instead use warm everyday words like 'blood level', 'baby bump', 'baby water bag', 'calming your body', 'clinic checks'.
Do NOT provide a translation in another language, just write the lesson strictly in ${langStr}.
Never mention a risk level, risk tier, risk score, or whether she is low/medium/high risk.
Finally, on a new line, recommend a real, educational YouTube search link about "Pregnancy week ${weekNumber}" or a trusted channel like WHO/Mayo Clinic (e.g., https://www.youtube.com/results?search_query=pregnancy+week+${weekNumber}).
Address her directly by name ("${patientName}") and mention her current pregnancy week. Use common warm Nigerian pregnancy phrases.
Keep the total output under 250 words. Format with standard paragraphs.`;

      const text = await groqChat(
        [
          { role: 'system', content: 'You are a warm, professional, compassionate clinical antenatal advisor at UBTH, Nigeria.' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.7, maxTokens: 400, retries: 4, maxWaitSeconds: 60 }
      );

      if (!text) {
        return null;
      }

      return {
        summary: text.trim(),
        transcript: '',
      };
    } catch (err) {
      logger.error({ err }, 'Failed to generate personalized AI lesson');
      return null;
    }
  },

  /**
   * Answers a question from a patient using their profile and medical context.
   */
  async answerPatientQuestion(patientData: any, question: string, opts: { retries?: number } = {}): Promise<string> {
    if (!env.GROQ_API_KEY || env.GROQ_API_KEY === 'your_groq_api_key_here' || env.GROQ_API_KEY === '') {
      return "I'm sorry, my AI features are currently unavailable.";
    }

    try {
      const preferredLanguage = patientData.language_preference === 'pidgin' ? 'Nigerian Pidgin' : 'English';
      // Rules below come from the clinical team's test questions (data/ai-eval): language, length,
      // when to seek care, no doses, Nigerian foods, calm wording
      const prompt = `You are 9Care's pregnancy assistant for patients of UBTH, Nigeria. You answer questions from pregnant women and new mothers.

About her (from her 9Care record):
- Name: ${patientData.name || 'not given'}
- Age: ${patientData.age || 'Unknown'}
- Pregnancy info: ${JSON.stringify(patientData.pregnancies?.[0] || 'No current pregnancy info')}
- Recent symptoms: ${JSON.stringify(patientData.symptoms || 'None')}
${deliveryContext(patientData.pregnancies?.[0])}
Her question: "${question}"

How to answer:
1. Language: reply in the language of her question. If she writes in Nigerian Pidgin, reply in natural, everyday Nigerian Pidgin, the way a Nigerian midwife would talk to her, not in English. If she writes in English, use simple English. If you cannot tell, use ${preferredLanguage}.${
        looksLikePidgin(question) ? '\nHer question is written in Nigerian Pidgin, so your whole reply must be in Nigerian Pidgin.' : ''
      }
2. Keep it short, like a WhatsApp message: about 4 to 7 sentences in plain words. No headings or tables. Use a short list only when she asks for a list of things (for example foods or items to pack).
3. Start with a direct answer, then say briefly why, then give practical tips she can use at home. Prefer affordable foods and options common in Nigeria (for example beans, eggs, fish, vegetables like ugu, garri with soup, pap, oranges, pawpaw, bananas).
4. Say clearly when to see her clinic or go to the hospital, naming the warning signs that matter for this topic. If she describes a danger sign now (vaginal bleeding, severe headache, blurred vision, fits, severe belly pain, fluid leaking, baby moving less than usual, fever, fainting, or vomiting so much she cannot keep fluids down), tell her first to go to the hospital now.
5. Be calm and kind. Do not frighten her, and do not tell her something is normal when it might not be. Do not diagnose: say what it could be and that her clinic can check.
6. Medicines: never give doses, prescribe, or tell her to start or stop a medicine, supplement or herbal mixture, and never suggest buying medicine by herself. If she asks about a medicine, ask for its name, strength and why she takes it, and tell her to check with her doctor or pharmacist.
7. Gently correct common pregnancy myths and say what is actually true.
8. Never mention a risk level, risk tier, risk score, or whether she is low/medium/high risk. If she asks for her risk, say her care team reviews her information and the next step is to attend antenatal clinic.
9. The clinic treats these as high-risk pregnancy conditions. If she mentions having any of them (now or in a past pregnancy), gently encourage her to tell her doctor at her next antenatal visit, or sooner if she has symptoms, without labelling her as high risk:
${riskGuidelineText()}
Evidence-based points you may share in simple words when relevant (never give doses or change her prescriptions; refer dose questions to her clinic):
${patientGuidanceText()}`;

      const text = await groqChat(
        [
          { role: 'system', content: "You are 9Care's warm, careful pregnancy assistant for Nigerian mothers." },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.5, maxTokens: 600, ...LIVE_RETRY, ...(opts.retries != null ? { retries: opts.retries, maxWaitSeconds: 60 } : {}) }
      );
      return text || "I'm sorry, I couldn't generate a response.";
    } catch (err) {
      logger.error({ err }, 'Failed to answer patient question');
      return "I encountered an error trying to answer your question. Please try again later.";
    }
  },

  /**
   * Answers a medical question from a doctor, optionally incorporating specific patient context.
   */
  async answerDoctorQuestion(question: string, patientData?: any): Promise<string> {
    if (!env.GROQ_API_KEY || env.GROQ_API_KEY === 'your_groq_api_key_here' || env.GROQ_API_KEY === '') {
      return "AI features are currently unavailable.";
    }

    try {
      let prompt = `You are an expert medical AI assistant for doctors at UBTH.\n`;
      
      if (patientData) {
        prompt += `\nYou are answering a question in the context of the following patient:
- Name: ${patientData.name || 'Unknown'}
- Age: ${patientData.age || 'Unknown'}
- Pregnancy info: ${JSON.stringify(patientData.pregnancies?.[0] || 'No current pregnancy info')}
- Risk Assessment: ${JSON.stringify(patientData.risk_assessments?.[0] || 'Unknown')}
- Recent symptoms: ${JSON.stringify(patientData.symptoms || 'None')}
${deliveryContext(patientData.pregnancies?.[0])}\n`;
      }

      prompt += `\nThis clinic's high-risk pregnancy criteria (from its own guideline; the risk engine grades every listed condition HIGH):
${riskGuidelineText()}
When the patient has any of these, say which ones and factor them into your recommendations.\n`;

      prompt += `\nPublished guidance to follow where relevant (prefer it over general knowledge and cite it by name):
${doctorGuidanceText()}\n`;

      prompt += `\nDoctor's Question: "${question}"\n
Provide an exceptionally insightful, comprehensive, and highly accurate medical analysis. Break down complex pathophysiology, outline evidence-based differential diagnoses, and provide actionable, step-by-step clinical management recommendations tailored precisely to this patient's risk profile. Always cite relevant clinical guidelines (e.g., ACOG, WHO) and highlight any potential red flags or edge cases the doctor should be aware of. Structure your response with clear headings and bullet points.`;

      const text = await groqChat(
        [
          { role: 'system', content: 'You are an advanced medical AI assistant designed to help healthcare providers.' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.3, maxTokens: 1500, ...LIVE_RETRY }
      );
      return text || "I'm sorry, I couldn't generate a response.";
    } catch (err) {
      logger.error({ err }, 'Failed to answer doctor question');
      return "I encountered an error trying to answer your question. Please try again later.";
    }
  }
};
