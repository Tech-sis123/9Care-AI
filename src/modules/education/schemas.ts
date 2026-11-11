import { z } from 'zod';
import { EDUCATION_STAGE_IDS, normalizeStages } from './stages';

export const educationModulesQuerySchema = z.object({
  week: z.string().optional().transform((v) => v ? parseInt(v, 10) : undefined),
});

export const moduleIdParamSchema = z.object({
  id: z.string().min(1, 'Invalid module ID'),
});

export const markProgressSchema = z.object({
  module_id: z.string().min(1, 'Invalid module ID'),
});

// ── Doctor content management ──────────────────────────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), { message: 'Must be a link starting with http:// or https://' });

export const educationContentSchema = z
  .object({
    content_type: z.enum(['video', 'article']),
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
    // Who sees it: one or more groups. `stage` (a single group) is still accepted from older app versions.
    stages: z.array(z.enum(EDUCATION_STAGE_IDS)).min(1, 'Choose at least one group').optional(),
    stage: z.enum(EDUCATION_STAGE_IDS).optional(),
    summary: optionalText(2000),
    video_url: optionalUrl,
    transcript: optionalText(100_000),
    body: optionalText(100_000),
    article_url: optionalUrl,
    status: z.enum(['draft', 'published']).default('published'),
  })
  .transform(({ stage, stages, ...rest }) => ({ ...rest, stages: normalizeStages(stages ?? [stage ?? 'general']) }))
  .superRefine((data, ctx) => {
    if (data.content_type === 'video' && !data.video_url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['video_url'], message: 'A video link is required' });
    }
    if (data.content_type === 'article' && !data.body && !data.article_url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'Write the article or add a link to it' });
    }
  });

export const educationStatusSchema = z.object({
  status: z.enum(['draft', 'published']),
});

// ── Lesson comments ────────────────────────────────────────────────────────

export const commentBodySchema = z.object({
  body: z.string().trim().min(1, 'Write a comment first').max(2000, 'Comments can be up to 2000 characters'),
});

export const moduleCommentParamsSchema = z.object({
  id: z.string().min(1),
  commentId: z.string().uuid('Invalid comment ID'),
});

export const commentIdParamSchema = z.object({
  id: z.string().uuid('Invalid comment ID'),
});

export const doctorCommentsQuerySchema = z.object({
  status: z.enum(['awaiting', 'all']).optional(),
  module_id: z.string().optional(),
});

export const commentHiddenSchema = z.object({
  hidden: z.boolean(),
});
