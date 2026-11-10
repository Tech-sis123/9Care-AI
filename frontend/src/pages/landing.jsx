// App.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import WhatsAppContact from '../components/WhatsAppContact';

const Landing = () => {
  const navigate = useNavigate();
  console.log('Landing component rendering...');
  return (
    <div className="bg-surface font-body-md text-on-surface min-h-screen">
      {/* Grain overlay */}
      <div className="grain-overlay" />

      {/* TopAppBar */}
      <nav className="bg-stone-50/80 backdrop-blur-md border-b border-amber-900/5 sticky top-0 z-50">
        <div className="flex justify-between items-center w-full px-6 py-4 max-w-7xl mx-auto">
          <div className="text-2xl font-serif font-bold text-amber-900 flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              pregnant_woman
            </span>
            <span className="font-headline-md">9Care AI</span>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="fixed bottom-4 right-4 z-[999] bg-black/80 text-white text-xs px-3 py-1.5 rounded-full font-mono hover:bg-black transition-colors"
          >
            → patient dash
          </button>
          <div className="hidden md:flex items-center gap-8">
            <a
              className="text-amber-900 border-b-2 border-amber-800 pb-1 font-body-md"
              href="#"
            >
              How it works
            </a>
            <button
              onClick={() => navigate('/provider')}
              className="text-stone-600 hover:text-amber-800 font-body-md transition-all"
            >
              For Providers
            </button>
            <a
              className="text-stone-600 hover:text-amber-800 font-body-md transition-all"
              href="#about"
            >
              About
            </a>
          </div>
          <div className="flex items-center gap-4">
            <button className="hidden lg:block px-4 py-1.5 rounded-full border border-outline font-label-sm text-sm uppercase tracking-widest text-primary">
              EN | Pidgin
            </button>
            <button
              onClick={() => navigate('/register?mode=login')}
              className="hidden sm:block text-primary font-body-md font-bold px-3 py-2 hover:opacity-80"
            >
              Log in
            </button>
            <button
              onClick={() => navigate('/register')}
              className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-body-md font-bold hover:opacity-90 transition-all scale-95 active:scale-90"
            >
              Sign up
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative min-h-[921px] flex items-center overflow-hidden bg-surface">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center py-20">
          <div className="z-10">
            <span className="inline-block py-1 px-4 bg-tertiary-fixed text-primary font-label-sm rounded-full mb-6">
              NATIONWIDE
            </span>
            <h1 className="font-display-xl text-primary mb-6 leading-tight">
              Smart care for you <br />
              and your baby.
            </h1>
            <p className="font-body-lg text-on-surface-variant mb-10 max-w-lg">
              9Care AI guides first-trimester mothers through a safe
              pregnancy with personalized risk assessments and direct links to
              specialists.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <button
                onClick={() => navigate('/register')}
                className="bg-primary text-on-primary px-8 py-4 rounded-lg font-body-md font-bold hover:opacity-95 transition-all"
              >
                Register/sign in
              </button>
              <button onClick={() => navigate('/provider')} className="border-2 border-primary text-primary px-8 py-4 rounded-lg font-body-md font-bold hover:bg-primary/5 transition-all">
                I'm a healthcare provider
              </button>
            </div>
            <div className="flex items-center gap-4 text-stone-500">
              <span className="material-symbols-outlined text-primary">
                verified
              </span>
              <p className="font-body-md">
                Trusted and used at Partner Hospitals
              </p>
            </div>
          </div>
          <div className="relative flex justify-center items-center">
            <div className="absolute w-[450px] h-[450px] bg-secondary-fixed opacity-30 rounded-full blur-3xl"></div>
            <div className="relative z-10 w-full max-w-[320px]">
              <div className="bg-white rounded-[40px] p-4 shadow-2xl border-[8px] border-stone-800">
                <div className="bg-surface-container rounded-[24px] overflow-hidden">
                  <img
                    className="w-full h-auto aspect-[9/19] object-cover"
                    alt="Mobile app interface showing maternal health dashboard with low risk status"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuC1gSLUMv5AvPjDT5yTGJgTLSm6qMkSSNKUIQoi89RhtD_pyKCWzHwmGckRDntIEzCapX1n9478gffVGb6uCGtzHGwkoMiS7QzL5p31J94BLKRSX_xssFn6lk_EkCMwk38eC60qF2EEqgW8r_lbL12PTx7OZVe2l8QTI51OSk5Xp7DWR75BKB8oDH9wR-gv4Dc9mHx9kczDGt_8IzZs8ReSTzDAE_AlVx7swFOhHCBU07P30ZI8osJIXxMZmF6L0-L3PMs-1Urgwtw"
                  />
                </div>
              </div>
              {/* Badges */}
              <div className="absolute -top-6 -right-12 bg-white p-4 rounded-xl shadow-lg border border-primary/10 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white">
                  <span className="material-symbols-outlined text-sm">
                    notifications
                  </span>
                </div>
                <div>
                  <p className="font-label-sm text-sm">Alert sent</p>
                  <p className="text-[10px] text-stone-500">Nurse notified</p>
                </div>
              </div>
              <div className="absolute bottom-12 -left-16 bg-tertiary-fixed p-4 rounded-xl shadow-lg border border-primary/10 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white">
                  <span className="material-symbols-outlined text-sm">
                    check_circle
                  </span>
                </div>
                <div>
                  <p className="font-label-sm text-sm">Risk Status</p>
                  <p className="text-[10px] text-primary font-bold">
                    LOW RISK
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <section className="bg-primary py-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(ellipse_at_top_right,_#FFDEA0_0%,_transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center text-on-primary divide-x divide-white/10">
            <div className="space-y-2 px-4">
              <h3 className="font-display-xl text-on-primary-container">200+</h3>
              <p className="font-label-sm uppercase tracking-widest opacity-80">
                Women enrolled
              </p>
            </div>
            <div className="space-y-2 px-4">
              <h3 className="font-display-xl text-on-primary-container">9</h3>
              <p className="font-label-sm uppercase tracking-widest opacity-80">
                Danger triggers
              </p>
            </div>
            <div className="space-y-2 px-4">
              <h3 className="font-display-xl text-on-primary-container">60s</h3>
              <p className="font-label-sm uppercase tracking-widest opacity-80">
                Emergency Alert
              </p>
            </div>
            <div className="space-y-2 px-4">
              <h3 className="font-display-xl text-on-primary-container">3</h3>
              <p className="font-label-sm uppercase tracking-widest opacity-80">
                Risk Tiers
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="font-headline-lg text-primary mb-4">
              How 9Care works
            </h2>
            <div className="w-20 h-1 bg-secondary mx-auto rounded-full"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 relative">
            {/* Step 1 */}
            <div className="relative flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-tertiary-fixed flex items-center justify-center mb-6 z-10 relative">
                <span className="material-symbols-outlined text-primary text-3xl">
                  app_registration
                </span>
              </div>
              <h4 className="font-headline-md text-primary mb-2">1. Register</h4>
              <p className="text-on-surface-variant font-body-md">
                Sign up with phone OTP once, then log in with email anytime.
              </p>
            </div>
            {/* Step 2 */}
            <div className="relative flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-tertiary-fixed flex items-center justify-center mb-6 z-10 relative">
                <span className="material-symbols-outlined text-primary text-3xl">
                  medical_information
                </span>
              </div>
              <h4 className="font-headline-md text-primary mb-2">
                2. Health Profile
              </h4>
              <p className="text-on-surface-variant font-body-md">
                Share your medical history in English or Pidgin.
              </p>
            </div>
            {/* Step 3 */}
            <div className="relative flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-tertiary-fixed flex items-center justify-center mb-6 z-10 relative">
                <span className="material-symbols-outlined text-primary text-3xl">
                  analytics
                </span>
              </div>
              <h4 className="font-headline-md text-primary mb-2">
                3. Risk Level
              </h4>
              <p className="text-on-surface-variant font-body-md">
                Our AI determines your unique pregnancy risk tier.
              </p>
            </div>
            {/* Step 4 */}
            <div className="relative flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-tertiary-fixed flex items-center justify-center mb-6 z-10 relative">
                <span className="material-symbols-outlined text-primary text-3xl">
                  event_available
                </span>
              </div>
              <h4 className="font-headline-md text-primary mb-2">4. Book</h4>
              <p className="text-on-surface-variant font-body-md">
                Get instant appointments based on your urgency.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-white p-10 rounded-xl shadow-[0_2px_16px_rgba(158,110,0,0.08)] border border-amber-900/5 hover:-translate-y-2 transition-all duration-300">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-8">
                <span className="material-symbols-outlined text-primary">
                  psychology
                </span>
              </div>
              <h3 className="font-headline-md text-primary mb-4">
                AI Risk Assessment
              </h3>
              <p className="text-on-surface-variant font-body-md">
                Advanced algorithms trained on local medical data to predict
                complications before they happen.
              </p>
            </div>
            {/* Card 2 */}
            <div className="bg-white p-10 rounded-xl shadow-[0_2px_16px_rgba(158,110,0,0.08)] border border-amber-900/5 hover:-translate-y-2 transition-all duration-300">
              <div className="w-12 h-12 bg-error-container rounded-lg flex items-center justify-center mb-8">
                <span
                  className="material-symbols-outlined text-secondary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  warning
                </span>
              </div>
              <h3 className="font-headline-md text-primary mb-4">
                Danger Sign Alerts
              </h3>
              <p className="text-on-surface-variant font-body-md">
                Immediate notification system for red flags like bleeding or
                blurred vision, alerting medical staff instantly.
              </p>
            </div>
            {/* Card 3 */}
            <div className="bg-white p-10 rounded-xl shadow-[0_2px_16px_rgba(158,110,0,0.08)] border border-amber-900/5 hover:-translate-y-2 transition-all duration-300">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-8">
                <span className="material-symbols-outlined text-primary">
                  play_circle
                </span>
              </div>
              <h3 className="font-headline-md text-primary mb-4">
                Education, your way
              </h3>
              <p className="text-on-surface-variant font-body-md">
                Personalized audio and video modules in English and Pidgin,
                explaining each stage of your pregnancy.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* For Providers */}
      <section className="py-24 bg-surface-container overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div>
            <h2 className="font-display-xl text-primary mb-8">
              See your patients <br />
              before they walk in.
            </h2>
            <p className="text-on-surface-variant font-body-lg mb-8">
              Our clinician dashboard gives obstetricians a real-time view
              of all patients. Prioritize high-risk patients and
              respond to alerts in seconds.
            </p>
            <ul className="space-y-4">
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">
                  check_circle
                </span>
                <span className="font-body-md">Automated triage workflow</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">
                  check_circle
                </span>
                <span className="font-body-md">
                  Real-time danger sign telemetry
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">
                  check_circle
                </span>
                <span className="font-body-md">
                  Integrated patient medical history
                </span>
              </li>
            </ul>
          </div>
          <div className="relative">
            <div className="bg-[#1A1A18] rounded-2xl p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
                <h4 className="text-white font-headline-md">Patient Queue</h4>
                <span className="text-stone-400 font-label-sm">
                  LIVE
                </span>
              </div>
              <div className="space-y-4">
                {/* High Risk Item */}
                <div className="bg-white/5 border-l-4 border-secondary p-4 flex justify-between items-center">
                  <div>
                    <p className="text-white font-bold">Patience Okon</p>
                    <p className="text-stone-400 text-xs">
                      BP: 160/100 · High Risk
                    </p>
                  </div>
                  <span className="bg-secondary text-white text-[10px] px-2 py-1 rounded uppercase">
                    Critical
                  </span>
                </div>
                {/* Low Risk Item */}
                <div className="bg-white/5 border-l-4 border-primary p-4 flex justify-between items-center">
                  <div>
                    <p className="text-white font-bold">Blessing Osagie</p>
                    <p className="text-stone-400 text-xs">
                      Normal vitals · Low Risk
                    </p>
                  </div>
                  <span className="bg-primary text-white text-[10px] px-2 py-1 rounded uppercase">
                    Routine
                  </span>
                </div>
                {/* Med Risk Item */}
                <div className="bg-white/5 border-l-4 border-tertiary p-4 flex justify-between items-center opacity-60">
                  <div>
                    <p className="text-white font-bold">Efe Williams</p>
                    <p className="text-stone-400 text-xs">
                      Med Risk · Review Pending
                    </p>
                  </div>
                  <span className="bg-tertiary text-white text-[10px] px-2 py-1 rounded uppercase">
                    Pending
                  </span>
                </div>
              </div>
              <div className="mt-8">
                <img
                  className="w-full h-40 object-cover rounded-lg"
                  alt="Medical dashboard with patient queue"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDLZwidpfVMAvaTu44VwejXH-KVNcsJJyyZutvVTI3ZXcI5UYVte9aLnlXp3tHLZTzHaoxcD4EOitz9lgR6aUpbnMOObevQ85lw0KRCd32nmmRLKjCGyOt-2o2j8LGuPsCVgRiLIGjYTUxsRbCbxmv3QChg8EZmERYyGcDEjzc7cij3sUMeSwzIMDCl0uH63VmV3vvB98DbCFVkAwNd_npHByNEAJmkN9WWhIaip0m_2FBluWbnFmXddCi0W1JVT8jWH0lAnD0BTCI"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-24 bg-tertiary-fixed">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span
            className="material-symbols-outlined text-primary text-6xl mb-8"
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            format_quote
          </span>
          <blockquote className="font-display-xl italic text-primary mb-10 leading-snug">
            "9Care AI has bridged the gap between home and hospital. We are
            catching potential issues weeks earlier than we used to, saving
            lives in NATIONWIDE."
          </blockquote>
          <div>
            <img
              className="w-20 h-20 rounded-full mx-auto object-cover mb-4 border-2 border-primary"
              alt="Dr. Osasumwen I. Osagie"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuB7Axo2GiWvudrBq-ZlxywzQsmvLLQxaiYh6nXHnzuVLm82qQ4eMJWHAjs-dUXwzHpKGlvmJoo_e72DFBdMhflm56pkCZoL8gD44jVaXb2vmd9wObIe1n0z0YmW19hS4YxSjTDkD_K4lWkx-h4ztgwJZhHsJGtlxFmcl2MxqEnMpi-ZF5WmvcbOfGoQaJrz8-ZwMD5L87m4XOS-SxQx8x8HF_L6bSwYoRAOZhMt8AJlIJZNGl7td7GpHzIPOdn1jfc-hz5wIHv_uhQ"
            />
            <p className="font-bold text-primary">Dr. Osasumwen I. Osagie</p>
            <p className="font-label-sm text-sm uppercase tracking-widest text-primary/60">
              Obstetrician
            </p>
          </div>
        </div>
      </section>

      {/* About: who builds 9Care AI */}
      <section id="about" className="py-24 bg-surface relative overflow-hidden scroll-mt-20">
        <div className="absolute -top-32 -right-32 w-[420px] h-[420px] bg-secondary-fixed opacity-20 rounded-full blur-3xl" />
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-16 items-center relative">
          <div className="lg:col-span-2">
            <span className="inline-block py-1 px-4 bg-tertiary-fixed text-primary font-label-sm rounded-full mb-6">
              THE PEOPLE BEHIND 9CARE
            </span>
            <h2 className="font-display-xl text-4xl md:text-display-xl text-primary mb-6 leading-tight">
              Built with care, <br />
              by AI Rising.
            </h2>
            <p className="font-body-lg text-on-surface-variant mb-8 max-w-md">
              9Care AI is developed by <span className="font-bold text-primary">AI Rising</span>, a registered
              technology enterprise led by Blessing Ikpia.
            </p>
            <div className="inline-flex items-center gap-3 bg-white rounded-full pl-2 pr-5 py-2 shadow-[0_2px_16px_rgba(158,110,0,0.08)] border border-amber-900/5">
              <span className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  rocket_launch
                </span>
              </span>
              <span className="font-label-sm text-sm uppercase tracking-widest text-primary">
                A product of AI Rising
              </span>
            </div>
          </div>

          <div className="lg:col-span-3">
            <p className="font-label-sm text-sm uppercase tracking-widest text-on-surface-variant mb-6">Leadership</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { initials: 'BI', name: 'Blessing Ikpia', role: 'Chief Executive Officer', tint: 'bg-primary text-on-primary' },
                { initials: 'VE', name: 'Vwakpor Efuetanu', role: 'Lead Innovator', tint: 'bg-tertiary-fixed text-primary' },
                { icon: 'diversity_3', name: 'Clinical & technical team', role: 'The clinicians and engineers who shape every feature', tint: 'bg-secondary-fixed text-primary' },
              ].map((person, i) => (
                <div
                  key={person.name}
                  className={`bg-white p-8 rounded-xl shadow-[0_2px_16px_rgba(158,110,0,0.08)] border border-amber-900/5 hover:-translate-y-2 transition-all duration-300 ${
                    i === 1 ? 'sm:mt-8' : ''
                  }`}
                >
                  <div className={`w-16 h-16 rounded-full ${person.tint} flex items-center justify-center mb-6 font-headline-md text-xl`}>
                    {person.icon ? <span className="material-symbols-outlined text-3xl">{person.icon}</span> : person.initials}
                  </div>
                  <h3 className="font-headline-md text-primary mb-1">{person.name}</h3>
                  <p className="text-on-surface-variant font-body-md text-sm">{person.role}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary text-on-primary border-t border-amber-900/10">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-8 py-16 max-w-7xl mx-auto gap-8">
          <div className="text-center md:text-left">
            <div className="text-xl font-serif font-bold text-amber-50 mb-4">
              9Care AI
            </div>
            <p className="font-serif text-sm tracking-wide opacity-80 max-w-sm">
              © 2026 9Care AI. Safe pregnancies, every time.
            </p>
            <p className="font-serif text-sm tracking-wide opacity-80 max-w-sm mt-2">
              Developed by AI Rising, led by Blessing Ikpia.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8 font-serif text-sm tracking-wide">
            <a
              className="text-stone-400 hover:text-amber-300 underline underline-offset-4"
              href="#"
            >
              How it works
            </a>
            <button
              onClick={() => navigate('/provider')}
              className="text-stone-400 hover:text-amber-300 underline underline-offset-4"
            >
              For Providers
            </button>
            <a
              className="text-stone-400 hover:text-amber-300 underline underline-offset-4"
              href="#about"
            >
              About
            </a>
            <a
              className="text-stone-400 hover:text-amber-300 underline underline-offset-4"
              href="#"
            >
              Privacy Policy
            </a>
            <a
              className="text-stone-400 hover:text-amber-300 underline underline-offset-4"
              href="#"
            >
              Terms
            </a>
          </div>
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary">
                language
              </span>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary">
                mail
              </span>
            </div>
          </div>
        </div>
      </footer>
      <WhatsAppContact />
    </div>
  );
};

export default Landing;