import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { upsertProfile, addPregnancy, saveIntake, submitIntake, getPatientMe, getIntake } from '../lib/api';
import { getPatientId, isPatientAuthenticated, getPatientData } from '../lib/auth';

// ── Colours (sky-blue theme) ─────────────────────────────────────────────────
const C = {
  primary:       'sky-600',
  primaryLight:  'sky-50',
  primaryMid:    'sky-100',
  primaryText:   'sky-700',
  primaryBorder: 'sky-400',
  ring:          'ring-sky-400',
};

// ── Shared UI ────────────────────────────────────────────────────────────────
const Label = ({ children }) => (
  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">{children}</p>
);

const RiskBadge = ({ text }) => (
  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mt-2">
    <span className="text-red-600 font-bold text-sm mt-0.5">⚠</span>
    <p className="text-red-600 font-bold text-sm">{text}</p>
  </div>
);

const Field = ({ label, value, onChange, placeholder, type = 'text', hint, min, max }) => (
  <div>
    {label && <Label>{label}</Label>}
    <input
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min} max={max}
      className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 text-base focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
    />
    {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
  </div>
);

const YesNo = ({ value, onChange, yesLabel = 'Yes', noLabel = 'No', unsureLabel }) => (
  <div className="flex flex-wrap gap-3">
    {[{ v: true, l: yesLabel }, { v: false, l: noLabel }].map(opt => (
      <button key={String(opt.v)} onClick={() => onChange(opt.v)}
        className={`flex-1 py-4 rounded-xl border-2 text-base font-semibold transition-all active:scale-95 ${
          value === opt.v
            ? 'border-primary bg-primary text-white shadow-md'
            : 'border-primary/20 bg-white text-slate-700 hover:border-primary/50'
        }`}
      >{opt.l}</button>
    ))}
    {unsureLabel ? (
      <button type="button" onClick={() => onChange('not_sure')}
        className={`w-full py-4 rounded-xl border-2 text-base font-semibold transition-all active:scale-95 ${
          value === 'not_sure'
            ? 'border-primary bg-primary text-white shadow-md'
            : 'border-primary/20 bg-white text-slate-700 hover:border-primary/50'
        }`}
      >{unsureLabel}</button>
    ) : null}
  </div>
);

function isNoneChoice(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'none' || s === 'none of these' || s === 'none of the above';
}

const MEDICAL_CONDITIONS = [
  { key: 'hypertension', label: 'Hypertension' },
  { key: 'epilepsy', label: 'Epilepsy' },
  { key: 'asthma', label: 'Asthma' },
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'peptic_ulcer_disease', label: 'Peptic ulcer disease' },
];

function isYesAnswer(v) {
  return v === true || v === 'true' || v === 'yes' || v === 'Yes';
}

function isNoAnswer(v) {
  return v === false || v === 'false' || v === 'no' || v === 'No';
}

function ynAnswer(v) {
  if (isYesAnswer(v)) return true;
  if (isNoAnswer(v)) return false;
  return null;
}

function isNotSureAnswer(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  return s === 'not_sure' || s === 'unsure' || s === 'notsure';
}

function loadTwinFlag(v) {
  const yn = ynAnswer(v);
  if (yn !== null) return yn;
  if (isNotSureAnswer(v)) return 'not_sure';
  return null;
}

function serializeTwinPregnancy(v) {
  if (v === true) return 'yes';
  if (v === false) return 'no';
  if (v === 'not_sure' || isNotSureAnswer(v)) return 'not_sure';
  return null;
}

function medicalConditionKey(label) {
  return String(label ?? '').toLowerCase().replace(/\s+/g, '_');
}

function loadMedicalConditions(map) {
  const grouped = map['medical_conditions'];
  if (grouped != null && String(grouped).trim() !== '') {
    return String(grouped).split(',').map((s) => s.trim()).filter(Boolean);
  }
  const selected = MEDICAL_CONDITIONS.filter((c) => isYesAnswer(map[c.key])).map((c) => c.label);
  if (selected.length > 0) return selected;
  if (isYesAnswer(map['none_of_these'])) return ['None of these'];
  return [];
}

function buildMedicalConditionResponses(selected) {
  const list = Array.isArray(selected) ? selected : [];
  if (list.length === 0) return [];
  const noneSelected = list.some(isNoneChoice);
  return [
    ...MEDICAL_CONDITIONS.map((c) => ({
      question_key: c.key,
      answer: list.some((item) => medicalConditionKey(item) === c.key) ? 'yes' : 'no',
    })),
    { question_key: 'none_of_these', answer: noneSelected ? 'yes' : 'no' },
    { question_key: 'medical_conditions', answer: list.join(', ') },
  ];
}

const Chips = ({ options = [], value, onChange, multi = false }) => {
  const vals = multi
    ? (Array.isArray(value) ? value : value != null && value !== '' ? [value] : [])
    : null;
  return (
    <div className="flex flex-wrap gap-2">
      {(options || []).map(opt => {
        const v = opt && opt.value !== undefined ? opt.value : opt;
        const l = opt && opt.label !== undefined ? opt.label : opt;
        const active = multi ? vals.includes(v) : value === v;
        return (
          <button key={String(v)} type="button" onClick={() => {
            if (multi) {
              if (vals.includes(v)) onChange(vals.filter(x => x !== v));
              else if (isNoneChoice(v) || isNoneChoice(l)) onChange([v]);
              else onChange([...vals.filter(x => !isNoneChoice(x)), v]);
            } else onChange(v);
          }}
            className={`px-4 py-2.5 rounded-full border-2 text-sm font-semibold transition-all active:scale-95 ${
              active
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-primary/20 bg-white text-slate-700 hover:border-primary/50'
            }`}
          >{l}</button>
        );
      })}
    </div>
  );
};

// ── G/P+ notation (ANC / clinical obstetric summary) ─────────────────────────
// G  = Gravida  — total pregnancies (including current, miscarriages, terminations)
// P  = Para     — pregnancies that reached ≥24 weeks (live birth or stillbirth)
// +A = abortions/miscarriages/terminations before 24 weeks
//
// For a woman who is currently pregnant (this app’s users):
//   G = P + A + 1   →   A = G − P − 1
// (the “1” is the index/current pregnancy, which is in G but not yet in P)
//
// Display matches chart style, e.g. G3P2+1 or G3P2+1(2A)
function computeGPParts(data) {
  const G = parseInt(data.gravidity, 10);
  const P = parseInt(data.parity, 10);
  const alive = parseInt(data.childrenAlive, 10);
  if (isNaN(G) || isNaN(P) || G < 0 || P < 0) return null;

  // Currently pregnant → subtract 1 for the ongoing pregnancy
  const abortions = Math.max(0, G - P - 1);
  const inconsistent = G < P + 1; // e.g. G2 P2 while pregnant is impossible

  return {
    G,
    P,
    abortions,
    alive: !isNaN(alive) && alive >= 0 ? alive : null,
    inconsistent,
    /** Compact clinical string: G3P2+1(2A) */
    compact: `G${G}P${P}+${abortions}${!isNaN(alive) && alive >= 0 ? `(${alive}A)` : ''}`,
    /** Chart-style two-line label */
    chartLine1: `G${G}`,
    chartLine2: `P${P} + ${abortions}`,
  };
}

function computeGP(data) {
  const parts = computeGPParts(data);
  return parts ? parts.compact : null;
}

// ── Section definitions ───────────────────────────────────────────────────────
const SECTION_META = [
  { id: 'biodata',        label: 'Biodata',                icon: 'person', desc: 'Personal information' },
  { id: 'index',          label: 'Index Pregnancy',        icon: 'pregnant_woman', desc: 'About this pregnancy' },
  { id: 'obstetric',      label: 'Obstetric History',      icon: 'child_care', desc: 'Previous pregnancies & births' },
  { id: 'gynae',          label: 'Gynaecological History', icon: 'water_drop', desc: 'Menstrual & gynaecological' },
  { id: 'medical',        label: 'Medical History',        icon: 'medication', desc: 'Conditions, drugs, allergies' },
  { id: 'systems',        label: 'Review of Systems',      icon: 'stethoscope', desc: 'Current symptoms by system' },
];

/** First pregnancy including this one (G1) — no previous obstetric history to collect. */
function isPrimigravida(data) {
  return parseInt(data?.gravidity, 10) === 1;
}

function visibleSectionMeta(data) {
  if (isPrimigravida(data)) {
    return SECTION_META.filter(s => s.id !== 'obstetric');
  }
  return SECTION_META;
}

