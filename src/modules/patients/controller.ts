import { Response, NextFunction } from 'express';
import prisma from '../../config/prisma';
import { AuthRequest } from '../../utils/types';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  DELIVERY_COMPLICATIONS,
  DELIVERY_PROMPT_FROM_WEEK,
  deliveryDateFromString,
  deliverySummary,
  lagosDateString,
  pregnancyStartDate,
} from '../../utils/delivery';
import { moduleStage, visibleStages } from '../education/stages';
import { calculateEDD, calculateEGAWeeks, calculateEGADetailed } from '../../services/ega-calculator';
import { logger } from '../../utils/logger';
import { aiService } from '../../services/ai';
import { recordPatientSiteVisit } from '../../services/site-visits';
import { isUsableEmail } from '../../utils/contact';
import { whatsappContact, whatsappStatus } from '../../services/whatsappContact';
import { env } from '../../config/env';
import { ageOn, parseDateOfBirth, refreshedAge } from '../../utils/dateOfBirth';

/** Updates the stored age once her birthday has passed (age is read by the risk engine and doctors). */
async function keepAgeCurrent(patient: { id: string; date_of_birth: Date | null; age: number | null }) {
  const age = refreshedAge(patient);
  if (age == null) return;
  patient.age = age;
  await prisma.patient.update({ where: { id: patient.id }, data: { age } }).catch((err) => {
    logger.warn({ err, patientId: patient.id }, 'Failed to update age from date of birth');
  });
}

/** Ask for her date of birth when the app has neither it nor her age (e.g. older accounts). */
const needsDateOfBirth = (patient: { date_of_birth: Date | null; age: number | null }) =>
  !patient.date_of_birth && patient.age == null;

