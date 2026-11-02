import { useCallback, useEffect, useRef, useState } from 'react';
import { getWhatsAppConnection, requestWhatsAppQr, unlinkWhatsApp } from '../lib/api';

// While WhatsApp is starting or waiting for a scan, check every 2 seconds; otherwise every 15
const FAST_POLL_MS = 2000;
const SLOW_POLL_MS = 15000;
const BUSY = new Set(['starting', 'qr', 'authenticating']);

const STATUS_BADGE = {
  ready: { label: 'Connected', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  qr: { label: 'Waiting for scan', className: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500 animate-pulse' },
  starting: { label: 'Starting…', className: 'bg-sky-50 text-sky-800 border-sky-200', dot: 'bg-sky-500 animate-pulse' },
  authenticating: { label: 'Linking…', className: 'bg-sky-50 text-sky-800 border-sky-200', dot: 'bg-sky-500 animate-pulse' },
  expired: { label: 'Code expired', className: 'bg-stone-100 text-stone-700 border-stone-200', dot: 'bg-stone-400' },
  stopped: { label: 'Not linked', className: 'bg-stone-100 text-stone-700 border-stone-200', dot: 'bg-stone-400' },
  disconnected: { label: 'Disconnected', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  failed: { label: 'Could not connect', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

const STEPS = [
  'Open WhatsApp on the clinic phone.',
  'Tap the menu (⋮) on Android, or Settings on iPhone, then Linked devices.',
  'Tap Link a device.',
  'Point the phone at the QR code on this page.',
];

const formatPhone = (phone) => {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(phone || '');
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : phone || '';
};

const Spinner = ({ label }) => (
  <div className="flex flex-col items-center justify-center gap-4 py-10 text-center" role="status" aria-live="polite">
    <span className="inline-block w-10 h-10 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" aria-hidden />
    <p className="font-body-md text-sm text-on-surface-variant max-w-[260px]">{label}</p>
  </div>
);

const apiError = (err, fallback) => {
  if (!err.response) return 'Could not reach the server. Check your internet connection and try again.';
  return err.response.data?.message || err.response.data?.error || fallback;
};

/** Doctor screen for linking the clinic WhatsApp by scanning a QR code. */
const WhatsAppConnection = () => {
  const [conn, setConn] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [working, setWorking] = useState(null); // null | 'connect' | 'restart' | 'unlink'
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const pollRef = useRef({ gen: 0, timer: null });

  const refresh = useCallback(async () => {
    try {
      const { data } = await getWhatsAppConnection();
      setConn(data);
      setLoadError('');
      return data;
    } catch (err) {
      setLoadError(apiError(err, 'Could not load the WhatsApp status.'));
      return null;
    }
  }, []);

  // Poll the status; faster while a QR code is on screen so new codes and the scan show up quickly.
  // Each schedule() replaces the previous one, so a button press never leaves two loops running.
  const schedule = useCallback(
    (delay) => {
      const run = (ms) => {
        const poll = pollRef.current;
        window.clearTimeout(poll.timer);
        const gen = ++poll.gen;
        poll.timer = window.setTimeout(async () => {
          const data = await refresh();
          if (gen !== pollRef.current.gen) return; // replaced or unmounted
          run(data && BUSY.has(data.status) ? FAST_POLL_MS : SLOW_POLL_MS);
        }, ms);
      };
      run(delay);
    },
    [refresh]
  );

  useEffect(() => {
    schedule(0);
    const poll = pollRef.current;
    return () => {
      poll.gen++;
      window.clearTimeout(poll.timer);
    };
  }, [schedule]);

  const getQr = async (restart = false) => {
    setActionError('');
    setWorking(restart ? 'restart' : 'connect');
    try {
      const { data } = await requestWhatsAppQr(restart);
      setConn(data);
      schedule(800);
    } catch (err) {
      setActionError(apiError(err, 'Could not get a QR code. Please try again.'));
    } finally {
      setWorking(null);
    }
  };

  const unlink = async () => {
    setActionError('');
    setWorking('unlink');
    try {
      const { data } = await unlinkWhatsApp();
      setConn(data);
      setConfirmUnlink(false);
    } catch (err) {
      setActionError(apiError(err, 'Could not unlink WhatsApp. Please try again.'));
    } finally {
      setWorking(null);
    }
  };

  const status = conn?.status || null;
  const badge = STATUS_BADGE[status] || null;
  const needsLink = status && !['ready', 'authenticating'].includes(status);

  const renderPanel = () => {
    if (!conn) {
      return loadError ? (
        <div className="py-10 text-center space-y-4">
          <span className="material-symbols-outlined text-4xl text-red-400">cloud_off</span>
          <p className="text-sm text-on-surface-variant">{loadError}</p>
          <button type="button" onClick={() => schedule(0)} className="px-5 py-2.5 rounded-xl border border-amber-200 text-sm font-semibold text-amber-900 hover:bg-amber-50">
            Try again
          </button>
        </div>
      ) : (
        <Spinner label="Checking the WhatsApp connection…" />
      );
    }

    if (status === 'ready') {
      return (
        <div className="py-8 flex flex-col items-center text-center gap-4">
          <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center">
            <span className="material-symbols-outlined text-emerald-600 text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <div>
            <p className="font-headline-md text-xl text-amber-900">WhatsApp is connected</p>
            {conn.phone && <p className="font-body-md text-lg font-semibold text-on-surface mt-1">{formatPhone(conn.phone)}</p>}
            {conn.name && <p className="text-sm text-on-surface-variant">{conn.name}</p>}
          </div>
          <p className="text-sm text-on-surface-variant max-w-sm">
            Appointment alerts, lessons and bot replies are sent from this number. You don't need to scan again unless it is unlinked.
          </p>
        </div>
      );
    }

    if (status === 'starting') {
      return (
        <Spinner
          label={
            conn.stage === 'downloading_browser'
              ? 'Setting up WhatsApp on the server for the first time. This can take a minute or two…'
              : 'Opening WhatsApp… the QR code usually appears within a minute.'
          }
        />
      );
    }
    if (status === 'authenticating') return <Spinner label="Code scanned. Linking the clinic WhatsApp…" />;

    if (status === 'qr' && conn.qr_image) {
      return (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="p-3 bg-white rounded-2xl border-2 border-amber-100 shadow-sm">
            <img src={conn.qr_image} alt="WhatsApp QR code to scan with the clinic phone" className="w-64 h-64 sm:w-72 sm:h-72 [image-rendering:pixelated]" />
          </div>
          <p className="text-xs text-on-surface-variant text-center max-w-xs">
            The code changes about every 20 seconds and this page updates by itself. Keep it open until the phone links.
          </p>
          <button
            type="button"
            onClick={() => getQr(true)}
            disabled={!!working}
            className="text-sm font-semibold text-primary underline underline-offset-4 disabled:opacity-50"
          >
            {working === 'restart' ? 'Getting a new code…' : 'Not working? Get a new code'}
          </button>
        </div>
      );
    }

    // stopped, expired, disconnected, failed
    const intro = {
      expired: 'The QR code expired because it was not scanned in time. Get a new one when the clinic phone is ready.',
      disconnected: conn.error || 'WhatsApp was disconnected. Get a new QR code to link it again.',
      failed: conn.error || 'Something went wrong. Get a new QR code to try again.',
    }[status] || 'WhatsApp is not linked yet. Get a QR code and scan it with the clinic phone.';

    return (
      <div className="py-8 flex flex-col items-center text-center gap-5">
        <div className="w-20 h-20 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-amber-700 text-5xl">qr_code_2</span>
        </div>
        <p className={`text-sm max-w-sm ${status === 'failed' || status === 'disconnected' ? 'text-red-700' : 'text-on-surface-variant'}`}>{intro}</p>
        <button
          type="button"
          onClick={() => getQr(status === 'failed' || status === 'disconnected')}
          disabled={!!working}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold text-sm shadow-sm hover:opacity-95 disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-lg">qr_code_scanner</span>
          {working ? 'Requesting…' : status === 'expired' || status === 'failed' || status === 'disconnected' ? 'Get a new QR code' : 'Get QR code'}
        </button>
        {conn.detail && (
          <details className="text-left w-full max-w-sm">
            <summary className="text-xs text-on-surface-variant cursor-pointer">Technical details</summary>
            <p className="mt-2 text-xs font-mono break-words bg-stone-50 border border-stone-200 rounded-lg p-2 text-stone-700">{conn.detail}</p>
          </details>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="font-headline-lg text-amber-900 text-2xl">Clinic WhatsApp</h2>
          <p className="font-body-md text-on-surface-variant/70 mt-1">
            Link the clinic phone so 9Care can send reminders, lessons and bot replies on WhatsApp.
          </p>
        </div>
        {badge && (
          <span className={`self-start sm:self-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${badge.className}`}>
            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        )}
      </div>

      {conn && loadError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3">
          {loadError} Showing the last known status.
        </div>
      )}
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3 flex items-start gap-2" role="alert">
          <span className="material-symbols-outlined text-base mt-0.5">error</span>
          <span>{actionError}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3 bg-white rounded-xl custom-shadow border border-amber-50 p-6">{renderPanel()}</section>

        <aside className="lg:col-span-2 space-y-6">
          {needsLink && (
            <section className="bg-white rounded-xl custom-shadow border border-amber-50 overflow-hidden">
              <div className="p-4 border-b border-amber-50">
                <p className="font-label-sm text-on-surface-variant uppercase text-xs tracking-widest">How to scan</p>
              </div>
              <ol className="p-5 space-y-4">
                {STEPS.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="text-sm text-on-surface">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {status === 'ready' && (
            <section className="bg-white rounded-xl custom-shadow border border-amber-50 overflow-hidden">
              <div className="p-4 border-b border-amber-50">
                <p className="font-label-sm text-on-surface-variant uppercase text-xs tracking-widest">Change number</p>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm text-on-surface-variant">
                  Unlink this phone to stop sending from it, or to link a different clinic number.
                </p>
                {confirmUnlink ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <p className="text-sm text-red-900">
                      Unlink {formatPhone(conn.phone) || 'this number'}? No WhatsApp messages will go out until someone scans a new code.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmUnlink(false)}
                        className="py-2.5 rounded-xl border border-stone-300 bg-white text-sm font-semibold text-stone-700 hover:bg-stone-50"
                      >
                        Keep it
                      </button>
                      <button
                        type="button"
                        onClick={unlink}
                        disabled={working === 'unlink'}
                        className="py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
                      >
                        {working === 'unlink' ? 'Unlinking…' : 'Yes, unlink'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmUnlink(true)}
                    className="w-full py-2.5 rounded-xl border-2 border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50"
                  >
                    Unlink WhatsApp
                  </button>
                )}
              </div>
            </section>
          )}

          <section className="bg-amber-50/60 rounded-xl border border-amber-100 p-5 flex gap-3">
            <span className="material-symbols-outlined text-amber-700">info</span>
            <p className="text-xs text-amber-900/80">
              Scan with the clinic's WhatsApp, not your personal number: every message 9Care sends will come from the phone that is linked here.
            </p>
          </section>

          {conn?.server && (
            <details className="bg-white rounded-xl custom-shadow border border-amber-50 px-5 py-3 text-xs text-on-surface-variant">
              <summary className="cursor-pointer font-semibold">Server details</summary>
              <dl className="mt-3 space-y-1.5">
                <div className="flex justify-between gap-3">
                  <dt>Memory in use</dt>
                  <dd className={`font-mono ${conn.server.memory_used_mb > conn.server.memory_limit_mb * 0.85 ? 'text-red-700 font-semibold' : ''}`}>
                    {conn.server.memory_used_mb} MB of {conn.server.memory_limit_mb} MB
                  </dd>
                </div>
                {conn.server.chrome_processes != null && (
                  <div className="flex justify-between gap-3">
                    <dt>Chrome processes</dt>
                    <dd className="font-mono">{conn.server.chrome_processes}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-3">WhatsApp needs about 600 MB free on the server. Send a screenshot of this if linking keeps failing.</p>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
};

export default WhatsAppConnection;
