import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/prisma', () => ({
  default: {
    patient: { update: vi.fn(), count: vi.fn() },
  },
}));

import prisma from '../src/config/prisma';
import { CURRENT_TUTORIAL_VERSION, tutorialStatus, tutorialStats } from '../src/utils/tutorial';
import { patientsController } from '../src/modules/patients/controller';
import { tutorialSchema } from '../src/modules/patients/schemas';

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('when the guided tour shows', () => {
  const seen = new Date('2026-11-12T09:00:00Z');

  it('shows once her health profile is submitted, until she finishes or skips this version', () => {
    expect(tutorialStatus({ intake_status: 'submitted', tutorial_seen_at: null }).show).toBe(true);
    // New sign-ups see it only after the health profile
    expect(tutorialStatus({ intake_status: 'in_progress', tutorial_seen_at: null }).show).toBe(false);
    expect(tutorialStatus({ intake_status: 'not_started', tutorial_seen_at: null }).show).toBe(false);
    // Finished or skipped: not again
    expect(tutorialStatus({ intake_status: 'submitted', tutorial_seen_at: seen, tutorial_version: CURRENT_TUTORIAL_VERSION }).show).toBe(false);
  });

  it('shows again when the tour version goes up', () => {
    expect(tutorialStatus({ intake_status: 'submitted', tutorial_seen_at: seen, tutorial_version: CURRENT_TUTORIAL_VERSION - 1 }).show).toBe(true);
    expect(tutorialStatus({ intake_status: 'submitted', tutorial_seen_at: seen, tutorial_version: null }).show).toBe(true);
  });
});

describe('saving that she has seen it', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patient.update).mockImplementation(async ({ data }: any) => data);
  });

  const save = async (body: unknown) => {
    const res = mockRes();
    const next = vi.fn();
    await patientsController.markTutorialSeen({ user: { id: 'p1' }, body: tutorialSchema.parse(body) } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    return vi.mocked(prisma.patient.update).mock.calls[0][0] as any;
  };

  it('records a skip halfway as seen, with the date and tour version', async () => {
    const call = await save({ skipped: true });
    expect(call.where).toEqual({ id: 'p1' });
    expect(call.data.tutorial_skipped).toBe(true);
    expect(call.data.tutorial_version).toBe(CURRENT_TUTORIAL_VERSION);
    expect(call.data.tutorial_seen_at).toBeInstanceOf(Date);
  });

  it('records a finished tour as not skipped', async () => {
    expect((await save({ skipped: false })).data.tutorial_skipped).toBe(false);
    vi.clearAllMocks();
    vi.mocked(prisma.patient.update).mockImplementation(async ({ data }: any) => data);
    expect((await save(undefined)).data.tutorial_skipped).toBe(false);
  });
});

describe('tour counts for the team', () => {
  it('splits patients into finished, skipped and not seen yet', async () => {
    vi.mocked(prisma.patient.count)
      .mockResolvedValueOnce(40) // all patients
      .mockResolvedValueOnce(12) // finished
      .mockResolvedValueOnce(5); // skipped
    expect(await tutorialStats()).toEqual({ version: CURRENT_TUTORIAL_VERSION, completed: 12, skipped: 5, not_seen: 23 });
    const finishedWhere = vi.mocked(prisma.patient.count).mock.calls[1][0]!.where as any;
    expect(finishedWhere).toMatchObject({ tutorial_skipped: false, tutorial_version: { gte: CURRENT_TUTORIAL_VERSION } });
  });
});
