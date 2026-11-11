import { z } from 'zod';
import { dateOfBirthSchema } from '../../utils/dateOfBirth';

export const otpRequestSchema = z.object({
  phone_number: z
    .string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(15, 'Phone number too long')
    .regex(/^\+?[0-9]+$/, 'Invalid phone number format'),
  channel: z.enum(['sms', 'whatsapp']).optional(),
});

export const otpVerifySchema = z.object({
  pin_id: z.string().min(1, 'pin_id is required'),
  code: z
    .string()
    .length(6, 'OTP code must be 6 digits')
    .regex(/^[0-9]+$/, 'OTP code must be numeric'),
});

/** After OTP signup — set email + password for future password logins (no OTP). */
export const patientSetCredentialsSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name is required').optional(),
  date_of_birth: dateOfBirthSchema.optional(),
  /** Older app versions send only the age */
  age: z.number().int().min(10).max(60).optional(),
});

/**
 * Returning patients log in with email or username + password (no OTP).
 * `identifier` is preferred; `email` is still accepted from older clients.
 */
export const patientLoginSchema = z
  .object({
    identifier: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((d) => !!(d.identifier || d.email), { message: 'Enter your email or username', path: ['identifier'] })
  .transform((d) => ({ identifier: (d.identifier || d.email)!.toLowerCase(), password: d.password }));

/** Direct email+password signup — no OTP required. */
export const patientRegisterEmailSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name is required').optional(),
  // Preferably a WhatsApp number; optional here so older app versions can still sign up
  phone_number: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => (val ? val : null))
    .refine((val) => val === null || /^\+?[0-9\s-]{10,18}$/.test(val), 'Enter a valid phone number'),
  date_of_birth: dateOfBirthSchema.optional(),
});

export const doctorLoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token is required'),
});

export const doctorRegisterSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name is required'),
  hospital: z.string().optional(),
  phone_number: z.string().trim().optional().nullable().transform(val => val === '' ? null : val),
});

export const doctorForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  new_password: z.string().min(6, 'Password must be at least 6 characters'),
});

/** Patient adds or updates email (OTP accounts, or email change). */
export const patientEmailRequestSchema = z.object({
  email: z.string().email('Enter a valid email address, not a phone number or username'),
});

export const patientEmailVerifySchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// ── Temporary biodata account recovery ───────────────────────────────────────

const optionalTrimmed = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

// Same options as the intake questionnaire
export const EDUCATION_LEVELS = ['Primary', 'Secondary', 'Tertiary (University, Polytechnic)', 'None'] as const;

export const patientRecoverSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, 'Enter your first and last name'),
    date_of_birth: optionalTrimmed.refine(
      (v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && Date.parse(v) < Date.now()),
      'Enter a valid date of birth'
    ),
    education_level: z.enum(EDUCATION_LEVELS).optional().nullable().transform((v) => v ?? null),
    email: optionalTrimmed,
    phone_number: optionalTrimmed,
  })
  .refine(
    (d) => [d.date_of_birth, d.education_level, d.email, d.phone_number].filter((v) => v !== null && v !== '').length >= 2,
    { message: 'Fill in at least 2 of the other details', path: ['details'] }
  );

export const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

const loginDetailsFields = {
  method: z.enum(['email', 'username']),
  email: z.string().trim().toLowerCase().optional(),
  username: z.string().trim().toLowerCase().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
};

const checkLoginDetails = (d: { method: 'email' | 'username'; email?: string; username?: string }, ctx: z.RefinementCtx) => {
  if (d.method === 'email' && !(d.email && z.string().email().safeParse(d.email).success)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'Enter a valid email address' });
  }
  if (d.method === 'username' && !(d.username && USERNAME_RE.test(d.username))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['username'],
      message: 'Username must be 3–30 characters: letters, numbers, dots or underscores',
    });
  }
};

/** New login details after recovery: either a real email or a username, plus a password. */
export const recoverCredentialsSchema = z
  .object({
    ...loginDetailsFields,
    recovery_token: z.string().min(1, 'Recovery session expired. Start again.'),
  })
  .superRefine(checkLoginDetails);
