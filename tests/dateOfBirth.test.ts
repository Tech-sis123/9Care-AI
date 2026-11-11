import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/prisma', () => ({
  default: {
    patient: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import prisma from '../src/config/prisma';
import { ageOn, parseDateOfBirth, refreshedAge, dateOfBirthSchema } from '../src/utils/dateOfBirth';
import { patientsController } from '../src/modules/patients/controller';
import { createProfileSchema } from '../src/modules/patients/schemas';
import { matchedFactors } from '../src/services/patientRecovery';

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('date of birth and age', () => {
  it('reads only real calendar dates', () => {
    expect(parseDateOfBirth('1996-08-15')).toEqual(new Date('1996-08-15T00:00:00Z'));
    expect(parseDateOfBirth('1996-02-30')).toBeNull();
    expect(parseDateOfBirth('15/08/1996')).toBeNull();
    expect(parseDateOfBirth('')).toBeNull();
  });

  it('works out the age, going up on her birthday', () => {
    const dob = parseDateOfBirth('1996-08-15')!;
    expect(ageOn(dob, new Date('2026-08-14T23:00:00Z'))).toBe(29);
    expect(ageOn(dob, new Date('2026-08-15T00:00:00Z'))).toBe(30);
  });

  it('says when the stored age is out of date', () => {
    const today = new Date('2026-11-11T00:00:00Z');
    const dob = parseDateOfBirth('1996-08-15')!;
    expect(refreshedAge({ date_of_birth: dob, age: 29 }, today)).toBe(30);
    expect(refreshedAge({ date_of_birth: dob, age: 30 }, today)).toBeNull();
    expect(refreshedAge({ date_of_birth: null, age: 29 }, today)).toBeNull();
  });

  it('accepts ages 10 to 60 only', () => {
    expect(dateOfBirthSchema.safeParse('1996-08-15').success).toBe(true);
    expect(dateOfBirthSchema.safeParse(`${new Date().getUTCFullYear() - 5}-01-01`).success).toBe(false);
    expect(dateOfBirthSchema.safeParse('1900-01-01').success).toBe(false);
  });
});

describe('saving the date of birth on her profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patient.update).mockImplementation(async ({ data }: any) => ({ id: 'p1', password_hash: 'hash', ...data }) as any);
  });

  const save = async (body: Record<string, unknown>, before: Record<string, unknown> = {}) => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: 'p1', ...before } as any);
    const res = mockRes();
    const next = vi.fn();
    await patientsController.upsertProfile({ user: { id: 'p1' }, body: createProfileSchema.parse(body) } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    return { data: vi.mocked(prisma.patient.update).mock.calls[0][0].data as any, res };
  };

  it('stores the date and the age from it (the pop-up sends only the date)', async () => {
    const { data, res } = await save({ date_of_birth: '1996-08-15' });
    expect(data.date_of_birth).toEqual(new Date('1996-08-15T00:00:00Z'));
    expect(data.age).toBe(ageOn(new Date('1996-08-15T00:00:00Z')));
    expect(data.name).toBeUndefined();
    // The password hash never goes back to the app
    expect(res.json.mock.calls[0][0].patient.password_hash).toBeUndefined();
  });

  it('ignores a typed age from an old app version once a date of birth is saved', async () => {
    const { data } = await save({ name: 'Ada', age: 25 }, { date_of_birth: new Date('1996-08-15T00:00:00Z') });
    expect(data.age).toBeUndefined();
    vi.clearAllMocks();
    vi.mocked(prisma.patient.update).mockImplementation(async ({ data: d }: any) => ({ id: 'p1', ...d }) as any);
    const older = await save({ name: 'Ada', age: 25 }, { date_of_birth: null });
    expect(older.data.age).toBe(25);
  });
});

describe('account recovery with a saved date of birth', () => {
  const candidate = { id: 'p1', name: 'Ada Okafor', phone_number: '+2348012345678', email: null, education_level: null };

  it('needs the exact date when one is saved, and allows a year either way for age-only accounts', () => {
    const withDob = { ...candidate, age: 30, date_of_birth: new Date('1996-08-15T00:00:00Z') };
    expect(matchedFactors(withDob, { full_name: 'Ada Okafor', date_of_birth: '1996-08-15' })).toContain('date_of_birth');
    expect(matchedFactors(withDob, { full_name: 'Ada Okafor', date_of_birth: '1996-08-16' })).not.toContain('date_of_birth');

    const ageOnly = { ...candidate, age: 30, date_of_birth: null };
    const born = `${new Date().getFullYear() - 31}-01-01`;
    expect(matchedFactors(ageOnly, { full_name: 'Ada Okafor', date_of_birth: born })).toContain('date_of_birth');
  });
});
