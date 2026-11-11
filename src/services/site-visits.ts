import prisma from '../config/prisma';
import { logger } from '../utils/logger';

/** A new visit starts when she comes back after this long away (refreshes and page changes don't count). */
export const VISIT_GAP_MINUTES = 30;

/**
 * Record a patient using the app: always moves last_seen_at, and adds a row to
 * patient_site_visits when she was last seen more than 30 minutes ago (or never).
 * Called on app load / session restore and from the dashboard and profile loads.
 * Returns true when a new visit was counted. Never throws.
 */
export async function recordPatientSiteVisit(
  patientId: string,
  path = '/dashboard',
  now: Date = new Date()
): Promise<boolean> {
  try {
    const cutoff = new Date(now.getTime() - VISIT_GAP_MINUTES * 60 * 1000);
    return await prisma.$transaction(async (tx) => {
      // Claim the new visit in one conditional update, so two requests arriving
      // together (dashboard + profile on app load) can't both count one.
      const { count } = await tx.patient.updateMany({
        where: { id: patientId, OR: [{ last_seen_at: null }, { last_seen_at: { lt: cutoff } }] },
        // site_visit_count is kept in step for old SQL queries; reports read the visits table
        data: { last_seen_at: now, site_visit_count: { increment: 1 } },
      });
      if (count > 0) {
        await tx.patientSiteVisit.create({ data: { patient_id: patientId, visited_at: now, path } });
        return true;
      }
      await tx.patient.updateMany({ where: { id: patientId }, data: { last_seen_at: now } });
      return false;
    });
  } catch (err) {
    logger.warn({ err, patientId }, 'Failed to record patient site visit');
    return false;
  }
}

/** Number of recorded visits per patient, from the visits table. */
export async function visitCounts(patientIds: string[]): Promise<Map<string, number>> {
  if (patientIds.length === 0) return new Map();
  const rows = await prisma.patientSiteVisit.groupBy({
    by: ['patient_id'],
    where: { patient_id: { in: patientIds } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.patient_id, r._count._all]));
}

/**
 * Retention figures from the visits table.
 * returning = patients with at least 2 visits; active_last_7_days = patients with a visit in the last 7 days.
 */
export async function retentionStats(now: Date = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [perPatient, totalVisits, activeLast7Days] = await Promise.all([
    prisma.patientSiteVisit.groupBy({ by: ['patient_id'], _count: { _all: true } }),
    prisma.patientSiteVisit.count(),
    prisma.patientSiteVisit.groupBy({ by: ['patient_id'], where: { visited_at: { gte: weekAgo } } }),
  ]);
  const withVisit = perPatient.length;
  const returning = perPatient.filter((r) => r._count._all >= 2).length;
  return {
    total_recorded_visits: totalVisits,
    patients_with_a_visit: withVisit,
    returning_patients: returning,
    returning_rate: withVisit ? Math.round((returning / withVisit) * 1000) / 10 : 0,
    patients_seen_last_7_days: activeLast7Days.length,
  };
}
