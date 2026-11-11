import { Response, NextFunction } from 'express';
import prisma from '../../config/prisma';
import { AuthRequest } from '../../utils/types';
import { NotFoundError } from '../../utils/errors';
import { generatePreConsultSummary } from '../../services/summary-generator';
import { calculateEGAWeeks, calculateEDD } from '../../services/ega-calculator';
import { logger } from '../../utils/logger';
import { aiService } from '../../services/ai';
import { splitRiskReasons, isSmsPhone, formatPhoneForTermii } from '../../utils/contact';
import { doctorSmsJobs } from '../../services/doctorSmsJobs';
import { assessPatientRisk } from '../risk/assess';
import { deliverySummary, postpartumStatus } from '../../utils/delivery';
import { visitCounts } from '../../services/site-visits';

export const providersController = {
  /**
   * GET /providers — list all doctors (patient-accessible)
   */
  async listDoctors(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const doctors = await prisma.doctor.findMany({
        select: { id: true, name: true, role: true, clinic_days: true },
        orderBy: { name: 'asc' },
      });
      res.status(200).json({ doctors });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /providers/queue?date=today
   * Today's patients for the logged-in doctor.
   * Red-tier patients pinned top, then medium, then low.
   */
  async getQueue(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const doctorId = req.user!.id;
      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];

      const dayStart = new Date(`${dateStr}T00:00:00`);
      const dayEnd = new Date(`${dateStr}T23:59:59`);
      const slotFilter = req.query.date
        ? { gte: dayStart, lte: dayEnd }
        : { gte: dayStart };

      const appointments = await prisma.appointment.findMany({
        where: {
          slot_start: slotFilter,
          status: { in: ['booked', 'completed'] },
        },
        include: {
          patient: {
            include: {
              risk_assessments: { orderBy: { created_at: 'desc' }, take: 1 },
              pregnancies: { orderBy: { id: 'desc' }, take: 1 },
            },
          },
        },
        orderBy: { slot_start: 'asc' },
      });

      // Sort by risk tier: HIGH first, then MEDIUM, then LOW, then unassessed
      const tierOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

      const sorted = appointments.sort((a, b) => {
        const tierA = a.patient.risk_assessments[0]?.tier || 'UNKNOWN';
        const tierB = b.patient.risk_assessments[0]?.tier || 'UNKNOWN';
        const orderA = tierOrder[tierA] ?? 3;
        const orderB = tierOrder[tierB] ?? 3;
        if (orderA !== orderB) return orderA - orderB;
        return a.slot_start.getTime() - b.slot_start.getTime();
      });

      const toCode = (id: string) =>
        `MC-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

      const queue = sorted.map((apt) => ({
        appointment_id: apt.id,
        slot_start: apt.slot_start,
        slot_end: apt.slot_end,
        status: apt.status,
        patient: {
          id: apt.patient.id,
          patient_code: toCode(apt.patient.id),
          name: apt.patient.name,
          phone_number: apt.patient.phone_number,
          age: apt.patient.age,
          risk_tier: apt.patient.risk_assessments[0]?.tier || null,
          risk_reasons: splitRiskReasons(apt.patient.risk_assessments[0]?.reasons).clinical,
          ega_weeks: apt.patient.pregnancies[0]?.lmp_date && !apt.patient.pregnancies[0]?.delivery_date
            ? calculateEGAWeeks(new Date(apt.patient.pregnancies[0].lmp_date))
            : null,
          postpartum_label: postpartumStatus(apt.patient.pregnancies[0]?.delivery_date)?.label ?? null,
        },
      }));

      res.status(200).json({ date: dateStr, queue });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /patients/:id/summary
   * Template-generated pre-consult summary.
   */
  async getPatientSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;

      const patient = await prisma.patient.findUnique({
        where: { id },
        include: {
          pregnancies: { orderBy: { id: 'desc' }, take: 1 },
          risk_assessments: { orderBy: { created_at: 'desc' }, take: 1 },
          symptoms: { orderBy: { reported_at: 'desc' }, take: 5 },
          intake_responses: {
            where: { domain: 'medical' },
          },
        },
      });

      if (!patient) {
        throw new NotFoundError('Patient not found');
      }

      const pregnancy = patient.pregnancies[0] || null;
      const egaWeeks = pregnancy?.delivery_date
        ? null
        : pregnancy?.current_ega_weeks ??
          (pregnancy?.lmp_date
            ? calculateEGAWeeks(new Date(pregnancy.lmp_date))
            : null);

      // Medical intake stores condition keys as question_key with answer "yes"
      // (e.g. hypertension, diabetes) — not chronic_* prefixes.
      const conditionLabels: Record<string, string> = {
        hypertension: 'Known hypertensive',
        epilepsy: 'Known epilepsy',
        asthma: 'Known asthmatic',
        diabetes: 'Known diabetic',
        peptic_ulcer_disease: 'Peptic ulcer disease',
      };
      const yesVal = (v: unknown) =>
        v === true || v === 'true' || v === 'yes' || v === 'Yes';

      const chronicConditions: string[] = [];
      for (const ir of patient.intake_responses) {
        const key = ir.question_key;
        if (conditionLabels[key] && yesVal(ir.answer)) {
          chronicConditions.push(conditionLabels[key]);
          continue;
        }
        // Legacy chronic_* keys
        if (key.startsWith('chronic_') && yesVal(ir.answer)) {
          const label = key.replace(/^chronic_/, '').replace(/_/g, ' ');
          chronicConditions.push(label.charAt(0).toUpperCase() + label.slice(1));
        }
      }

      // Children alive: check direct children_alive question first, then child cards
      const allIntake = await prisma.intakeResponse.findMany({
        where: { patient_id: id },
        select: { question_key: true, answer: true },
      });
      const directChildrenAlive = allIntake.find((ir) => ir.question_key === 'children_alive')?.answer;
      let childrenAlive: number | null = null;
      if (directChildrenAlive != null && directChildrenAlive !== '' && !isNaN(Number(directChildrenAlive))) {
        childrenAlive = Number(directChildrenAlive);
      } else {
        let childEntries = 0;
        let aliveCount = 0;
        for (const ir of allIntake) {
          const m = /^child_(\d+)_state_now$/.exec(ir.question_key);
          if (!m) continue;
          childEntries += 1;
          const state = String(ir.answer ?? '').toLowerCase();
          if (state.includes('alive') || state === 'well' || state === 'healthy' || state === 'living') {
            aliveCount += 1;
          }
        }
        if (childEntries > 0) {
          childrenAlive = aliveCount;
        } else if (pregnancy?.parity === 0) {
          childrenAlive = 0;
        }
      }

      const summary = generatePreConsultSummary({
        name: patient.name || 'Unknown',
        age: patient.age,
        gravidity: pregnancy?.gravidity ?? null,
        parity: pregnancy?.parity ?? null,
        children_alive: childrenAlive,
        ega_weeks: egaWeeks,
        recent_symptoms: patient.symptoms.map((s) => s.symptom_key),
        chronic_conditions: chronicConditions,
        risk_tier: patient.risk_assessments[0]?.tier || null,
        bp_systolic: pregnancy?.booking_bp_systolic ?? null,
        bp_diastolic: pregnancy?.booking_bp_diastolic ?? null,
      });

      const risk = patient.risk_assessments[0] || null;
      const split = splitRiskReasons(risk?.reasons);
      const flags = [...split.clinical, ...split.incomplete];

      res.status(200).json({
        patient_id: id,
        summary,
        risk_tier: risk?.tier || null,
        flags,
        risk_reasons: split.clinical,
        incomplete_data: split.incomplete,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /providers/patients?q=&page=&limit=&risk=
   * Search or list all patients (doctor-accessible).
   * Supports name, phone, unique patient code (MC-XXXXXX), and pagination.
   */
  async searchPatients(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const q = ((req.query.q as string) || '').trim();
      const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt((req.query.limit as string) || '20', 10) || 20));
      const risk = ((req.query.risk as string) || '').trim().toLowerCase();

      const codeNeedle = q.replace(/^MC-?/i, '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
      const looksLikeCode = /^MC-?[a-fA-F0-9]{4,}/i.test(q) || (/^[a-fA-F0-9]{4,8}$/i.test(q) && q.length <= 8);

      const [totalRegistered, patients] = await Promise.all([
        prisma.patient.count(),
        prisma.patient.findMany({
          where: q && !looksLikeCode
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { phone_number: { contains: q } },
                ],
              }
            : {},
          include: {
            risk_assessments: {
              orderBy: { created_at: 'desc' },
              take: 1,
              select: { tier: true, reasons: true },
            },
            // Only lmp_date is needed for EGA — avoid selecting clinic columns
            // that may not exist yet (P2022 on search looks like an empty list).
            pregnancies: {
              orderBy: { id: 'desc' },
              take: 1,
              select: { lmp_date: true, delivery_date: true },
            },
          },
          orderBy: { name: 'asc' },
        }),
      ]);

      const toCode = (id: string) =>
        `MC-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

      let filtered = patients;
      if (q && looksLikeCode && codeNeedle) {
        filtered = patients.filter((p) => {
          const code = toCode(p.id).toLowerCase();
          const compactId = p.id.replace(/-/g, '').toLowerCase();
          return code.includes(codeNeedle) || compactId.startsWith(codeNeedle);
        });
      }

      if (risk && risk !== 'all') {
        filtered = filtered.filter((p) => {
          const tier = (p.risk_assessments[0]?.tier || 'low').toLowerCase();
          return tier === risk;
        });
      }

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginated = filtered.slice(startIndex, startIndex + limit);
      const visits = await visitCounts(paginated.map((p) => p.id));

      const result = paginated.map((p) => ({
        id: p.id,
        patient_code: toCode(p.id),
        name: p.name,
        age: p.age,
        phone_number: p.phone_number,
        risk_tier: p.risk_assessments[0]?.tier || null,
        risk_reasons: splitRiskReasons(p.risk_assessments[0]?.reasons).clinical,
        last_seen_at: p.last_seen_at,
        // From the visits table (one per return after 30+ minutes away)
        site_visit_count: visits.get(p.id) ?? 0,
        has_sms: isSmsPhone(p.phone_number),
        ega_weeks: p.pregnancies[0]?.lmp_date && !p.pregnancies[0]?.delivery_date
          ? calculateEGAWeeks(new Date(p.pregnancies[0].lmp_date))
          : null,
        postpartum_label: postpartumStatus(p.pregnancies[0]?.delivery_date)?.label ?? null,
      }));

      res.status(200).json({
        patients: result,
        total,
        totalRegistered,
        page,
        limit,
        totalPages,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /visits/:id/notes
   * Upsert visit notes for an appointment.
   * Autosave: complete=false (default) keeps appointment open.
   * Mark seen: complete=true marks appointment completed.
   */
  async createVisitNotes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { doctor_notes, complete } = req.body as {
        doctor_notes: string;
        complete?: boolean;
      };
      const doctorId = req.user!.id;

      const appointment = await prisma.appointment.findUnique({ where: { id } });
      if (!appointment) {
        throw new NotFoundError('Appointment not found');
      }

      const existing = await prisma.visit.findFirst({
        where: { appointment_id: id },
        orderBy: { created_at: 'desc' },
      });

      let visit;
      if (existing) {
        visit = await prisma.visit.update({
          where: { id: existing.id },
          data: { doctor_notes },
        });
      } else {
        visit = await prisma.visit.create({
          data: {
            appointment_id: id,
            doctor_notes,
          },
        });
      }

      if (complete) {
        await prisma.appointment.update({
          where: { id },
          data: { status: 'completed' },
        });
      }

      await prisma.auditLog.create({
        data: {
          actor_type: 'doctor',
          actor_id: doctorId,
          action: existing ? 'visit_notes_updated' : 'visit_notes_created',
          resource_type: 'visit',
          resource_id: visit.id,
          before: existing ? { doctor_notes: existing.doctor_notes } : null,
          after: { doctor_notes, complete: !!complete },
        },
      });

      res.status(existing ? 200 : 201).json({ visit });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /providers/ask
   * Doctor asking the AI a question
   */
  async askAI(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { question, patient_id } = req.body;
      
      let patientData = null;
      if (patient_id) {
        patientData = await prisma.patient.findUnique({
          where: { id: patient_id },
          include: {
            pregnancies: { orderBy: { id: 'desc' }, take: 1 },
            risk_assessments: { orderBy: { created_at: 'desc' }, take: 1 },
            symptoms: { orderBy: { reported_at: 'desc' }, take: 5 },
          },
        });
        
        if (!patientData) {
          throw new NotFoundError('Patient not found');
        }
      }

      const responseText = await aiService.answerDoctorQuestion(question, patientData);

      res.status(200).json({ answer: responseText });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /providers/patients/:id
   * Full patient detail (biodata, pregnancies, intake responses, risk assessments) for doctor view.
   */
  async getPatientDetail(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const patient = await prisma.patient.findUnique({
        where: { id },
        include: {
          pregnancies: { orderBy: { id: 'desc' }, take: 1 },
          risk_assessments: { orderBy: { created_at: 'desc' }, take: 5 },
          symptoms: { orderBy: { reported_at: 'desc' }, take: 10 },
          intake_responses: true,
          // Booking history for doctor pre-consult (newest first)
          appointments: {
            orderBy: { slot_start: 'desc' },
            take: 50,
            include: {
              doctor: { select: { id: true, name: true } },
              visits: {
                orderBy: { created_at: 'desc' },
                take: 1,
                select: { id: true, doctor_notes: true, created_at: true },
              },
            },
          },
        },
      });

      if (!patient) {
        throw new NotFoundError('Patient not found');
      }

      // Refresh EGA from LMP when stale/missing (avoids absurd stored values e.g. week 138)
      const pregnancies = patient.pregnancies.map((preg) => {
        if (!preg.lmp_date) return preg;
        const liveWeeks = calculateEGAWeeks(new Date(preg.lmp_date));
        return { ...preg, current_ega_weeks: liveWeeks };
      });

      const booking_history = (patient.appointments || []).map((apt) => ({
        id: apt.id,
        slot_start: apt.slot_start,
        slot_end: apt.slot_end,
        status: apt.status,
        created_at: apt.created_at,
        doctor: apt.doctor
          ? { id: apt.doctor.id, name: apt.doctor.name }
          : null,
        notes: apt.visits?.[0]?.doctor_notes ?? null,
      }));

      const patient_code = `MC-${patient.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
      // Omit raw appointments relation; expose shaped booking_history instead
      const { appointments: _apts, password_hash: _pw, ...patientRest } = patient as typeof patient & {
        appointments: unknown;
        password_hash?: string | null;
      };
      const visits = await visitCounts([patient.id]);
      res.status(200).json({
        patient: {
          ...patientRest,
          site_visit_count: visits.get(patient.id) ?? 0,
          pregnancies,
          patient_code,
          booking_history,
          // Saved by the patient from her dashboard
          delivery: deliverySummary(patient.pregnancies[0]),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /providers/patients/:id/pregnancy
   * Doctor updates index pregnancy / booking investigations (TT, IPT, USS, labs, etc.).
   */
  async updatePatientPregnancy(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const patientId = req.params.id as string;
      const doctorId = req.user!.id;
      const data = req.body;

      const patient = await prisma.patient.findUnique({ where: { id: patientId } });
      if (!patient) throw new NotFoundError('Patient not found');

      const existing = await prisma.pregnancy.findFirst({
        where: { patient_id: patientId },
        orderBy: { id: 'desc' },
      });

      const hasLmp = data.lmp_date && !isNaN(Date.parse(data.lmp_date));
      const lmpDate = hasLmp ? new Date(data.lmp_date) : null;
      const eddComputed = lmpDate ? calculateEDD(lmpDate) : undefined;
      const currentEgaWeeks = lmpDate ? calculateEGAWeeks(lmpDate) : undefined;
      const ussDate =
        data.uss_date && !isNaN(Date.parse(data.uss_date)) ? new Date(data.uss_date) : undefined;
      const bookingDate =
        data.booking_date && !isNaN(Date.parse(data.booking_date))
          ? new Date(data.booking_date)
          : undefined;

      const setIf = <T,>(key: string, value: T | null | undefined, transform?: (v: T) => unknown) => {
        if (value === undefined) return {};
        if (value === null) return { [key]: null };
        return { [key]: transform ? transform(value) : value };
      };

      const payload: Record<string, unknown> = {
        ...setIf('lmp_date', lmpDate ?? (data.lmp_date === null ? null : undefined)),
        ...(lmpDate
          ? { edd_computed: eddComputed, current_ega_weeks: currentEgaWeeks }
          : {}),
        ...setIf('booking_weight', data.booking_weight),
        ...setIf('booking_height', data.booking_height),
        ...setIf('booking_bp_systolic', data.booking_bp_systolic),
        ...setIf('booking_bp_diastolic', data.booking_bp_diastolic),
        ...setIf('blood_group', data.blood_group),
        ...setIf('genotype', data.genotype),
        ...setIf('rhesus', data.rhesus),
        ...setIf('rvd_status', data.rvd_status),
        ...setIf('vdrl', data.vdrl),
        ...setIf('pcv', data.pcv),
        ...setIf('hep_b', data.hep_b),
        ...setIf('malaria_parasite', data.malaria_parasite),
        ...setIf('urinalysis', data.urinalysis),
        ...setIf('tetanus_history', data.tetanus_history),
        ...setIf('ipt_history', data.ipt_history),
        ...setIf('uss_date', ussDate ?? (data.uss_date === null ? null : undefined)),
        ...setIf('uss_ega_weeks', data.uss_ega_weeks),
        ...setIf('uss_notes', data.uss_notes),
        ...setIf('booked_anc', data.booked_anc),
        ...setIf('booked_anc_facility', data.booked_anc_facility),
        ...setIf('booking_ga_weeks', data.booking_ga_weeks),
        ...setIf(
          'booking_date',
          bookingDate ?? (data.booking_date === null ? null : undefined)
        ),
        ...setIf('booking_history', data.booking_history),
        ...setIf('hep_c', data.hep_c),
        ...setIf('rbg', data.rbg),
        ...setIf('ogtt', data.ogtt),
        ...setIf('extra_labs', data.extra_labs),
        ...setIf('vitals_log', data.vitals_log),
        ...setIf('drugs_vaccines', data.drugs_vaccines),
        ...setIf('scans_log', data.scans_log),
        ...setIf('examination', data.examination),
        ...setIf('important_remarks', data.important_remarks),
        ...setIf('gravidity', data.gravidity),
        ...setIf('parity', data.parity),
      };

      let pregnancy;
      if (existing) {
        pregnancy = await prisma.pregnancy.update({
          where: { id: existing.id },
          data: payload as any,
        });
      } else {
        pregnancy = await prisma.pregnancy.create({
          data: {
            patient_id: patientId,
            ...(payload as any),
          },
        });
      }

      await prisma.auditLog.create({
        data: {
          actor_type: 'doctor',
          actor_id: doctorId,
          action: existing ? 'pregnancy_updated_by_doctor' : 'pregnancy_created_by_doctor',
          resource_type: 'pregnancy',
          resource_id: pregnancy.id,
          before: existing as any,
          after: pregnancy as any,
        },
      });

      // New BP, labs or scan findings can change the risk tier
      let risk: { tier: string; reasons: string[] } | null = null;
      try {
        const result = await assessPatientRisk(patientId, { type: 'doctor', id: doctorId });
        risk = { tier: result.tier, reasons: result.reasons };
      } catch (err) {
        logger.warn({ err, patientId }, 'Risk re-assessment after pregnancy update failed');
      }

      res.status(existing ? 200 : 201).json({ pregnancy, risk });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /providers/me — get current logged-in doctor profile
   */
  async getMe(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const doctorId = req.user!.id;
      const doctor = await prisma.doctor.findUnique({
        where: { id: doctorId },
        select: { id: true, name: true, email: true, role: true, phone_number: true },
      });
      if (!doctor) throw new NotFoundError('Doctor not found');
      res.status(200).json({ doctor });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /providers/me — update doctor profile (e.g. WhatsApp / phone number)
   */
  async updateMe(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const doctorId = req.user!.id;
      const { name, phone_number } = req.body;
      const data: Record<string, any> = {};
      if (name !== undefined) data.name = name;
      if (phone_number !== undefined) data.phone_number = phone_number || null;

      const doctor = await prisma.doctor.update({
        where: { id: doctorId },
        data,
        select: { id: true, name: true, email: true, role: true, phone_number: true },
      });
      res.status(200).json({ doctor, message: 'Profile updated successfully' });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /providers/sms — send SMS directly to all or selected patients,
   * plus any phone numbers the doctor typed in manually. Returns 202 with a job id.
   */
  async sendPatientSms(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { message, patient_ids, send_all, phone_numbers } = req.body as {
        message: string;
        patient_ids?: string[];
        send_all?: boolean;
        phone_numbers?: string[];
      };
      const doctorId = req.user!.id;

      let patients: Array<{ id: string; name: string | null; phone_number: string | null }> = [];

      if (send_all) {
        patients = await prisma.patient.findMany({
          select: { id: true, name: true, phone_number: true },
          orderBy: { name: 'asc' },
        });
      } else if (patient_ids && patient_ids.length > 0) {
        patients = await prisma.patient.findMany({
          where: { id: { in: patient_ids } },
          select: { id: true, name: true, phone_number: true },
          orderBy: { name: 'asc' },
        });
      }

      const validPatients = patients.filter((p) => isSmsPhone(p.phone_number));

      // Deduplicate by formatted phone number
      const uniqueRecipients = new Map<
        string,
        { id: string | null; name: string | null; phone: string; formatted: string; source: 'patient' | 'manual' }
      >();

      for (const p of validPatients) {
        if (!p.phone_number) continue;
        const formatted = formatPhoneForTermii(p.phone_number);
        if (!uniqueRecipients.has(formatted)) {
          uniqueRecipients.set(formatted, {
            id: p.id,
            name: p.name,
            phone: p.phone_number,
            formatted,
            source: 'patient',
          });
        }
      }

      // Manually entered numbers: skip invalid ones and any already covered by a patient
      const manualNumbers = phone_numbers ?? [];
      const invalidManual: string[] = [];
      for (const raw of manualNumbers) {
        if (!isSmsPhone(raw)) {
          invalidManual.push(raw);
          continue;
        }
        const formatted = formatPhoneForTermii(raw);
        if (!uniqueRecipients.has(formatted)) {
          uniqueRecipients.set(formatted, {
            id: null,
            name: null,
            phone: raw,
            formatted,
            source: 'manual',
          });
        }
      }

      const recipients = Array.from(uniqueRecipients.values());

      // Sending happens in the background; the dashboard polls GET /providers/sms/:jobId
      const jobId = await doctorSmsJobs.create({
        doctorId,
        message,
        recipients: recipients.map((r) => ({ phone: r.formatted, name: r.name, source: r.source })),
        totalTargeted: patients.length + manualNumbers.length,
        manualNumbers: manualNumbers.length,
        skippedNoPhone: patients.length - validPatients.length,
        invalidManualNumbers: invalidManual,
      });
      doctorSmsJobs.start(jobId);

      const job = await doctorSmsJobs.getForDoctor(jobId, doctorId);
      res.status(202).json({ message: 'SMS dispatch started', ...job });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /providers/sms/:jobId — live per-number status of an SMS broadcast
   */
  async getSmsJob(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const job = await doctorSmsJobs.getForDoctor(String(req.params.jobId), req.user!.id);
      if (!job) throw new NotFoundError('SMS broadcast not found');
      res.status(200).json(job);
    } catch (err) {
      next(err);
    }
  },
};
