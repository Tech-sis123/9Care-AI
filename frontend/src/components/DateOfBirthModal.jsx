import { useState } from 'react';
import { upsertProfile } from '../lib/api';
import DateOfBirthField from './DateOfBirthField';
import { dateOfBirthIso, DATE_OF_BIRTH_ERROR } from '../lib/dateOfBirth';

/** Asks older accounts that have no age for her date of birth (her age is worked out from it). */
const DateOfBirthModal = ({ onSaved, onLater }) => {
  const [dob, setDob] = useState({ day: '', month: '', year: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    const iso = dateOfBirthIso(dob.day, dob.month, dob.year);
    if (!iso) {
      setError(DATE_OF_BIRTH_ERROR);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await upsertProfile({ date_of_birth: iso });
      onSaved?.(data?.patient);
    } catch (err) {
      const d = err.response?.data;
      setError(d?.issues?.[0]?.message || d?.message || d?.error || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[85] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="dob-title">
      <form onSubmit={handleSave} noValidate className="bg-white w-full max-w-[440px] rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[100dvh] overflow-y-auto space-y-5">
        <div className="w-14 h-14 rounded-full bg-tertiary-fixed flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-primary text-3xl">cake</span>
        </div>
        <div className="text-center space-y-1">
          <h2 id="dob-title" className="font-headline-md text-xl text-primary">When were you born?</h2>
          <p className="text-sm text-on-surface-variant">
            Your age helps your doctors care for you and your baby. Please add your date of birth.
          </p>
        </div>

        <DateOfBirthField
          value={dob}
          onChange={(next) => {
            setDob(next);
            if (error) setError('');
          }}
          label="Date of birth"
          labelClassName="text-sm font-semibold text-on-surface"
          idPrefix="dob-modal"
        />

        {error && <p className="text-sm text-error text-center">{error}</p>}

        <div className="space-y-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-95 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onLater} className="w-full py-2 text-sm font-semibold text-on-surface-variant hover:text-primary">
            Remind me later
          </button>
        </div>
      </form>
    </div>
  );
};

export default DateOfBirthModal;
