import { Response, NextFunction } from 'express';
import prisma from '../../config/prisma';
import { env } from '../../config/env';
import { AuthRequest } from '../../utils/types';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';

/**
 * Comments on education lessons: patients ask, doctors reply (one level deep).
 *
 * Privacy: patients see each other's comments (first name only) and the doctors'
 * replies. Set EDUCATION_COMMENTS_PUBLIC=false so each patient sees only her own
 * comments and the replies to them.
 */

const commentsArePublic = () => env.EDUCATION_COMMENTS_PUBLIC === 'true';

const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || 'A mother';

type ReplyRow = { id: string; parent_id: string | null; body: string; created_at: Date; hidden: boolean; doctor: { name: string } | null };

function shapeReply(r: ReplyRow) {
  return { id: r.id, body: r.body, created_at: r.created_at, author: { type: 'doctor' as const, name: r.doctor?.name || 'Doctor' } };
}

async function repliesFor(parentIds: string[], includeHidden = false) {
  if (parentIds.length === 0) return new Map<string, ReplyRow[]>();
  const rows = await prisma.educationComment.findMany({
    where: { parent_id: { in: parentIds }, ...(includeHidden ? {} : { hidden: false }) },
    include: { doctor: { select: { name: true } } },
    orderBy: { created_at: 'asc' },
  });
  const byParent = new Map<string, ReplyRow[]>();
  for (const r of rows) {
    const list = byParent.get(r.parent_id!) || [];
    list.push(r);
    byParent.set(r.parent_id!, list);
  }
  return byParent;
}

async function assertVisibleModule(moduleId: string) {
  const module = await prisma.educationModule.findUnique({ where: { id: moduleId }, select: { id: true, status: true } });
  if (!module || module.status !== 'published') throw new NotFoundError('Education module not found');
}

