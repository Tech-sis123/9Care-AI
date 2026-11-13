import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { markTutorialSeen } from '../lib/api';
import { TOUR_SHOWN_KEY, TOUR_STEPS, TourContext } from '../lib/tour';

const PAD = 6; // space around a highlighted element
const GAP = 12; // between the highlight and the message
const EDGE = 16; // phone side margin
const WAIT_FOR_TARGET_MS = 2500;
/** Space taken by the page's sticky header (the dashboard's is tall on phones). */
const headerClearance = () => {
  const bottoms = [...document.querySelectorAll('header')]
    .filter((h) => ['sticky', 'fixed'].includes(getComputedStyle(h).position))
    .map((h) => h.getBoundingClientRect().bottom);
  return Math.max(EDGE, ...bottoms) + GAP;
};

const readShown = () => {
  try {
    return sessionStorage.getItem(TOUR_SHOWN_KEY) === '1';
  } catch {
    return false;
  }
};

/** Visible elements for a step (an element hidden for her stage of pregnancy doesn't count). */
const findTargets = (step) =>
  step.targets
    .map((t) =>
      [...document.querySelectorAll(`[data-tour="${t}"]`)].find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      })
    )
    .filter(Boolean);

/**
 * Runs the guided tour across pages. Wrap the routes in it; pages mark elements
 * with data-tour="..." and the dashboard calls start() for a first-time user.
 */
