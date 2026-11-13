import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  doctorLogin as apiDoctorLogin,
  registerDoctor as apiRegisterDoctor,
  recoverDoctorPassword as apiRecoverDoctorPassword,
  getDoctorQueue,
  searchPatients,
  acknowledgeAlert,
  askDoctorAI,
  getDoctorProfile,
  updateDoctorProfile,
  sendDoctorSms,
  getDoctorSmsJob,
} from '../lib/api';
import { setDoctorAuth, clearDoctorAuth, isDoctorAuthenticated, getDoctorData } from '../lib/auth';
import DoctorEducationManager from '../components/DoctorEducationManager';
import WhatsAppConnection from '../components/WhatsAppConnection';

const RISK_COLORS = {
  HIGH:   { bar: 'bg-secondary', badge: 'bg-secondary text-white',       border: 'border-secondary',   text: 'text-secondary' },
  MEDIUM: { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800',  border: 'border-amber-500',   text: 'text-amber-700' },
  LOW:    { bar: 'bg-primary',   badge: 'bg-primary/10 text-primary',    border: 'border-primary',     text: 'text-primary' },
};

const STATUS_STYLE = {
  WAITING:      'bg-secondary/20 text-secondary border border-secondary/30',
  'IN PROGRESS':'bg-amber-100 text-amber-800 border border-amber-200',
  QUEUED:       'bg-surface-container text-on-surface-variant border border-outline-variant',
  DONE:         'bg-primary text-on-primary',
};

// Reading material for doctors; the files live in frontend/public/resources/.
// The WHO digital adaptation kit is AI context only (docs/ -> npm run kb:build), not listed here.
const RESOURCES = [
  {
    title: 'WHO recommendations on antenatal care for a positive pregnancy experience',
    year: 2016,
    about: 'The 49 WHO recommendations for routine antenatal care: nutrition, maternal and fetal assessment, preventive measures, common symptoms, and the 8-contact schedule.',
    pages: 172,
    size: '3.9 MB',
    href: '/resources/who-antenatal-care-2016.pdf',
    category: 'WHO guidelines',
  },
  {
    title: 'Pregnancy, childbirth, postpartum and newborn care: a guide for essential practice (IMPAC)',
    year: 2015,
    about: 'Step-by-step clinical charts for assessing and managing women and newborns, including emergencies, referral and postpartum care.',
    pages: 184,
    size: '2.8 MB',
    href: '/resources/who-pregnancy-childbirth-postpartum-newborn-care-2015.pdf',
    category: 'WHO guidelines',
  },
];

const patientCode = (id) =>
  id ? `MC-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}` : '';

const toQueuePatient = (apt) => {
  const slotDate = new Date(apt.slot_start);
  const today = new Date();
  const isToday = slotDate.toDateString() === today.toDateString();
  const dateLabel = isToday
    ? 'Today'
    : slotDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    id: apt.patient.id,
    appointment_id: apt.appointment_id,
    name: apt.patient.name || '—',
    code: apt.patient.patient_code || patientCode(apt.patient.id),
    age: apt.patient.age || '—',
    weeks: apt.patient.ega_weeks || '—',
    postpartum: apt.patient.postpartum_label || null,
    risk: (apt.patient.risk_tier || 'LOW').toUpperCase(),
    flags: Array.isArray(apt.patient.risk_reasons) ? apt.patient.risk_reasons : [],
    time: slotDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    dateLabel,
    isToday,
    status: apt.status === 'completed' ? 'DONE' : 'QUEUED',
    initials: (apt.patient.name || 'P').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
  };
};

const isSmsPhone = (phone) => {
  if (!phone) return false;
  const str = String(phone).trim();
  if (str.startsWith('email-')) return false;
  const digits = str.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
};

// Mirrors the backend's formatPhoneForTermii so duplicates are caught before sending
const normalizeSmsPhone = (phone) => {
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '234' + digits.slice(1);
  else if (!digits.startsWith('234') && digits.length === 10 && /^[789]/.test(digits)) digits = '234' + digits;
  return digits;
};

// Splits pasted text on commas, semicolons or new lines. A chunk that is too long to be
// one number (e.g. "0801… 0809…") is split again on spaces, so "+234 801 234 5678" still works.
const parseManualNumbers = (text) =>
  String(text)
    .split(/[,;\n\r]+/)
    .flatMap((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return [];
      return trimmed.replace(/\D/g, '').length > 15 ? trimmed.split(/\s+/) : [trimmed];
    })
    .filter(Boolean);

const toPatientRow = (p) => ({
  id: p.id,
  name: p.name || '—',
  code: p.patient_code || patientCode(p.id),
  age: p.age || '—',
  weeks: p.ega_weeks || '—',
  postpartum: p.postpartum_label || null,
  risk: (p.risk_tier || 'LOW').toUpperCase(),
  flags: Array.isArray(p.risk_reasons) ? p.risk_reasons : [],
  lastSeen: p.last_seen_at || null,
  visitCount: p.site_visit_count || 0,
  phone: p.phone_number || '',
  hasSms: p.has_sms !== undefined ? !!p.has_sms : isSmsPhone(p.phone_number),
  initials: (p.name || 'P').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'P',
});

// ── Sub-views ────────────────────────────────────────────────────