export const educationCommentsController = {
  /**
   * GET /education/modules/:id/comments — threads the patient may see
   */
  async listForPatient(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const moduleId = req.params.id as string;
      const patientId = req.user!.id;
      await assertVisibleModule(moduleId);

      const comments = await prisma.educationComment.findMany({
        where: {
          module_id: moduleId,
          parent_id: null,
          hidden: false,
          ...(commentsArePublic() ? {} : { patient_id: patientId }),
        },
        include: { patient: { select: { name: true } } },
        orderBy: { created_at: 'desc' },
        take: 100,
      });
      const replies = await repliesFor(comments.map((c) => c.id));

      res.status(200).json({
        public: commentsArePublic(),
        comments: comments.map((c) => ({
          id: c.id,
          body: c.body,
          created_at: c.created_at,
          is_mine: c.patient_id === patientId,
          author: { type: 'patient', name: c.patient_id === patientId ? 'You' : firstName(c.patient?.name) },
          replies: (replies.get(c.id) || []).map(shapeReply),
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /education/modules/:id/comments — patient adds a comment or question
   */
  async createByPatient(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const moduleId = req.params.id as string;
      const patientId = req.user!.id;
      await assertVisibleModule(moduleId);

      const comment = await prisma.educationComment.create({
        data: { module_id: moduleId, author_type: 'patient', patient_id: patientId, body: req.body.body },
      });
      res.status(201).json({
        comment: {
          id: comment.id,
          body: comment.body,
          created_at: comment.created_at,
          is_mine: true,
          author: { type: 'patient', name: 'You' },
          replies: [],
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /education/modules/:id/comments/:commentId — patient removes her own comment (and its replies)
   */
  async deleteByPatient(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const comment = await prisma.educationComment.findUnique({ where: { id: req.params.commentId as string } });
      if (!comment || comment.module_id !== req.params.id) throw new NotFoundError('Comment not found');
      if (comment.patient_id !== req.user!.id) throw new ForbiddenError('You can only delete your own comments');

      await prisma.$transaction([
        prisma.educationComment.deleteMany({ where: { parent_id: comment.id } }),
        prisma.educationComment.delete({ where: { id: comment.id } }),
      ]);
      res.status(200).json({ message: 'Comment deleted' });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /education/manage/comments?status=awaiting|all&module_id=
   * All patient comments for the doctor Education tab, newest first.
   */
  async listForDoctor(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, module_id } = req.query as { status?: 'awaiting' | 'all'; module_id?: string };

      const comments = await prisma.educationComment.findMany({
        where: { parent_id: null, ...(module_id ? { module_id } : {}) },
        include: { patient: { select: { id: true, name: true } } },
        orderBy: { created_at: 'desc' },
        take: 300,
      });
      const replies = await repliesFor(comments.map((c) => c.id), true);

      const moduleIds = Array.from(new Set(comments.map((c) => c.module_id)));
      const modules = await prisma.educationModule.findMany({
        where: { id: { in: moduleIds } },
        select: { id: true, title: true },
      });
      const titles = new Map(modules.map((m) => [m.id, m.title]));

      const threads = comments
        .map((c) => {
          const threadReplies = replies.get(c.id) || [];
          return {
            id: c.id,
            module_id: c.module_id,
            module_title: titles.get(c.module_id) || 'Deleted lesson',
            body: c.body,
            created_at: c.created_at,
            hidden: c.hidden,
            patient: { id: c.patient?.id || null, name: c.patient?.name || 'Patient' },
            awaiting_reply: !c.hidden && !threadReplies.some((r) => !r.hidden),
            replies: threadReplies.map((r) => ({ ...shapeReply(r), hidden: r.hidden })),
          };
        })
        .filter((t) => status !== 'awaiting' || t.awaiting_reply);

      res.status(200).json({ comments: threads });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /education/manage/comments/:id/replies — doctor replies to a patient comment
   */
  async replyByDoctor(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parent = await prisma.educationComment.findUnique({ where: { id: req.params.id as string } });
      if (!parent) throw new NotFoundError('Comment not found');
      if (parent.parent_id) throw new ValidationError('Reply to the original comment, not to a reply');

      const reply = await prisma.educationComment.create({
        data: {
          module_id: parent.module_id,
          parent_id: parent.id,
          author_type: 'doctor',
          doctor_id: req.user!.id,
          body: req.body.body,
        },
        include: { doctor: { select: { name: true } } },
      });

      await prisma.auditLog
        .create({
          data: {
            actor_type: 'doctor',
            actor_id: req.user!.id,
            action: 'education_comment_reply',
            resource_type: 'education_comment',
            resource_id: parent.id,
            after: { reply_id: reply.id },
          },
        })
        .catch((err) => logger.warn({ err }, 'Failed to audit comment reply'));

      res.status(201).json({ reply: { ...shapeReply(reply), hidden: false } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /education/manage/comments/:id — doctor hides or un-hides a comment or reply
   */
  async setHiddenByDoctor(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.educationComment.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new NotFoundError('Comment not found');

      const comment = await prisma.educationComment.update({
        where: { id: existing.id },
        data: { hidden: req.body.hidden },
      });

      await prisma.auditLog
        .create({
          data: {
            actor_type: 'doctor',
            actor_id: req.user!.id,
            action: comment.hidden ? 'education_comment_hidden' : 'education_comment_unhidden',
            resource_type: 'education_comment',
            resource_id: comment.id,
            before: { hidden: existing.hidden, body: existing.body },
            after: { hidden: comment.hidden },
          },
        })
        .catch((err) => logger.warn({ err }, 'Failed to audit comment visibility change'));

      res.status(200).json({ id: comment.id, hidden: comment.hidden });
    } catch (err) {
      next(err);
    }
  },
};

/** Per-lesson comment totals for the doctor's content list. */
export async function commentStatsByModule() {
  const top = await prisma.educationComment.findMany({
    where: { parent_id: null, hidden: false },
    select: { id: true, module_id: true },
  });
  const answered = new Set(
    (
      await prisma.educationComment.findMany({
        where: { parent_id: { in: top.map((t) => t.id) }, author_type: 'doctor', hidden: false },
        select: { parent_id: true },
      })
    ).map((r) => r.parent_id)
  );
  const stats: Record<string, { total: number; awaiting: number }> = {};
  for (const t of top) {
    const s = (stats[t.module_id] ||= { total: 0, awaiting: 0 });
    s.total++;
    if (!answered.has(t.id)) s.awaiting++;
  }
  return stats;
}
