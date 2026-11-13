import { createContext, useContext } from 'react';

/**
 * Guided tour of the patient app. Each step points at the elements marked
 * data-tour="<target>" on its page (none = a centred message). A step whose
 * targets aren't on her screen is skipped automatically.
 */
export const TOUR_STEPS = [
  { id: 'welcome', route: '/dashboard', targets: [], text: 'Welcome! Let us show you around in under a minute.' },
  {
    id: 'symptoms',
    route: '/dashboard',
    targets: ['report-symptoms'],
    text: 'Tap here to report any symptoms you are having. Your doctor will see it.',
  },
  {
    id: 'learn',
    route: '/dashboard',
    targets: ['learn'],
    text: 'Tap here for videos and tips that match your stage of pregnancy.',
    postpartumText: 'Tap here for videos and tips for you and your baby.',
  },
  {
    id: 'appointments',
    route: '/dashboard',
    targets: ['book-appointment'],
    text: 'Tap here to book an appointment or see your upcoming ones.',
  },
  {
    id: 'profile',
    route: '/dashboard',
    targets: ['profile'],
    text: 'Tap here to open your profile. Let us show you what is inside.',
  },
  { id: 'assessment', route: '/profile', targets: ['health-assessment'], text: 'Tap here to take your health assessment.' },
  { id: 'edit', route: '/profile', targets: ['edit-details'], text: 'Tap here to change or correct your details.' },
  {
    id: 'contact',
    route: '/profile',
    targets: ['whatsapp', 'email'],
    text: 'Check and update your email and WhatsApp number here, so we can reach you.',
  },
  // No route: shown on whichever page she is on
  { id: 'done', route: null, targets: [], text: 'You are all set. You can replay this tour any time from your profile page.' },
];

// Set when the tour starts on a login; the WhatsApp and email pop-ups then wait for her next login
export const TOUR_SHOWN_KEY = 'mc_tour_shown';

export const TourContext = createContext({
  active: false,
  shownThisSession: false,
  start: () => {},
});

export const useTour = () => useContext(TourContext);