const QueueView = ({ navigate, sseAlerts, onDismiss, fromTab }) => {
  const [filter, setFilter] = useState('All');
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const filters = ['All', 'HIGH', 'MEDIUM', 'LOW', 'Done'];

  useEffect(() => {
    getDoctorQueue()
      .then(({ data }) => setQueue((data.queue || []).map(toQueuePatient)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = queue.filter(p => {
    if (filter === 'All') return p.status !== 'DONE';
    if (filter === 'Done') return p.status === 'DONE';
    return p.risk === filter;
  });
  const highCount = queue.filter(p => p.risk === 'HIGH').length;

  return (
    <div className="space-y-6">
      {/* SSE alert toasts */}
      <div className="fixed top-24 right-6 z-[60] flex flex-col gap-3 max-w-sm w-full">
        {(sseAlerts || []).map((alert, i) => {
          const isBooking = alert.type === 'booking';
          const isOnboarding = alert.type === 'onboarding';
          const bgClass = isBooking || isOnboarding ? 'bg-primary' : 'bg-secondary';
          const borderClass = isBooking || isOnboarding ? 'border-primary/50' : 'border-secondary/50';
          const icon = isBooking ? 'event_available' : isOnboarding ? 'person_add' : 'warning';
          const title = isBooking ? 'New Booking' : isOnboarding ? 'Onboarding complete' : 'Critical Alert';
          
          return (
            <div key={alert.id || i} className={`${bgClass} text-white px-5 py-4 rounded-xl shadow-2xl flex items-center gap-4 border ${borderClass} animate-slide-up`}>
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-label-sm text-xs uppercase tracking-wide">{title}</p>
                <p className="font-body-md font-bold text-sm truncate">
                  {isBooking ? `${alert.patient_name}: ${alert.message}` : (alert.patient_name || alert.message || 'New high-risk alert')}
                </p>
              </div>
              <button onClick={() => onDismiss(alert)} className="ml-1 text-white/60 hover:text-white shrink-0">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          );
        })}
      </div>

      {highCount > 0 && (
        <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4 flex items-center gap-4">
          <div className="bg-secondary text-white w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-lg">priority_high</span>
          </div>
          <p className="font-body-md text-secondary font-semibold">
            🚨 {highCount} HIGH RISK patient{highCount !== 1 ? 's' : ''} in queue — review immediately
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total',       value: queue.length,                                          bg: 'bg-white border border-amber-50',                        fg: 'text-primary' },
          { label: 'High Risk',    value: highCount,                                              bg: 'bg-secondary/5 border border-secondary/10',              fg: 'text-secondary' },
          { label: 'Pending',      value: queue.filter(p => p.status === 'QUEUED').length,        bg: 'bg-amber-50 border border-amber-200',                    fg: 'text-amber-800' },
          { label: 'Seen',         value: queue.filter(p => p.status === 'DONE').length,          bg: 'bg-primary/5 border border-primary/10',                  fg: 'text-primary' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-6 custom-shadow`}>
            <p className={`font-label-sm text-xs uppercase mb-1 ${s.fg} opacity-70`}>{s.label}</p>
            <h3 className={`font-display-xl text-4xl leading-none ${s.fg}`}>
              {loading ? '—' : String(s.value).padStart(2, '0')}
            </h3>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1 no-scrollbar">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2 rounded-full font-label-sm text-xs whitespace-nowrap transition-all ${
              filter === f
                ? 'bg-primary text-white'
                : 'bg-white text-on-surface-variant border border-amber-100 hover:bg-amber-50'
            }`}
          >
            {f === 'HIGH' ? '🔴 High Risk' : f === 'MEDIUM' ? '🟡 Medium' : f === 'LOW' ? '🟢 Low Risk' : f}
          </button>
        ))}
      </div>

      {/* Patient rows */}
      <div className="space-y-3">
        {loading && (
          <div className="text-center py-12 text-on-surface-variant font-body-md text-sm">
            Loading today's queue…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl block mb-2">event_available</span>
            <p className="font-body-md">No patients in queue for this filter</p>
          </div>
        )}
        {filtered.map(p => {
          const rc = RISK_COLORS[p.risk] || RISK_COLORS.LOW;
          return (
            <div
              key={p.id}
              className={`group relative bg-white border border-amber-50 rounded-xl p-5 flex items-center justify-between transition-all hover:shadow-md custom-shadow ${
                p.risk === 'HIGH' ? 'bg-secondary/5 border-secondary/20' : ''
              }`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${rc.bar} rounded-l-xl`} />
              <div className="flex items-center gap-5">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${rc.badge}`}>
                  {p.initials}
                </div>
                <div className="text-center w-16 hidden sm:block">
                  <p className={`font-label-sm text-[10px] ${p.isToday ? rc.text : 'text-outline'}`}>{p.dateLabel}</p>
                  <p className={`font-label-sm text-xs ${rc.text}`}>{p.time}</p>
                </div>
                <div>
                  <h4 className="font-headline-md text-amber-900 text-base">{p.name}</h4>
                  <p className="font-body-md text-on-surface-variant text-sm mt-0.5">
                    {p.code ? <span className="font-mono text-xs mr-2 text-primary/80">{p.code}</span> : null}
                    Age {p.age} · {p.postpartum || `Week ${p.weeks}`}
                  </p>
                  {p.flags.length > 0 && (
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      {p.flags.map(f => (
                        <span
                          key={f}
                          className={`font-label-sm text-[10px] px-2 py-0.5 rounded-full border ${
                            p.risk === 'HIGH' ? 'bg-secondary text-white border-secondary' :
                            p.risk === 'MEDIUM' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                            'bg-primary/5 text-primary border-primary/10'
                          }`}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`font-label-sm text-[10px] px-3 py-1 rounded-full ${STATUS_STYLE[p.status] || STATUS_STYLE.QUEUED}`}>
                  {p.status}
                </span>
                {p.status !== 'DONE' && (
                  <button
                    onClick={() => navigate('/provider/patient', { state: { patient: p, appointment_id: p.appointment_id, fromTab } })}
                    className="bg-primary text-white px-5 py-2 rounded-lg font-label-sm text-xs hover:bg-primary-container transition-all flex items-center gap-1"
                  >
                    View
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MetricsView = () => {
  const riskDist = [
    { label: 'Low Risk',    count: 4, pct: 57, color: 'bg-primary' },
    { label: 'Medium Risk', count: 2, pct: 29, color: 'bg-amber-400' },
    { label: 'High Risk',   count: 1, pct: 14, color: 'bg-secondary' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-headline-lg text-amber-900 text-2xl">Health Metrics</h2>
        <p className="font-body-md text-on-surface-variant/70 mt-1">Provider Summary</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Registered Patients', value: '—',   sub: 'Live data coming soon', icon: 'group',           color: 'text-primary' },
          { label: 'Avg Risk Score',       value: '—',   sub: 'Live data coming soon', icon: 'analytics',       color: 'text-amber-700' },
          { label: 'Alert Response Time',  value: '—',   sub: 'SLA: 60s',              icon: 'timer',           color: 'text-primary' },
          { label: 'Appt Adherence',       value: '—',   sub: 'Live data coming soon', icon: 'event_available', color: 'text-primary' },
          { label: 'Danger Alerts Sent',   value: '—',   sub: 'Live data coming soon', icon: 'warning',         color: 'text-secondary' },
          { label: 'Modules Completed',    value: '—',   sub: 'Live data coming soon', icon: 'school',          color: 'text-primary' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl p-5 custom-shadow border border-amber-50">
            <div className="flex justify-between items-start mb-3">
              <p className="font-label-sm text-on-surface-variant text-xs uppercase">{k.label}</p>
              <span className={`material-symbols-outlined text-lg ${k.color}`}>{k.icon}</span>
            </div>
            <h3 className={`font-display-xl text-3xl ${k.color}`}>{k.value}</h3>
            <p className="font-label-sm text-outline text-xs mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl p-6 custom-shadow border border-amber-50">
        <h3 className="font-headline-md text-amber-900 mb-6">Risk Distribution — Today's Queue</h3>
        <div className="flex h-40 items-end gap-6 mb-4">
          {riskDist.map(r => (
            <div key={r.label} className="flex-1 flex flex-col items-center gap-2">
              <span className="font-headline-md text-on-surface">{r.count}</span>
              <div
                className={`w-full ${r.color} rounded-t-lg transition-all duration-700`}
                style={{ height: `${r.pct * 1.2}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-6">
          {riskDist.map(r => (
            <div key={r.label} className="flex-1 flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${r.color}`} />
              <span className="font-label-sm text-outline text-xs">{r.label} ({r.pct}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const PatientsView = ({ navigate, fromTab, setActiveView, onSelectPatientForSms }) => {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [patients, setPatients] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const delay = search.trim() ? 350 : 0;
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      setLoadError('');
      searchPatients({
        q: search.trim(),
        page,
        limit,
        risk: riskFilter !== 'All' ? riskFilter.toLowerCase() : undefined,
      })
        .then(({ data }) => {
          if (cancelled) return;
          const list = Array.isArray(data) ? data : data?.patients || [];
          setPatients(list.map(toPatientRow));
          const total = data?.total ?? list.length;
          setTotalCount(total);
          setTotalRegistered(data?.totalRegistered ?? total);
          setTotalPages(data?.totalPages ?? Math.max(1, Math.ceil(total / limit)));
        })
        .catch((err) => {
          if (cancelled) return;
          setPatients([]);
          setTotalCount(0);
          setTotalPages(1);
          const status = err.response?.status;
          setLoadError(
            status === 401
              ? 'Session expired. Please sign in again.'
              : 'Could not load patients. Check that the API is running, then try again.'
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, riskFilter, page, limit, reloadTick]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleRiskChange = (e) => {
    setRiskFilter(e.target.value);
    setPage(1);
  };

  const handleLimitChange = (e) => {
    setLimit(Number(e.target.value));
    setPage(1);
  };

  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (page <= 3) {
      return [1, 2, 3, 4, '...', totalPages];
    }
    if (page >= totalPages - 2) {
      return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', page - 1, page, page + 1, '...', totalPages];
  };

  const start = totalCount > 0 ? (page - 1) * limit + 1 : 0;
  const end = Math.min(page * limit, totalCount);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-headline-lg text-amber-900 text-2xl">All Patients</h2>
          <p className="font-body-md text-on-surface-variant/70 mt-1">
            {loading ? (
              'Loading…'
            ) : search.trim() || riskFilter !== 'All' ? (
              <>
                Showing <span className="font-semibold text-amber-900">{totalCount}</span> matching patient{totalCount !== 1 ? 's' : ''}{' '}
                <span className="text-on-surface-variant/50">({totalRegistered} total registered)</span>
              </>
            ) : (
              `${totalRegistered} patient${totalRegistered !== 1 ? 's' : ''} registered`
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {setActiveView && (
            <button
              type="button"
              onClick={() => setActiveView('sms')}
              className="px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">chat</span>
              Send Patient SMS
            </button>
          )}
          {totalCount > 0 && (
            <div className="text-xs font-label-sm text-on-surface-variant/80 bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant/30">
              Page {page} of {totalPages}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="relative flex-grow">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
          <input
            type="text"
            placeholder="Search by name or patient code (MC-XXXXXX)…"
            value={search}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-10 py-3 border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none font-body-md bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors p-1"
              title="Clear search"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={riskFilter}
            onChange={handleRiskChange}
            className="flex-1 sm:flex-none px-4 py-3 border border-outline-variant rounded-xl font-body-md bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          >
            <option value="All">All Risks</option>
            <option value="HIGH">HIGH Risk</option>
            <option value="MEDIUM">MEDIUM Risk</option>
            <option value="LOW">LOW Risk</option>
          </select>

          <select
            value={limit}
            onChange={handleLimitChange}
            title="Patients per page"
            className="px-3 py-3 border border-outline-variant rounded-xl font-body-md bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm"
          >
            <option value={10}>10 / pg</option>
            <option value={20}>20 / pg</option>
            <option value={50}>50 / pg</option>
            <option value={100}>100 / pg</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="text-center py-12 text-on-surface-variant font-body-md text-sm">
            <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-2"></div>
            <p>Loading patients…</p>
          </div>
        )}
        {!loading && loadError && (
          <div className="text-center py-16 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl block mb-2 text-rose-500">error</span>
            <p className="font-body-md">{loadError}</p>
            <button
              type="button"
              onClick={() => setReloadTick((n) => n + 1)}
              className="mt-4 px-5 py-2 rounded-full bg-primary text-white font-label-sm text-xs"
            >
              Try again
            </button>
          </div>
        )}
        {!loading && !loadError && patients.length === 0 && (
          <div className="text-center py-16 text-on-surface-variant bg-white border border-outline-variant/30 rounded-2xl p-8">
            <span className="material-symbols-outlined text-4xl block mb-2 text-outline">person_search</span>
            <p className="font-body-md font-medium text-amber-900">No patients found</p>
            <p className="font-body-md text-xs text-on-surface-variant/70 mt-1">
              {search || riskFilter !== 'All' ? 'Try adjusting your search query or risk filter.' : 'No patients have been registered yet.'}
            </p>
            {(search || riskFilter !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setRiskFilter('All');
                  setPage(1);
                }}
                className="mt-4 px-4 py-1.5 rounded-full border border-outline-variant text-xs font-label-sm text-primary hover:bg-amber-50"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        {!loading && patients.map(p => {
          const rc = RISK_COLORS[p.risk] || RISK_COLORS.LOW;
          return (
            <button
              key={p.id}
              onClick={() => navigate('/provider/patient', { state: { patient: p, fromTab } })}
              className="w-full text-left group relative bg-white border border-amber-50 rounded-xl p-5 flex items-center justify-between transition-all hover:shadow-md custom-shadow hover:border-primary/20 cursor-pointer"
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${rc.bar} rounded-l-xl`} />
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${rc.badge} flex-shrink-0`}>
                  {p.initials}
                </div>
                <div>
                  <p className="font-headline-md text-amber-900">{p.name}</p>
                  <p className="font-body-md text-on-surface-variant text-sm">
                    {p.code ? <span className="font-mono text-xs mr-2 text-primary/80">{p.code}</span> : null}
                    Age {p.age} · {p.postpartum || `Week ${p.weeks}`}
                  </p>
                  {p.flags.length > 0 && (
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      {p.flags.slice(0, 3).map((f) => (
                        <span
                          key={f}
                          className={`font-label-sm text-[10px] px-2 py-0.5 rounded-full border ${
                            p.risk === 'HIGH' ? 'bg-secondary text-white border-secondary' :
                            p.risk === 'MEDIUM' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                            'bg-primary/5 text-primary border-primary/10'
                          }`}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectPatientForSms) onSelectPatientForSms(p.id);
                  }}
                  title={p.hasSms ? `Send SMS to ${p.name}` : 'No valid phone number'}
                  disabled={!p.hasSms}
                  className={`p-2 rounded-lg transition-all ${
                    p.hasSms
                      ? 'text-primary hover:bg-primary/10 border border-primary/20'
                      : 'text-on-surface-variant/30 border border-transparent cursor-not-allowed opacity-40'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">chat</span>
                </button>
                <span className={`font-label-sm text-xs px-3 py-1 rounded-full border ${rc.badge} ${rc.border}`}>
                  {p.risk}
                </span>
                <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">chevron_right</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pagination Bar */}
      {!loading && totalCount > 0 && (
        <div className="bg-white border border-outline-variant/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="text-sm font-body-md text-on-surface-variant">
            Showing <span className="font-semibold text-amber-900">{start}</span>–<span className="font-semibold text-amber-900">{end}</span> of <span className="font-semibold text-amber-900">{totalCount}</span> patients
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Previous Page */}
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/60 text-xs font-label-sm flex items-center gap-1 text-on-surface hover:bg-amber-50 disabled:opacity-35 disabled:hover:bg-transparent transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
              <span className="hidden xs:inline">Prev</span>
            </button>

            {/* Page Numbers */}
            <div className="flex items-center gap-1">
              {getPageNumbers().map((pNum, idx) => {
                if (pNum === '...') {
                  return (
                    <span key={`ellipsis-${idx}`} className="px-1.5 py-1 text-xs text-on-surface-variant/60 font-mono select-none">
                      …
                    </span>
                  );
                }
                const isCurrent = pNum === page;
                return (
                  <button
                    key={`page-${pNum}`}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setPage(pNum);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`w-8 h-8 rounded-lg text-xs font-label-sm flex items-center justify-center transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-primary text-white font-bold shadow-sm'
                        : 'text-on-surface hover:bg-amber-50 border border-transparent hover:border-outline-variant/40'
                    }`}
                  >
                    {pNum}
                  </button>
                );
              })}
            </div>

            {/* Next Page */}
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/60 text-xs font-label-sm flex items-center gap-1 text-on-surface hover:bg-amber-50 disabled:opacity-35 disabled:hover:bg-transparent transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <span className="hidden xs:inline">Next</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── SMS Broadcast View ──────────────────────────────────────────
const SMS_TEMPLATES = [
  {
    id: 'education',
    title: '🤰🏽 Educational Update',
    badge: 'Latest',
    text: `There is an update waiting for you on 9Care!\n\nWe have just added a new educational update to help you better understand your pregnancy and make decisions.\n\nLog into your account and take a look:\nwww.9careai.com/education\n\nStay informed. Stay prepared.`,
  },
  {
    id: 'anc_reminder',
    title: '📅 Antenatal Visit Reminder',
    badge: 'Clinical',
    text: `Hello from 9Care! 🌸 This is a reminder for your upcoming antenatal clinic visit. Please remember to arrive on time and bring your antenatal record. Take care! www.9careai.com`,
  },
  {
    id: 'checkin',
    title: '💜 Wellbeing Check-in',
    badge: 'Support',
    text: `Hello from 9Care AI! 💜 How are you and your baby feeling today? Remember to log any symptoms or chat with our 24/7 AI health assistant at www.9careai.com`,
  },
  {
    id: 'clinic_notice',
    title: '📢 Clinic Announcement',
    badge: 'Notice',
    text: `Important update from 9Care: Our routine maternal care consultations and clinical screenings are holding as scheduled. Please check your account: www.9careai.com`,
  },
];

const SMS_JOB_STORAGE_KEY = '9care_last_sms_job';
const SMS_JOB_POLL_MS = 1500;

const RECIPIENT_STATUS = {
  queued:  { label: 'Waiting',  icon: 'schedule',     pill: 'bg-gray-100 text-on-surface-variant border-gray-200' },
  sending: { label: 'Sending',  icon: 'progress_activity', pill: 'bg-amber-100 text-amber-800 border-amber-200' },
  sent:    { label: 'Sent',     icon: 'check_circle', pill: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  failed:  { label: 'Not sent', icon: 'error',        pill: 'bg-rose-100 text-rose-800 border-rose-200' },
};

const STATUS_FILTERS = [
  { id: 'all',     label: 'All' },
  { id: 'sent',    label: 'Sent' },
  { id: 'failed',  label: 'Not sent' },
  { id: 'pending', label: 'Waiting' },
];

// Live per-number delivery status for one SMS broadcast
const SmsDeliveryStatus = ({ job, onDismiss, onRetryFailed, retrying }) => {
  const [filter, setFilter] = useState('all');
  const [confirmRetry, setConfirmRetry] = useState(false);

  const results = job.results || [];
  const total = results.length;
  const pending = (job.queued || 0) + (job.sending || 0);
  const done = (job.sent || 0) + (job.failed || 0);
  const isSending = job.state === 'sending';
  const pct = (n) => (total === 0 ? 0 : (n / total) * 100);

  const visible = results.filter((r) =>
    filter === 'all'
      ? true
      : filter === 'pending'
      ? r.status === 'queued' || r.status === 'sending'
      : r.status === filter
  );
  const filterCount = { all: total, sent: job.sent || 0, failed: job.failed || 0, pending };

  return (
    <div className="bg-white border border-amber-100 rounded-2xl p-5 space-y-4 custom-shadow animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
          {isSending ? (
            <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin flex-shrink-0" />
          ) : (
            <span className={`material-symbols-outlined ${job.failed > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {job.failed > 0 ? 'report' : 'check_circle'}
            </span>
          )}
          <span>
            {isSending
              ? `Sending messages… ${done} of ${total}`
              : job.failed > 0
              ? `Finished: ${job.sent} sent, ${job.failed} not sent`
              : `All ${job.sent} message${job.sent !== 1 ? 's' : ''} sent`}
          </span>
        </div>
        {!isSending && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-on-surface-variant hover:text-amber-900 text-xs font-medium cursor-pointer flex-shrink-0"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div>
        <div
          className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden flex"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="SMS sending progress"
        >
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct(job.sent || 0)}%` }} />
          <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${pct(job.failed || 0)}%` }} />
          {isSending && (
            <div className="h-full bg-amber-300/70 animate-pulse transition-all duration-500" style={{ width: `${pct(job.sending || 0)}%` }} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-on-surface-variant">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Sent <strong className="text-emerald-800">{job.sent || 0}</strong></span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" />Not sent <strong className="text-rose-700">{job.failed || 0}</strong></span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" />Waiting <strong className="text-amber-950">{pending}</strong></span>
          {job.skipped_no_phone > 0 && (
            <span>Skipped (no phone): <strong className="text-amber-950">{job.skipped_no_phone}</strong></span>
          )}
        </div>
      </div>

      {/* Filters + Retry */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                filter === f.id
                  ? 'bg-amber-900 text-white border-amber-900'
                  : 'bg-surface-container-low text-amber-950 border-outline-variant/40 hover:bg-amber-50'
              }`}
            >
              {f.label} ({filterCount[f.id]})
            </button>
          ))}
        </div>
        {!isSending && job.failed > 0 && onRetryFailed && (
          confirmRetry ? (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-on-surface-variant">Resend to {job.failed} number{job.failed !== 1 ? 's' : ''}?</span>
              <button
                type="button"
                disabled={retrying}
                onClick={() => setConfirmRetry(false)}
                className="px-2 py-1 rounded-lg text-on-surface-variant hover:bg-amber-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={retrying}
                onClick={async () => {
                  await onRetryFailed(results.filter((r) => r.status === 'failed').map((r) => r.phone), job.message);
                  setConfirmRetry(false);
                  setFilter('all');
                }}
                className="px-2.5 py-1 rounded-lg font-semibold bg-primary text-white hover:bg-primary/90 cursor-pointer disabled:opacity-50"
              >
                {retrying ? 'Resending…' : 'Yes, resend'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRetry(true)}
              className="text-[11px] font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Retry Not Sent ({job.failed})
            </button>
          )
        )}
      </div>

      {/* Per-number list */}
      <div className="max-h-72 overflow-y-auto border border-outline-variant/40 rounded-xl divide-y divide-outline-variant/20">
        {visible.length === 0 ? (
          <div className="p-5 text-center text-xs text-on-surface-variant">No numbers in this group.</div>
        ) : (
          visible.map((r) => {
            const st = RECIPIENT_STATUS[r.status] || RECIPIENT_STATUS.queued;
            return (
              <div key={r.phone} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-amber-950 truncate">
                    {r.name || (r.source === 'manual' ? 'Added number' : 'Patient')}
                  </p>
                  <p className="text-[11px] text-on-surface-variant font-mono truncate">+{r.phone}</p>
                  {r.status === 'failed' && r.error && (
                    <p className="text-[11px] text-rose-700 truncate" title={r.error}>{r.error}</p>
                  )}
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${st.pill}`}>
                  <span className={`material-symbols-outlined text-[12px] ${r.status === 'sending' ? 'animate-spin' : ''}`}>{st.icon}</span>
                  {st.label}
                </span>
              </div>
            );
          })
        )}
      </div>

      <p className="text-[11px] text-on-surface-variant/70">
        “Sent” means the SMS gateway accepted the message for delivery to that number.
      </p>
    </div>
  );
};

const BroadcastSmsView = ({ selectedSmsPatientId, onClearSelectedSmsPatient }) => {
  const [mode, setMode] = useState(selectedSmsPatientId ? 'selected' : 'all');
  const [message, setMessage] = useState(SMS_TEMPLATES[0].text);
  const [activeTemplate, setActiveTemplate] = useState('education');
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [selectedIds, setSelectedIds] = useState(selectedSmsPatientId ? [selectedSmsPatientId] : []);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('All');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [manualNumbers, setManualNumbers] = useState([]);
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState('');
  const [job, setJob] = useState(null);
  const [retrying, setRetrying] = useState(false);
  // Remembered so the status comes back if the doctor leaves this view mid-send
  const [jobId, setJobId] = useState(() => {
    try {
      return localStorage.getItem(SMS_JOB_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const rememberJob = (id) => {
    setJobId(id);
    try {
      if (id) localStorage.setItem(SMS_JOB_STORAGE_KEY, id);
      else localStorage.removeItem(SMS_JOB_STORAGE_KEY);
    } catch {
      // storage unavailable; status just won't survive navigation
    }
  };

  const handleDismissJob = () => {
    setJob(null);
    rememberJob(null);
  };

  // Poll the broadcast until every number has a final status
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const { data } = await getDoctorSmsJob(jobId);
        if (cancelled) return;
        setJob(data);
        if (data.state === 'sending') timer = setTimeout(poll, SMS_JOB_POLL_MS);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 404) {
          setJob(null);
          rememberJob(null);
        } else {
          timer = setTimeout(poll, SMS_JOB_POLL_MS * 2);
        }
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  const jobInProgress = job?.state === 'sending';

  useEffect(() => {
    if (selectedSmsPatientId) {
      setMode('selected');
      setSelectedIds((prev) => Array.from(new Set([...prev, selectedSmsPatientId])));
    }
  }, [selectedSmsPatientId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingPatients(true);
    searchPatients({ limit: 100 })
      .then(({ data }) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.patients || [];
        setPatients(list.map(toPatientRow));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingPatients(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reachableAll = patients.filter((p) => p.hasSms);
  const reachableAllCount = reachableAll.length;

  const filteredPatients = patients.filter((p) => {
    const matchesSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.phone.includes(search);
    const matchesRisk = riskFilter === 'All' || p.risk === riskFilter;
    return matchesSearch && matchesRisk;
  });

  const selectedPatients = patients.filter((p) => selectedIds.includes(p.id));
  const reachableSelected = selectedPatients.filter((p) => p.hasSms);

  const audiencePatients = mode === 'all' ? reachableAll : mode === 'selected' ? reachableSelected : [];
  const audiencePhones = new Set(audiencePatients.map((p) => normalizeSmsPhone(p.phone)));
  // Manual numbers that belong to a patient already in the audience are only sent once
  const extraManualCount = manualNumbers.filter((n) => !audiencePhones.has(n)).length;
  const patientTargetCount = audiencePatients.length;
  const targetCount = patientTargetCount + extraManualCount;

  const handleAddManualNumbers = () => {
    const entries = parseManualNumbers(manualInput);
    if (entries.length === 0) return;

    const invalid = entries.filter((n) => !isSmsPhone(n));
    const valid = entries.filter((n) => isSmsPhone(n)).map(normalizeSmsPhone);

    setManualNumbers((prev) => Array.from(new Set([...prev, ...valid])));
    setManualInput(invalid.join('\n'));
    setManualError(
      invalid.length > 0
        ? `${invalid.length} number${invalid.length !== 1 ? 's' : ''} could not be added. Check them and try again.`
        : ''
    );
  };

  const handleRemoveManualNumber = (number) => {
    setManualNumbers((prev) => prev.filter((n) => n !== number));
  };

  const handleTogglePatient = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllReachable = () => {
    const reachableFilteredIds = filteredPatients.filter((p) => p.hasSms).map((p) => p.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...reachableFilteredIds])));
  };

  const handleSelectHighRisk = () => {
    const highRiskIds = patients.filter((p) => p.risk === 'HIGH' && p.hasSms).map((p) => p.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...highRiskIds])));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
    if (onClearSelectedSmsPatient) onClearSelectedSmsPatient();
  };

  const charCount = message.length;
  const isUnicode = /[^\u0000-\u007F]/.test(message);
  const segmentSize = isUnicode ? (charCount > 70 ? 67 : 70) : (charCount > 160 ? 153 : 160);
  const segments = charCount === 0 ? 0 : Math.ceil(charCount / segmentSize);

  const handleApplyTemplate = (tpl) => {
    setActiveTemplate(tpl.id);
    setMessage(tpl.text);
  };

  const handleSend = async () => {
    if (!message.trim()) {
      setSendError('Please compose an SMS message before sending.');
      return;
    }
    if (targetCount === 0) {
      setSendError(
        mode === 'manual'
          ? 'Add at least one phone number before sending.'
          : 'None of the selected patients have a valid SMS phone number.'
      );
      return;
    }

    setSending(true);
    setSendError('');

    try {
      const payload = {
        message: message.trim(),
        send_all: mode === 'all',
        patient_ids: mode === 'selected' && selectedIds.length > 0 ? selectedIds : undefined,
        phone_numbers: manualNumbers.length > 0 ? manualNumbers : undefined,
      };

      const { data } = await sendDoctorSms(payload);
      setJob(data);
      rememberJob(data.job_id);
      setConfirmOpen(false);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to dispatch SMS';
      setSendError(msg);
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  };

  const handleRetryFailed = async (phones, retryMessage) => {
    setRetrying(true);
    setSendError('');
    try {
      const { data } = await sendDoctorSms({ message: retryMessage, phone_numbers: phones, send_all: false });
      setJob(data);
      rememberJob(data.job_id);
    } catch (err) {
      setSendError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to resend SMS');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-headline-lg text-amber-900 text-2xl">Patient SMS Messaging</h2>
          <p className="font-body-md text-on-surface-variant/70 mt-1">
            Directly compose and broadcast SMS announcements, education updates, and reminders to patients.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto bg-amber-50 border border-amber-200/80 px-3.5 py-1.5 rounded-full text-xs font-label-sm text-amber-900">
          <span className="material-symbols-outlined text-sm text-emerald-600">verified</span>
          <span>Sender: <strong>9Care AI</strong></span>
        </div>
      </div>

      {/* Live Delivery Status */}
      {job && (
        <SmsDeliveryStatus
          key={job.job_id}
          job={job}
          onDismiss={handleDismissJob}
          onRetryFailed={handleRetryFailed}
          retrying={retrying}
        />
      )}

      {/* Error Banner */}
      {sendError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-rose-600">error</span>
            <span>{sendError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSendError('')}
            className="text-rose-700 hover:text-rose-900 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Composer & Recipient Selector on Left, Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          {/* Target Audience Card */}
          <div className="bg-white border border-amber-50 rounded-2xl p-6 custom-shadow space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-amber-900 font-bold text-base flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">group</span>
                Recipient Audience
              </h3>
              <span className="text-xs font-label-sm text-on-surface-variant/80 bg-surface-container-low px-3 py-1 rounded-full">
                {targetCount} reachable recipient{targetCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Mode Toggle Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setMode('all')}
                className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  mode === 'all'
                    ? 'bg-white text-amber-950 shadow-sm border border-outline-variant/30'
                    : 'text-on-surface-variant hover:text-amber-900'
                }`}
              >
                <span className="material-symbols-outlined text-base">groups</span>
                All Patients ({reachableAllCount})
              </button>
              <button
                type="button"
                onClick={() => setMode('selected')}
                className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  mode === 'selected'
                    ? 'bg-white text-amber-950 shadow-sm border border-outline-variant/30'
                    : 'text-on-surface-variant hover:text-amber-900'
                }`}
              >
                <span className="material-symbols-outlined text-base">checklist</span>
                Selected Patients ({selectedIds.length})
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  mode === 'manual'
                    ? 'bg-white text-amber-950 shadow-sm border border-outline-variant/30'
                    : 'text-on-surface-variant hover:text-amber-900'
                }`}
              >
                <span className="material-symbols-outlined text-base">dialpad</span>
                Numbers Only ({manualNumbers.length})
              </button>
            </div>

            {mode === 'manual' ? (
              <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-4 text-xs text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-emerald-600">dialpad</span>
                  Only the phone numbers you add below will receive this message.
                </p>
                <p className="text-on-surface-variant/80 text-[11px]">
                  Use this for numbers that are not linked to a registered patient.
                </p>
              </div>
            ) : mode === 'all' ? (
              <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-4 text-xs text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
                  Broadcast will be sent to all {reachableAllCount} registered patients with a phone number.
                </p>
                <p className="text-on-surface-variant/80 text-[11px]">
                  Duplicate phone numbers and email-only accounts are automatically de-duplicated and filtered out.
                </p>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {/* Search & Risk Filter */}
                <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
                    <input
                      type="text"
                      placeholder="Search patient name, code, phone…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-outline-variant rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                    />
                  </div>
                  <select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                    className="px-2.5 py-2 text-xs border border-outline-variant rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  >
                    <option value="All">All Tiers</option>
                    <option value="HIGH">High Risk</option>
                    <option value="MEDIUM">Medium Risk</option>
                    <option value="LOW">Low Risk</option>
                  </select>
                </div>

                {/* Quick Actions Row */}
                <div className="flex items-center justify-between text-xs gap-2 pt-1 flex-wrap">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllReachable}
                      className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                    >
                      Select All Filtered ({filteredPatients.filter((p) => p.hasSms).length})
                    </button>
                    <span className="text-on-surface-variant/40">·</span>
                    <button
                      type="button"
                      onClick={handleSelectHighRisk}
                      className="text-[11px] font-semibold text-secondary hover:underline cursor-pointer"
                    >
                      Select High Risk
                    </button>
                  </div>
                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="text-[11px] text-on-surface-variant hover:text-amber-900 cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                {/* Patient Checklist Box */}
                <div className="max-h-56 overflow-y-auto border border-outline-variant/40 rounded-xl divide-y divide-outline-variant/20 bg-white">
                  {loadingPatients ? (
                    <div className="p-6 text-center text-xs text-on-surface-variant">Loading patients…</div>
                  ) : filteredPatients.length === 0 ? (
                    <div className="p-6 text-center text-xs text-on-surface-variant">No patients match this filter.</div>
                  ) : (
                    filteredPatients.map((p) => {
                      const isSelected = selectedIds.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            if (p.hasSms) handleTogglePatient(p.id);
                          }}
                          className={`p-3 flex items-center justify-between gap-3 text-xs transition-colors ${
                            p.hasSms ? 'cursor-pointer hover:bg-amber-50/60' : 'opacity-40 cursor-not-allowed bg-gray-50/40'
                          } ${isSelected ? 'bg-amber-50/90' : ''}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!p.hasSms}
                              onChange={() => {}}
                              className="rounded text-primary focus:ring-primary h-4 w-4"
                            />
                            <div className="truncate">
                              <p className="font-semibold text-amber-950 truncate">{p.name}</p>
                              <p className="text-[11px] text-on-surface-variant truncate">
                                {p.code} · {p.phone || 'No phone'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!p.hasSms ? (
                              <span className="text-[10px] text-on-surface-variant/60 bg-gray-200/80 px-2 py-0.5 rounded-full">
                                No SMS
                              </span>
                            ) : (
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  p.risk === 'HIGH'
                                    ? 'bg-secondary text-white border-secondary'
                                    : p.risk === 'MEDIUM'
                                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                                    : 'bg-primary/10 text-primary border-primary/20'
                                }`}
                              >
                                {p.risk}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Manually Added Numbers */}
            <div className="pt-4 border-t border-outline-variant/30 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-amber-950 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-primary">add_call</span>
                    {mode === 'manual' ? 'Phone Numbers' : 'Add Phone Numbers Manually'}
                  </p>
                  <p className="text-[11px] text-on-surface-variant/80 mt-0.5">
                    {mode === 'manual'
                      ? 'Type or paste as many numbers as you need.'
                      : 'Optional. These numbers also receive the message, on top of the patients above.'}
                  </p>
                </div>
                {manualNumbers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setManualNumbers([])}
                    className="text-[11px] text-on-surface-variant hover:text-amber-900 cursor-pointer flex-shrink-0"
                  >
                    Remove All
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  rows={2}
                  value={manualInput}
                  onChange={(e) => {
                    setManualInput(e.target.value);
                    if (manualError) setManualError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddManualNumbers();
                    }
                  }}
                  placeholder={'e.g. 08012345678, +2348098765432\nPaste a list separated by commas or new lines'}
                  className="flex-grow px-3 py-2 text-xs border border-outline-variant rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-y font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddManualNumbers}
                  disabled={!manualInput.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-900 text-white hover:bg-amber-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed sm:self-start"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Add
                </button>
              </div>

              {manualError && (
                <p className="text-[11px] text-rose-700 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {manualError} Numbers need 10–15 digits.
                </p>
              )}

              {manualNumbers.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-on-surface-variant">
                    {manualNumbers.length} number{manualNumbers.length !== 1 ? 's' : ''} added
                    {manualNumbers.length !== extraManualCount && mode !== 'manual' && (
                      <> · {manualNumbers.length - extraManualCount} already in the patient list</>
                    )}
                  </p>
                  <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5 p-2 border border-outline-variant/40 rounded-xl bg-[#FAF8F5]">
                    {manualNumbers.map((n) => (
                      <span
                        key={n}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-white border border-amber-200 text-[11px] font-mono text-amber-950"
                      >
                        +{n}
                        <button
                          type="button"
                          onClick={() => handleRemoveManualNumber(n)}
                          aria-label={`Remove +${n}`}
                          className="w-4 h-4 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-rose-100 hover:text-rose-700 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                mode === 'manual' && (
                  <p className="text-[11px] text-on-surface-variant/70 italic">No numbers added yet.</p>
                )
              )}
            </div>
          </div>

          {/* Message Composer Card */}
          <div className="bg-white border border-amber-50 rounded-2xl p-6 custom-shadow space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-amber-900 font-bold text-base flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">edit_note</span>
                Compose Message
              </h3>
              <div className="flex items-center gap-2">
                {message && (
                  <button
                    type="button"
                    onClick={() => setMessage('')}
                    className="text-xs text-on-surface-variant hover:text-amber-900 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Quick Templates Selector */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-label-sm text-on-surface-variant uppercase tracking-wider">
                Quick Templates
              </p>
              <div className="flex gap-2 flex-wrap">
                {SMS_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTemplate === tpl.id && message === tpl.text
                        ? 'bg-amber-900 text-white border-amber-900 shadow-sm'
                        : 'bg-surface-container-low text-amber-950 border-outline-variant/40 hover:bg-amber-50'
                    }`}
                  >
                    <span>{tpl.title}</span>
                    {tpl.badge && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                        activeTemplate === tpl.id && message === tpl.text ? 'bg-amber-700 text-amber-100' : 'bg-amber-200/70 text-amber-900'
                      }`}>
                        {tpl.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea Input */}
            <div className="space-y-2">
              <textarea
                rows={7}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type the message you want to send to patients…"
                className="w-full p-4 text-sm font-body-md border border-outline-variant rounded-2xl focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-y bg-[#FAF8F5] leading-relaxed"
              />

              {/* Character & Segment Info Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-on-surface-variant/80 gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-amber-950 font-semibold">{charCount}</span>
                  <span>characters</span>
                  <span>·</span>
                  <span className="font-mono font-semibold text-amber-950">{segments}</span>
                  <span>SMS part{segments !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${isUnicode ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                    {isUnicode ? 'Unicode (Emojis Enabled)' : 'Standard GSM'}
                  </span>
                </div>
                <div className="text-[11px] text-on-surface-variant/70">
                  Target: <strong className="text-amber-900">{targetCount}</strong> recipient{targetCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Send CTA */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={sending || jobInProgress || targetCount === 0 || !message.trim()}
                title={jobInProgress ? 'Wait for the current broadcast to finish' : undefined}
                onClick={() => setConfirmOpen(true)}
                className="px-6 py-3 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-base">send</span>
                Send SMS Broadcast
              </button>
            </div>
          </div>
        </div>

        {/* Live Smartphone Preview Column */}
        <div className="lg:col-span-5 space-y-4 sticky top-24">
          <div className="bg-white border border-amber-50 rounded-2xl p-6 custom-shadow space-y-4">
            <h3 className="font-headline-md text-amber-900 font-bold text-base flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">phone_iphone</span>
              Live Patient Preview
            </h3>
            <p className="text-xs text-on-surface-variant/70">
              Real-time visualization of how the SMS will appear on a recipient’s phone screen.
            </p>

            {/* Smartphone Mockup */}
            <div className="bg-[#1A1A18] p-5 rounded-3xl border border-amber-900/40 shadow-2xl text-white">
              {/* Phone Status Bar */}
              <div className="flex justify-between items-center text-[10px] text-amber-200/60 pb-3 border-b border-white/10 mb-4 px-1">
                <span>9:41</span>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-xs">signal_cellular_alt</span>
                  <span className="material-symbols-outlined text-xs">wifi</span>
                  <span className="material-symbols-outlined text-xs">battery_full</span>
                </div>
              </div>

              {/* Contact Header */}
              <div className="flex items-center gap-3 pb-3 mb-4 border-b border-white/10">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 font-bold text-sm">
                  9C
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-xs text-white">9Care AI</p>
                    <span className="material-symbols-outlined text-amber-400 text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  </div>
                  <p className="text-[10px] text-amber-200/60">Official SMS Channel</p>
                </div>
              </div>

              {/* Message Bubble Container */}
              <div className="space-y-2 mb-4">
                <div className="text-[10px] text-center text-amber-200/40 font-mono">Today · Just now</div>
                <div className="bg-[#2D2A26] border border-amber-500/20 text-white rounded-2xl rounded-tl-sm p-4 text-xs font-body-md leading-relaxed whitespace-pre-wrap shadow-inner">
                  {message ? (
                    message
                  ) : (
                    <span className="italic text-white/30">Start typing your message to preview how patients will receive it…</span>
                  )}
                  <div className="mt-2.5 flex items-center justify-end gap-1 text-[9px] text-amber-200/50">
                    <span>Delivered</span>
                    <span className="material-symbols-outlined text-[11px] text-emerald-400">done_all</span>
                  </div>
                </div>
              </div>

              {/* Info Note */}
              <div className="bg-amber-950/40 border border-amber-800/40 rounded-xl p-3 text-[11px] text-amber-300/80 flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-sm flex-shrink-0">sms</span>
                <span>Sent directly via Termii Gateway with Unicode support.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-amber-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-xl">send</span>
              </div>
              <div>
                <h3 className="font-headline-md text-amber-900 font-bold text-lg">Confirm SMS Broadcast</h3>
                <p className="text-xs text-on-surface-variant">Review message and target audience</p>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Target Audience:</span>
                <span className="font-semibold text-amber-900">
                  {mode === 'all'
                    ? `All Reachable Patients (${reachableAllCount})`
                    : mode === 'selected'
                    ? `${patientTargetCount} Selected Patient(s)`
                    : 'Manually Added Numbers'}
                </span>
              </div>
              {extraManualCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">{mode === 'manual' ? 'Phone Numbers:' : 'Extra Numbers:'}</span>
                  <span className="font-semibold text-amber-900">{extraManualCount}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Total Recipients:</span>
                <span className="font-semibold text-amber-900">{targetCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Message Length:</span>
                <span className="font-mono text-amber-900">{charCount} chars ({segments} part{segments !== 1 ? 's' : ''})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Encoding:</span>
                <span className="font-medium text-amber-900">{isUnicode ? 'Unicode (Emojis Enabled)' : 'Standard GSM'}</span>
              </div>
            </div>

            <div className="p-3 bg-surface-container-low rounded-xl text-xs text-on-surface-variant font-mono max-h-32 overflow-y-auto whitespace-pre-wrap border border-outline-variant/30">
              {message}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-amber-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={handleSend}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
              >
                {sending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Dispatching via Termii…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">send</span>
                    Yes, Send SMS Broadcast
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ResourcesView = () => (
  <div className="space-y-6">
    <div>
      <h2 className="font-headline-lg text-amber-900 text-2xl">Resources</h2>
      <p className="font-body-md text-on-surface-variant/70 mt-1">Clinical guidelines and reading material for the care team</p>
    </div>

    {[...new Set(RESOURCES.map(r => r.category))].map(cat => (
      <div key={cat}>
        <h3 className="font-label-sm text-on-surface-variant uppercase tracking-widest text-xs mb-3">{cat}</h3>
        <div className="space-y-3">
          {RESOURCES.filter(r => r.category === cat).map(r => (
            <div key={r.href} className="bg-white rounded-xl p-4 custom-shadow border border-amber-50 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-primary/20 transition-all">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center font-bold text-xs bg-secondary/10 text-secondary">
                  PDF
                </div>
                <div className="min-w-0">
                  <p className="font-body-md font-medium text-on-surface">{r.title}</p>
                  <p className="font-body-md text-sm text-on-surface-variant mt-0.5">{r.about}</p>
                  <p className="font-label-sm text-outline text-xs mt-1">WHO · {r.year} · {r.pages} pages · {r.size}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0 sm:ml-2">
                <a
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-95"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden>menu_book</span>
                  Read
                </a>
                <a
                  href={r.href}
                  download
                  aria-label={`Download ${r.title}`}
                  className="inline-flex items-center justify-center p-2 rounded-lg border border-outline-variant hover:bg-primary/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-primary text-lg" aria-hidden>download</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const ProfileView = ({ doctor, onUpdateDoctor }) => {
  const d = doctor || {};
  const initials = (d.name || 'DR').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const [phone, setPhone] = useState(d.phone_number || '');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setPhone(d.phone_number || '');
  }, [d.phone_number]);

  const handleSavePhone = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    setErrorMsg('');
    try {
      const res = await updateDoctorProfile({ phone_number: phone.trim() });
      if (res.data?.doctor) {
        onUpdateDoctor?.(res.data.doctor);
        setSavedMsg('WhatsApp number saved! Critical patient alerts will be sent here.');
        setTimeout(() => setSavedMsg(''), 4500);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to update WhatsApp number');
    } finally {
      setSaving(false);
    }
  };

  return (
  <div className="space-y-6 animate-fade-in">
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
      <div>
        <h2 className="font-headline-lg text-amber-900 text-2xl">Provider Profile</h2>
        <p className="font-body-md text-on-surface-variant/70 mt-1">Maternal Health Portal</p>
      </div>
      <div className="flex items-center gap-2 text-xs font-label-sm text-primary bg-primary/10 px-3 py-2 rounded-full w-fit">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse-dot" />
        Active today
      </div>
    </div>

    <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6">
      <div className="bg-[#1A1A18] text-white rounded-3xl p-6 lg:p-8 shadow-2xl overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-primary/10 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-24 h-24 rounded-3xl bg-amber-900/50 flex items-center justify-center shrink-0 border border-amber-400/20">
            <span className="font-headline-lg text-3xl text-white">{initials}</span>
          </div>
          <div className="flex-1">
            <p className="text-amber-300/70 text-xs uppercase tracking-[0.24em] font-label-sm">Clinical profile</p>
            <h3 className="font-headline-lg text-3xl mt-2">{d.name || 'Provider'}</h3>
            <p className="text-amber-100/80 mt-1">Obstetrician</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="px-3 py-1 rounded-full bg-white/10 text-xs">Obstetrics & Gynaecology</span>
              
              <span className="px-3 py-1 rounded-full bg-secondary/20 text-secondary text-xs border border-secondary/30">
                {d.role || 'doctor'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Contact details */}
        <div className="bg-white rounded-2xl p-5 custom-shadow border border-amber-50">
          <p className="font-label-sm text-on-surface-variant uppercase text-xs tracking-widest">Contact</p>
          <div className="mt-4 space-y-3">
            {[
              { icon: 'mail',  label: 'Email', value: d.email || '—' },
              { icon: 'badge', label: 'Role',  value: d.role || '—' },
              { icon: 'chat',  label: 'WhatsApp', value: d.phone_number ? `${d.phone_number}` : 'Not configured' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-lg">{item.icon}</span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-outline font-label-sm">{item.label}</p>
                  <p className="text-sm text-on-surface mt-1">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WhatsApp input card */}
        <div className="bg-white rounded-2xl p-5 custom-shadow border border-amber-50">
          <div className="flex items-center justify-between mb-2">
            <p className="font-label-sm text-on-surface-variant uppercase text-xs tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-emerald-600 text-base">chat</span>
              WhatsApp Notifications
            </p>
            {d.phone_number ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Connected
              </span>
            ) : (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Action required
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant/80 mb-3">
            Enter your WhatsApp number to receive immediate patient danger sign emergency alerts and onboarding updates.
          </p>
          <form onSubmit={handleSavePhone} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-stone-700 block mb-1">
                WhatsApp Number
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. +2348012345678 or 08012345678"
                  className="w-full px-3 py-2.5 pl-9 text-sm border border-stone-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none font-mono"
                />
                <span className="material-symbols-outlined text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px]">
                  call
                </span>
              </div>
            </div>
            {savedMsg && <p className="text-xs font-medium text-emerald-600 bg-emerald-50 p-2 rounded-lg">{savedMsg}</p>}
            {errorMsg && <p className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded-lg">{errorMsg}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 px-4 bg-primary text-white rounded-xl font-label-sm text-xs font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-sm">save</span>
              {saving ? 'Saving…' : 'Save WhatsApp Number'}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
  );
};

const SettingsView = ({ onEditProfile, onSignOut, doctor }) => {
  const [notifSMS, setNotifSMS]         = useState(true);
  const [notifWhatsApp, setNotifWhatsApp] = useState(true);
  const [notifEmail, setNotifEmail]     = useState(false);

  const d = doctor || {};
  const initials = (d.name || 'DR').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const Toggle = ({ value, onChange }) => (
    <button
      onClick={() => onChange(!value)}
      className={`w-12 h-6 rounded-full transition-all relative ${value ? 'bg-primary' : 'bg-outline-variant'}`}
    >
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? 'left-7' : 'left-1'}`} />
    </button>
  );

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h2 className="font-headline-lg text-amber-900 text-2xl">Settings</h2>
        <p className="font-body-md text-on-surface-variant/70 mt-1">Account and notification preferences</p>
      </div>

      <div className="bg-white rounded-xl custom-shadow border border-amber-50 overflow-hidden">
        <div className="p-4 border-b border-amber-50">
          <p className="font-label-sm text-on-surface-variant uppercase text-xs tracking-widest">Account</p>
        </div>
        <div className="flex items-center gap-4 p-6">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="font-headline-md text-primary text-2xl">{initials}</span>
          </div>
          <div>
            <p className="font-headline-md text-amber-900 text-lg">{d.name || 'Provider'}</p>
            <p className="font-body-md text-on-surface-variant text-sm">
              {d.role === 'department_head' ? 'Department Head' : 'Obstetrician'}
            </p>
            <p className="font-label-sm text-outline text-xs mt-1">{d.email || '—'}</p>
            <p className="font-label-sm text-primary text-xs mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">chat</span>
              WhatsApp: {d.phone_number || 'Not configured'}
            </p>
          </div>
        </div>
        <div className="px-6 pb-6">
          <button
            onClick={onEditProfile}
            className="text-primary font-label-sm text-sm underline underline-offset-4"
          >
            Edit profile & WhatsApp number
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl custom-shadow border border-amber-50 overflow-hidden">
        <div className="p-4 border-b border-amber-50">
          <p className="font-label-sm text-on-surface-variant uppercase text-xs tracking-widest">Alert Notifications</p>
        </div>
        <div className="divide-y divide-amber-50">
          {[
            { label: 'SMS Alerts',      sub: 'High-risk patient notifications', value: notifSMS,      set: setNotifSMS },
            { label: 'WhatsApp Alerts', sub: d.phone_number ? `Delivered to WhatsApp: ${d.phone_number}` : 'WhatsApp number not set — click "Edit profile" to configure', value: notifWhatsApp, set: setNotifWhatsApp },
            { label: 'Email Digest',    sub: 'Daily summary report',            value: notifEmail,    set: setNotifEmail },
          ].map(n => (
            <div key={n.label} className="flex justify-between items-center px-6 py-4">
              <div>
                <p className="font-body-md text-on-surface">{n.label}</p>
                <p className="font-label-sm text-outline text-xs">{n.sub}</p>
              </div>
              <Toggle value={n.value} onChange={n.set} />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl custom-shadow border border-amber-50 overflow-hidden">
        <div className="p-4 border-b border-amber-50">
          <p className="font-label-sm text-on-surface-variant uppercase text-xs tracking-widest">Department</p>
        </div>
        <div className="p-6 space-y-3">
          {[
            { label: 'Hospital',    value: 'Partner Hospitals' },
            { label: 'Department',  value: 'Obstetrics & Gynaecology' },
            { label: 'Pilot Group', value: 'Cohort 1' },
          ].map(d => (
            <div key={d.label} className="flex justify-between items-center py-2 border-b border-outline-variant/20 last:border-0">
              <span className="font-label-sm text-on-surface-variant text-xs uppercase">{d.label}</span>
              <span className="font-body-md text-on-surface text-sm">{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onSignOut} className="text-secondary font-label-sm text-sm flex items-center gap-2 hover:underline">
        <span className="material-symbols-outlined text-sm">logout</span>
        Sign out
      </button>
    </div>
  );
};

// ── Doctor Auth Flow ─────────────────────────────────────────────────
const DoctorAuthScreen = ({ onLogin }) => {
  const [view, setView] = useState('login'); // 'login', 'register', 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [name, setName] = useState('');
  const [hospital, setHospital] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setMsg('');
    try {
      const { data } = await apiDoctorLogin(email, password);
      setDoctorAuth(data.access_token, data.refresh_token, data.doctor);
      onLogin(data.doctor);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setMsg('');
    try {
      await apiRegisterDoctor({
        email,
        password,
        name,
        hospital,
        phone_number: phoneNumber.trim() || undefined,
      });
      setMsg('Registration successful! Please log in.');
      setView('login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setMsg('');
    try {
      await apiRecoverDoctorPassword(email);
      setMsg('Password recovery email sent (if account exists).');
      setView('login');
    } catch (err) {
      setError(err.response?.data?.message || 'Recovery failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1A1A18] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-2xl">
        <div className="mb-8">
          <h1 className="font-headline-lg text-amber-900 text-2xl mb-1">Provider Portal</h1>
          <p className="font-body-md text-on-surface-variant text-sm">
            {view === 'login' ? 'Sign in to access patient care dashboard' :
             view === 'register' ? 'Create a provider account' : 'Recover your password'}
          </p>
        </div>
        
        {msg && <p className="text-primary font-label-sm mb-4 p-3 bg-primary/10 rounded-lg">{msg}</p>}

        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="font-label-sm text-on-surface-variant text-xs uppercase tracking-widest block mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none font-body-md" required />
            </div>
            <div>
              <label className="font-label-sm text-on-surface-variant text-xs uppercase tracking-widest block mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-11 border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none font-body-md"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 focus:outline-none flex items-center justify-center p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => { setView('forgot'); setError(''); setMsg(''); }} className="text-primary font-label-sm text-xs hover:underline">Forgot password?</button>
            </div>
            {error && <p className="text-secondary font-label-sm text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-primary text-white py-4 rounded-xl font-label-sm hover:opacity-90 transition-all disabled:opacity-60">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-center font-body-md text-sm mt-4">
              Don't have an account? <button type="button" onClick={() => { setView('register'); setError(''); setMsg(''); }} className="text-primary font-bold hover:underline">Register here</button>
            </p>
          </form>
        )}

        {view === 'register' && (
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="font-label-sm text-on-surface-variant text-xs uppercase tracking-widest block mb-2">Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none font-body-md" required />
            </div>
            <div>
              <label className="font-label-sm text-on-surface-variant text-xs uppercase tracking-widest block mb-2">Hospital / Clinic</label>
              <input type="text" value={hospital} onChange={e => setHospital(e.target.value)} className="w-full px-4 py-3 border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none font-body-md" required />
            </div>
            <div>
              <label className="font-label-sm text-on-surface-variant text-xs uppercase tracking-widest block mb-2">WhatsApp Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder="e.g. +2348012345678 or 08012345678"
                className="w-full px-4 py-3 border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none font-body-md"
              />
              <p className="text-[11px] text-on-surface-variant/70 mt-1">
                Used to deliver emergency danger sign alerts & patient onboarding notifications.
              </p>
            </div>
            <div>
              <label className="font-label-sm text-on-surface-variant text-xs uppercase tracking-widest block mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none font-body-md" required />
            </div>
            <div>
              <label className="font-label-sm text-on-surface-variant text-xs uppercase tracking-widest block mb-2">Password</label>
              <div className="relative">
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-11 border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none font-body-md"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 focus:outline-none flex items-center justify-center p-1"
                  tabIndex={-1}
                  aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showRegPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>
            {error && <p className="text-secondary font-label-sm text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-primary text-white py-4 rounded-xl font-label-sm hover:opacity-90 transition-all disabled:opacity-60">
              {loading ? 'Registering…' : 'Create Account'}
            </button>
            <p className="text-center font-body-md text-sm mt-4">
              Already have an account? <button type="button" onClick={() => { setView('login'); setError(''); setMsg(''); }} className="text-primary font-bold hover:underline">Sign in</button>
            </p>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-5">
            <div>
              <label className="font-label-sm text-on-surface-variant text-xs uppercase tracking-widest block mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary outline-none font-body-md" required />
            </div>
            {error && <p className="text-secondary font-label-sm text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-primary text-white py-4 rounded-xl font-label-sm hover:opacity-90 transition-all disabled:opacity-60">
              {loading ? 'Sending…' : 'Send Recovery Email'}
            </button>
            <p className="text-center font-body-md text-sm mt-4">
              Remember your password? <button type="button" onClick={() => { setView('login'); setError(''); setMsg(''); }} className="text-primary font-bold hover:underline">Sign in</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

// ── Ask AI View ──────────────────────────────────────────────────

const AskAIView = () => {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hello, Doctor. Ask me a clinical question or provide a Patient ID for a patient-specific analysis.' },
  ]);
  const [question, setQuestion] = useState('');
  const [patientId, setPatientId] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const q = question.trim();
    if (!q || q.length < 5 || loading) return;
    const pid = patientId.trim() || undefined;
    setQuestion('');
    const userLabel = pid ? `[Patient ${pid.slice(0, 8)}…] ${q}` : q;
    setMessages(prev => [...prev, { role: 'user', text: userLabel }]);
    setLoading(true);
    try {
      const { data } = await askDoctorAI(q, pid);
      setMessages(prev => [...prev, { role: 'ai', text: data.answer }]);
    } catch (err) {
      const msg = err.response?.status === 404
        ? 'Patient not found. Double-check the Patient ID.'
        : err.response?.status === 403
          ? 'Access denied. Only doctors and department heads can use this assistant.'
          : 'Unable to reach the AI right now. Please try again.';
      setMessages(prev => [...prev, { role: 'ai', text: msg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[700px]">
      {/* Optional patient context input */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1">
          <label className="font-label-sm text-xs text-on-surface-variant uppercase tracking-widest block mb-1">
            Patient ID (optional — for patient-specific analysis)
          </label>
          <input
            type="text"
            value={patientId}
            onChange={e => setPatientId(e.target.value)}
            placeholder="Paste patient UUID here…"
            className="w-full px-4 py-2.5 border border-amber-100 rounded-xl font-body-md text-sm bg-white focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        {patientId && (
          <button
            onClick={() => setPatientId('')}
            className="mt-5 text-on-surface-variant hover:text-secondary"
            title="Clear patient ID"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        )}
      </div>

      {patientId && (
        <div className="mb-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          <span className="material-symbols-outlined text-amber-600 text-sm">person_search</span>
          <p className="font-label-sm text-xs text-amber-800">
            Context locked to patient <span className="font-bold">{patientId.slice(0, 8)}…</span>
          </p>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4 bg-white rounded-2xl border border-amber-50 p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {m.role === 'ai' && (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="material-symbols-outlined text-primary text-base">smart_toy</span>
              </div>
            )}
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl font-body-md text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-primary text-white rounded-tr-sm'
                  : 'bg-amber-50 text-amber-900 rounded-tl-sm border border-amber-100'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-primary text-base">smart_toy</span>
            </div>
            <div className="bg-amber-50 border border-amber-100 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-4 flex items-end gap-3">
        <textarea
          rows={2}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask a clinical question… (Shift+Enter for new line)"
          className="flex-1 resize-none rounded-2xl border border-amber-100 bg-white px-4 py-3 font-body-md text-sm focus:outline-none focus:border-primary transition-colors"
          style={{ maxHeight: '120px', overflowY: 'auto' }}
        />
        <button
          onClick={send}
          disabled={question.trim().length < 5 || loading}
          className="w-12 h-12 bg-primary rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity hover:opacity-90"
        >
          <span className="material-symbols-outlined text-white">send</span>
        </button>
      </div>
      <p className="mt-2 font-label-sm text-[10px] text-on-surface-variant/50 text-center">
        Powered by Groq · Responses reference ACOG/WHO guidelines · Not a substitute for clinical judgment
      </p>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'queue',    icon: 'dashboard',  label: 'Patient Queue' },
  { id: 'metrics',  icon: 'monitoring', label: 'Health Metrics' },
  { id: 'patients', icon: 'group',      label: 'Patients' },
  { id: 'sms',      icon: 'chat',       label: 'Patient SMS' },
  { id: 'whatsapp', icon: 'qr_code_scanner', label: 'WhatsApp' },
  { id: 'education',icon: 'school',     label: 'Education' },
  { id: 'ask_ai',   icon: 'smart_toy',  label: 'Ask AI' },
  { id: 'resources',icon: 'menu_book',  label: 'Resources' },
  { id: 'profile',  icon: 'badge',      label: 'Profile' },
  { id: 'settings', icon: 'settings',   label: 'Settings' },
];

const TAB_IDS = new Set(NAV_ITEMS.map((item) => item.id));
const isProviderTab = (tab) => TAB_IDS.has(tab);

const TODAY_DATE = new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

const ProviderDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loggedIn, setLoggedIn] = useState(isDoctorAuthenticated());
  const [doctor, setDoctor] = useState(getDoctorData());
  const [selectedSmsPatientId, setSelectedSmsPatientId] = useState(null);
  const tabParam = searchParams.get('tab');
  const activeView = isProviderTab(tabParam) ? tabParam : 'queue';
  const setActiveView = (id) => {
    if (!isProviderTab(id) || id === 'queue') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: id }, { replace: true });
    }
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sseAlerts, setSseAlerts] = useState([]);
  const sseRef = useRef(null);

  useEffect(() => {
    if (!loggedIn) return;
    const token = localStorage.getItem('mc_doctor_token');
    if (!token) return;
    const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const es = new EventSource(
      `${BASE}/alerts/subscribe?token=${token}`
    );
    es.onmessage = (e) => {
      try {
        const alert = JSON.parse(e.data);
        setSseAlerts(prev => [alert, ...prev].slice(0, 5));
      } catch {}
    };
    sseRef.current = es;
    return () => es.close();
  }, [loggedIn]);

  useEffect(() => {
    try { sessionStorage.setItem('mc_provider_tab', activeView); } catch {}
  }, [activeView]);

  const handleUpdateDoctor = (updatedDoctor) => {
    setDoctor(updatedDoctor);
    try {
      localStorage.setItem('mc_doctor', JSON.stringify(updatedDoctor));
    } catch {}
  };

  useEffect(() => {
    if (!loggedIn) return;
    getDoctorProfile()
      .then(res => {
        if (res.data?.doctor) {
          handleUpdateDoctor(res.data.doctor);
        }
      })
      .catch(() => {});
  }, [loggedIn]);

  const handleDoctorLogin = (doc) => {
    handleUpdateDoctor(doc);
    setLoggedIn(true);
  };

  const handleDismissAlert = (alert) => {
    if (alert.id) acknowledgeAlert(alert.id).catch(() => {});
    setSseAlerts(prev => prev.filter(a => a !== alert));
  };

  const handleSignOut = () => {
    clearDoctorAuth();
    if (sseRef.current) sseRef.current.close();
    setLoggedIn(false);
    setDoctor(null);
  };

  if (!loggedIn) {
    return <DoctorAuthScreen onLogin={handleDoctorLogin} />;
  }

  const doctorInitials = (doctor?.name || 'DR').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const doctorShortName = doctor?.name?.split(' ').slice(0, 2).join(' ') || 'Doctor';

  const VIEWS = {
    queue: QueueView,
    metrics: MetricsView,
    patients: PatientsView,
    sms: BroadcastSmsView,
    whatsapp: WhatsAppConnection,
    education: DoctorEducationManager,
    ask_ai: AskAIView,
    resources: ResourcesView,
    profile: ProfileView,
    settings: SettingsView,
  };
  const ActiveView = VIEWS[activeView] || QueueView;

  const TODAY_LABELS = {
    queue: "Today's Queue",
    metrics: 'Health Metrics',
    patients: 'All Patients',
    sms: 'Patient SMS Messaging',
    whatsapp: 'Clinic WhatsApp',
    education: 'Education Content',
    ask_ai: 'Clinical AI Assistant',
    resources: 'Resources',
    profile: 'Provider Profile',
    settings: 'Settings',
  };

  return (
    <div className="font-body-md text-on-surface min-h-screen flex">
      <div className="grain-overlay" />

      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex h-screen w-64 fixed left-0 top-0 bg-[#1A1A18] border-r border-amber-900/30 shadow-2xl flex-col p-6 z-50">
        <div className="mb-8">
          <h1 className="font-headline-md text-xl font-bold text-white mb-1">9Care</h1>
          <p className="font-label-sm text-amber-500/70 text-[10px] uppercase tracking-widest">Maternal Health Portal</p>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-body-md text-sm transition-all ${
                activeView === item.id
                  ? 'bg-amber-900/50 text-white border-l-4 border-amber-400'
                  : 'text-amber-200/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-lg" style={activeView === item.id ? { fontVariationSettings: "'FILL' 1" } : {}}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-6 border-t border-amber-900/40">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-900/50 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-white text-sm">{doctorInitials}</span>
            </div>
            <div>
              <p className="text-white font-medium text-sm">{doctorShortName}</p>
              <p className="text-amber-500/60 text-xs">{doctor?.role === 'department_head' ? 'Dept. Head' : 'Obstetrician'}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-amber-200/50 hover:text-white font-label-sm text-xs flex items-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-[#1A1A18] h-full flex flex-col p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h1 className="font-headline-md text-lg text-white">9Care</h1>
              <button onClick={() => setSidebarOpen(false)} className="text-white/60 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <nav className="flex-1 space-y-1">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setActiveView(item.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-body-md text-sm transition-all ${
                    activeView === item.id ? 'bg-amber-900/50 text-white border-l-4 border-amber-400' : 'text-amber-200/60 hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <main className="lg:ml-64 flex-1 min-h-screen">
        <header className="sticky top-0 w-full z-40 bg-[#F7F3ED]/90 backdrop-blur-md border-b border-amber-100 px-6 lg:px-10 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-amber-50 rounded-full">
              <span className="material-symbols-outlined text-amber-900">menu</span>
            </button>
            <div>
              <h2 className="font-headline-lg text-amber-900">{TODAY_LABELS[activeView]}</h2>
              <p className="font-body-md text-on-surface-variant/70 text-sm">{TODAY_DATE}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className="material-symbols-outlined text-amber-900 cursor-pointer p-2 hover:bg-amber-50 rounded-full transition-all">notifications</span>
              {sseAlerts.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-secondary rounded-full text-white text-[9px] font-bold flex items-center justify-center border border-[#F7F3ED]">
                  {sseAlerts.length}
                </span>
              )}
            </div>
            <button onClick={handleSignOut} className="hidden md:flex items-center gap-2 text-sm font-label-sm text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-sm">logout</span>
              Sign out
            </button>
          </div>
        </header>

        <div className="max-w-[1100px] mx-auto p-6 lg:p-10">
          {doctor && !doctor.phone_number && (
            <div className="mb-6 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-600 text-2xl shrink-0">phone_android</span>
                <div>
                  <p className="font-semibold text-sm">Add your WhatsApp number for appointment alerts</p>
                  <p className="text-xs text-amber-800/80">You will receive instant WhatsApp notifications and quick patient links whenever an appointment is booked with you.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('profile')}
                className="self-start sm:self-auto shrink-0 px-3.5 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors shadow-sm"
              >
                Add Number
              </button>
            </div>
          )}
          <ActiveView
            navigate={navigate}
            fromTab={activeView}
            onEditProfile={() => setActiveView('profile')}
            onSignOut={handleSignOut}
            sseAlerts={sseAlerts}
            onDismiss={handleDismissAlert}
            doctor={doctor}
            onUpdateDoctor={handleUpdateDoctor}
            setActiveView={setActiveView}
            selectedSmsPatientId={selectedSmsPatientId}
            onSelectPatientForSms={(id) => {
              setSelectedSmsPatientId(id);
              setActiveView('sms');
            }}
            onClearSelectedSmsPatient={() => setSelectedSmsPatientId(null)}
          />
        </div>
      </main>

      {/* FAB */}
      <div className="fixed bottom-8 right-8 z-50">
        <button className="bg-primary text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-2xl">add</span>
        </button>
      </div>
    </div>
  );
};

export default ProviderDashboard;
