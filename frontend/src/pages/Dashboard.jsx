import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CalendarDays, CalendarCheck,
  BookOpen, AlertTriangle, ClipboardList, Home, Calendar,
  User, ChevronRight, Heart, Bot, Send, X,
} from 'lucide-react';
import { getPatientDashboard, getPatientMe, askPatientAI } from '../lib/api';
import { getPatientData, isPatientAuthenticated } from '../lib/auth';
import WhatsAppContact from '../components/WhatsAppContact';
import EmailPrompt from '../components/EmailPrompt';
import DeliveryModal from '../components/DeliveryModal';
import WhatsAppNumberModal from '../components/WhatsAppNumberModal';
import DateOfBirthModal from '../components/DateOfBirthModal';
import { POSTPARTUM_DAYS } from '../lib/delivery';

const AIChatPanel = ({ onClose }) => {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hi! I\'m your 9Care AI assistant. Ask me anything about your pregnancy, symptoms, or health.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || q.length < 3 || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const { data } = await askPatientAI(q);
      setMessages(prev => [...prev, { role: 'ai', text: data.answer }]);
    } catch (err) {
      const msg = err.response?.status === 404
        ? 'Please complete your profile first so I can give personalised advice.'
        : 'Sorry, I couldn\'t reach the AI right now. Please try again.';
      setMessages(prev => [...prev, { role: 'ai', text: msg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-[640px] mx-auto flex flex-col shadow-2xl"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-headline-md text-sm text-primary">9Care AI</p>
              <p className="font-label-sm text-[10px] text-outline">Powered by Groq · Not medical advice</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
            <X className="w-4 h-4 text-outline" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {m.role === 'ai' && (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[78%] px-4 py-3 rounded-2xl font-body-md text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-primary text-white rounded-tr-sm'
                    : 'bg-surface-container text-on-surface rounded-tl-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-surface-container px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-8 pt-3 border-t border-surface-container flex items-end gap-3">
          <textarea
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about your pregnancy…"
            className="flex-1 resize-none rounded-2xl border border-surface-container bg-surface-container-low px-4 py-3 font-body-md text-sm focus:outline-none focus:border-primary transition-colors"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
          <button
            onClick={send}
            disabled={input.trim().length < 3 || loading}
            className="w-11 h-11 bg-primary rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

const trimesterLabel = (weeks) => {
  if (weeks == null || Number.isNaN(Number(weeks))) return null;
  const w = Number(weeks);
  if (w <= 12) return 'First trimester';
  if (w <= 27) return 'Second trimester';
  return 'Third trimester';
};

const PatientDashboard = () => {
  const navigate = useNavigate();
  const [dashData, setDashData] = useState(null);
  const [patientData, setPatientData] = useState(getPatientData());
  const [showAI, setShowAI] = useState(false);
  const [loadingEga, setLoadingEga] = useState(true);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  // null | 'prompt' (Have you delivered?) | 'form'
  const [deliveryModal, setDeliveryModal] = useState(null);
  // After account recovery: ask for her WhatsApp number at each login until she saves one
  const [showWhatsappPrompt, setShowWhatsappPrompt] = useState(false);
  // Older accounts with no age: ask for her date of birth (shown before the other pop-ups)
  const [showDobPrompt, setShowDobPrompt] = useState(false);

  useEffect(() => {
    if (!isPatientAuthenticated()) {
      navigate('/register');
      return;
    }
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending <= 0) setLoadingEga(false);
    };
    getPatientDashboard()
      .then(r => {
        setDashData(r.data);
        const dismissed = sessionStorage.getItem('mc_email_prompt_dismissed') === '1';
        if (!dismissed && (r.data?.needs_email || (r.data?.email_verified === false && !r.data?.username))) {
          setShowEmailPrompt(true);
        }
        // From 30 weeks: ask once per login until she enters her delivery details
        if (r.data?.delivery_prompt && sessionStorage.getItem('mc_delivery_prompt_dismissed') !== '1') {
          setDeliveryModal('prompt');
        }
        if (r.data?.whatsapp?.prompt && sessionStorage.getItem('mc_whatsapp_prompt_dismissed') !== '1') {
          setShowWhatsappPrompt(true);
        }
        if (r.data?.needs_date_of_birth && sessionStorage.getItem('mc_dob_prompt_dismissed') !== '1') {
          setShowDobPrompt(true);
        }
      })
      .catch(() => {})
      .finally(done);
    getPatientMe()
      .then(r => {
        setPatientData(r.data);
        const dismissed = sessionStorage.getItem('mc_email_prompt_dismissed') === '1';
        if (!dismissed && (r.data?.needs_email || (r.data?.email_verified === false && !r.data?.username))) {
          setShowEmailPrompt(true);
        }
      })
      .catch(() => {})
      .finally(done);
  }, [navigate]);

  const firstName = patientData?.name?.split(' ')[0] || 'Mama';
  const pregnancy =
    patientData?.pregnancies?.[0] ||
    patientData?.pregnancy_record ||
    patientData?.latest_pregnancy;
  // API returns current_ega on both /dashboard and /me — never invent Week 12
  const ega =
    dashData?.current_ega ||
    dashData?.gestational_age ||
    dashData?.ega ||
    patientData?.current_ega ||
    null;
  const weeksRaw =
    ega?.weeks ??
    pregnancy?.current_ega_weeks ??
    pregnancy?.gestational_age?.weeks ??
    null;
  const delivery = dashData?.delivery || patientData?.delivery || null;
  const delivered = !!delivery?.delivered;
  const postpartum = delivered ? delivery.postpartum : null;
  // Gestational age is not shown once she has delivered
  const weeks =
    !delivered && weeksRaw != null && !Number.isNaN(Number(weeksRaw)) ? Number(weeksRaw) : null;
  const trimester = trimesterLabel(weeks);
  const postpartumPct = postpartum ? Math.min(100, Math.round((postpartum.days / POSTPARTUM_DAYS) * 100)) : 0;
  const canReportDelivery = !delivered && !!dashData?.delivery_prompt;

  const refreshAfterDelivery = (saved) => {
    setDeliveryModal(null);
    setDashData((prev) => ({ ...prev, delivery: saved, delivery_prompt: false, current_ega: null }));
    setPatientData((prev) => ({ ...prev, delivery: saved, current_ega: null }));
    getPatientDashboard().then((r) => setDashData(r.data)).catch(() => {});
  };
  const progressPct =
    weeks != null ? Math.min(100, Math.max(0, Math.round((weeks / 40) * 100))) : 0;

  const nextAppt = dashData?.next_appointment;
  const eduModule =
    dashData?.education_module ||
    dashData?.educational_module ||
    dashData?.recommended_module;
  // Show complete-profile CTA only when intake is not finished (not a full retake)
  const intakeStatus =
    patientData?.intake_status ||
    dashData?.intake_status ||
    getPatientData()?.intake_status ||
    'not_started';
  const needsProfileCompletion = intakeStatus !== 'submitted';

  const nextApptLabel = (() => {
    if (!nextAppt) return null;
    const raw = nextAppt.slot_start || nextAppt.date;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const datePart = d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
    const timePart = d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart} · ${timePart}`;
  })();

  return (
    <div className="min-h-screen text-on-surface font-body-md selection:bg-secondary/20">
      {/* Navbar & Header Cluster */}
      <header className="bg-primary pt-6 pb-12 px-6 sticky top-0 z-40">
        <div className="max-w-[640px] mx-auto">
          <nav className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2 text-on-primary font-headline-md text-xl">
              <Heart className="w-5 h-5 text-on-primary fill-current" />
              <span>9Care AI</span>
            </div>
            <button className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
              <Bell className="w-5 h-5 text-white" />
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-secondary rounded-full border-2 border-primary"></span>
            </button>
          </nav>
          <div className="space-y-1">
            <h1 className="font-headline-md text-headline-md text-white">Hello, {firstName} 👋</h1>
            {loadingEga ? (
              <div className="flex items-center gap-2 text-white/80 pt-1">
                <span
                  className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  aria-hidden
                />
                <span className="font-body-md text-sm">Loading pregnancy week…</span>
              </div>
            ) : (
              <p className="font-body-md text-white/80">
                {postpartum
                  ? postpartum.completed
                    ? postpartum.label
                    : `${postpartum.label} · Postpartum period`
                  : weeks != null
                  ? `Week ${weeks}${trimester ? ` · ${trimester}` : ''}`
                  : 'Pregnancy week unavailable'}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[640px] mx-auto px-4 -mt-6 pb-32 space-y-6">
        {/* Pregnancy Progress Card */}
        <section className="bg-surface-container-lowest rounded-xl p-6 card-shadow border border-surface-container">
          {loadingEga ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3" role="status" aria-live="polite">
              <span
                className="inline-block w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin"
                aria-hidden
              />
              <p className="font-body-md text-sm text-on-surface-variant">Loading pregnancy progress…</p>
            </div>
          ) : postpartum ? (
            <div>
              <p className="font-label-sm text-outline uppercase text-[10px] tracking-widest mb-1">After delivery</p>
              <h3 className="font-headline-md text-body-lg text-primary mb-1">{postpartum.label}</h3>
              <p className="font-body-md text-sm text-on-surface-variant mb-5">
                {postpartum.completed
                  ? 'Your 6-week postpartum period is complete. Keep attending your clinic check-ups.'
                  : 'The postpartum period is the first 6 weeks after delivery. Rest, eat well, and go to your check-ups.'}
              </p>
              <div className="overflow-hidden h-2 text-xs flex rounded-full bg-surface-container">
                <div className="bg-primary" style={{ width: `${postpartumPct}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-[10px] font-label-sm text-outline">
                <span>Delivery</span>
                <span>6 weeks</span>
              </div>
            </div>
          ) : weeks == null ? (
            <div className="py-4">
              <h3 className="font-headline-md text-body-lg text-primary mb-2">Pregnancy progress</h3>
              <p className="font-body-md text-sm text-on-surface-variant">
                We need your LMP date to calculate your week. Complete your health profile to see progress.
              </p>
              {needsProfileCompletion && (
                <button
                  onClick={() => navigate('/intake')}
                  className="mt-3 text-sm font-bold text-primary underline underline-offset-4"
                >
                  Complete health profile →
                </button>
              )}
            </div>
          ) : (
            <>
              <h3 className="font-headline-md text-body-lg text-primary mb-6">Week {weeks} of 40</h3>
              <div className="relative pt-1">
                <div className="overflow-hidden h-2 mb-8 text-xs flex rounded-full bg-surface-container">
                  <div
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary"
                    style={{ width: `${progressPct}%` }}
                  ></div>
                </div>
                <div className="flex justify-between relative">
                  <div className="text-center">
                    <div className="w-3 h-3 bg-primary rounded-full mx-auto mb-2"></div>
                    <p className="text-[10px] font-label-sm text-outline">
                      Week 1<br />Start
                    </p>
                  </div>
                  <div className="text-center absolute -translate-x-1/2" style={{ left: `${progressPct}%` }}>
                    <div className="w-5 h-5 bg-primary rounded-full mx-auto mb-1 flex items-center justify-center ring-4 ring-secondary/20">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                    <p className="text-[10px] font-label-sm text-primary">
                      Week {weeks}<br />You are here
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-3 h-3 bg-surface-container rounded-full mx-auto mb-2"></div>
                    <p className="text-[10px] font-label-sm text-outline">
                      Week 40<br />Due date
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {canReportDelivery && (
          <section className="bg-tertiary-fixed rounded-xl p-5 card-shadow border border-primary/10 flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-white/70 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary">child_care</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-headline-md text-sm text-primary">Has your baby arrived?</p>
              <p className="text-xs text-on-surface-variant">Tell us so we can show you care after delivery.</p>
            </div>
            <button
              type="button"
              onClick={() => setDeliveryModal('form')}
              className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold shrink-0"
            >
              I have delivered
            </button>
          </section>
        )}

        {/* Next Appointment Card */}
        <section className="bg-surface-container-lowest rounded-xl p-6 card-shadow border border-surface-container">
          <div className="flex gap-4 mb-6">
            <div className="w-12 h-12 bg-surface-container-low rounded-lg flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-label-sm text-outline uppercase mb-1">Next Appointment</h3>
              <p className="font-headline-md text-lg text-primary">
                {nextApptLabel || 'No upcoming appointment'}
              </p>
            </div>
          </div>
          <div className="space-y-1 mb-6 pl-16">
            <p className="font-body-md text-on-surface">
              {nextAppt?.doctor?.name ? (nextAppt.doctor.name.toLowerCase().startsWith('dr') ? nextAppt.doctor.name : `Dr. ${nextAppt.doctor.name}`) : (nextApptLabel ? 'Your clinician' : '—')}
            </p>
            <p className="font-body-md text-on-surface-variant text-sm">
              {nextAppt?.location || (nextApptLabel ? 'ANC Clinic' : 'Book a visit when you are ready')}
            </p>
          </div>
          <div className="flex gap-3 pl-16">
            <button
              type="button"
              onClick={() => navigate('/appointments', { state: { appointment_id: nextAppt?.id, doctor_id: nextAppt?.doctor_id } })}
              className="px-4 py-2 border border-outline rounded-lg text-sm font-label-sm text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              {nextApptLabel ? 'Reschedule' : 'Book appointment'}
            </button>
            <button className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-label-sm hover:opacity-90 transition-opacity">
              Get directions
            </button>
          </div>
        </section>

        {/* Education Nudge */}
        <section className="bg-primary rounded-xl p-6 card-shadow relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-white/70 font-label-sm text-xs mb-2">
              <span>
                {loadingEga
                  ? 'Weekly tip'
                  : delivered
                    ? 'Postpartum tip'
                    : weeks != null
                    ? `Week ${weeks} tip`
                    : 'Pregnancy tip'}
              </span>
              <BookOpen className="w-3 h-3" />
            </div>
            <h3 className="font-headline-md text-xl text-white mb-4 max-w-[200px]">
              {eduModule?.title || (delivered ? 'Caring for yourself after delivery' : 'What happens to your body this week?')}
            </h3>
            <button onClick={() => navigate('/education')} className="text-white font-label-sm text-sm underline underline-offset-4">
              Read full article
            </button>
          </div>
          <div className="absolute right-0 bottom-0 top-0 w-1/2">
            <img
              className="w-full h-full object-cover opacity-40 mix-blend-overlay"
              alt="Expectant mother's hands on belly"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuA5HHI9tMOcn_iIL9yyXOxfjbRdmAe3YRJb7vslOBZzelayBjtLz-Ez5iW2AfuXYgrnJ4-eFLj2sUpvtmDLe_PadQK3DsJuf9eiqpU7gxuO7OCJOXM9b-UZ3965xwiJffo3bmlAOA8CTX6cmss20jb_I7hqEDwGDBZ3EtbnTSNcAeEky2UPy_e7Yc7BZkm1iJmdH6U8_UiRPixcbo6YPEQ31QwCyOObcWtbOj8h_TYImZyFYBkNwxqKpg0L2IKUIbhlEwZxx1pcFq8"
            />
          </div>
        </section>

        {/* Quick Actions Grid */}
        <section className="grid grid-cols-2 gap-4">
          <button onClick={() => navigate('/appointments')} className="bg-surface-container-lowest p-4 rounded-xl card-shadow border border-surface-container flex flex-col items-center gap-3 text-center transition-transform active:scale-95 hover:border-primary/20 hover:shadow-md">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-primary" />
            </div>
            <span className="font-label-sm text-xs text-on-surface">Book appointment</span>
          </button>
          <button onClick={() => navigate('/education')} className="bg-surface-container-lowest p-4 rounded-xl card-shadow border border-surface-container flex flex-col items-center gap-3 text-center transition-transform active:scale-95 hover:border-primary/20 hover:shadow-md">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <span className="font-label-sm text-xs text-on-surface">Learn</span>
          </button>
          <button onClick={() => navigate('/emergency')} className="bg-[#FCEBEB] p-4 rounded-xl card-shadow border border-secondary/20 flex flex-col items-center gap-3 text-center transition-transform active:scale-95 hover:bg-secondary/10">
            <div className="w-10 h-10 bg-secondary/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-secondary" />
            </div>
            <span className="font-label-sm text-xs text-secondary">Report symptoms</span>
          </button>
          <button className="bg-surface-container-lowest p-4 rounded-xl card-shadow border border-surface-container flex flex-col items-center gap-3 text-center transition-transform active:scale-95 hover:border-primary/20 hover:shadow-md">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <span className="font-label-sm text-xs text-on-surface">My records</span>
          </button>
        </section>

        {/* Recent Activity */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-headline-md text-lg text-primary">Recent Activity</h3>
            <button className="text-xs font-label-sm text-outline hover:text-primary">View all</button>
          </div>
          <div className="bg-surface-container-lowest rounded-xl card-shadow border border-surface-container overflow-hidden">
            <div className="divide-y divide-surface-container">
              <div className="p-4 flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-primary/40"></div>
                <div>
                  <p className="font-body-md text-sm text-on-surface">Health check completed</p>
                  <p className="text-[10px] text-outline">2 hours ago</p>
                </div>
              </div>
              <div className="p-4 flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-primary/40"></div>
                <div>
                  <p className="font-body-md text-sm text-on-surface">Appointment booked</p>
                  <p className="text-[10px] text-outline">Yesterday, 4:15 PM</p>
                </div>
              </div>
              <div className="p-4 flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-primary/40"></div>
                <div>
                  <p className="font-body-md text-sm text-on-surface">Module 3 watched</p>
                  <p className="text-[10px] text-outline">Monday, 10:20 AM</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Copyright */}
      <footer className="max-w-[640px] mx-auto px-8 py-16 text-center border-t border-primary/10 bg-surface-container-low mb-20">
        <div className="font-headline-md text-xl font-bold text-primary mb-4">9Care AI</div>
        <p className="font-body-md text-sm text-outline tracking-wide leading-relaxed">
          © 2026 9Care AI. Safe pregnancies, every time.
        </p>
        <div className="flex justify-center gap-6 mt-8 flex-wrap">
          <a href="#" className="text-outline text-xs font-label-sm hover:text-primary underline underline-offset-4">
            Privacy Policy
          </a>
          <a href="#" className="text-outline text-xs font-label-sm hover:text-primary underline underline-offset-4">
            Terms
          </a>
          <a href="#" className="text-outline text-xs font-label-sm hover:text-primary underline underline-offset-4">
            Contact
          </a>
        </div>
      </footer>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-surface-container z-50 px-4 py-3 pb-8">
        <div className="max-w-[640px] mx-auto flex justify-between items-center">
          <button onClick={() => navigate('/dashboard')} className="flex flex-col items-center gap-1">
            <Home className="w-5 h-5 text-primary" />
            <span className="text-[10px] font-label-sm text-primary">Home</span>
          </button>
          <button onClick={() => navigate('/appointments')} className="flex flex-col items-center gap-1 text-outline hover:text-primary transition-colors">
            <Calendar className="w-5 h-5" />
            <span className="text-[10px] font-label-sm">Appointments</span>
          </button>
          <button
            onClick={() => setShowAI(true)}
            className="flex flex-col items-center gap-1 -mt-6 relative"
          >
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg ring-4 ring-white">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] font-label-sm text-primary mt-1">Ask AI</span>
          </button>
          <button onClick={() => navigate('/education')} className="flex flex-col items-center gap-1 text-outline hover:text-primary transition-colors">
            <BookOpen className="w-5 h-5" />
            <span className="text-[10px] font-label-sm">Learn</span>
          </button>
          <button onClick={() => navigate('/profile')} className="flex flex-col items-center gap-1 text-outline hover:text-primary transition-colors">
            <User className="w-5 h-5" />
            <span className="text-[10px] font-label-sm">Profile</span>
          </button>
        </div>
      </nav>

      {/* Floating AI button */}
      <button
        onClick={() => setShowAI(true)}
        className="fixed bottom-24 right-5 z-50 w-14 h-14 bg-primary rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="Ask AI"
      >
        <Bot className="w-6 h-6 text-white" />
      </button>

      {/* AI Chat Panel */}
      {showAI && <AIChatPanel onClose={() => setShowAI(false)} />}

      <WhatsAppContact number={dashData?.support_whatsapp} />

      {showDobPrompt ? (
        <DateOfBirthModal
          onLater={() => {
            sessionStorage.setItem('mc_dob_prompt_dismissed', '1');
            setShowDobPrompt(false);
          }}
          onSaved={(p) => {
            setShowDobPrompt(false);
            if (p) setPatientData((prev) => ({ ...prev, date_of_birth: p.date_of_birth, age: p.age }));
          }}
        />
      ) : null}

      {showWhatsappPrompt && !showDobPrompt ? (
        <WhatsAppNumberModal
          phoneNumber={dashData?.whatsapp?.phone_number}
          onLater={() => {
            sessionStorage.setItem('mc_whatsapp_prompt_dismissed', '1');
            setShowWhatsappPrompt(false);
          }}
          onSaved={(whatsapp) => {
            setShowWhatsappPrompt(false);
            setDashData((prev) => ({ ...prev, whatsapp }));
          }}
        />
      ) : null}

      {deliveryModal && !showEmailPrompt && !showWhatsappPrompt && !showDobPrompt ? (
        <DeliveryModal
          step={deliveryModal}
          pregnancyStart={dashData?.pregnancy_start}
          onNotYet={() => {
            sessionStorage.setItem('mc_delivery_prompt_dismissed', '1');
            setDeliveryModal(null);
          }}
          onClose={() => {
            sessionStorage.setItem('mc_delivery_prompt_dismissed', '1');
            setDeliveryModal(null);
          }}
          onSaved={refreshAfterDelivery}
        />
      ) : null}

      {showEmailPrompt && !showWhatsappPrompt && !showDobPrompt ? (
        <EmailPrompt
          mode={patientData?.needs_email || dashData?.needs_email ? 'add' : 'verify'}
          initialEmail={patientData?.email || dashData?.email || ''}
          onClose={() => {
            sessionStorage.setItem('mc_email_prompt_dismissed', '1');
            setShowEmailPrompt(false);
          }}
          onSaved={(p) => {
            if (p) setPatientData((prev) => ({ ...prev, ...p }));
          }}
        />
      ) : null}
    </div>
  );
};

export default PatientDashboard;