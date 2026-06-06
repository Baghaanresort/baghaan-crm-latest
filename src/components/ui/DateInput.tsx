'use client';

import { useRef } from 'react';
import { Calendar, X } from 'lucide-react';
import { fmtDate } from '@/lib/utils/date';

interface DateInputProps {
  value: string; // ISO YYYY-MM-DD, or '' when empty
  onChange: (iso: string) => void;
  min?: string | undefined;
  max?: string | undefined;
  readOnly?: boolean | undefined;
  clearable?: boolean | undefined;
  className?: string | undefined;
}

// A native <input type="date"> renders in the BROWSER's locale (commonly
// mm/dd/yyyy) and that text cannot be reformatted. This wrapper shows the value
// as dd/mm/yyyy in a styled box, with a real (transparent, overlaid) native date
// input kept underneath only to hold the value + min/max and to summon the OS
// calendar picker via showPicker(). The visible text is always dd/mm/yyyy.
export function DateInput({ value, onChange, min, max, readOnly, clearable, className = '' }: DateInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    if (readOnly) return;
    const el = ref.current;
    if (el && typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch { /* not allowed here → fall back */ }
    }
    el?.focus();
  };

  return (
    <div
      onClick={openPicker}
      className={`relative flex items-center justify-between gap-2 px-3 py-2 border border-stone-300 text-sm transition focus-within:border-emerald-700 ${readOnly ? 'bg-stone-100' : 'bg-white cursor-pointer'} ${className}`}
    >
      <span className={value ? 'text-stone-900' : 'text-stone-400'}>
        {value ? fmtDate(value) : 'dd/mm/yyyy'}
      </span>
      <span className="flex items-center gap-1 flex-shrink-0">
        {clearable && value && !readOnly && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(''); }}
            className="text-stone-400 hover:text-stone-700"
            aria-label="Clear date"
          >
            <X size={13} />
          </button>
        )}
        <Calendar size={14} className="text-stone-400" />
      </span>
      <input
        ref={ref}
        type="date"
        value={value}
        min={min}
        max={max}
        readOnly={readOnly}
        onChange={e => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
      />
    </div>
  );
}
