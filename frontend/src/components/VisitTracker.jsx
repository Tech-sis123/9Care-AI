import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recordPatientVisit } from '../lib/api';
import { isPatientAuthenticated } from '../lib/auth';

// Don't ping more than this often from one tab; the server decides what counts as a new visit (30+ minutes away)
const PING_EVERY_MS = 5 * 60 * 1000;
let lastPing = 0;

/**
 * Tells the server a signed-in patient opened the app: on load (including a saved session)
 * and whenever she switches back to the app. Renders nothing.
 */
const VisitTracker = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const ping = () => {
      if (!isPatientAuthenticated() || pathname.startsWith('/provider')) return;
      const now = Date.now();
      if (now - lastPing < PING_EVERY_MS) return;
      lastPing = now;
      recordPatientVisit(pathname).catch(() => {});
    };
    ping();
    const onVisible = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pathname]);

  return null;
};

export default VisitTracker;