export const patientsController = {
  /**
   * POST /patients/profile — create or update biodata
   */
  async upsertProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const patientId = req.user!.id;
      const data = req.body;

      const before = await prisma.patient.findUnique({ where: { id: patientId } });
      if (!before) throw new NotFoundError('Patient not found');

      // Only set defined fields so partial updates never wipe columns with undefined
      const dataUpdate: Record<string, unknown> = {};
      if (data.name != null) dataUpdate.name = data.name;
      if (data.date_of_birth) {
        const dob = parseDateOfBirth(data.date_of_birth)!;
        dataUpdate.date_of_birth = dob;
        dataUpdate.age = ageOn(dob);
      } else if (data.age != null && !before.date_of_birth) {
        dataUpdate.age = data.age;
      }
      if (data.education_level !== undefined) dataUpdate.education_level = data.education_level;
      if (data.occupation !== undefined) dataUpdate.occupation = data.occupation;
      if (data.marital_status !== undefined) dataUpdate.marital_status = data.marital_status;
      if (data.address !== undefined) dataUpdate.address = data.address;
      if (data.religion !== undefined) dataUpdate.religion = data.religion;
      if (data.ethnicity !== undefined) dataUpdate.ethnicity = data.ethnicity;
      if (data.language_preference !== undefined) dataUpdate.language_preference = data.language_preference;
      if (data.emergency_contact_name !== undefined) {
        dataUpdate.emergency_contact_name = data.emergency_contact_name;
      }
      if (data.emergency_contact_relationship !== undefined) {
        dataUpdate.emergency_contact_relationship = data.emergency_contact_relationship;
      }
      if (data.emergency_contact_phone !== undefined) {
        dataUpdate.emergency_contact_phone = data.emergency_contact_phone;
      }

      const patient = await prisma.patient.update({
        where: { id: patientId },
        data: dataUpdate,
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          actor_type: 'patient',
          actor_id: patientId,
          action: 'profile_updated',
          resource_type: 'patient',
          resource_id: patientId,
          before: before as any,
          after: patient as any,
        },
      });

      const { password_hash: _pw, ...safePatient } = patient;
      res.status(200).json({ patient: safePatient });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /patients/pregnancy — create or update the latest pregnancy record
   */
  async createPregnancy(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const patientId = req.user!.id;
      const data = req.body;

      const hasLmp = data.lmp_date && !isNaN(Date.parse(data.lmp_date));
      const lmpDate = hasLmp ? new Date(data.lmp_date) : null;
      const eddComputed = lmpDate ? calculateEDD(lmpDate) : undefined;
      const currentEgaWeeks = lmpDate ? calculateEGAWeeks(lmpDate) : undefined;

      const ussDate =
        data.uss_date && !isNaN(Date.parse(data.uss_date)) ? new Date(data.uss_date) : undefined;

      const payload = {
        ...(lmpDate ? { lmp_date: lmpDate, edd_computed: eddComputed, current_ega_weeks: currentEgaWeeks } : {}),
        ...(data.booking_weight != null ? { booking_weight: data.booking_weight } : {}),
        ...(data.booking_height != null ? { booking_height: data.booking_height } : {}),
        ...(data.booking_bp_systolic != null ? { booking_bp_systolic: data.booking_bp_systolic } : {}),
        ...(data.booking_bp_diastolic != null ? { booking_bp_diastolic: data.booking_bp_diastolic } : {}),
        ...(data.blood_group != null ? { blood_group: data.blood_group } : {}),
        ...(data.genotype != null ? { genotype: data.genotype } : {}),
        ...(data.rhesus != null ? { rhesus: data.rhesus } : {}),
        ...(data.rvd_status != null ? { rvd_status: data.rvd_status } : {}),
        ...(data.vdrl != null ? { vdrl: data.vdrl } : {}),
        ...(data.pcv != null ? { pcv: data.pcv } : {}),
        ...(data.hep_b != null ? { hep_b: data.hep_b } : {}),
        ...(data.malaria_parasite != null ? { malaria_parasite: data.malaria_parasite } : {}),
        ...(data.urinalysis != null ? { urinalysis: data.urinalysis } : {}),
        ...(data.tetanus_history != null ? { tetanus_history: data.tetanus_history } : {}),
        ...(data.ipt_history != null ? { ipt_history: data.ipt_history } : {}),
        ...(ussDate ? { uss_date: ussDate } : {}),
        ...(data.uss_ega_weeks != null ? { uss_ega_weeks: data.uss_ega_weeks } : {}),
        ...(data.uss_notes != null ? { uss_notes: data.uss_notes } : {}),
        ...(data.booked_anc != null ? { booked_anc: data.booked_anc } : {}),
        ...(data.booked_anc_facility != null ? { booked_anc_facility: data.booked_anc_facility } : {}),
        ...(data.booking_ga_weeks != null ? { booking_ga_weeks: data.booking_ga_weeks } : {}),
        ...(data.gravidity != null ? { gravidity: data.gravidity } : {}),
        ...(data.parity != null ? { parity: data.parity } : {}),
      };

      const existing = await prisma.pregnancy.findFirst({
        where: { patient_id: patientId },
        orderBy: { id: 'desc' },
      });

      let pregnancy;
      if (existing) {
        pregnancy = await prisma.pregnancy.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        pregnancy = await prisma.pregnancy.create({
          data: {
            patient_id: patientId,
            ...payload,
          },
        });
      }

      await prisma.auditLog.create({
        data: {
          actor_type: 'patient',
          actor_id: patientId,
          action: existing ? 'pregnancy_updated' : 'pregnancy_created',
          resource_type: 'pregnancy',
          resource_id: pregnancy.id,
          before: existing as any,
          after: pregnancy as any,
        },
      });

      res.status(existing ? 200 : 201).json({ pregnancy });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /patients/me — full profile + pregnancy
   */
  async getMe(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const patientId = req.user!.id;

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        include: {
          pregnancies: { orderBy: { id: 'desc' }, take: 1 },
        },
      });

      if (!patient) {
        throw new NotFoundError('Patient not found');
      }
      await keepAgeCurrent(patient);

      // Recompute current EGA dynamically (not shown once she has delivered)
      const pregnancy = patient.pregnancies[0];
      const delivery = deliverySummary(pregnancy);
      let ega = null;
      if (pregnancy?.lmp_date && !delivery.delivered) {
        ega = calculateEGADetailed(new Date(pregnancy.lmp_date));
      }

      const { password_hash: _pw, ...safePatient } = patient as typeof patient & {
        password_hash?: string | null;
      };

      void recordPatientSiteVisit(patientId, '/profile');

      const email = safePatient.email ?? null;

      res.status(200).json({
        ...safePatient,
        has_password: !!_pw,
        email_verified: !!patient.email_verified_at,
        needs_email: !isUsableEmail(email) && !safePatient.username,
        current_ega: ega,
        delivery,
        whatsapp: whatsappStatus(patient),
        needs_date_of_birth: needsDateOfBirth(patient),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /patients/me/dashboard
   * Returns: current EGA, next appointment, this week's education module
   */
  async getDashboard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const patientId = req.user!.id;

      // Fetch patient + pregnancy
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        include: {
          pregnancies: { orderBy: { id: 'desc' }, take: 1 },
          risk_assessments: { orderBy: { created_at: 'desc' }, take: 1 },
        },
      });

      if (!patient) {
        throw new NotFoundError('Patient not found');
      }
      await keepAgeCurrent(patient);

      const pregnancy = patient.pregnancies[0] || null;
      const delivery = deliverySummary(pregnancy);
      let currentEga = null;
      let egaWeeks = 0;
      if (pregnancy?.lmp_date && !delivery.delivered) {
        currentEga = calculateEGADetailed(new Date(pregnancy.lmp_date));
        egaWeeks = currentEga.weeks;
      }

      // Next appointment
      const nextAppointment = await prisma.appointment.findFirst({
        where: {
          patient_id: patientId,
          status: 'booked',
          slot_start: { gte: new Date() },
        },
        orderBy: { slot_start: 'asc' },
        include: { doctor: { select: { name: true } } },
      });

      // This week's education module; after delivery, the newest lesson she can see (postpartum first)
      let educationModule;
      if (delivery.delivered) {
        const stages = visibleStages({ egaWeeks: null, postpartum: delivery.postpartum, delivered: true });
        const published = await prisma.educationModule.findMany({
          where: { status: 'published' },
          orderBy: { created_at: 'desc' },
        });
        const visible = published.filter((m) => stages.has(moduleStage(m)));
        educationModule = visible.find((m) => moduleStage(m) === 'postpartum') || visible[0] || null;
      } else {
        educationModule = await prisma.educationModule.findFirst({
          where: {
            week_number: egaWeeks > 0 ? egaWeeks : 6,
            status: 'published',
          },
        });
      }

      void recordPatientSiteVisit(patientId, '/dashboard');

      const latestRisk = patient.risk_assessments[0] || null;

      res.status(200).json({
        current_ega: currentEga,
        edd: pregnancy?.edd_computed,
        delivery,
        // Ask "Have you delivered?" from 30 weeks until she saves her delivery details
        delivery_prompt: !!pregnancy && !delivery.delivered && !!currentEga && currentEga.weeks >= DELIVERY_PROMPT_FROM_WEEK,
        pregnancy_start: pregnancyStartDate(pregnancy)?.toISOString().slice(0, 10) ?? null,
        next_appointment: nextAppointment
          ? {
              id: nextAppointment.id,
              slot_start: nextAppointment.slot_start,
              slot_end: nextAppointment.slot_end,
              doctor_id: nextAppointment.doctor_id,
              doctor: { name: nextAppointment.doctor?.name },
            }
          : null,
        education_module: educationModule,
        risk: latestRisk
          ? { tier: latestRisk.tier, assessed_at: latestRisk.created_at }
          : null,
        email: patient.email ?? null,
        email_verified: !!patient.email_verified_at,
        username: patient.username ?? null,
        needs_email: !isUsableEmail(patient.email) && !patient.username,
        support_whatsapp: env.SUPPORT_WHATSAPP_NUMBER,
        // Asked after account recovery, at every login, until she saves a WhatsApp number
        whatsapp: whatsappStatus(patient),
        // Older accounts with no age: the dashboard asks for her date of birth
        needs_date_of_birth: needsDateOfBirth(patient),
        last_seen_at: patient.last_seen_at,
        site_visit_count: patient.site_visit_count,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /patients/me/delivery
   * Patient records that she has delivered. Can be saved again to correct details.
   */
  async saveDelivery(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const patientId = req.user!.id;
      const data = req.body as {
        delivery_date: string;
        had_complications: boolean;
        complications: string[];
        other_complication?: string | null;
        outcome: string;
        mode: string;
      };

      const pregnancy = await prisma.pregnancy.findFirst({
        where: { patient_id: patientId },
        orderBy: { id: 'desc' },
      });
      if (!pregnancy) throw new ValidationError('We could not find your pregnancy record. Please contact your clinic.');

      if (data.delivery_date > lagosDateString()) {
        throw new ValidationError('The date of delivery cannot be in the future');
      }
      const start = pregnancyStartDate(pregnancy);
      if (start && data.delivery_date < start.toISOString().slice(0, 10)) {
        throw new ValidationError('The date of delivery cannot be before the start of your pregnancy');
      }

      const ticked = new Set(data.had_complications ? data.complications : []);
      const complicationFields = Object.fromEntries(DELIVERY_COMPLICATIONS.map((c) => [c.column, ticked.has(c.key)]));

      const updated = await prisma.pregnancy.update({
        where: { id: pregnancy.id },
        data: {
          delivery_date: deliveryDateFromString(data.delivery_date),
          delivery_recorded_at: new Date(),
          delivery_had_complications: data.had_complications,
          ...complicationFields,
          comp_other_details: ticked.has('other') ? data.other_complication || null : null,
          delivery_outcome: data.outcome,
          delivery_mode: data.mode,
        },
      });

      await prisma.auditLog
        .create({
          data: {
            actor_type: 'patient',
            actor_id: patientId,
            action: pregnancy.delivery_date ? 'delivery_updated' : 'delivery_recorded',
            resource_type: 'pregnancy',
            resource_id: pregnancy.id,
            after: { delivery_date: data.delivery_date, outcome: data.outcome, mode: data.mode },
          },
        })
        .catch((err) => logger.warn({ err }, 'Failed to audit delivery'));

      res.status(200).json({ delivery: deliverySummary(updated) });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /patients/me/whatsapp
   * Saves her WhatsApp number (stored as +234…) with consent. Not verified until the code step exists.
   */
  async saveWhatsapp(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { whatsapp_number, source } = req.body as { whatsapp_number: string; source?: 'prompt' | 'profile' };
      const whatsapp = await whatsappContact.saveNumber(req.user!.id, whatsapp_number, source === 'profile' ? 'profile' : 'prompt');
      res.status(200).json({ whatsapp });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /patients/me/whatsapp/consent
   * She no longer wants WhatsApp messages; nothing is sent to her on WhatsApp after this.
   */
  async withdrawWhatsappConsent(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const whatsapp = await whatsappContact.withdrawConsent(req.user!.id);
      res.status(200).json({ whatsapp });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /patients/me/ask
   * Patient asking the AI a question
   */
  async askAI(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const patientId = req.user!.id;
      const { question } = req.body;

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        include: {
          pregnancies: { orderBy: { id: 'desc' }, take: 1 },
          symptoms: { orderBy: { reported_at: 'desc' }, take: 5 },
        },
      });

      if (!patient) {
        throw new NotFoundError('Patient not found');
      }

      const responseText = await aiService.answerPatientQuestion(patient, question);

      res.status(200).json({ answer: responseText });
    } catch (err) {
      next(err);
    }
  },
};