// ── Build slides per section (data-driven) ────────────────────────────────────
function buildSlides(sectionId, data) {
  switch (sectionId) {

    case 'biodata': return [
      { id: 'age',           question: 'How old are you?',                           field: 'age',           type: 'number',  required: true,  placeholder: 'e.g. 28', min: 12, max: 55,
        hint: 'Your age is used in your risk assessment — please confirm it is correct.' },
      { id: 'occupation',    question: 'What is your occupation?',                   field: 'occupation',    type: 'text',    required: false, placeholder: 'e.g. Trader, Teacher, Nurse' },
      { id: 'education',     question: 'What is your level of education?',           field: 'education',     type: 'chips',   required: false,
        options: ['Primary', 'Secondary', 'Tertiary (University, Polytechnic)', 'None'] },
      { id: 'marital',       question: 'What is your marital status?',               field: 'marital',       type: 'chips',   required: false,
        options: ['Single', 'Married', 'Widowed', 'Divorced'] },
      { id: 'address',       question: 'What is your home address?',                  field: null,            type: 'address', required: false },
      { id: 'religion',      question: 'What is your religion?',                     field: 'religion',      type: 'chips',   required: false,
        options: ['Christian', 'Muslim', 'Traditional', 'Other'] },
      { id: 'christianDenom', question: 'Which denomination are you?',               field: 'christianDenom', type: 'chips',  required: false,
        condition: d => d.religion === 'Christian',
        options: ['Pentecostal', 'Catholic', "Jehovah's Witness", 'Other'] },
      { id: 'tribe',         question: 'What is your tribe / ethnicity?',            field: 'tribe',         type: 'text',    required: false, placeholder: 'e.g. Edo, Yoruba, Igbo' },
      { id: 'lmpKnown',     question: 'Do you know the exact date your last period started?', field: 'lmpKnown', type: 'yes_no', required: true },
      { id: 'lmpDate',      question: 'When did your last period start? (LMP)',      field: 'lmpDate',       type: 'date',    required: false,
        condition: d => d.lmpKnown === true,
        hint: 'This helps us calculate your due date and gestational age.' },
      { id: 'lmpMonthYear', question: 'Which month and year did your last period start?', field: null,      type: 'month_year', required: false,
        condition: d => d.lmpKnown === false,
        hint: 'Approximate is fine — just pick the month and year.' },
      { id: 'gravidity',     question: 'How many times have you been pregnant in your life? (including abortions,miscarriages and your current pregnancy)',
        field: 'gravidity',     type: 'number',  required: true,  placeholder: 'e.g. 3', min: 1, max: 20 },
      { id: 'parity',        question: 'How many pregnancies have you carried to at least 6 months and given birth to? (Do not add this current pregnancy)',
        field: 'parity',        type: 'number',  required: true,  placeholder: 'e.g. 2', min: 0, max: 20,
        condition: d => !isPrimigravida(d),
        riskCheck: v => { const p = parseInt(v); if (p > 5) return 'Grand multiparity — more than 5 deliveries. Flagged as high risk.'; return null; } },
      { id: 'miscarriage', question: 'Have you ever had a miscarriage?', field: 'miscarriage', type: 'yes_no', required: false,
        condition: d => !isPrimigravida(d) },
      { id: 'miscarriageCount', question: 'How many miscarriages have you had?', field: 'miscarriageCount', type: 'number', required: false,
        condition: d => d.miscarriage === true,
        placeholder: 'e.g. 1', min: 1, max: 20 },
      { id: 'abortion', question: 'Have you ever had a Termination of pregnancy (abortion)?', field: 'abortion', type: 'yes_no', required: false,
        condition: d => !isPrimigravida(d) },
      { id: 'abortionCount', question: 'How many terminations have you had?', field: 'abortionCount', type: 'number', required: false,
        condition: d => d.abortion === true,
        placeholder: 'e.g. 1', min: 1, max: 20 },
      { id: 'multiGestation', question: 'Did any of those pregnancies include Twin or multiple gestations?', field: 'multiGestation', type: 'yes_no', required: false,
        condition: d => !isPrimigravida(d) },
      { id: 'multiGestationCount', question: 'How many of those pregnancies were twin or multiple gestations?', field: 'multiGestationCount', type: 'number', required: false,
        condition: d => d.multiGestation === true,
        placeholder: 'e.g. 1', min: 1, max: 20,
        hint: 'Count pregnancies with twins, triplets, or more — not the number of babies.' },
      { id: 'childrenAlive', question: 'How many of the children you delivered are currently alive?',
        field: 'childrenAlive', type: 'number',  required: false, placeholder: 'e.g. 2', min: 0, max: 20,
        condition: d => parseInt(d.parity) > 0 },
    ];

    case 'index': return [
      { id: 'conception',     question: 'How was this pregnancy achieved?',              field: 'conception',     type: 'chips',   required: false,
        options: [{ value: 'spontaneous', label: 'Spontaneous (natural)' }, { value: 'assisted', label: 'Assisted (IVF / IUI)' }] },
      { id: 'currentMultiGestation', question: 'Is this pregnancy a twin or multiple pregnancy?', field: 'currentMultiGestation', type: 'yes_no', required: false,
        unsureLabel: 'Not sure',
        hint: 'This is about the pregnancy you are carrying now.' },
      { id: 'pregTestDone',   question: 'Did you do a pregnancy test to confirm this pregnancy?', field: 'pregTestDone', type: 'yes_no', required: false },
      { id: 'pregTestType',   question: 'What type of pregnancy test did you use?',      field: 'pregTestType',   type: 'chips',   required: false,
        condition: d => d.pregTestDone === true,
        options: [{ value: 'blood', label: 'Blood test' }, { value: 'strip', label: 'Urine strip' }] },
      { id: 'scanDone',       question: 'Did you have an ultrasound scan to confirm the pregnancy?', field: 'scanDone', type: 'yes_no', required: false },
      { id: 'scanDate',       question: 'When was the scan done?',                       field: 'scanDate',       type: 'date',    required: false,
        condition: d => d.scanDone === true,
        hint: 'Approximate date is fine.' },
      { id: 'bloodGroup',     question: 'What is your blood group?',                    field: 'bloodGroup',     type: 'chips',   required: false,
        options: ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−', 'Not sure'] },
      { id: 'genotype',       question: 'What is your genotype?',                       field: 'genotype',       type: 'chips',   required: false,
        options: ['AA', 'AS', 'SS', 'AC', 'Not sure'],
        riskCheck: v => v === 'SS' ? 'Sickle cell disease — requires close monitoring.' : null },
    ];

    case 'obstetric': {
      if (isPrimigravida(data)) return [];

      const derivedMCount = data.miscarriage === true ? (parseInt(data.miscarriageCount, 10) || 0) : 0;
      const mCount = Math.min(10, derivedMCount);
      const miscarriageDetailsSlides = Array.from({ length: mCount }, (_, i) => ({
        id: `miscarriage_${i}`,
        question: null,
        type: 'miscarriage_card',
        miscarriageIdx: i,
        required: false,
      }));

      const p = parseInt(data.parity, 10) || 0;
      let childSlides = [];
      if (p > 0) {
        childSlides = Array.from({ length: p }, (_, i) => ({
          id: `child_${i}`,
          question: null,
          type: 'child_card',
          childIdx: i,
          required: false,
        }));
      }

      if (miscarriageDetailsSlides.length === 0 && childSlides.length === 0) {
        return [{ id: 'obs_none', question: null, type: 'obs_none', required: false }];
      }

      return [...childSlides, ...miscarriageDetailsSlides];
    }

    case 'gynae': return [
      { id: 'menarche',      question: 'At what age did you first see your period?',    field: 'menarche',       type: 'number',  required: false, placeholder: 'e.g. 13', min: 7, max: 20, hint: 'This is called your menarche age.' },
      { id: 'cycleLength',   question: 'How many days is your menstrual cycle?',        field: 'cycleLength',    type: 'number',  required: false, placeholder: 'e.g. 28', min: 14, max: 60, hint: 'Count from the first day of one period to the first day of the next.' },
      { id: 'flowDays',      question: 'How many days do you bleed for?',               field: 'flowDays',       type: 'number',  required: false, placeholder: 'e.g. 5',  min: 1,  max: 14 },
      { id: 'contraAware',   question: 'Do you know about contraceptives (family planning)?',             field: 'contraAware',    type: 'yes_no',  required: false },
      { id: 'contraUsed',    question: 'Have you ever used contraceptives?',            field: 'contraUsed',     type: 'yes_no',  required: false, condition: d => d.contraAware === true },
      { id: 'contraType',    question: 'Which type of contraceptive did you use?',      field: 'contraType',     type: 'chips',   required: false,
        condition: d => d.contraUsed === true,
        options: [{ value: 'pill', label: 'Pill' }, { value: 'injection', label: 'Injection' }, { value: 'implant', label: 'Implant' }, { value: 'iud', label: 'IUD / Coil' }, { value: 'condom', label: 'Condom' }, { value: 'other', label: 'Other' }] },
      { id: 'contraStartDate', question: 'When did you start using it?',                field: 'contraStartDate', type: 'text', required: false, condition: d => d.contraUsed === true && d.contraType && d.contraType !== 'condom', placeholder: 'e.g. Year (2020) is okay as a response' },
      { id: 'contraRemoved',   question: 'Did you stop taking it/have it removed before you got pregnant?',field: 'contraRemoved',  type: 'yes_no', required: false, condition: d => d.contraUsed === true && d.contraType && d.contraType !== 'condom' },
    ];

    case 'medical': {
      // Cap count so a large/invalid number cannot freeze the UI with huge arrays
      const sCount = Math.min(20, Math.max(0, parseInt(data.surgeryCount, 10) || 0));
      const surgeryFields = Array.from({ length: sCount }, (_, i) => ({
        id: `surgery_${i}`,
        question: null,
        type: 'surgery_card',
        surgeryIdx: i,
        required: false,
        condition: d => d.surgeries === true && (parseInt(d.surgeryCount, 10) || 0) > 0,
      }));

      return [
        { id: 'conditions',    question: 'Do you have or have you ever had any of these conditions?', field: 'conditions', type: 'multi', required: false,
          options: [...MEDICAL_CONDITIONS.map((c) => c.label), 'None of these'] },
        { id: 'surgeries',     question: 'Have you had any past surgeries?',               field: 'surgeries',      type: 'yes_no',  required: false },
        { id: 'surgeryCount',  question: 'How many surgeries have you had in the past?',   field: 'surgeryCount',   type: 'number',  required: false, condition: d => d.surgeries === true, placeholder: 'e.g. 1', min: 1, max: 20 },
        ...surgeryFields,
        { id: 'pregMeds',      question: 'Which pregnancy medications are you taking?',    field: 'pregMeds',       type: 'text',    required: false, placeholder: 'e.g. Folic acid, Iron, Calcium…' },
        { id: 'routineMedsCheck', question: 'Are you routinely taking any drugs aside your pregnancy medications?', field: 'routineMedsCheck', type: 'yes_no', required: false, hint: 'including medications for blood pressure and diabetes' },
        { id: 'currentMeds',   question: 'Other routine medications',                      field: 'currentMeds',    type: 'text',    required: false, condition: d => d.routineMedsCheck === true, placeholder: 'e.g. Labetalol…' },
        { id: 'drugAllergy',   question: 'Do you have any drug allergies?',                field: 'drugAllergy',    type: 'yes_no',  required: false },
        { id: 'allergyDetails',question: 'What are you allergic to?',                      field: 'allergyDetails', type: 'text',    required: false, condition: d => d.drugAllergy === true, placeholder: 'e.g. Penicillin, Sulpha drugs…' },
      ];
    }

    case 'systems': return [
      { id: 'systemsSymptoms', question: 'Do you have any of these symptoms?', field: 'systemsSymptoms', type: 'multi', required: false,
        options: [
          'Headaches', 'Seizures / convulsions', 'Dizziness', 'Fainting episodes',
          'Chest pain', 'Cough', 'Palpitations', 'Difficulty breathing', 'Other', 'None of these'
        ]
      },
      { id: 'systemsOther', question: 'Please describe any other symptoms you have', field: 'systemsOther', type: 'text', placeholder: 'Type your other symptoms…', condition: d => (d.systemsSymptoms || []).includes('Other') },
      { id: 'uroGynae', question: 'Are you experiencing any of these?', field: 'uroGynaeSymptoms', type: 'multi', required: false,
        options: ['Frequent urination', 'Pain on urination', 'Urinating blood', 'Unusual vaginal discharge', 'Constipation (hard stool)', 'Frequent stooling', 'Other', 'None of these']
      },
      { id: 'uroGynaeOther', question: 'Please describe any other symptoms you are experiencing', field: 'uroGynaeOther', type: 'text', placeholder: 'Type your other symptoms…', condition: d => (d.uroGynaeSymptoms || []).includes('Other') },
    ];

    default: return [];
  }
}

// ── Completion helpers ────────────────────────────────────────────────────────
function isFilledValue(v) {
  if (v === '' || v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Minimum fields for a previous-child card to count as done */
function isMiscarriageCardFilled(m) {
  if (!m || typeof m !== 'object') return false;
  return isFilledValue(m.year) || isFilledValue(m.gestationalAge);
}

function isChildCardFilled(child) {
  if (!child || typeof child !== 'object') return false;
  // Year + gender + mode of delivery + state now is a practical "filled" bar
  return (
    isFilledValue(child.year) &&
    isFilledValue(child.gender) &&
    isFilledValue(child.deliveryMode) &&
    isFilledValue(child.stateNow)
  );
}

function isSurgeryCardFilled(surgery) {
  if (!surgery || typeof surgery !== 'object') return false;
  return isFilledValue(surgery.type) && isFilledValue(surgery.year);
}

function isAddressFilled(data) {
  return [data?.addrHouse, data?.addrStreet, data?.addrCity, data?.addrState].some(isFilledValue);
}

function isMonthYearFilled(data) {
  return isFilledValue(data?.lmpMonth) && isFilledValue(data?.lmpYear);
}

function isSlideAnswered(slide, data) {
  if (!slide) return false;
  if (slide.type === 'obs_none') return true;
  if (slide.type === 'address') return isAddressFilled(data);
  if (slide.type === 'month_year') return isMonthYearFilled(data);
  if (slide.type === 'child_card') {
    return isChildCardFilled((data.children || [])[slide.childIdx]);
  }
  if (slide.type === 'surgery_card') {
    return isSurgeryCardFilled((data.surgeryDetails || [])[slide.surgeryIdx]);
  }
  if (slide.type === 'miscarriage_card') {
    return isMiscarriageCardFilled((data.miscarriages || [])[slide.miscarriageIdx]);
  }
  if (slide.field) return isFilledValue(data[slide.field]);
  return false;
}

// ── Completion check ──────────────────────────────────────────────────────────
function sectionComplete(sectionId, data) {
  const slides = buildSlides(sectionId, data).filter(s => !s.condition || s.condition(data));
  if (slides.length === 0) return true;

  if (sectionId === 'obstetric') {
    if (isPrimigravida(data)) return true;
    const derivedMCount = data.miscarriage === true ? (parseInt(data.miscarriageCount, 10) || 0) : 0;
    const p = parseInt(data.parity, 10) || 0;
    if (derivedMCount === 0 && p === 0) return true;
    const childrenOk = p === 0 || Array.from({ length: p }, (_, i) => (data.children || [])[i]).every(isChildCardFilled);
    const miscarriagesOk = derivedMCount === 0 || Array.from({ length: derivedMCount }, (_, i) => (data.miscarriages || [])[i]).every(isMiscarriageCardFilled);
    return childrenOk && miscarriagesOk;
  }

  const required = slides.filter(s => s.required);
  if (required.length > 0) {
    return required.every(s => isSlideAnswered(s, data));
  }

  // Optional field sections: keep prior “enough answers” heuristic so we don’t
  // suddenly mark long sections incomplete; always require card slides (surgery) if present.
  const fieldSlides = slides.filter(s => s.field);
  const cardSlides = slides.filter(s => s.type === 'child_card' || s.type === 'surgery_card' || s.type === 'miscarriage_card');

  if (fieldSlides.length === 0) {
    return cardSlides.length === 0 || cardSlides.every(s => isSlideAnswered(s, data));
  }

  const answeredFields = fieldSlides.filter(s => isFilledValue(data[s.field])).length;
  const fieldsOk = answeredFields >= Math.min(3, fieldSlides.length);
  const cardsOk = cardSlides.every(s => isSlideAnswered(s, data));
  return fieldsOk && cardsOk;
}

/** Progress counts for overview cards (works for field slides + child/surgery cards) */
function sectionProgress(sectionId, data) {
  const slides = buildSlides(sectionId, data).filter(s => !s.condition || s.condition(data));
  if (slides.length === 0) return { answered: 0, total: 0 };
  const total = slides.length;
  const answered = slides.filter(s => isSlideAnswered(s, data)).length;
  return { answered, total };
}

// ── Initial data ──────────────────────────────────────────────────────────────
const INIT = {
  // Biodata
  name: '', age: '', occupation: '', education: null, marital: null,
  addrHouse: '', addrStreet: '', addrCity: '', addrState: '',
  religion: null, christianDenom: null, tribe: '',
  lmpKnown: null, lmpDate: '', lmpMonth: '', lmpYear: '',
  gravidity: '', parity: '', multiGestation: null, multiGestationCount: '', childrenAlive: '',
  miscarriage: null, abortion: null, abortionCount: '',
  // Index pregnancy
  desired: null, conception: null, currentMultiGestation: null,
  pregTestDone: null, pregTestType: null,
  scanDone: null, scanDate: '',
  bloodGroup: null, genotype: null,
  // Children (obstetric)
  children: [],
  miscarriageHistory: null,
  miscarriageCount: '',
  miscarriages: [],
  // Gynae
  menarche: '', cycleLength: '', flowDays: '',
  contraAware: null, contraUsed: null, contraType: null, contraStartDate: '', contraRemoved: null,
  papSmearAware: null, papSmearDone: null,
  topDone: null, topCount: '', topYear: '', topMethod: null, topComplications: null,
  // Medical
  conditions: [], surgeries: null, surgeryCount: '', surgeryDetails: [], pregMeds: '', routineMedsCheck: null, currentMeds: '', drugAllergy: null, allergyDetails: '',
  // Systems
  neuroSymptoms: [], cardioSymptoms: [], systemsSymptoms: [], systemsOther: '', uroGynaeSymptoms: [], uroGynaeOther: '',
};

// ── Surgery card ──────────────────────────────────────────────────────────────
const SurgeryCard = ({ idx, surgery, onChange }) => {
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
  const label = ordinals[idx] || `${idx + 1}th`;
  const set = (field, val) => onChange(idx, field, val);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-primary">{label} surgery</h2>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label>What surgery was done?</Label>
          <input type="text" value={surgery.type || ''} onChange={e => set('type', e.target.value)}
            placeholder="e.g. Appendectomy, C-section"
            className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 focus:ring-2 focus:ring-primary/50 outline-none" />
        </div>
        <div>
          <Label>When was it done?</Label>
          <input type="text" value={surgery.year || ''} onChange={e => set('year', e.target.value)}
            placeholder="e.g. 2021"
            className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 focus:ring-2 focus:ring-primary/50 outline-none" />
        </div>
      </div>
    </div>
  );
};

// ── Child card ────────────────────────────────────────────────────────────────
const ChildCard = ({ idx, child, onChange }) => {
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
  const label = ordinals[idx] || `${idx + 1}th`;
  const set = (field, val) => onChange(idx, field, val);

  const csRisk = child.deliveryMode === 'cs';
  const pregnancyEventOptions = [
    { id: 'Diabetes', l: 'High blood sugar' },
    { id: 'Hypertension', l: 'High blood pressure (BP)' },
    { id: 'Malaria', l: 'Malaria' },
    { id: 'Bleeding', l: 'Bleeding' },
    { id: 'Anaemia', l: 'Low blood levels (Anaemia)' },
    { id: 'Other', l: 'Others' },
    { id: 'None', l: 'None' },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-primary">{label} delivery</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Year of birth</Label>
          <input type="number" value={child.year || ''} onChange={e => set('year', e.target.value)}
            placeholder="e.g. 2020" min={1980} max={2026}
            className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 focus:ring-2 focus:ring-primary/50 outline-none" />
        </div>
        <div>
          <Label>Gender</Label>
          <div className="flex gap-2">
            {['Male', 'Female'].map(g => (
              <button key={g} onClick={() => set('gender', g.toLowerCase())}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  child.gender === g.toLowerCase()
                    ? 'border-primary bg-primary text-white'
                    : 'border-primary/20 bg-white text-slate-700 hover:border-primary/50'
                }`}>{g}</button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <Label>Mode of delivery</Label>
        <div className="flex gap-2">
          {[{ v: 'vaginal', l: 'Vaginal delivery' }, { v: 'cs', l: 'Caesarean section (CS)' }].map(opt => (
            <button key={opt.v} onClick={() => set('deliveryMode', opt.v)}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                child.deliveryMode === opt.v
                  ? 'border-primary bg-primary text-white'
                  : 'border-primary/20 bg-white text-slate-700 hover:border-primary/50'
              }`}>{opt.l}</button>
          ))}
        </div>
        {csRisk && <p className="text-red-600 font-bold text-xs mt-1">⚠ CS delivery noted</p>}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label>Birth weight (kg)</Label>
          <input type="number" step="0.1" value={child.birthWeight || ''} onChange={e => set('birthWeight', e.target.value)}
            placeholder="e.g. 3.2" min={0.5} max={7}
            className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 focus:ring-2 focus:ring-primary/50 outline-none" />
        </div>
      </div>

      <div>
        <Label>State of child</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: 'alive_well', l: 'Alive and well' },
            { v: 'alive_unwell', l: 'Alive, health issues' },
            { v: 'stillbirth', l: 'Still birth' },
            { v: 'died_later', l: 'Died at birth/later' }
          ].map(opt => (
            <button key={opt.v} onClick={() => set('stateNow', opt.v)}
              className={`py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all text-center ${
                child.stateNow === opt.v || (opt.v === 'stillbirth' && child.stateNow === 'died_at_birth')
                  ? 'border-primary bg-primary text-white'
                  : 'border-primary/20 bg-white text-slate-700 hover:border-primary/50'
              }`}>{opt.l}</button>
          ))}
        </div>
        {(child.stateNow === 'died_at_birth' || child.stateNow === 'stillbirth' || child.stateNow === 'died_later') &&
          <p className="text-red-600 font-bold text-xs mt-1">⚠ Bad obstetric history — flagged as high risk</p>}
      </div>

      <div>
        <Label>Did any of these happen during this pregnancy?</Label>
        <div className="flex flex-wrap gap-2">
          {pregnancyEventOptions.map(e => {
            const events = child.events || [];
            const active = events.includes(e.id);
            return (
              <button key={e.id} onClick={() => {
                if (e.id === 'None') {
                  set('events', active ? [] : ['None']);
                  set('eventsOther', '');
                } else {
                  const filtered = events.filter(x => x !== 'None');
                  const next = active ? filtered.filter(x => x !== e.id) : [...filtered, e.id];
                  set('events', next);
                  if (e.id === 'Other' && active) set('eventsOther', '');
                }
              }}
                className={`px-3 py-2 rounded-full border-2 text-xs font-semibold transition-all ${
                  active ? 'border-primary bg-primary text-white' : 'border-primary/20 bg-white text-slate-700 hover:border-primary/50'
                }`}>{e.l}</button>
            );
          })}
        </div>
        {(child.events || []).includes('Other') && (
          <div className="mt-3">
            <Label>Please specify</Label>
            <input
              type="text"
              value={child.eventsOther || ''}
              onChange={e => set('eventsOther', e.target.value)}
              placeholder="Type any other pregnancy issue…"
              className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 focus:ring-2 focus:ring-primary/50 outline-none"
            />
          </div>
        )}
      </div>

      <div>
        <Label>Did any issue arise immediately after delivery or within 6 weeks after delivery?</Label>
        <div className="flex gap-2 mb-4">
          {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map(opt => (
            <button key={String(opt.v)} onClick={() => {
              set('hasPostnatalComplication', opt.v);
              if (!opt.v) {
                set('postnatalIssues', []);
                set('postnatalOther', '');
              }
            }}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                child.hasPostnatalComplication === opt.v
                  ? 'border-primary bg-primary text-white'
                  : 'border-primary/20 bg-white text-slate-700 hover:border-primary/50'
              }`}>{opt.l}</button>
          ))}
        </div>
        
        {child.hasPostnatalComplication && (
          <>
            <Label>What were the issues? (select all that apply)</Label>
            <div className="flex flex-wrap gap-2 mb-4">
              {['Excessive bleeding', 'Infection', 'High blood pressure', 'Depression / severe mood swings', 'Breast issues (mastitis)'].map(issue => {
                const issues = child.postnatalIssues || [];
                const active = issues.includes(issue);
                return (
                  <button key={issue} onClick={() => {
                    set('postnatalIssues', active ? issues.filter(x => x !== issue) : [...issues, issue]);
                  }}
                    className={`px-3 py-2 rounded-full border-2 text-xs font-semibold transition-all ${
                      active ? 'border-primary bg-primary text-white' : 'border-primary/20 bg-white text-slate-700 hover:border-primary/50'
                    }`}>{issue}</button>
                );
              })}
            </div>
            <Label>Other issues (if any)</Label>
            <input type="text" value={child.postnatalOther || ''} onChange={e => set('postnatalOther', e.target.value)}
              placeholder="e.g. Jaundice…"
              className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 focus:ring-2 focus:ring-primary/50 outline-none" />
          </>
        )}
      </div>
    </div>
  );
};

// ── Miscarriage card ──────────────────────────────────────────────────────────
const MiscarriageCard = ({ idx, miscarriage, onChange }) => {
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
  const label = ordinals[idx] || `${idx + 1}th`;
  const set = (field, val) => onChange(idx, field, val);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-primary">{label} miscarriage</h2>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label>What year did it happen?</Label>
          <input type="number" value={miscarriage.year || ''} onChange={e => set('year', e.target.value)}
            placeholder="e.g. 2021" min={1980} max={2026}
            className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 focus:ring-2 focus:ring-primary/50 outline-none" />
        </div>
        <div>
          <Label>At what gestational age did it happen?</Label>
          <input type="text" value={miscarriage.gestationalAge || ''} onChange={e => set('gestationalAge', e.target.value)}
            placeholder="i.e 20 weeks or 5 months"
            className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 focus:ring-2 focus:ring-primary/50 outline-none" />
        </div>
      </div>
    </div>
  );
};

// ── Slide renderer ────────────────────────────────────────────────────────────
const SlideContent = ({ slide, data, set, setChild, setSurgery, setMiscarriage }) => {
  if (!slide) return null;
  const val = slide.field ? data[slide.field] : null;
  const risk = slide.riskCheck ? slide.riskCheck(val, data) : null;

  if (slide.type === 'text') return (
    <div className="space-y-3">
      <Field value={val} onChange={v => set(slide.field, v)} placeholder={slide.placeholder} hint={slide.hint} />
      {risk && <RiskBadge text={risk} />}
    </div>
  );

  if (slide.type === 'number') return (
    <div className="space-y-3">
      <Field value={val} onChange={v => set(slide.field, v)} type="number" placeholder={slide.placeholder} hint={slide.hint} min={slide.min} max={slide.max} />
      {risk && <RiskBadge text={risk} />}
    </div>
  );

  if (slide.type === 'date') return (
    <div className="space-y-3">
      <input type="date" value={val || ''} max={new Date().toISOString().split('T')[0]}
        onChange={e => set(slide.field, e.target.value)}
        className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 text-base focus:ring-2 focus:ring-primary/50 outline-none" />
      {slide.hint && <p className="text-xs text-slate-400">{slide.hint}</p>}
    </div>
  );

  if (slide.type === 'month_year') return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label>Month</Label>
        <select value={data.lmpMonth || ''} onChange={e => set('lmpMonth', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 focus:ring-2 focus:ring-primary/50 outline-none">
          <option value="">Select month</option>
          {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
            <option key={m} value={String(i + 1)}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <Label>Year</Label>
        <input type="number" value={data.lmpYear || ''} onChange={e => set('lmpYear', e.target.value)}
          placeholder="e.g. 2026" min={2020} max={2026}
          className="w-full px-4 py-3 rounded-xl border-2 border-primary/20 bg-white text-slate-800 focus:ring-2 focus:ring-primary/50 outline-none" />
      </div>
    </div>
  );

  if (slide.type === 'chips') return (
    <div className="space-y-3">
      <Chips options={slide.options} value={val} onChange={v => set(slide.field, v)} />
      {risk && <RiskBadge text={risk} />}
    </div>
  );

  if (slide.type === 'multi') return (
    <Chips options={slide.options} value={val || []} onChange={v => set(slide.field, v)} multi />
  );

  if (slide.type === 'yes_no') return (
    <div className="space-y-3">
      <YesNo value={val} onChange={v => set(slide.field, v)} unsureLabel={slide.unsureLabel} />
      {risk && <RiskBadge text={risk} />}
    </div>
  );

  if (slide.type === 'address') return (
    <div className="space-y-3">
      <Field label="House / Flat number" value={data.addrHouse} onChange={v => set('addrHouse', v)} placeholder="e.g. 12B" />
      <Field label="Street name" value={data.addrStreet} onChange={v => set('addrStreet', v)} placeholder="e.g. Mission Road" />
      <Field label="City / Town" value={data.addrCity} onChange={v => set('addrCity', v)} placeholder="e.g. NATIONWIDE" />
      <Field label="State" value={data.addrState} onChange={v => set('addrState', v)} placeholder="e.g. Nationwide" />
    </div>
  );


  if (slide.type === 'obs_none') return (
    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-8 text-center">
      <p className="text-4xl mb-4">🌱</p>
      <p className="text-primary font-semibold">This is your first delivery — no previous obstetric history to record.</p>
    </div>
  );

  if (slide.type === 'child_card') {
    const children = data.children || [];
    const child = children[slide.childIdx] || {};
    return <ChildCard idx={slide.childIdx} child={child} onChange={setChild} />;
  }

  if (slide.type === 'surgery_card') {
    if (typeof setSurgery !== 'function') {
      return (
        <p className="text-red-600 text-sm font-semibold">
          Unable to load surgery details. Please go back and try again.
        </p>
      );
    }
    const surgeries = data.surgeryDetails || [];
    const surgery = surgeries[slide.surgeryIdx] || {};
    return <SurgeryCard idx={slide.surgeryIdx} surgery={surgery} onChange={setSurgery} />;
  }

  if (slide.type === 'miscarriage_card') {
    if (typeof setMiscarriage !== 'function') {
      return (
        <p className="text-red-600 text-sm font-semibold">
          Unable to load miscarriage details. Please go back and try again.
        </p>
      );
    }
    const miscarriages = data.miscarriages || [];
    const miscarriage = miscarriages[slide.miscarriageIdx] || {};
    return <MiscarriageCard idx={slide.miscarriageIdx} miscarriage={miscarriage} onChange={setMiscarriage} />;
  }

  return null;
};

// ── Main component ────────────────────────────────────────────────────────────
const IntakeQuestionnaire = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const entryFrom = searchParams.get('from');
  const directStart = entryFrom === 'otp' || entryFrom === 'email';
  const entryRef = useRef(directStart ? entryFrom : null);
  const [view, setView] = useState(directStart ? 'section' : 'overview');
  const [secIdx, setSecIdx] = useState(0);
  const [slideIdx, setSlideIdx] = useState(entryFrom === 'otp' ? 1 : 0);
  const [data, setData] = useState(() => {
    if (!directStart) return INIT;
    const stored = getPatientData();
    if (stored?.age == null || stored.age === '') return INIT;
    return { ...INIT, age: stored.age, name: stored.name || INIT.name };
  });
  const [loading, setLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  /** @type {[{ can_edit?: boolean, is_locked?: boolean, days_remaining?: number|null, status?: string, first_submitted_at?: string|null }|null, Function]} */
  const [intakeMeta, setIntakeMeta] = useState(null);
  const [saveError, setSaveError] = useState('');

  // TEMPORARILY DISABLED: 7-day edit lock — patients can edit whenever.
  // Restore: const canEdit = intakeMeta?.can_edit !== false && !intakeMeta?.is_locked;
  const canEdit = true;

  useEffect(() => {
    if (!isPatientAuthenticated() || !getPatientId()) {
      navigate('/register?mode=login', { replace: true });
      return;
    }
    const patientId = getPatientId();
    Promise.all([
      getPatientMe().catch(() => ({ data: null })),
      getIntake(patientId).catch(() => ({ data: null }))
    ]).then(([profileRes, intakeRes]) => {
      const prof = profileRes?.data?.patient || profileRes?.data;
      const intk = intakeRes?.data?.domains;
      if (intakeRes?.data?.meta) setIntakeMeta(intakeRes.data.meta);
      else if (intakeRes?.data?.status) {
        setIntakeMeta({
          status: intakeRes.data.status,
          can_edit: true,
          is_locked: false,
        });
      }
      if (!prof && !intk) {
        setHydrated(true);
        return;
      }

      const map = {};
      Object.values(intk || {}).flat().forEach(r => {
        if (r && r.question_key) map[r.question_key] = r.answer;
      });

      const preg = prof?.pregnancies?.[0] || {};
      const addrParts = prof?.address ? prof.address.split(', ') : [];

      setData(prev => {
        const parityVal = preg.parity ?? prev.parity;
        const surgeryCountVal = map['surgery_count'] ?? prev.surgeryCount;

        const children = Array.from({ length: parseInt(parityVal) || 0 }, (_, i) => ({
          year: map[`child_${i}_year`] || '',
          gender: map[`child_${i}_gender`] || '',
          deliveryMode: map[`child_${i}_delivery_mode`] || '',
          birthWeight: map[`child_${i}_birth_weight`] || '',
          stateNow: map[`child_${i}_state_now`] === 'died_at_birth' ? 'stillbirth' : (map[`child_${i}_state_now`] || ''),
          events: map[`child_${i}_events`] ? String(map[`child_${i}_events`]).split(',').filter(Boolean) : [],
          eventsOther: map[`child_${i}_events_other`] || '',
          hasPostnatalComplication: map[`child_${i}_postnatal_issues`] && map[`child_${i}_postnatal_issues`] !== 'no' ? true : false,
          postnatalIssues: map[`child_${i}_postnatal_issues`] && map[`child_${i}_postnatal_issues`] !== 'no'
            ? String(map[`child_${i}_postnatal_issues`]).split(', ').filter(x => ['Excessive bleeding', 'Infection', 'High blood pressure', 'Depression / severe mood swings', 'Breast issues (mastitis)'].includes(x))
            : [],
          postnatalOther: map[`child_${i}_postnatal_issues`] && map[`child_${i}_postnatal_issues`] !== 'no'
            ? String(map[`child_${i}_postnatal_issues`]).split(', ').filter(x => !['Excessive bleeding', 'Infection', 'High blood pressure', 'Depression / severe mood swings', 'Breast issues (mastitis)'].includes(x)).join(', ')
            : ''
        }));

        const surgeryDetails = Array.from({ length: parseInt(surgeryCountVal) || 0 }, (_, i) => ({
          type: map[`surgery_${i}_type`] || '',
          year: map[`surgery_${i}_year`] || ''
        }));

        const miscarriageCountVal = map['miscarriage_count'] ?? prev.miscarriageCount;
        const miscarriages = Array.from({ length: parseInt(miscarriageCountVal) || 0 }, (_, i) => ({
          year: map[`miscarriage_${i}_year`] || '',
          gestationalAge: map[`miscarriage_${i}_gestational_age`] || ''
        }));

        const loadedConditions = loadMedicalConditions(map);

        return {
          ...prev,
          name: prof?.name || prev.name,
          age: prof?.age || prev.age,
          occupation: prof?.occupation || prev.occupation,
          education: (() => {
            const raw = prof?.education_level;
            if (!raw) return prev.education;
            const s = String(raw);
            // Normalise stored values back to chip labels
            const lower = s.toLowerCase();
            if (lower === 'primary') return 'Primary';
            if (lower === 'secondary') return 'Secondary';
            if (lower === 'none') return 'None';
            if (lower.includes('tertiary') || lower.includes('university') || lower.includes('polytechnic')) {
              return 'Tertiary (University, Polytechnic)';
            }
            return s;
          })(),
          marital: prof?.marital_status ? prof.marital_status.charAt(0).toUpperCase() + prof.marital_status.slice(1) : prev.marital,
          addrHouse: addrParts[0] || prev.addrHouse,
          addrStreet: addrParts[1] || prev.addrStreet,
          addrCity: addrParts[2] || prev.addrCity,
          addrState: addrParts[3] || prev.addrState,
          religion: prof?.religion ? prof.religion.charAt(0).toUpperCase() + prof.religion.slice(1) : prev.religion,
          christianDenom: prof?.denomination || map['denomination'] || prev.christianDenom,
          tribe: prof?.ethnicity || prev.tribe,
          lmpKnown: preg.lmp_date ? true : prev.lmpKnown,
          lmpDate: preg.lmp_date ? new Date(preg.lmp_date).toISOString().split('T')[0] : prev.lmpDate,
          gravidity: preg.gravidity ?? prev.gravidity,
          parity: parseInt(preg.gravidity ?? prev.gravidity, 10) === 1 ? '0' : parityVal,
          childrenAlive: map['children_alive'] != null && map['children_alive'] !== '' ? String(map['children_alive']) : prev.childrenAlive,
          bloodGroup: preg.blood_group || prev.bloodGroup,
          genotype: preg.genotype || prev.genotype,
          multiGestation: (() => {
            const yn = (v) => (v === true || v === 'true' || v === 'yes' ? true : v === false || v === 'false' || v === 'no' ? false : null);
            const hist = yn(map['multi_gestation_history']);
            if (hist !== null) return hist;
            // Legacy: older saves stored past multi-gestation as is_twin_pregnancy only
            if (!('multi_gestation_history' in map)) {
              const legacy = yn(map['is_twin_pregnancy']);
              if (legacy !== null) return legacy;
            }
            return prev.multiGestation;
          })(),
          multiGestationCount: map['multi_gestation_count'] != null && map['multi_gestation_count'] !== ''
            ? String(map['multi_gestation_count'])
            : prev.multiGestationCount,
          currentMultiGestation: (() => {
            if (!('is_twin_pregnancy' in map)) return prev.currentMultiGestation;
            const cur = loadTwinFlag(map['is_twin_pregnancy']);
            return cur !== null ? cur : prev.currentMultiGestation;
          })(),
          children,
          miscarriage: (() => {
            const direct = ynAnswer(map['miscarriage']);
            if (direct !== null) return direct;
            if (map['miscarriage_history'] === 'yes') return true;
            if (map['miscarriage_history'] === 'no') return false;
            return prev.miscarriage;
          })(),
          abortion: ynAnswer(map['abortion']) ?? prev.abortion,
          abortionCount: map['abortion_count'] != null && map['abortion_count'] !== '' ? String(map['abortion_count']) : prev.abortionCount,
          miscarriageHistory: map['miscarriage_history'] === 'yes' ? true : map['miscarriage_history'] === 'no' ? false : prev.miscarriageHistory,
          miscarriageCount: miscarriageCountVal,
          miscarriages,
          menarche: map['menarche_age'] || prev.menarche,
          cycleLength: map['cycle_days'] || prev.cycleLength,
          flowDays: map['flow_days'] || prev.flowDays,
          contraUsed: map['contraceptive'] === 'yes' ? true : map['contraceptive'] === 'no' ? false : prev.contraUsed,
          contraAware: map['contraceptive'] ? true : prev.contraAware,
          contraType: map['contraceptive_type'] || prev.contraType,
          contraStartDate: map['contraceptive_start_date'] || prev.contraStartDate,
          contraRemoved: map['contraceptive_removed_before_pregnancy'] === 'yes' ? true : map['contraceptive_removed_before_pregnancy'] === 'no' ? false : prev.contraRemoved,
          papSmearDone: map['pap_smear'] === 'yes' ? true : map['pap_smear'] === 'no' ? false : prev.papSmearDone,
          papSmearAware: map['pap_smear'] ? true : prev.papSmearAware,
          topDone: map['top'] === 'yes' ? true : map['top'] === 'no' ? false : prev.topDone,
          topCount: map['top_count'] || prev.topCount,
          topYear: map['top_year'] || prev.topYear,
          topMethod: map['top_method'] || prev.topMethod,
          topComplications: map['top_complications'] === 'yes' ? true : map['top_complications'] === 'no' ? false : prev.topComplications,
          // Index pregnancy (doctor clerking)
          desired: map['desired'] === 'yes' ? true : map['desired'] === 'no' ? false : prev.desired,
          conception: map['conception'] || prev.conception,
          pregTestDone: map['preg_test_done'] === 'yes' ? true : map['preg_test_done'] === 'no' ? false : prev.pregTestDone,
          pregTestType: map['preg_test_type'] || prev.pregTestType,
          scanDone: map['scan_done'] === 'yes' ? true : map['scan_done'] === 'no' ? false : prev.scanDone,
          scanDate: map['scan_date'] || prev.scanDate,
          conditions: loadedConditions.length > 0 ? loadedConditions : prev.conditions,
          surgeries: map['surgery'] === 'yes' ? true : map['surgery'] === 'no' ? false : prev.surgeries,
          surgeryCount: surgeryCountVal,
          surgeryDetails,
          pregMeds: map['pregnancy_medications'] != null ? String(map['pregnancy_medications']) : prev.pregMeds,
          routineMedsCheck: map['routine_medications'] === 'yes' ? true : map['routine_medications'] === 'no' ? false : prev.routineMedsCheck,
          currentMeds: map['other_medications'] || prev.currentMeds,
          drugAllergy: map['drug_allergy'] === 'yes' ? true : map['drug_allergy'] === 'no' ? false : prev.drugAllergy,
          allergyDetails: map['allergy_details'] || prev.allergyDetails,
          // Systems: prefer new grouped key 'systems_symptoms' if present, else fall back to legacy individual keys
          systemsSymptoms: (map['systems_symptoms'] ? String(map['systems_symptoms']).split(',').map(s => s.trim()).filter(Boolean) : (
            [
              { key: 'headaches', label: 'Headaches' },
              { key: 'seizures_/_convulsions', label: 'Seizures / convulsions' },
              { key: 'dizziness', label: 'Dizziness' },
              { key: 'fainting_episodes', label: 'Fainting episodes' },
              { key: 'chest_pain', label: 'Chest pain' },
              { key: 'cough', label: 'Cough' },
              { key: 'palpitations', label: 'Palpitations' },
              { key: 'difficulty_breathing', label: 'Difficulty breathing' }
            ].filter(x => map[x.key] === 'yes').map(x => x.label)
          )),
          systemsOther: map['systems_symptoms_other'] || prev.systemsOther,
          // Uro/gynae grouped symptoms
          uroGynaeSymptoms: (map['uro_gynae_symptoms'] ? String(map['uro_gynae_symptoms']).split(',').map(s => s.trim()).filter(Boolean) : (
            [
              { key: 'frequent_urination', label: 'Frequent urination' },
              { key: 'pain_on_urination', label: 'Pain on urination' },
              { key: 'urinating_blood', label: 'Urinating blood' },
              { key: 'vaginal_discharge', label: 'Unusual vaginal discharge' },
              { key: 'constipation', label: 'Constipation (hard stool)' },
              { key: 'frequent_stooling', label: 'Frequent stooling' }
            ].filter(x => map[x.key] === 'yes').map(x => x.label)
          )),
          uroGynaeOther: map['uro_gynae_symptoms_other'] || prev.uroGynaeOther,
          // legacy per-field keys removed — new grouped keys used: systems_symptoms, uro_gynae_symptoms
        };
      });
    }).finally(() => setHydrated(true));
  }, [navigate]);

  const set = (key, val) => {
    if (!canEdit) return;
    setData(prev => {
      const next = { ...prev, [key]: val };
      // Clear follow-ups when parent answer is No / cleared
      if (key === 'multiGestation' && val !== true) next.multiGestationCount = '';
      if (key === 'miscarriageHistory' && val !== true) {
        next.miscarriageCount = '';
        next.miscarriages = [];
      }
      if (key === 'miscarriage' && val !== true) {
        next.miscarriageCount = '';
        next.miscarriages = [];
      }
      if (key === 'abortion' && val !== true) next.abortionCount = '';
      if (key === 'surgeries' && val !== true) {
        next.surgeryCount = '';
        next.surgeryDetails = [];
      }
      if (key === 'routineMedsCheck' && val !== true) next.currentMeds = '';
      if (key === 'drugAllergy' && val !== true) next.allergyDetails = '';
      if (key === 'pregTestDone' && val !== true) next.pregTestType = null;
      if (key === 'scanDone' && val !== true) next.scanDate = '';
      // removed: hasPain/painDetails follow-up is no longer used
      if (key === 'topDone' && val !== true) {
        next.topCount = '';
        next.topYear = '';
        next.topMethod = null;
        next.topComplications = null;
      }
      if (key === 'gravidity' && parseInt(val, 10) === 1) {
        next.parity = '0';
        next.multiGestation = null;
        next.multiGestationCount = '';
        next.childrenAlive = '';
        next.children = [];
        next.miscarriage = null;
        next.miscarriageCount = '';
        next.miscarriages = [];
        next.abortion = null;
        next.abortionCount = '';
      }
      return next;
    });
  };

  const setChild = (idx, field, val) => {
    if (!canEdit) return;
    setData(prev => {
      const parity = parseInt(prev.parity) || 0;
      const children = Array.from({ length: parity }, (_, i) => prev.children?.[i] || {});
      children[idx] = { ...(children[idx] || {}), [field]: val };
      return { ...prev, children };
    });
  };

  const setMiscarriage = (idx, field, val) => {
    if (!canEdit) return;
    setData(prev => {
      const derivedCount = Math.max(0, (parseInt(prev.gravidity, 10) || 0) - (parseInt(prev.parity, 10) || 0) - 1);
      const count = Math.min(10, Math.max(0, derivedCount));
      const miscarriages = Array.from({ length: Math.max(count, idx + 1) }, (_, i) => prev.miscarriages?.[i] || {});
      miscarriages[idx] = { ...(miscarriages[idx] || {}), [field]: val };
      return { ...prev, miscarriages };
    });
  };

  const setSurgery = (idx, field, val) => {
    if (!canEdit) return;
    setData(prev => {
      const count = Math.min(20, Math.max(0, parseInt(prev.surgeryCount, 10) || 0));
      const surgeries = Array.from({ length: Math.max(count, idx + 1) }, (_, i) => prev.surgeryDetails?.[i] || {});
      surgeries[idx] = { ...(surgeries[idx] || {}), [field]: val };
      return { ...prev, surgeryDetails: surgeries };
    });
  };

  const gpParts = useMemo(() => computeGPParts(data), [data]);
  const gp = gpParts ? gpParts.compact : null;

  // Sync children / surgery array length when counts change
  const parity = Math.min(20, Math.max(0, parseInt(data.parity, 10) || 0));
  const ensuredChildren = Array.from({ length: parity }, (_, i) => data.children?.[i] || {});

  const surgeryCount = Math.min(20, Math.max(0, parseInt(data.surgeryCount, 10) || 0));
  const ensuredSurgeries = Array.from({ length: surgeryCount }, (_, i) => data.surgeryDetails?.[i] || {});

  const derivedMCount = data.miscarriage === true ? (parseInt(data.miscarriageCount, 10) || 0) : 0;
  const mCount = Math.min(10, Math.max(0, derivedMCount));
  const ensuredMiscarriages = Array.from({ length: mCount }, (_, i) => data.miscarriages?.[i] || {});

  const sections = useMemo(() => visibleSectionMeta(data), [data.gravidity]);

  const getSlides = (sId) => {
    const all = buildSlides(sId, { ...data, children: ensuredChildren, surgeryDetails: ensuredSurgeries, miscarriages: ensuredMiscarriages });
    return all.filter(s => !s.condition || s.condition(data));
  };

  const enterSection = (idx) => {
    setSecIdx(idx);
    setSlideIdx(0);
    setView('section');
  };

  const goNext = async () => {
    setNavLoading(true);
    try {
      // Recompute slides so newly added surgery/child cards are included after count is entered
      const list = getSlides(sections[secIdx]?.id);
      const idx = Math.min(slideIdx, Math.max(0, list.length - 1));
      if (list.length > 0 && idx < list.length - 1) {
        // Persist conditions as soon as the patient leaves that slide so "None of these"
        // is not lost if they don't finish the rest of Medical History in this session.
        const current = list[idx];
        if (current?.field === 'conditions' && (data.conditions || []).length > 0 && canEdit) {
          const patientId = getPatientId();
          const payload = buildMedicalConditionResponses(data.conditions);
          if (patientId && payload.length) {
            await saveIntake(patientId, 'medical', payload).catch(() => {});
          }
        }
        setSlideIdx(idx + 1);
        window.scrollTo(0, 0);
      } else {
        // Section complete — save, then open the next section automatically
        await autoSave(secIdx);
        const nextIdx = secIdx + 1;
        if (nextIdx < sections.length) {
          setSecIdx(nextIdx);
          setSlideIdx(0);
          setView('section');
        } else {
          setView('overview');
        }
        window.scrollTo(0, 0);
      }
    } finally {
      setNavLoading(false);
    }
  };

  const goBack = () => {
    if (navLoading) return;
    if (slideIdx > 0) {
      setSlideIdx(s => s - 1);
      window.scrollTo(0, 0);
      return;
    }
    if (secIdx > 0) {
      const prevIdx = secIdx - 1;
      const prevSlides = getSlides(sections[prevIdx].id);
      setSecIdx(prevIdx);
      setSlideIdx(Math.max(0, prevSlides.length - 1));
      setView('section');
      window.scrollTo(0, 0);
      return;
    }
    setView('overview');
    window.scrollTo(0, 0);
  };

  const autoSave = async (sIdx) => {
    const patientId = getPatientId();
    if (!patientId || !canEdit) return;
    const sId = sections[sIdx]?.id;
    if (!sId) return;
    setSaveError('');
    try {
      if (sId === 'biodata') {
        const ageNum = parseInt(String(data.age), 10);
        await upsertProfile({
          name: data.name || undefined,
          age: !isNaN(ageNum) && ageNum > 0 ? ageNum : undefined,
          occupation: data.occupation || undefined,
          education_level: data.education || undefined,
          marital_status: data.marital?.toLowerCase() || undefined,
          address: [data.addrHouse, data.addrStreet, data.addrCity, data.addrState].filter(Boolean).join(', ') || undefined,
          religion: data.religion?.toLowerCase() || undefined,
          ethnicity: data.tribe || undefined,
        }).catch(() => {});
        // Past twin/multiple history + current twin flag + denomination + children alive (biodata domain is allowed by API)
        const biodataResponses = [];
        if (data.religion === 'Christian' && data.christianDenom) {
          biodataResponses.push({ question_key: 'denomination', answer: String(data.christianDenom) });
        }
        if (data.childrenAlive !== '' && data.childrenAlive != null) {
          biodataResponses.push({ question_key: 'children_alive', answer: String(data.childrenAlive) });
        }
        if (data.multiGestation !== null && data.multiGestation !== undefined) {
          biodataResponses.push({ question_key: 'multi_gestation_history', answer: data.multiGestation === true });
        }
        if (data.multiGestation === true && data.multiGestationCount !== '' && data.multiGestationCount != null) {
          biodataResponses.push({ question_key: 'multi_gestation_count', answer: String(data.multiGestationCount) });
        }
        {
          const twinAns = serializeTwinPregnancy(data.currentMultiGestation);
          if (twinAns != null) {
            biodataResponses.push({ question_key: 'is_twin_pregnancy', answer: twinAns });
          }
        }
        if (data.miscarriage !== null && data.miscarriage !== undefined) {
          biodataResponses.push({ question_key: 'miscarriage', answer: data.miscarriage === true });
        }
        if (data.miscarriage === true && data.miscarriageCount !== '' && data.miscarriageCount != null) {
          biodataResponses.push({ question_key: 'miscarriage_count', answer: String(data.miscarriageCount) });
        }
        if (data.abortion !== null && data.abortion !== undefined) {
          biodataResponses.push({ question_key: 'abortion', answer: data.abortion === true });
        }
        if (data.abortion === true && data.abortionCount !== '' && data.abortionCount != null) {
          biodataResponses.push({ question_key: 'abortion_count', answer: String(data.abortionCount) });
        }
        if (biodataResponses.length) {
          await saveIntake(patientId, 'biodata', biodataResponses).catch(() => {});
        }
        // LMP / G / P are asked in biodata — persist them here so they survive a reload
        // before the index-pregnancy section is completed.
        const lmp = data.lmpKnown
          ? data.lmpDate
          : (data.lmpYear && data.lmpMonth ? `${data.lmpYear}-${String(data.lmpMonth).padStart(2, '0')}-01` : undefined);
        await addPregnancy({
          lmp_date: lmp ? new Date(lmp).toISOString() : undefined,
          gravidity: data.gravidity === '' || data.gravidity == null || isNaN(Number(data.gravidity)) ? undefined : Number(data.gravidity),
          parity: isPrimigravida(data)
            ? 0
            : (data.parity === '' || data.parity == null || isNaN(Number(data.parity)) ? undefined : Number(data.parity)),
        }).catch(() => {});
      }
      if (sId === 'index') {
        const lmp = data.lmpKnown ? data.lmpDate : (data.lmpYear && data.lmpMonth ? `${data.lmpYear}-${String(data.lmpMonth).padStart(2, '0')}-01` : undefined);
        // Persist "Not sure" so the chip reloads; risk engine treats unknown genotype as missing
        await addPregnancy({
          lmp_date: lmp ? new Date(lmp).toISOString() : undefined,
          blood_group: data.bloodGroup || undefined,
          genotype: data.genotype || undefined,
          gravidity: data.gravidity === '' || data.gravidity == null || isNaN(Number(data.gravidity)) ? undefined : Number(data.gravidity),
          parity: isPrimigravida(data)
            ? 0
            : (data.parity === '' || data.parity == null || isNaN(Number(data.parity)) ? undefined : Number(data.parity)),
        }).catch(() => {});
        // Index pregnancy clerking details for doctor view
        const indexResponses = buildDomainResponses('index', data, ensuredChildren, ensuredMiscarriages);
        if (indexResponses.length) {
          await saveIntake(patientId, 'index', indexResponses).catch(() => {});
        }
        // Keep twin flag on biodata domain for risk engine compatibility
        {
          const twinAns = serializeTwinPregnancy(data.currentMultiGestation);
          if (twinAns != null) {
            await saveIntake(patientId, 'biodata', [
              { question_key: 'is_twin_pregnancy', answer: twinAns },
            ]).catch(() => {});
          }
        }
      }
      const domainMap = {
        obstetric: 'obstetric',
        gynae: 'gynae',
        medical: 'medical',
        systems: 'systems',
      };
      if (domainMap[sId]) {
        const responses = buildDomainResponses(sId, data, ensuredChildren, ensuredMiscarriages);
        if (responses.length) await saveIntake(patientId, domainMap[sId], responses).catch(() => {});
      }
    } catch (_) {}
  };

  const handleSubmit = async () => {
    if (!canEdit) {
      setSaveError('This questionnaire is locked. The 7-day edit window has ended.');
      return;
    }
    setLoading(true);
    setSaveError('');
    const patientId = getPatientId();
    if (patientId) {
      try {
        // Save all sections in parallel (was sequential — major latency)
        await Promise.all(sections.map((_, i) => autoSave(i)));
        const { data: res } = await submitIntake(patientId);
        if (res?.meta) setIntakeMeta(res.meta);
        // Never persist risk on the patient device — the confirmation screen is generic.
        localStorage.removeItem('mc_risk_tier');
        localStorage.removeItem('mc_risk_reasons');
        localStorage.removeItem('mc_risk_engine');
        navigate('/risk-result');
      } catch (err) {
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Could not submit questionnaire. Please try again.';
        setSaveError(msg);
        setLoading(false);
        return;
      }
    } else {
      setLoading(false);
    }
  };

  const dataForComplete = { ...data, children: ensuredChildren, surgeryDetails: ensuredSurgeries, miscarriages: ensuredMiscarriages };
  const allDone = sections.every(s => sectionComplete(s.id, dataForComplete));

  // MUST stay above any early return — otherwise overview→section crashes (hooks order)
  useEffect(() => {
    if (view !== 'section') return;
    const list = getSlides(sections[secIdx]?.id);
    if (list.length > 0 && slideIdx >= list.length) {
      setSlideIdx(list.length - 1);
    }
  }, [view, secIdx, data.surgeryCount, data.surgeries, data.parity, data.gravidity, slideIdx]);

  // Direct entry after sign-up: age known from the date of birth → occupation; otherwise "How old are you?".
  useEffect(() => {
    const entry = entryRef.current;
    if (!hydrated || (entry !== 'otp' && entry !== 'email')) return;
    entryRef.current = null;

    const biodataIdx = Math.max(0, sections.findIndex((s) => s.id === 'biodata'));
    const slides = getSlides(sections[biodataIdx]?.id);
    const occupationIdx = slides.findIndex((s) => s.id === 'occupation');
    const ageFilled = isFilledValue(data.age) || isFilledValue(getPatientData()?.age);

    setSecIdx(biodataIdx);
    setView('section');
    if (ageFilled && occupationIdx >= 0) {
      setSlideIdx(occupationIdx);
    } else {
      setSlideIdx(0);
    }
    setSearchParams({}, { replace: true });
  }, [hydrated, setSearchParams]);

  // ── Overview page ──────────────────────────────────────────────────────────
  if (view === 'overview') {
    const hasProgress =
      hydrated &&
      sections.some(s => sectionComplete(s.id, dataForComplete));
    const status = intakeMeta?.status || (hasProgress ? 'in_progress' : 'not_started');

    return (
      <div className="min-h-screen bg-primary/5 font-body-md">
        <header className="bg-primary px-6 pt-10 pb-16">
          <div className="max-w-[640px] mx-auto">
            <button onClick={() => navigate('/dashboard')} className="mb-6 flex items-center gap-2 text-primary-fixed/80 text-sm">
              ← Dashboard
            </button>
            <h1 className="text-white text-3xl font-bold">Health Profile</h1>
            <p className="text-primary-fixed mt-1 text-sm">
              {status === 'in_progress'
                ? 'Welcome back — your answers were saved. Continue where you left off.'
                : status === 'submitted' && canEdit
                  ? 'You can still update your answers.'
                  : 'Fill in each section. When you finish one, the next opens automatically.'}
            </p>
            {gpParts && (
              <div className="mt-4 inline-flex flex-col items-start gap-0.5 bg-white/20 text-white rounded-2xl px-4 py-2 text-sm font-semibold leading-tight">
                <span className="text-base tracking-wide">{gpParts.chartLine1}</span>
                <span className="text-base tracking-wide">{gpParts.chartLine2}</span>
                {gpParts.alive != null && (
                  <span className="text-xs opacity-90">({gpParts.alive}A)</span>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="max-w-[640px] mx-auto px-4 -mt-8 pb-32">
          {/* Resume / edit-window banners */}
          {status === 'in_progress' && canEdit && (
            <div className="mb-4 bg-sky-50 border border-sky-200 rounded-2xl p-4">
              <p className="text-sky-800 font-bold text-sm">Progress saved</p>
              <p className="text-sky-700 text-xs mt-1">
                Your questionnaire is stored on your account. Log out and back in any time — you will see the same answers.
              </p>
            </div>
          )}
          {/* TEMPORARILY DISABLED: 7-day edit lock banners. Restore by removing `false &&` when the lock is re-enabled. */}
          {false && status === 'submitted' && canEdit && intakeMeta?.days_remaining != null && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-amber-800 font-bold text-sm">Edit window open</p>
              <p className="text-amber-700 text-xs mt-1">
                You can update this questionnaire for {intakeMeta.days_remaining} more day
                {intakeMeta.days_remaining === 1 ? '' : 's'} (7 days from first submission). After that it locks.
              </p>
            </div>
          )}
          {false && !canEdit && (
            <div className="mb-4 bg-stone-100 border border-stone-200 rounded-2xl p-4">
              <p className="text-stone-800 font-bold text-sm">Questionnaire locked</p>
              <p className="text-stone-600 text-xs mt-1">
                The 7-day edit window after your first submission has ended. You can still review your answers.
              </p>
            </div>
          )}
          {saveError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm font-semibold">
              {saveError}
            </div>
          )}

          {/* Section cards */}
          <div className="space-y-3">
            {sections.map((s, i) => {
              const dataForSection = { ...data, children: ensuredChildren, surgeryDetails: ensuredSurgeries, miscarriages: ensuredMiscarriages };
              const done = sectionComplete(s.id, dataForSection);
              const { answered, total } = sectionProgress(s.id, dataForSection);
              return (
                <button key={s.id} onClick={() => enterSection(i)}
                  className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm border border-primary/10 hover:border-primary/30 hover:shadow-md transition-all text-left active:scale-[0.99]">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0 ${done ? 'bg-emerald-100' : 'bg-primary/10'}`}>
                    <span className="material-symbols-outlined text-2xl">{s.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-800">{s.label}</p>
                      {!done && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">INCOMPLETE</span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs mt-0.5">{s.desc}</p>
                    {total > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${Math.min(100, (answered / total) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-400">{answered}/{total}</span>
                      </div>
                    )}
                  </div>
                  {done ? (
                    <span className="text-emerald-500 text-xl flex-shrink-0">✓</span>
                  ) : (
                    <span className="text-primary/50 text-xl flex-shrink-0">›</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Submit */}
          <div className="mt-6">
            {!canEdit ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full py-5 bg-primary text-white font-bold text-lg rounded-2xl shadow-lg"
              >
                Back to dashboard
              </button>
            ) : allDone ? (
              <button onClick={handleSubmit}
                className="w-full py-5 bg-primary text-white font-bold text-lg rounded-2xl shadow-lg hover:bg-primary active:scale-95 transition-all">
                {status === 'submitted' ? 'Update answers' : 'Submit questionnaire'}
              </button>
            ) : (
              <div className="text-center">
                <p className="text-slate-400 text-sm mb-3">Complete all sections to submit</p>
                <button onClick={handleSubmit}
                  className="w-full py-4 bg-primary/20 text-primary font-bold rounded-2xl transition-all hover:bg-primary/30">
                  Submit anyway (partial)
                </button>
              </div>
            )}
          </div>
        </main>

        {loading && <LoadingOverlay />}
      </div>
    );
  }

  // ── Carousel section view ──────────────────────────────────────────────────
  const sec = sections[secIdx];
  const slides = getSlides(sec?.id);
  // Clamp index when slide list grows/shrinks (e.g. after entering surgery count)
  const safeSlideIdx = slides.length === 0 ? 0 : Math.min(slideIdx, slides.length - 1);
  const slide = slides[safeSlideIdx];
  const progress = slides.length > 0 ? ((safeSlideIdx + 1) / slides.length) * 100 : 0;
  const isLast = slides.length === 0 || safeSlideIdx === slides.length - 1;
  const nextSec = isLast && secIdx < sections.length - 1 ? sections[secIdx + 1] : null;

  if (!sec) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-slate-600 text-center">Could not open this section.</p>
        <button
          type="button"
          onClick={() => setView('overview')}
          className="px-6 py-3 bg-primary text-white font-bold rounded-xl"
        >
          Back to health profile
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white font-body-md">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-primary/10">
        <div className="max-w-[640px] mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => { if (!navLoading) { setView('overview'); window.scrollTo(0, 0); } }}
            className="p-2 -ml-2 rounded-full hover:bg-primary/5 transition-colors"
            aria-label="Back to health profile"
          >
            <span className="text-primary font-bold text-lg">←</span>
          </button>
          <div className="flex-1">
            <p className="text-primary font-bold text-sm">{sec.label}</p>
            <p className="text-slate-400 text-xs">{slides.length ? `${safeSlideIdx + 1} of ${slides.length}` : '—'}</p>
          </div>
          <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>{sec.icon}</span>
        </div>
        <div className="h-1 bg-primary/10">
          <div className="h-full bg-primary/50 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </header>

      {/* Slide */}
      <main className="flex-1 flex flex-col px-6 py-10 max-w-[640px] mx-auto w-full">
        {slide?.question && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800 leading-snug">{slide.question}</h2>
            {slide.hint && <p className="text-slate-400 text-sm mt-2">{slide.hint}</p>}
          </div>
        )}
        {slide?.type === 'obs_none' && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800">Obstetric history</h2>
          </div>
        )}
        {slide?.type === 'child_card' && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800">Tell us about each of your previous delivery</h2>
          </div>
        )}
        {slide?.type === 'surgery_card' && (
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800">Tell us about each surgery</h2>
            <p className="text-slate-400 text-sm mt-2">What was done, and roughly which year.</p>
          </div>
        )}

        <SlideContent
          slide={slide}
          data={{ ...data, children: ensuredChildren, surgeryDetails: ensuredSurgeries, miscarriages: ensuredMiscarriages }}
          set={set}
          setChild={setChild}
          setMiscarriage={setMiscarriage}
          setSurgery={setSurgery}
        />
      </main>

      {/* Footer nav */}
      <footer className="sticky bottom-0 bg-white border-t border-primary/10 px-6 py-4">
        <div className="max-w-[640px] mx-auto flex gap-3">
          <button onClick={goBack}
            disabled={navLoading}
            className={`flex-1 py-4 font-bold text-primary border-2 border-primary/20 rounded-2xl hover:bg-primary/5 transition-all active:scale-95 ${navLoading ? 'opacity-60 cursor-not-allowed' : ''}`}>
            Back
          </button>
          <button onClick={goNext}
            disabled={navLoading}
            className={`flex-[2] py-4 font-bold text-white bg-primary rounded-2xl shadow-lg hover:bg-primary transition-all active:scale-95 flex items-center justify-center gap-2 ${navLoading ? 'opacity-80 cursor-wait' : ''}`}>
            {navLoading ? (
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full animate-spin ${isLast ? 'border-2 border-white border-t-transparent' : 'border-2 border-primary/20 border-t-primary'}`} />
                <span>{isLast ? `Saving ${sec.label}...` : 'Loading...'}</span>
              </div>
            ) : (
              <>
                {isLast
                  ? (nextSec ? `Continue to ${nextSec.label}` : `Finish ${sec.label}`)
                  : 'Next'}
                <span>→</span>
              </>
            )}
          </button>
        </div>
      </footer>

      {loading && <LoadingOverlay />}
    </div>
  );
};

// ── Domain response builder ───────────────────────────────────────────────────
function buildDomainResponses(sId, data, children, miscarriages) {
  switch (sId) {
    case 'index': return [
      { question_key: 'desired', answer: data.desired === true ? 'yes' : data.desired === false ? 'no' : '' },
      { question_key: 'conception', answer: data.conception || '' },
      { question_key: 'is_twin_pregnancy', answer: serializeTwinPregnancy(data.currentMultiGestation) || '' },
      { question_key: 'preg_test_done', answer: data.pregTestDone === true ? 'yes' : data.pregTestDone === false ? 'no' : '' },
      { question_key: 'preg_test_type', answer: data.pregTestType || '' },
      { question_key: 'scan_done', answer: data.scanDone === true ? 'yes' : data.scanDone === false ? 'no' : '' },
      { question_key: 'scan_date', answer: data.scanDate || '' },
      { question_key: 'blood_group', answer: data.bloodGroup || '' },
      { question_key: 'genotype', answer: data.genotype || '' },
    ].filter((r) => r.answer !== '' && r.answer != null);
    case 'obstetric': {
      const childResponses = (children || []).flatMap((c, i) => [
      { question_key: `child_${i}_year`,          answer: String(c.year || '') },
      { question_key: `child_${i}_gender`,         answer: c.gender || '' },
      { question_key: `child_${i}_delivery_mode`,  answer: c.deliveryMode || '' },
      { question_key: `child_${i}_birth_weight`,   answer: String(c.birthWeight || '') },
      { question_key: `child_${i}_state_now`,      answer: c.stateNow || '' },
      { question_key: `child_${i}_events`,         answer: (c.events || []).join(',') },
      { question_key: `child_${i}_events_other`,   answer: (c.events || []).includes('Other') ? (c.eventsOther || '') : '' },
      { question_key: `child_${i}_postnatal_issues`, answer: c.hasPostnatalComplication ? [...(c.postnatalIssues || []), c.postnatalOther].filter(Boolean).join(', ') : 'no' },
      ]);
      /* Miscarriage responses commented out for now per doctor instructions
      const miscarriageResponses = [
        { question_key: 'miscarriage_history', answer: data.miscarriageHistory === true ? 'yes' : data.miscarriageHistory === false ? 'no' : '' },
        { question_key: 'miscarriage_count', answer: String(data.miscarriageCount || '') }
      ];
      const mDetails = (miscarriages || []).flatMap((m, i) => [
        { question_key: `miscarriage_${i}_year`, answer: String(m.year || '') },
        { question_key: `miscarriage_${i}_gestational_age`, answer: m.gestationalAge || '' }
      ]);
      */
      const derivedMCount = data.miscarriage === true ? (parseInt(data.miscarriageCount, 10) || 0) : 0;
      const miscarriageResponses = derivedMCount > 0 ? [
        { question_key: 'miscarriage_history', answer: 'yes' },
        { question_key: 'miscarriage_count', answer: String(derivedMCount) },
      ] : [
        { question_key: 'miscarriage_history', answer: 'no' },
        { question_key: 'miscarriage_count', answer: '0' },
      ];
      const mDetails = (miscarriages || []).slice(0, derivedMCount).flatMap((m, i) => [
        { question_key: `miscarriage_${i}_year`, answer: String(m.year || '') },
        { question_key: `miscarriage_${i}_gestational_age`, answer: m.gestationalAge || '' }
      ]);
      return [...childResponses, ...miscarriageResponses, ...mDetails].filter(r => r.answer !== '' && r.answer != null);
    }
    case 'gynae': return [
      { question_key: 'menarche_age',    answer: data.menarche || '' },
      { question_key: 'cycle_days',      answer: data.cycleLength || '' },
      { question_key: 'flow_days',       answer: data.flowDays || '' },
      { question_key: 'contraceptive',   answer: data.contraUsed ? 'yes' : 'no' },
      { question_key: 'contraceptive_type', answer: data.contraType || '' },
      { question_key: 'contraceptive_start_date', answer: data.contraStartDate || '' },
      { question_key: 'contraceptive_removed_before_pregnancy', answer: data.contraRemoved === true ? 'yes' : data.contraRemoved === false ? 'no' : '' },
    ];
    case 'medical': return [
      ...buildMedicalConditionResponses(data.conditions),
      { question_key: 'surgery',          answer: data.surgeries ? 'yes' : 'no' },
      { question_key: 'surgery_count',    answer: String(data.surgeryCount || '') },
      ...(data.surgeryDetails || []).flatMap((s, i) => [
        { question_key: `surgery_${i}_type`, answer: s.type || '' },
        { question_key: `surgery_${i}_year`, answer: String(s.year || '') },
      ]),
      { question_key: 'pregnancy_medications', answer: data.pregMeds || '' },
      { question_key: 'routine_medications',   answer: data.routineMedsCheck ? 'yes' : 'no' },
      { question_key: 'other_medications',     answer: data.currentMeds || '' },
      { question_key: 'drug_allergy',     answer: data.drugAllergy ? 'yes' : 'no' },
      { question_key: 'allergy_details',  answer: data.allergyDetails || '' },
    ];
    case 'systems': return [
      // Persist merged systems symptoms. Send both a grouped key and individual per-symptom flags.
      ...(data.systemsSymptoms || []).filter(s => !isNoneChoice(s)).flatMap(s => {
        const slug = String(s).toLowerCase().replace(/\s*\/\s*/g, '_').replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        return [
          { question_key: slug, answer: 'yes' },
        ];
      }),
      { question_key: 'systems_symptoms', answer: (data.systemsSymptoms || []).join(', ') },
      ...(data.systemsOther ? [{ question_key: 'systems_symptoms_other', answer: data.systemsOther }] : []),
      // Uro/gynae grouped symptoms
      ...(data.uroGynaeSymptoms || []).filter(s => !isNoneChoice(s)).flatMap(s => {
        const slug = String(s).toLowerCase().replace(/\s*\/\s*/g, '_').replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        return [{ question_key: slug, answer: 'yes' }];
      }),
      { question_key: 'uro_gynae_symptoms', answer: (data.uroGynaeSymptoms || []).join(', ') },
      ...(data.uroGynaeOther ? [{ question_key: 'uro_gynae_symptoms_other', answer: data.uroGynaeOther }] : []),
    ];
    default: return [];
  }
}

// ── Loading overlay ───────────────────────────────────────────────────────────
const LoadingOverlay = () => (
  <div className="fixed inset-0 bg-primary/5/95 z-[100] flex flex-col items-center justify-center p-8">
    <div className="relative w-24 h-24 mb-8">
      <div className="absolute inset-0 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl text-primary">pregnant_woman</span>
      </div>
    </div>
    <h3 className="font-bold text-primary text-2xl">Loading…</h3>
    <p className="text-slate-500 text-center max-w-xs mt-3">Please wait a moment while we save your answers.</p>
    <div className="mt-8 flex gap-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  </div>
);

export default IntakeQuestionnaire;
