// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

// Styled dropdown (native <select> popups cannot be themed); used app-wide,
// matching the raid/dungeon picker.
export default function Dropdown({ value, onChange, options, disabled, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);
  const current = options.find((o) => o.value === value);
  return (
    <div className="dd" ref={ref}>
      <button type="button" className={'dd-trigger' + (value ? ' active' : '')} disabled={disabled}
        onClick={() => setOpen((o) => !o)}>
        <span className="dd-val" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, overflow: 'hidden' }}>
          {current?.icon}<span className="dd-label">{current?.label ?? placeholder ?? '—'}</span></span>
        <svg width="12" height="12" viewBox="0 0 24 24" className="dd-caret" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="dd-menu" role="listbox">
          {options.map((o) => (
            <button type="button" key={String(o.value)} role="option" aria-selected={o.value === value}
              className={'dd-item' + (o.value === value ? ' on' : '')}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{o.icon}{o.label}</span>
              {o.value === value && <span className="dd-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
