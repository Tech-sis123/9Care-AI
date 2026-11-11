import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/redis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { redis: new RedisMock() };
});

vi.mock('../src/config/prisma', () => ({
  default: {
    patient: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock('../src/services/brevo', () => ({
  brevoService: { sendEmail: vi.fn().mockResolvedValue({}) },
}));

import prisma from '../src/config/prisma';
import { authController } from '../src/modules/auth/controller';
import { patientRegisterEmailSchema } from '../src/modules/auth/schemas';
import { phoneVariants } from '../src/utils/contact';

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const register = async (body: Record<string, unknown>) => {
  const res = mockRes();
  const next = vi.fn();
  await authController.patientRegisterEmail({ body: patientRegisterEmailSchema.parse(body) } as any, res, next);
  return { res, next };
};

describe('email sign-up with phone number', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patient.create).mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }) as any);
  });

  it('saves the phone in the same +234 format as phone sign-ups', async () => {
    vi.mocked(prisma.patient.findFirst).mockResolvedValue(null);
    const { next } = await register({ email: 'ada@example.com', password: 'secret1', name: 'Ada', phone_number: '0801 234 5678' });
    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    expect(vi.mocked(prisma.patient.create).mock.calls[0][0].data.phone_number).toBe('+2348012345678');
  });

  it('blocks a phone number that already has an account', async () => {
    vi.mocked(prisma.patient.findFirst)
      .mockResolvedValueOnce(null) // email is free
      .mockResolvedValueOnce({ id: 'other' } as any); // phone is taken
    const { next } = await register({ email: 'bisi@example.com', password: 'secret1', phone_number: '+2348012345678' });
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(prisma.patient.create).not.toHaveBeenCalled();
    const where = vi.mocked(prisma.patient.findFirst).mock.calls[1][0]!.where as any;
    expect(where.phone_number.in).toEqual(expect.arrayContaining(phoneVariants('08012345678')));
  });

  it('still works without a phone (older app versions)', async () => {
    vi.mocked(prisma.patient.findFirst).mockResolvedValue(null);
    await register({ email: 'chi@example.com', password: 'secret1' });
    expect(vi.mocked(prisma.patient.create).mock.calls[0][0].data.phone_number).toMatch(/^email-/);
  });

  it('rejects an invalid phone number', () => {
    expect(patientRegisterEmailSchema.safeParse({ email: 'a@b.co', password: 'secret1', phone_number: 'abc' }).success).toBe(false);
  });

  it('saves her date of birth with the age worked out from it, and still signs up without one', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-11T09:00:00Z'), toFake: ['Date'] });
    vi.mocked(prisma.patient.findFirst).mockResolvedValue(null);
    const { res } = await register({ email: 'dupe@example.com', password: 'secret1', phone_number: '08012345678', date_of_birth: '1996-08-15' });
    const data = vi.mocked(prisma.patient.create).mock.calls[0][0].data;
    expect(data.date_of_birth).toEqual(new Date('1996-08-15T00:00:00Z'));
    expect(data.age).toBe(30);
    expect(res.json.mock.calls[0][0].patient.age).toBe(30);

    await register({ email: 'eke@example.com', password: 'secret1' });
    expect(vi.mocked(prisma.patient.create).mock.calls[1][0].data.date_of_birth).toBeUndefined();
    for (const bad of ['2023-01-01', '1996-02-30', '15/08/1996']) {
      expect(patientRegisterEmailSchema.safeParse({ email: 'a@b.co', password: 'secret1', date_of_birth: bad }).success, bad).toBe(false);
    }
    vi.useRealTimers();
  });
});
