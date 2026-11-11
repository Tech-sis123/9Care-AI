import crypto from 'crypto';
import prisma from '../config/prisma';
import { redis } from '../config/redis';
import { parseDateOfBirth } from '../utils/dateOfBirth';

/**
 * TEMPORARY biodata-based account recovery.
 *
 * Many patients signed up with made-up emails (we didn't verify them) and then
 * forgot their password. Until every account has login details the patient can
 * remember, a patient can regain access by matching their name plus at least
 * REQUIRED_EXTRA_MATCHES other details from their profile. This is weaker than
 * an OTP or email link: anyone who knows those details about a patient can get
 * in. Switch it off with PATIENT_RECOVERY_ENABLED=false once it's no longer needed.
 */

export const REQUIRED_EXTRA_MATCHES = 2;
const RECOVERY_TOKEN_TTL_SECONDS = 15 * 60;
const MAX_FAILED_ATTEMPTS_PER_ACCOUNT = 5;
const ACCOUNT_LOCK_SECONDS = 24 * 60 * 60;

export interface RecoveryAnswers {
  full_name: string;
  date_of_birth?: string | null; // YYYY-MM-DD
  education_level?: string | null;
  email?: string | null;
  phone_number?: string | null;
}

interface RecoveryCandidate {
  id: string;
  name: string | null;
  phone_number: string;
  email: string | null;
  age: number | null;
  date_of_birth?: Date | null;
  education_level: string | null;
}

export type MatchedFactor = 'date_of_birth' | 'education_level' | 'email' | 'phone_number';

const nameTokens = (name?: string | null) =>
  (name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

/** Name matches when enough words overlap, in any order ("Ada Okafor" ≈ "okafor ada chioma"). */
export function namesMatch(stored: string | null | undefined, given: string, minOverlap = 2): boolean {
  const storedTokens = new Set(nameTokens(stored));
  const givenTokens = new Set(nameTokens(given));
  if (storedTokens.size === 0 || givenTokens.size === 0) return false;
  let overlap = 0;
  for (const t of givenTokens) if (storedTokens.has(t)) overlap++;
  return overlap >= Math.min(minOverlap, storedTokens.size, givenTokens.size);
}

/** Compares the last 10 digits so 0803…, 234803… and +234 803… all match. */
const phoneKey = (phone?: string | null) => {
  if (!phone || phone.startsWith('email-')) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
};

/** Age in whole years today for a YYYY-MM-DD date, or null if invalid. */
export function ageFromDateOfBirth(dob?: string | null, today = new Date()): number | null {
  const m = dob?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age -= 1;
  return age;
}

const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/** Education is stored as free-ish text ("Primary", "tertiary", "Tertiary (University, Polytechnic)"). */
export function educationBucket(level?: string | null): string | null {
  const s = level?.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('tertiary') || s.includes('university') || s.includes('polytechnic')) return 'tertiary';
  if (s.includes('secondary')) return 'secondary';
  if (s.includes('primary')) return 'primary';
  if (s === 'none' || s.includes('no formal')) return 'none';
  return s;
}

export function matchedFactors(candidate: RecoveryCandidate, answers: RecoveryAnswers): MatchedFactor[] {
  const matched: MatchedFactor[] = [];

  // Exact date when saved; older accounts only have an age, which can be a year out of date
  const givenDob = parseDateOfBirth(answers.date_of_birth);
  const givenAge = ageFromDateOfBirth(answers.date_of_birth);
  if (candidate.date_of_birth) {
    if (givenDob && sameDay(givenDob, candidate.date_of_birth)) matched.push('date_of_birth');
  } else if (givenAge != null && candidate.age != null && Math.abs(candidate.age - givenAge) <= 1) {
    matched.push('date_of_birth');
  }

  const givenEducation = educationBucket(answers.education_level);
  if (givenEducation && givenEducation === educationBucket(candidate.education_level)) matched.push('education_level');

  const givenEmail = answers.email?.trim().toLowerCase();
  if (givenEmail && givenEmail === candidate.email?.trim().toLowerCase()) matched.push('email');

  const givenPhone = phoneKey(answers.phone_number);
  if (givenPhone && givenPhone === phoneKey(candidate.phone_number)) matched.push('phone_number');

  return matched;
}

