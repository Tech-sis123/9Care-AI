import { Router } from 'express';
import { patientsController } from './controller';
import { authenticate } from '../../middleware/auth';
import { rbac } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { createProfileSchema, createPregnancySchema, askQuestionSchema, deliverySchema, whatsappSchema, visitSchema, tutorialSchema } from './schemas';

const router = Router();

router.post(
  '/profile',
  authenticate,
  rbac('patient'),
  validate(createProfileSchema),
  patientsController.upsertProfile
);

router.post(
  '/pregnancy',
  authenticate,
  rbac('patient'),
  validate(createPregnancySchema),
  patientsController.createPregnancy
);

router.post(
  '/me/visit',
  authenticate,
  rbac('patient'),
  validate(visitSchema),
  patientsController.recordVisit
);

router.post(
  '/me/tutorial',
  authenticate,
  rbac('patient'),
  validate(tutorialSchema),
  patientsController.markTutorialSeen
);

router.get(
  '/me',
  authenticate,
  rbac('patient'),
  patientsController.getMe
);

router.get(
  '/me/dashboard',
  authenticate,
  rbac('patient'),
  patientsController.getDashboard
);

router.put(
  '/me/delivery',
  authenticate,
  rbac('patient'),
  validate(deliverySchema),
  patientsController.saveDelivery
);

router.put(
  '/me/whatsapp',
  authenticate,
  rbac('patient'),
  validate(whatsappSchema),
  patientsController.saveWhatsapp
);

router.delete(
  '/me/whatsapp/consent',
  authenticate,
  rbac('patient'),
  patientsController.withdrawWhatsappConsent
);

router.post(
  '/me/ask',
  authenticate,
  rbac('patient'),
  validate(askQuestionSchema),
  patientsController.askAI
);

export default router;
