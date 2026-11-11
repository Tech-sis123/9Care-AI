export const MIN_AGE = 10;
export const MAX_AGE = 60;

/** Day / Month / Year boxes -> "YYYY-MM-DD", or null if it isn't a real date for a woman aged 10 to 60. */
export function dateOfBirthIso(day, month, year) {
  const [d, m, y] = [parseInt(day, 10), parseInt(month, 10), parseInt(year, 10)];
  if ([d, m, y].some(Number.isNaN) || String(year).length !== 4) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() < m - 1 || (today.getMonth() === m - 1 && today.getDate() < d)) age -= 1;
  if (age < MIN_AGE || age > MAX_AGE) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "1996-08-15" or "1996-08-15T00:00:00.000Z" -> { day: '15', month: '08', year: '1996' } */
export function splitDateOfBirth(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { day: m[3], month: m[2], year: m[1] } : { day: '', month: '', year: '' };
}

export const DATE_OF_BIRTH_ERROR = 'Please enter a valid date of birth (Day, Month, Year).';
