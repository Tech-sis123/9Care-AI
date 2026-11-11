import { z } from 'zod';

/**
 * Date of birth is what patients give; age is worked out from it (and kept current
 * by refreshedAge) because the risk engine, doctor views and AI all read `age`.
 */

export const MIN_AGE = 10;
export const MAX_AGE = 60;

/** "YYYY-MM-DD" -> that date at UTC midnight, or null if it isn't a real calendar date. */
export function parseDateOfBirth(value?: string | null): Date | null {
  const m = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** Whole years old on `today` (calendar dates, so the time of day doesn't matter). */
export function ageOn(dob: Date, today: Date = new Date()): number {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

/** The age to store when it has changed since it was saved (her birthday passed), else null. */
export function refreshedAge(patient: { date_of_birth?: Date | null; age?: number | null }, today = new Date()): number | null {
  if (!patient.date_of_birth) return null;
  const age = ageOn(patient.date_of_birth, today);
  return age !== patient.age ? age : null;
}

/** API field: "YYYY-MM-DD", a real date, giving an age of 10 to 60. */
export const dateOfBirthSchema = z
  .string()
  .trim()
  .refine((v) => {
    const dob = parseDateOfBirth(v);
    if (!dob) return false;
    const age = ageOn(dob);
    return age >= MIN_AGE && age <= MAX_AGE;
  }, 'Enter a valid date of birth');
