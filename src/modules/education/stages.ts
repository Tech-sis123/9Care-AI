import type { PostpartumStatus } from '../../utils/delivery';

/** Lesson groups a doctor can publish to, with the weeks each covers. */
export const EDUCATION_STAGES = [
  { id: 'general', label: 'General (any week)' },
  { id: 'trimester_1', label: 'First trimester (weeks 1 to 13)' },
  { id: 'trimester_2', label: 'Second trimester (weeks 14 to 27)' },
  { id: 'trimester_3', label: 'Third trimester (weeks 28 to 40)' },
  { id: 'postpartum', label: 'Postpartum (up to 6 weeks after delivery)' },
] as const;

export type EducationStage = (typeof EDUCATION_STAGES)[number]['id'];
export const EDUCATION_STAGE_IDS = EDUCATION_STAGES.map((s) => s.id) as [EducationStage, ...EducationStage[]];

type StagedModule = { stage?: string | null; week_number?: number | null };

/**
 * Groups a lesson is shown to. The stage column holds one id or several joined
 * by commas ("trimester_2,trimester_3"); legacy rows only have a week number.
 */
export function moduleStages(mod: StagedModule): EducationStage[] {
  const picked = normalizeStages((mod.stage || '').split(','));
  if (picked.length) return picked;
  if (mod.week_number == null) return ['general'];
  return [trimesterStage(mod.week_number)];
}

/** First group of a lesson (for older app versions that show one). */
export function moduleStage(mod: StagedModule): EducationStage {
  return moduleStages(mod)[0];
}

/** Known ids only, in the standard order, no repeats. General already covers every week, so it stands alone. */
export function normalizeStages(ids: readonly string[]): EducationStage[] {
  const wanted = new Set(ids.map((s) => s.trim()));
  if (wanted.has('general')) return ['general'];
  return EDUCATION_STAGE_IDS.filter((id) => wanted.has(id));
}

/** Value saved in the stage column. */
export function stagesColumn(stages: readonly string[]): string {
  return normalizeStages(stages).join(',') || 'general';
}

/** Whether a patient who can see these groups sees the lesson. */
export function isLessonVisible(mod: StagedModule, visible: Set<EducationStage>): boolean {
  return moduleStages(mod).some((s) => visible.has(s));
}

export function trimesterStage(weeks: number): EducationStage {
  if (weeks <= 13) return 'trimester_1';
  if (weeks <= 27) return 'trimester_2';
  return 'trimester_3'; // includes 41+ weeks while still pregnant
}

/**
 * Groups a patient can see. General is always shown. Delivered women see
 * postpartum lessons for 42 days; pregnant women see their trimester (all
 * three when the week is unknown).
 */
export function visibleStages(params: { egaWeeks: number | null; postpartum: PostpartumStatus | null; delivered: boolean }): Set<EducationStage> {
  const stages = new Set<EducationStage>(['general']);
  if (params.delivered) {
    if (params.postpartum && !params.postpartum.completed) stages.add('postpartum');
  } else if (params.egaWeeks == null) {
    stages.add('trimester_1').add('trimester_2').add('trimester_3');
  } else {
    stages.add(trimesterStage(params.egaWeeks));
  }
  return stages;
}
