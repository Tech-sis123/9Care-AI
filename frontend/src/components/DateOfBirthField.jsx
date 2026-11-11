import { useRef } from 'react';

/**
 * Day / Month / Year boxes that jump to the next box when one is full.
 * value: { day, month, year }; onChange receives the updated object.
 */
const DateOfBirthField = ({ value, onChange, label = 'DATE OF BIRTH', labelClassName = 'font-label-sm text-on-surface-variant', idPrefix = 'dob' }) => {
  const monthRef = useRef(null);
  const yearRef = useRef(null);
  const boxClass =
    'w-full px-3 py-3 text-center border border-outline-variant rounded-lg bg-white focus:ring-2 focus:ring-primary outline-none text-sm';
  const digits = (text, max) => text.replace(/\D/g, '').slice(0, max);
  const set = (part, text, max, nextRef) => {
    const val = digits(text, max);
    onChange({ ...value, [part]: val });
    if (nextRef && val.length === max) nextRef.current?.focus();
  };
  return (
    <div className="space-y-1">
      <label htmlFor={`${idPrefix}-day`} className={labelClassName}>
        {label}
      </label>
      <div className="grid grid-cols-3 gap-2">
        <input
          id={`${idPrefix}-day`}
          type="text"
          inputMode="numeric"
          placeholder="Day (DD)"
          aria-label="Day of birth"
          maxLength={2}
          value={value.day}
          onChange={(e) => set('day', e.target.value, 2, monthRef)}
          className={boxClass}
          required
        />
        <input
          ref={monthRef}
          type="text"
          inputMode="numeric"
          placeholder="Month (MM)"
          aria-label="Month of birth"
          maxLength={2}
          value={value.month}
          onChange={(e) => set('month', e.target.value, 2, yearRef)}
          className={boxClass}
          required
        />
        <input
          ref={yearRef}
          type="text"
          inputMode="numeric"
          placeholder="Year (YYYY)"
          aria-label="Year of birth"
          maxLength={4}
          value={value.year}
          onChange={(e) => set('year', e.target.value, 4)}
          className={boxClass}
          required
        />
      </div>
      <p className="text-[11px] text-stone-400">e.g. 15 / 08 / 1996</p>
    </div>
  );
};

export default DateOfBirthField;
