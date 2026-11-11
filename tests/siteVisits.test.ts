import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny in-memory stand-in for the two tables involved
const db = vi.hoisted(() => ({
  patient: { id: 'p1', last_seen_at: null as Date | null, site_visit_count: 0 },
  visits: [] as { patient_id: string; visited_at: Date; path: string }[],
}));

vi.mock('../src/config/prisma', () => {
  const tx = {
    patient: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (where.id !== db.patient.id) return { count: 0 };
        if (where.OR) {
          const cutoff: Date = where.OR[1].last_seen_at.lt;
          const seen = db.patient.last_seen_at;
          if (seen && seen >= cutoff) return { count: 0 };
        }
        db.patient.last_seen_at = data.last_seen_at;
        if (data.site_visit_count) db.patient.site_visit_count += 1;
        return { count: 1 };
      }),
    },
    patientSiteVisit: {
      create: vi.fn(async ({ data }: any) => {
        db.visits.push(data);
        return data;
      }),
    },
  };
  return {
    default: {
      $transaction: vi.fn(async (fn: any) => fn(tx)),
      patientSiteVisit: {
        count: vi.fn(async () => db.visits.length),
        groupBy: vi.fn(async ({ where }: any) => {
          const counts = new Map<string, number>();
          for (const v of db.visits) {
            if (where?.patient_id?.in && !where.patient_id.in.includes(v.patient_id)) continue;
            if (where?.visited_at?.gte && v.visited_at < where.visited_at.gte) continue;
            counts.set(v.patient_id, (counts.get(v.patient_id) ?? 0) + 1);
          }
          return [...counts].map(([patient_id, n]) => ({ patient_id, _count: { _all: n } }));
        }),
      },
    },
  };
});

import { recordPatientSiteVisit, retentionStats, visitCounts } from '../src/services/site-visits';
import { visitSchema } from '../src/modules/patients/schemas';

const at = (iso: string) => new Date(iso);

describe('recording visits', () => {
  beforeEach(() => {
    db.patient.last_seen_at = null;
    db.patient.site_visit_count = 0;
    db.visits.length = 0;
  });

  it('counts the first open, ignores refreshes, and counts a return after 30+ minutes away', async () => {
    expect(await recordPatientSiteVisit('p1', '/', at('2026-11-10T09:00:00Z'))).toBe(true);
    expect(await recordPatientSiteVisit('p1', '/dashboard', at('2026-11-10T09:05:00Z'))).toBe(false);
    // Still using the app: each call moves last_seen_at, so this is the same visit
    expect(await recordPatientSiteVisit('p1', '/education', at('2026-11-10T09:30:00Z'))).toBe(false);
    expect(db.patient.last_seen_at).toEqual(at('2026-11-10T09:30:00Z'));
    // Back after 31 minutes away, same day: a new visit (the old rule allowed one per day)
    expect(await recordPatientSiteVisit('p1', '/', at('2026-11-10T10:01:00Z'))).toBe(true);
    expect(db.visits.map((v) => v.path)).toEqual(['/', '/']);
    expect(db.patient.site_visit_count).toBe(2);
  });

  it('never throws (a failed write must not break the dashboard)', async () => {
    const prisma = (await import('../src/config/prisma')).default as any;
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(recordPatientSiteVisit('p1')).resolves.toBe(false);
  });

  it('works out retention from the visits table', async () => {
    db.visits.push(
      { patient_id: 'a', visited_at: at('2026-11-01T09:00:00Z'), path: '/' },
      { patient_id: 'a', visited_at: at('2026-11-10T09:00:00Z'), path: '/' },
      { patient_id: 'b', visited_at: at('2026-10-01T09:00:00Z'), path: '/' },
    );
    const stats = await retentionStats(at('2026-11-11T12:00:00Z'));
    expect(stats).toEqual({
      total_recorded_visits: 3,
      patients_with_a_visit: 2,
      returning_patients: 1,
      returning_rate: 50,
      patients_seen_last_7_days: 1,
    });
    expect(Object.fromEntries(await visitCounts(['a', 'b', 'c']))).toEqual({ a: 2, b: 1 });
  });

  it('accepts a missing or odd page path without failing the request', () => {
    expect(visitSchema.parse(undefined)).toEqual({});
    expect(visitSchema.parse({ path: '/education/abc-123' }).path).toBe('/education/abc-123');
    expect(visitSchema.parse({ path: 'javascript:alert(1)' }).path).toBeUndefined();
  });
});