export function isRecoveryMatch(candidate: RecoveryCandidate, answers: RecoveryAnswers) {
  const factors = matchedFactors(candidate, answers);
  return {
    nameMatches: namesMatch(candidate.name, answers.full_name),
    factors,
    ok: namesMatch(candidate.name, answers.full_name) && factors.length >= REQUIRED_EXTRA_MATCHES,
  };
}

const failKey = (patientId: string) => `recover_fail:${patientId}`;
const tokenKey = (token: string) => `patient_recover:${token}`;

async function findCandidates(answers: RecoveryAnswers): Promise<RecoveryCandidate[]> {
  const or: any[] = [];
  const phone = phoneKey(answers.phone_number);
  if (phone) or.push({ phone_number: { endsWith: phone } });
  if (answers.email) or.push({ email: { equals: answers.email.trim().toLowerCase(), mode: 'insensitive' } });
  for (const token of nameTokens(answers.full_name).filter((t) => t.length >= 3)) {
    or.push({ name: { contains: token, mode: 'insensitive' } });
  }
  if (or.length === 0) return [];

  return prisma.patient.findMany({
    where: { OR: or },
    select: {
      id: true,
      name: true,
      phone_number: true,
      email: true,
      age: true,
      date_of_birth: true,
      education_level: true,
    },
    take: 200,
  });
}

export interface RecoveryResult {
  ok: boolean;
  reason: 'matched' | 'no_match' | 'ambiguous' | 'locked';
  /** The matched patient on success; accounts that were targeted on failure */
  patientIds: string[];
  token?: string;
  expiresIn?: number;
  factors?: MatchedFactor[];
}

export const patientRecovery = {
  /** Finds exactly one patient whose biodata matches; issues a short-lived recovery token. */
  async attempt(answers: RecoveryAnswers): Promise<RecoveryResult> {
    const candidates = await findCandidates(answers);
    const evaluated = candidates.map((c) => ({ c, ...isRecoveryMatch(c, answers) }));
    const passing = evaluated.filter((e) => e.ok);

    if (passing.length > 1) {
      return { ok: false, reason: 'ambiguous', patientIds: passing.map((e) => e.c.id) };
    }

    if (passing.length === 0) {
      // Count failures against accounts whose name matched, so one patient can't be guessed at forever
      const targeted = evaluated.filter((e) => e.nameMatches).map((e) => e.c.id);
      for (const id of targeted) {
        const n = await redis.incr(failKey(id));
        if (n === 1) await redis.expire(failKey(id), ACCOUNT_LOCK_SECONDS);
      }
      return { ok: false, reason: 'no_match', patientIds: targeted };
    }

    const match = passing[0];
    const failures = Number((await redis.get(failKey(match.c.id))) || 0);
    if (failures >= MAX_FAILED_ATTEMPTS_PER_ACCOUNT) {
      return { ok: false, reason: 'locked', patientIds: [match.c.id] };
    }

    const token = crypto.randomBytes(32).toString('hex');
    await redis.set(tokenKey(token), match.c.id, 'EX', RECOVERY_TOKEN_TTL_SECONDS);
    await redis.del(failKey(match.c.id));
    return {
      ok: true,
      reason: 'matched',
      patientIds: [match.c.id],
      token,
      expiresIn: RECOVERY_TOKEN_TTL_SECONDS,
      factors: match.factors,
    };
  },

  /** Returns the patient id for a recovery token, or null if expired/used. */
  async patientIdForToken(token: string): Promise<string | null> {
    return redis.get(tokenKey(token));
  },

  async consumeToken(token: string) {
    await redis.del(tokenKey(token));
  },
};