export const TourProvider = ({ children }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [tour, setTourState] = useState(null); // { index, dir, replay, postpartum }
  const tourRef = useRef(null);
  const setTour = (t) => {
    tourRef.current = t;
    setTourState(t);
  };
  const [shownThisSession, setShownThisSession] = useState(readShown);
  // Page the tour is moving to (its own navigation), and the page it is showing on
  const pendingPath = useRef(null);
  const tourPath = useRef(null);

  const move = (path) => {
    if (path && path !== window.location.pathname) {
      pendingPath.current = path;
      navigate(path);
    }
  };

  const goTo = (index, dir) => {
    move(TOUR_STEPS[index].route);
    setTour({ ...tourRef.current, index, dir });
  };

  const start = useCallback(
    ({ replay = false, postpartum = false } = {}) => {
      if (!replay) {
        try {
          sessionStorage.setItem(TOUR_SHOWN_KEY, '1');
        } catch {
          /* private mode: the account flag still stops it next time */
        }
        setShownThisSession(true);
      }
      tourPath.current = window.location.pathname;
      move(TOUR_STEPS[0].route);
      setTour({ index: 0, dir: 1, replay, postpartum });
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const end = (skipped) => {
    const t = tourRef.current;
    if (!t) return;
    setTour(null);
    pendingPath.current = null;
    if (t.replay) return; // replays keep the first date
    // Finished or skipped both count as seen
    markTutorialSeen(skipped).catch(() => {});
    // Back to the dashboard, where the "Have you delivered?" question comes next
    if (window.location.pathname !== '/dashboard') navigate('/dashboard');
  };

  // Leaving the tour's page herself (e.g. the phone's back button) counts as skipping it
  useEffect(() => {
    if (!tourRef.current) return;
    if (pendingPath.current) {
      if (pathname === pendingPath.current) {
        pendingPath.current = null;
        tourPath.current = pathname;
      }
      return;
    }
    if (pathname !== tourPath.current) end(true);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({ active: !!tour, shownThisSession, start }), [tour, shownThisSession, start]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {tour && (
        <TourOverlay
          key={`${tour.index}-${pathname}`}
          index={tour.index}
          dir={tour.dir}
          postpartum={tour.postpartum}
          onNext={() => (tour.index >= TOUR_STEPS.length - 1 ? end(false) : goTo(tour.index + 1, 1))}
          onBack={() => goTo(Math.max(0, tour.index - 1), -1)}
          onSkip={() => end(true)}
          onMissing={() => {
            // Nothing to point at on her screen: move on in the same direction
            const nextIndex = tour.index + tour.dir;
            if (nextIndex < 0) goTo(0, 1);
            else if (nextIndex >= TOUR_STEPS.length) end(false);
            else goTo(nextIndex, tour.dir);
          }}
        />
      )}
    </TourContext.Provider>
  );
};

const TourOverlay = ({ index, postpartum, onNext, onBack, onSkip, onMissing }) => {
  const step = TOUR_STEPS[index];
  const [rects, setRects] = useState(step.targets.length ? null : []); // null = still looking
  const [cardSize, setCardSize] = useState({ w: 340, h: 250 });
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  const cardHeight = useRef(cardSize.h);
  useEffect(() => {
    cardHeight.current = cardSize.h;
  }, [cardSize.h]);

  // Find the step's elements (they may still be loading), bring them into view, then follow them
  useEffect(() => {
    if (!step.targets.length) return undefined;
    let els = [];
    let raf = 0;
    let followRaf = 0;
    const startedAt = Date.now();
    const measure = () => {
      setRects(els.map((el) => el.getBoundingClientRect()));
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    // Scroll so every highlighted part is on screen, just under the page header,
    // with room for the message underneath when the screen is tall enough
    const bringIntoView = () => {
      if (els[0].closest('.fixed, .sticky')) return;
      const rs = els.map((el) => el.getBoundingClientRect());
      const top = Math.min(...rs.map((r) => r.top));
      const bottom = Math.max(...rs.map((r) => r.bottom));
      const headerH = headerClearance();
      const roomFor = window.innerHeight - cardHeight.current - GAP - EDGE;
      if (top >= headerH - 1 && bottom <= roomFor + 1) return;
      const fitsWithCard = bottom - top + headerH <= roomFor;
      const delta = fitsWithCard ? top - headerH : top - Math.max(headerH, (window.innerHeight - (bottom - top)) / 2);
      window.scrollBy({ top: delta, behavior: 'smooth' });
    };
    // Follow the element while the page scrolls; check again once it settles,
    // since the page may still be loading and move things down
    const follow = (ms, then) => {
      const until = Date.now() + ms;
      const tick = () => {
        measure();
        if (Date.now() < until) followRaf = requestAnimationFrame(tick);
        else then?.();
      };
      tick();
    };
    const look = () => {
      els = findTargets(step);
      if (els.length) {
        bringIntoView();
        follow(900, () => {
          els = findTargets(step).length ? findTargets(step) : els;
          bringIntoView();
          follow(700);
        });
        return;
      }
      if (Date.now() - startedAt > WAIT_FOR_TARGET_MS) onMissing();
      else raf = window.setTimeout(look, 100);
    };
    look();
    const onChange = () => els.length && measure();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.clearTimeout(raf);
      cancelAnimationFrame(followRaf);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // The page behind the tour doesn't scroll by finger while it runs
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = before;
    };
  }, []);

  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const { offsetWidth: w, offsetHeight: h } = cardRef.current;
    if (w !== cardSize.w || h !== cardSize.h) setCardSize({ w, h });
  }, [index, rects, viewport.w, cardSize.w, cardSize.h]);

  useEffect(() => {
    if (rects !== null) nextRef.current?.focus({ preventScroll: true });
  }, [index, rects === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rects === null) {
    // Still finding the element: dim the screen, no message yet
    return <div className="fixed inset-0 z-[200] bg-black/60" aria-hidden />;
  }

  const holes = rects.map((r) => ({
    x: r.left - PAD,
    y: r.top - PAD,
    w: r.width + PAD * 2,
    h: r.height + PAD * 2,
  }));

  // Message beside the highlight: below it, else above it, else at the bottom of the screen
  const cardW = Math.min(360, viewport.w - EDGE * 2);
  let cardStyle;
  if (!holes.length) {
    cardStyle = { left: (viewport.w - cardW) / 2, top: Math.max(EDGE, (viewport.h - cardSize.h) / 2) };
  } else {
    const top = Math.min(...holes.map((h) => h.y));
    const bottom = Math.max(...holes.map((h) => h.y + h.h));
    const centre = (Math.min(...holes.map((h) => h.x)) + Math.max(...holes.map((h) => h.x + h.w))) / 2;
    const left = Math.min(Math.max(EDGE, centre - cardW / 2), viewport.w - cardW - EDGE);
    if (viewport.h - bottom >= cardSize.h + GAP + EDGE) cardStyle = { left, top: bottom + GAP };
    else if (top >= cardSize.h + GAP + EDGE) cardStyle = { left, top: top - GAP - cardSize.h };
    else cardStyle = { left, top: viewport.h - cardSize.h - EDGE };
  }

  const text = postpartum && step.postpartumText ? step.postpartumText : step.text;
  const last = index === TOUR_STEPS.length - 1;

  return (
    // Taps outside the message do nothing, so the tour can't close by accident
    <div className="fixed inset-0 z-[200]" onClick={(e) => e.stopPropagation()}>
      <svg className="absolute inset-0 w-full h-full" aria-hidden>
        <defs>
          <mask id="tour-spotlight">
            <rect width="100%" height="100%" fill="white" />
            {holes.map((h, i) => (
              <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx="14" fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(25, 16, 0, 0.66)" mask="url(#tour-spotlight)" />
        {holes.map((h, i) => (
          <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx="14" fill="none" stroke="#F5C43A" strokeWidth="3" />
        ))}
      </svg>

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-text"
        className="absolute bg-white rounded-2xl shadow-2xl p-5 space-y-4"
        style={{ width: cardW, ...cardStyle }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-primary">
            {index + 1} of {TOUR_STEPS.length}
          </span>
          {!last && (
            <button type="button" onClick={onSkip} className="min-h-[44px] px-2 text-base font-semibold text-on-surface-variant underline underline-offset-4">
              Skip
            </button>
          )}
        </div>
        <p id="tour-text" aria-live="polite" className="text-lg leading-snug font-semibold text-on-surface">
          {text}
        </p>
        <div className="flex gap-3">
          {index > 0 && (
            <button
              type="button"
              onClick={onBack}
              className="flex-1 min-h-[48px] rounded-xl border-2 border-outline-variant text-base font-semibold text-on-surface"
            >
              Back
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={onNext}
            className="flex-1 min-h-[48px] rounded-xl bg-primary text-white text-base font-semibold"
          >
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TourProvider;
