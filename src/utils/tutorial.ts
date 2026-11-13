import prisma from '../config/prisma';

/** Raise this when the tour changes (new features) to show it to everyone again. */
export const CURRENT_TUTORIAL_VERSION = 1;

type TutorialFields = {
  intake_status?: string | null;
  tutorial_seen_at?: Date | null;
  tutorial_version?: number | null;
};

/** Whether she has finished or skipped the current version of the tour. */
export function hasSeenTutorial(p: TutorialFields): boolean {
  return !!p.tutorial_seen_at && (p.tutorial_version ?? 0) >= CURRENT_TUTORIAL_VERSION;
}

/** The dashboard starts the tour once her health profile is submitted and she hasn't seen this version. */
export function tutorialStatus(p: TutorialFields) {
  return {
    show: p.intake_status === 'submitted' && !hasSeenTutorial(p),
    version: CURRENT_TUTORIAL_VERSION,
  };
}

/** Counts for the current tour version: finished, skipped, not seen yet. */
export async function tutorialStats() {
  const seen = { tutorial_seen_at: { not: null }, tutorial_version: { gte: CURRENT_TUTORIAL_VERSION } };
  const [total, completed, skipped] = await Promise.all([
    prisma.patient.count(),
    prisma.patient.count({ where: { ...seen, tutorial_skipped: false } }),
    prisma.patient.count({ where: { ...seen, tutorial_skipped: true } }),
  ]);
  return { version: CURRENT_TUTORIAL_VERSION, completed, skipped, not_seen: total - completed - skipped };
}
