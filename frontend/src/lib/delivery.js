/** Delivery form options and lesson groups (mirrors src/utils/delivery.ts and education/stages.ts). */

export const COMPLICATIONS = [
  { key: 'antepartum_hemorrhage', label: 'Antepartum hemorrhage', explain: 'Bleeding from the vagina before delivery' },
  { key: 'premature_rupture_of_membranes', label: 'Premature rupture of membranes', explain: 'The waters broke before labour started' },
  { key: 'prolonged_labour', label: 'Prolonged labour', explain: 'Labour lasted unusually long' },
  { key: 'postpartum_hemorrhage', label: 'Postpartum hemorrhage', explain: 'Heavy bleeding after delivery' },
  { key: 'preeclampsia', label: 'Preeclampsia', explain: 'High blood pressure in pregnancy' },
  { key: 'eclampsia', label: 'Eclampsia', explain: 'Seizures or fits' },
  { key: 'other', label: 'Other', explain: 'Something else (type it below)' },
];

export const OUTCOMES = [
  { key: 'alive_well', label: 'Alive and well' },
  { key: 'alive_with_complications', label: 'Alive with some complications' },
  { key: 'stillbirth', label: 'Stillbirth / died at birth' },
];

export const MODES = [
  { key: 'vaginal', label: 'Vaginal delivery', explain: 'Normal birth' },
  { key: 'caesarean', label: 'Caesarean section', explain: 'C-section, delivery by surgery' },
];

export const POSTPARTUM_DAYS = 42;

export const EDUCATION_STAGES = [
  { id: 'general', label: 'General', range: 'any week' },
  { id: 'trimester_1', label: 'First trimester', range: 'weeks 1 to 13' },
  { id: 'trimester_2', label: 'Second trimester', range: 'weeks 14 to 27' },
  { id: 'trimester_3', label: 'Third trimester', range: 'weeks 28 to 40' },
  { id: 'postpartum', label: 'Postpartum', range: 'from delivery up to 6 weeks after' },
];

/** Known ids in the standard order; General covers every week, so it stands alone. */
export const normalizeStages = (ids) => {
  const wanted = new Set((ids || []).map((s) => String(s).trim()));
  if (wanted.has('general')) return ['general'];
  return EDUCATION_STAGES.map((s) => s.id).filter((id) => wanted.has(id));
};

/** Groups a lesson is shown to ("trimester_2,trimester_3" in the stage column); legacy rows only have a week number. */
export const moduleStages = (mod) => {
  const picked = normalizeStages(Array.isArray(mod?.stages) ? mod.stages : String(mod?.stage || '').split(','));
  if (picked.length) return picked;
  const w = mod?.week_number;
  if (w == null) return ['general'];
  if (w <= 13) return ['trimester_1'];
  if (w <= 27) return ['trimester_2'];
  return ['trimester_3'];
};

export const moduleStage = (mod) => moduleStages(mod)[0];

/** e.g. "Second trimester" or "Second trimester, Third trimester" */
export const stageLabel = (mod) =>
  moduleStages(mod)
    .map((id) => EDUCATION_STAGES.find((s) => s.id === id)?.label)
    .filter(Boolean)
    .join(', ') || 'General';

/** "Today" as YYYY-MM-DD in the user's own timezone, for the date picker's max. */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const formatDeliveryDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
