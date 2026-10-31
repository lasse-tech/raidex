// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';
import { useMe } from '../lib/store.jsx';
import {
  datePlaceholder, formatDateField, formatTimeField,
  maskDate, maskTime, parseDate, parseTime, resolveLocale,
} from '../lib/locale.js';
import { t } from '../i18n/index.js';

// Date and time as plain text fields instead of <input type="datetime-local">.
// The native control renders in Chrome's UI language — neither `lang="de"` nor
// CSS reaches it — so a browser running in English shows 09/03/2026 to a user
// who wants 03.09.2026. These fields format from the stored locale instead.
//
// Value in and out is "YYYY-MM-DDTHH:mm" (local, same as the native control
// produced), so callers keep parsing it with new Date(value).

const pad = (n, w = 2) => String(n).padStart(w, '0');

const toIso = ({ y, m, d }, { h, min }) => `${pad(y, 4)}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}`;

// Local "YYYY-MM-DDTHH:mm" → Date, without letting the string go through the
// UTC-flavoured Date parser.
function fromIso(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function DateTimeField({ value, onChange }) {
  // Read through `me` rather than the module-level active locale, so switching
  // the format in the profile re-renders and re-masks this field.
  const { me } = useMe();
  const locale = resolveLocale(me?.user?.locale);
  const initial = fromIso(value);
  const [date, setDate] = useState(() => (initial ? formatDateField(initial, locale) : ''));
  const [time, setTime] = useState(() => (initial ? formatTimeField(initial) : ''));
  // `mine` is the last value this field emitted. Comparing against it is what
  // keeps a half-typed "3.9.20" from being rewritten to "03.09.0020" on every
  // keystroke, while still picking up a value set from outside.
  const mine = useRef(value);
  const lastLocale = useRef(locale);

  useEffect(() => {
    const localeChanged = lastLocale.current !== locale;
    lastLocale.current = locale;
    if (!localeChanged && value === mine.current) return;
    const d = fromIso(value);
    if (!d) return;
    setDate(formatDateField(d, locale));
    setTime(formatTimeField(d));
  }, [value, locale]);

  const push = (dateText, timeText) => {
    const d = parseDate(dateText, locale);
    const tm = parseTime(timeText);
    if (!d || !tm) return;                 // incomplete input keeps the last valid value
    const iso = toIso(d, tm);
    mine.current = iso;
    onChange(iso);
  };

  const onDate = (e) => {
    const next = maskDate(e.target.value, locale);
    setDate(next);
    push(next, time);
  };
  const onTime = (e) => {
    const next = maskTime(e.target.value);
    setTime(next);
    push(date, next);
  };

  const dateBad = date !== '' && !parseDate(date, locale);
  const timeBad = time !== '' && !parseTime(time);

  return (
    <div className="field-datetime">
      <input
        className={`input input-date${dateBad ? ' invalid' : ''}`}
        inputMode="numeric" autoComplete="off" spellCheck="false"
        maxLength={datePlaceholder(locale).length}
        placeholder={datePlaceholder(locale)}
        aria-label={t('common.date')} aria-invalid={dateBad || undefined}
        value={date} onChange={onDate}
      />
      <input
        className={`input input-time${timeBad ? ' invalid' : ''}`}
        inputMode="numeric" autoComplete="off" spellCheck="false"
        maxLength={5} placeholder={t('common.timePlaceholder')}
        aria-label={t('common.time')} aria-invalid={timeBad || undefined}
        value={time} onChange={onTime}
      />
    </div>
  );
}

// Time on its own, for the raid's end. 24-hour like the field above.
export function TimeField({ value, onChange, label = t('common.time') }) {
  const [time, setTime] = useState(() => maskTime(value));
  const mine = useRef(value);

  useEffect(() => {
    if (value === mine.current) return;
    setTime(maskTime(value));
  }, [value]);

  const onTime = (e) => {
    const next = maskTime(e.target.value);
    setTime(next);
    if (parseTime(next)) {
      mine.current = next;
      onChange(next);
    }
  };

  const bad = time !== '' && !parseTime(time);
  return (
    <input
      className={`input${bad ? ' invalid' : ''}`}
      inputMode="numeric" autoComplete="off" spellCheck="false"
      maxLength={5} placeholder={t('common.timePlaceholder')}
      aria-label={label} aria-invalid={bad || undefined}
      value={time} onChange={onTime}
    />
  );
}
