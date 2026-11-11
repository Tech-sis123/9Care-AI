import axios from 'axios';
import { getPatientToken, getDoctorToken, clearPatientAuth, clearDoctorAuth } from './auth';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const patientApi = axios.create({ baseURL: BASE });
export const doctorApi = axios.create({ baseURL: BASE });

patientApi.interceptors.request.use(cfg => {
  const token = getPatientToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

doctorApi.interceptors.request.use(cfg => {
  const token = getDoctorToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Auto-logout on 401 — stale or wrong-env token
patientApi.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      const refresh = localStorage.getItem('mc_patient_refresh');
      if (refresh) {
        try {
          // Attempt token refresh
          const { data } = await axios.post(`${BASE}/auth/refresh`, { refresh_token: refresh });
          if (data?.access_token) {
            localStorage.setItem('mc_patient_token', data.access_token);
            if (data.refresh_token) localStorage.setItem('mc_patient_refresh', data.refresh_token);
            // Retry original request with new token
            err.config.headers.Authorization = `Bearer ${data.access_token}`;
            return axios(err.config);
          }
        } catch (e) {
          // fallthrough to logout
        }
      }
      // Background calls (the visit ping) never log her out or move her off the page
      if (err.config?.quiet) return Promise.reject(err);
      clearPatientAuth();
      window.location.href = '/register';
    }
    return Promise.reject(err);
  }
);

doctorApi.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      const refresh = localStorage.getItem('mc_doctor_refresh');
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE}/auth/refresh`, { refresh_token: refresh });
          if (data?.access_token) {
            localStorage.setItem('mc_doctor_token', data.access_token);
            if (data.refresh_token) localStorage.setItem('mc_doctor_refresh', data.refresh_token);
            err.config.headers.Authorization = `Bearer ${data.access_token}`;
            return axios(err.config);
          }
        } catch (e) {
          // fallthrough to logout
        }
      }
      clearDoctorAuth();
      window.location.href = '/provider';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const requestOtp = (phone_number, channel = 'sms') =>
  axios.post(`${BASE}/auth/patient/otp/request`, { phone_number, channel });

export const verifyOtp = (pin_id, code) =>
  axios.post(`${BASE}/auth/patient/otp/verify`, { pin_id, code });

/** After OTP sign-up: set email + password for future logins (no OTP). */
export const setPatientCredentials = (data) =>
  patientApi.post('/auth/patient/credentials', data);

/** Add or change email and send a verification link (OTP accounts). */
export const requestEmailVerification = (email) =>
  patientApi.post('/auth/patient/email/request-verification', { email });

/** Confirm email from the inbox link token. */
export const verifyPatientEmail = (token) =>
  axios.post(`${BASE}/auth/patient/email/verify`, { token });

/** Returning patients: email or username + password login (no OTP). */
export const patientLogin = (identifier, password) =>
  axios.post(`${BASE}/auth/patient/login`, { identifier, password });

/** TEMPORARY account recovery: match name + 2 profile details to get a recovery token. */
export const recoverPatientAccount = (details) =>
  axios.post(`${BASE}/auth/patient/recover`, details);

/** Set new login details (email or username + password) with a recovery token. */
export const setRecoveredLoginDetails = (data) =>
  axios.post(`${BASE}/auth/patient/recover/credentials`, data);

/** Direct email + password signup (no OTP). */
export const registerPatientEmail = (email, password, name, phone_number, date_of_birth) =>
  axios.post(`${BASE}/auth/patient/register-email`, { email, password, name, phone_number, date_of_birth });

export const doctorLogin = (email, password) =>
  axios.post(`${BASE}/auth/doctor/login`, { email, password });

export const registerDoctor = (data) =>
  axios.post(`${BASE}/auth/doctor/register`, data);

export const recoverDoctorPassword = (email) =>
  axios.post(`${BASE}/auth/doctor/forgot-password`, { email });

export const resetDoctorPassword = (token, new_password) =>
  axios.post(`${BASE}/auth/doctor/reset-password`, { token, new_password });

// ── Patient ───────────────────────────────────────────────────────────────────

export const getPatientMe = () => patientApi.get('/patients/me');
// App opened / brought back to the foreground (the server counts a visit after 30+ minutes away)
export const recordPatientVisit = path => patientApi.post('/patients/me/visit', { path }, { quiet: true });
export const getPatientDashboard = () => patientApi.get('/patients/me/dashboard');
export const upsertProfile = data => patientApi.post('/patients/profile', data);
export const addPregnancy = data => patientApi.post('/patients/pregnancy', data);
export const savePatientDelivery = data => patientApi.put('/patients/me/delivery', data);
/** Save her WhatsApp number (consent must be true). source: 'prompt' | 'profile' */
export const savePatientWhatsapp = (whatsapp_number, source = 'prompt') =>
  patientApi.put('/patients/me/whatsapp', { whatsapp_number, consent: true, source });
export const withdrawWhatsappConsent = () => patientApi.delete('/patients/me/whatsapp/consent');

// ── Intake ────────────────────────────────────────────────────────────────────

export const getIntake = patientId =>
  patientApi.get(`/intake/${patientId}`);

export const saveIntake = (patientId, domain, responses) =>
  patientApi.patch(`/intake/${patientId}`, { domain, responses });

export const submitIntake = patientId =>
  patientApi.post(`/intake/${patientId}/submit`);

// ── Symptoms ──────────────────────────────────────────────────────────────────

export const logSymptoms = symptoms =>
  patientApi.post(
    '/symptoms',
    { symptoms },
    { headers: { 'Idempotency-Key': crypto.randomUUID() } }
  );

// ── Providers ─────────────────────────────────────────────────────────────────

export const getProviders = () => patientApi.get('/providers');

// ── Doctor ────────────────────────────────────────────────────────────────────

export const getDoctorProfile = () =>
  doctorApi.get('/providers/me');

export const updateDoctorProfile = (data) =>
  doctorApi.patch('/providers/me', data);

export const getDoctorQueue = (date) =>
  doctorApi.get('/providers/queue', date ? { params: { date } } : {});

export const getDoctorPatientDetail = (patientId) =>
  doctorApi.get(`/providers/patients/${patientId}`);

export const getPatientSummary = (patientId) =>
  doctorApi.get(`/providers/patients/${patientId}/summary`);

export const updateDoctorPregnancy = (patientId, data) =>
  doctorApi.patch(`/providers/patients/${patientId}/pregnancy`, data);

/** Save visit notes. Pass complete:true only when marking the appointment done. */
export const saveVisitNotes = (appointmentId, doctor_notes, { complete = false } = {}) =>
  doctorApi.post(`/providers/visits/${appointmentId}/notes`, { doctor_notes, complete });

export const searchPatients = (params = {}) => {
  const queryParams = typeof params === 'string' ? { q: params } : params;
  return doctorApi.get('/providers/patients', { params: queryParams });
};

export const getPatientSymptoms = (patientId, range = '30d') =>
  doctorApi.get(`/patients/${patientId}/symptoms`, { params: { range } });

export const acknowledgeAlert = alertId =>
  doctorApi.post(`/alerts/${alertId}/acknowledge`);

// ── Appointments ──────────────────────────────────────────────────────────────

export const getAvailableSlots = (date, doctor_id) =>
  patientApi.get('/appointments/available', { params: { date, doctor_id } });

export const bookAppointment = (doctor_id, slot_start) =>
  patientApi.post(
    '/appointments',
    { doctor_id, slot_start },
    { headers: { 'Idempotency-Key': crypto.randomUUID() } }
  );

export const rescheduleAppointment = (appointment_id, slot_start) =>
  patientApi.patch(`/appointments/${appointment_id}/reschedule`, { slot_start });

// ── Education ─────────────────────────────────────────────────────────────────

export const getEducationModules = (week) =>
  patientApi.get('/education/modules', week ? { params: { week } } : {});

export const getEducationModule = (id) =>
  patientApi.get(`/education/modules/${id}`);

export const markModuleComplete = module_id =>
  patientApi.patch('/education/progress', { module_id });

// ── AI Assistant ──────────────────────────────────────────────────────────────

export const askPatientAI = (question) =>
  patientApi.post('/patients/me/ask', { question });

export const askDoctorAI = (question, patient_id) =>
  doctorApi.post('/providers/ask', patient_id ? { question, patient_id } : { question });

export const sendDoctorSms = ({ message, patient_ids, send_all, phone_numbers }) =>
  doctorApi.post('/providers/sms', { message, patient_ids, send_all, phone_numbers });

export const getDoctorSmsJob = (jobId) =>
  doctorApi.get(`/providers/sms/${jobId}`);

// ── Clinic WhatsApp link (QR code) ───────────────────────────────────────────

export const getWhatsAppConnection = () => doctorApi.get('/providers/whatsapp');

/** Starts WhatsApp Web and produces a QR code. restart=true gets a fresh code. */
export const requestWhatsAppQr = (restart = false) =>
  doctorApi.post('/providers/whatsapp/connect', { restart });

export const unlinkWhatsApp = () => doctorApi.post('/providers/whatsapp/logout');

// ── Doctor education content management ──────────────────────────────────────

export const getDoctorEducationModules = () =>
  doctorApi.get('/education/manage/modules');

export const createEducationModule = (data) =>
  doctorApi.post('/education/manage/modules', data);

export const updateEducationModule = (id, data) =>
  doctorApi.put(`/education/manage/modules/${id}`, data);

export const setEducationModuleStatus = (id, status) =>
  doctorApi.patch(`/education/manage/modules/${id}/status`, { status });

export const deleteEducationModule = (id) =>
  doctorApi.delete(`/education/manage/modules/${id}`);

// ── Doctor high-risk checklist (risk engine v2) ──────────────────────────────

export const getRiskConditions = (patientId) =>
  doctorApi.get(`/risk/${patientId}/conditions`);

export const saveRiskConditions = (patientId, condition_ids) =>
  doctorApi.put(`/risk/${patientId}/conditions`, { condition_ids });

// ── Lesson comments ──────────────────────────────────────────────────────────

export const getLessonComments = (moduleId) =>
  patientApi.get(`/education/modules/${moduleId}/comments`);

export const postLessonComment = (moduleId, body) =>
  patientApi.post(`/education/modules/${moduleId}/comments`, { body });

export const deleteLessonComment = (moduleId, commentId) =>
  patientApi.delete(`/education/modules/${moduleId}/comments/${commentId}`);

export const getDoctorLessonComments = (params = {}) =>
  doctorApi.get('/education/manage/comments', { params });

export const replyToLessonComment = (commentId, body) =>
  doctorApi.post(`/education/manage/comments/${commentId}/replies`, { body });

export const setLessonCommentHidden = (commentId, hidden) =>
  doctorApi.patch(`/education/manage/comments/${commentId}`, { hidden });
