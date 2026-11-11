import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/prisma', () => ({
  default: {
    pregnancy: { findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import prisma from '../src/config/prisma';
import { postpartumStatus, deliverySummary } from '../src/utils/delivery';
import { visibleStages, moduleStage } from '../src/modules/education/stages';
import { deliverySchema } from '../src/modules/patients/schemas';
import { educationContentSchema } from '../src/modules/education/schemas';
import { patientsController } from '../src/modules/patients/controller';

// Noon in Lagos, so the calendar day is unambiguous
const on = (date: string) => new Date(`${date}T11:00:00Z`);

describe('postpartum counter', () => {
  it.each([
    ['2026-10-01', 'Delivered today'],
    ['2026-10-02', '1 day postpartum'],
    ['2026-10-05', '4 days postpartum'],
    ['2026-10-07', '6 days postpartum'],
    ['2026-10-08', '1 week postpartum'],
    ['2026-10-22', '3 weeks postpartum'],
    ['2026-11-12', '6 weeks postpartum'], // day 42
    ['2026-11-13', 'Postpartum period completed'], // day 43
  ])('on %s shows "%s"', (today, label) => {
    expect(postpartumStatus(new Date('2026-10-01T00:00:00Z'), on(today))?.label).toBe(label);
  });

  it('summarises saved delivery details for the doctor', () => {
    const summary = deliverySummary(
      {
        delivery_date: new Date('2026-10-01T00:00:00Z'),
        delivery_had_complications: true,
        comp_postpartum_hemorrhage: true,
        comp_other: true,
        comp_other_details: 'Retained placenta',
        delivery_outcome: 'alive_well',
        delivery_mode: 'caesarean',
      },
      on('2026-10-04')
    );
    expect(summary).toMatchObject({
      delivered: true,
      delivery_date: '2026-10-01',
      outcome_label: 'Alive and well',
      mode_label: 'Caesarean section (C-section)',
      postpartum: { days: 3, label: '3 days postpartum' },
    });
    expect((summary as any).complications.map((c: any) => c.label)).toEqual(['Postpartum hemorrhage', 'Other: Retained placenta']);
    expect(deliverySummary({ delivery_date: null })).toEqual({ delivered: false });
  });
});

describe('lesson groups', () => {
  it('maps legacy single-week lessons into trimesters', () => {
    expect(moduleStage({ week_number: null })).toBe('general');
    expect(moduleStage({ week_number: 13 })).toBe('trimester_1');
    expect(moduleStage({ week_number: 14 })).toBe('trimester_2');
    expect(moduleStage({ week_number: 28 })).toBe('trimester_3');
    expect(moduleStage({ stage: 'postpartum', week_number: 12 })).toBe('postpartum');
  });

  it('shows pregnant women general + their trimester', () => {
    expect([...visibleStages({ egaWeeks: 20, delivered: false, postpartum: null })]).toEqual(['general', 'trimester_2']);
    expect([...visibleStages({ egaWeeks: 41, delivered: false, postpartum: null })]).toEqual(['general', 'trimester_3']);
  });

  it('shows postpartum lessons for 6 weeks after delivery only', () => {
    const during = postpartumStatus(new Date('2026-10-01T00:00:00Z'), on('2026-10-20'));
    const after = postpartumStatus(new Date('2026-10-01T00:00:00Z'), on('2026-12-01'));
    expect([...visibleStages({ egaWeeks: null, delivered: true, postpartum: during })]).toEqual(['general', 'postpartum']);
    expect([...visibleStages({ egaWeeks: null, delivered: true, postpartum: after })]).toEqual(['general']);
  });

  it('doctor form accepts a group instead of a week', () => {
    const parsed = educationContentSchema.parse({ content_type: 'video', title: 'Breastfeeding', video_url: 'https://youtu.be/x', stage: 'postpartum' });
    expect(parsed.stages).toEqual(['postpartum']);
    expect(educationContentSchema.safeParse({ content_type: 'video', title: 'Bad', video_url: 'https://youtu.be/x', stage: 'week_9' }).success).toBe(false);
  });
});

describe('delivery form validation', () => {
  const base = { delivery_date: '2026-10-01', had_complications: false, outcome: 'alive_well', mode: 'vaginal' };

  it('accepts a form with no complications', () => {
    expect(deliverySchema.safeParse(base).success).toBe(true);
  });

  it('needs at least one complication when Yes is chosen, and text for Other', () => {
    expect(deliverySchema.safeParse({ ...base, had_complications: true }).success).toBe(false);
    expect(deliverySchema.safeParse({ ...base, had_complications: true, complications: ['other'] }).success).toBe(false);
    expect(
      deliverySchema.safeParse({ ...base, had_complications: true, complications: ['other'], other_complication: 'Fever' }).success
    ).toBe(true);
  });
});

describe('saving delivery details', () => {
  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
  };
  const save = async (body: Record<string, unknown>) => {
    const res = mockRes();
    const next = vi.fn();
    await patientsController.saveDelivery({ user: { id: 'p1' }, body } as any, res, next);
    return { res, next };
  };
  const body = {
    delivery_date: '2026-10-01',
    had_complications: true,
    complications: ['eclampsia', 'prolonged_labour'],
    outcome: 'alive_with_complications',
    mode: 'caesarean',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(on('2026-10-10'));
    vi.mocked(prisma.pregnancy.findFirst).mockResolvedValue({ id: 'preg1', lmp_date: new Date('2026-01-10T00:00:00Z'), delivery_date: null } as any);
    vi.mocked(prisma.pregnancy.update).mockImplementation(async ({ data }: any) => ({ id: 'preg1', ...data }) as any);
  });

  it('saves each complication as its own yes/no field', async () => {
    const { res, next } = await save(body);
    expect(next).not.toHaveBeenCalled();
    const data = vi.mocked(prisma.pregnancy.update).mock.calls[0][0].data as any;
    expect(data).toMatchObject({
      delivery_had_complications: true,
      comp_eclampsia: true,
      comp_prolonged_labour: true,
      comp_preeclampsia: false,
      comp_postpartum_hemorrhage: false,
      comp_other: false,
      comp_other_details: null,
      delivery_outcome: 'alive_with_complications',
      delivery_mode: 'caesarean',
    });
    expect(data.delivery_date.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(res.json.mock.calls[0][0].delivery.postpartum.label).toBe('1 week postpartum');
    vi.useRealTimers();
  });

  it('rejects a future date or a date before the pregnancy started', async () => {
    expect((await save({ ...body, delivery_date: '2026-10-11' })).next.mock.calls[0][0].message).toMatch(/future/);
    expect((await save({ ...body, delivery_date: '2026-01-01' })).next.mock.calls[0][0].message).toMatch(/before the start/);
    expect(prisma.pregnancy.update).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
