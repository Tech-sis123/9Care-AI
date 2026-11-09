import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/prisma', () => ({
  default: {
    educationModule: { findUnique: vi.fn(), findMany: vi.fn() },
    educationComment: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import prisma from '../src/config/prisma';
import { env } from '../src/config/env';
import { educationCommentsController, commentStatsByModule } from '../src/modules/education/comments';
import { doctorGuidanceText, patientGuidanceText } from '../src/services/clinicalGuidance';

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('lesson comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.educationModule.findUnique).mockResolvedValue({ id: 'm1', status: 'published' } as any);
  });

  it('when switched to private, shows a patient only her own comments, with doctor replies', async () => {
    env.EDUCATION_COMMENTS_PUBLIC = 'false';
    vi.mocked(prisma.educationComment.findMany)
      .mockResolvedValueOnce([
        { id: 'c1', body: 'Is this normal?', created_at: new Date(), patient_id: 'p1', patient: { name: 'Ada Okafor' } },
      ] as any)
      .mockResolvedValueOnce([
        { id: 'r1', parent_id: 'c1', body: 'Yes', created_at: new Date(), hidden: false, doctor: { name: 'Dr Bello' } },
      ] as any);

    const res = mockRes();
    await educationCommentsController.listForPatient({ params: { id: 'm1' }, user: { id: 'p1' } } as any, res, vi.fn());

    const where = vi.mocked(prisma.educationComment.findMany).mock.calls[0][0]!.where as any;
    expect(where).toMatchObject({ module_id: 'm1', parent_id: null, hidden: false, patient_id: 'p1' });
    const body = res.json.mock.calls[0][0];
    expect(body.comments[0]).toMatchObject({ is_mine: true, author: { name: 'You' } });
    expect(body.comments[0].replies[0].author).toEqual({ type: 'doctor', name: 'Dr Bello' });
  });

  it('is public by default: other patients by first name only, with doctor replies', async () => {
    env.EDUCATION_COMMENTS_PUBLIC = 'true';
    vi.mocked(prisma.educationComment.findMany)
      .mockResolvedValueOnce([
        { id: 'c2', body: 'Thanks', created_at: new Date(), patient_id: 'p2', patient: { name: 'Bisi Adeyemi' } },
      ] as any)
      .mockResolvedValueOnce([
        { id: 'r2', parent_id: 'c2', body: 'You are welcome', created_at: new Date(), hidden: false, doctor: { name: 'Dr Bello' } },
      ] as any);

    const res = mockRes();
    await educationCommentsController.listForPatient({ params: { id: 'm1' }, user: { id: 'p1' } } as any, res, vi.fn());

    const where = vi.mocked(prisma.educationComment.findMany).mock.calls[0][0]!.where as any;
    expect(where.patient_id).toBeUndefined();
    const body = res.json.mock.calls[0][0];
    expect(body.public).toBe(true);
    expect(body.comments[0].author.name).toBe('Bisi');
    expect(body.comments[0].replies[0].body).toBe('You are welcome');
  });

  it('does not let doctors reply to a reply', async () => {
    vi.mocked(prisma.educationComment.findUnique).mockResolvedValue({ id: 'r1', parent_id: 'c1' } as any);
    const next = vi.fn();
    await educationCommentsController.replyByDoctor(
      { params: { id: 'r1' }, user: { id: 'd1' }, body: { body: 'hi' } } as any,
      mockRes(),
      next
    );
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(prisma.educationComment.create).not.toHaveBeenCalled();
  });

  it('counts comments awaiting a doctor reply per lesson', async () => {
    vi.mocked(prisma.educationComment.findMany)
      .mockResolvedValueOnce([
        { id: 'c1', module_id: 'm1' },
        { id: 'c2', module_id: 'm1' },
        { id: 'c3', module_id: 'm2' },
      ] as any)
      .mockResolvedValueOnce([{ parent_id: 'c1' }] as any);

    expect(await commentStatsByModule()).toEqual({
      m1: { total: 2, awaiting: 1 },
      m2: { total: 1, awaiting: 1 },
    });
  });
});

describe('clinical guidance context', () => {
  it('includes the FIGO anaemia recommendations with citation', () => {
    expect(doctorGuidanceText()).toContain('doi:10.1002/ijgo.70529');
    expect(doctorGuidanceText()).toContain('Hb < 11.0 g/dL');
    // Patient-facing points must not contain doses
    expect(patientGuidanceText()).not.toMatch(/\d+\s?mg/);
  });
});
