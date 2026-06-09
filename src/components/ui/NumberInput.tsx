'use client';

import { useState } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (n: number) => void;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  emptyValue?: number | undefined; // value reported to the parent when the box is blank (default 0)
  placeholder?: string | undefined;
  className?: string | undefined;
}

// A controlled number input you can actually empty. A plain
// value={number} + onChange={Number(e.target.value)} input snaps '' back to 0,
// so you can't backspace the last digit and end up forced to type leading zeros.
// This keeps an internal text buffer: the box may be blank/partial while typing,
// and the parsed number (blank → emptyValue) is reported to the parent so the
// rest of the form logic keeps working with a real number.
export function NumberInput({ value, onChange, min, max, step, emptyValue = 0, placeholder = '0', className = '' }: NumberInputProps) {
  const [text, setText] = useState(value ? String(value) : '');

  const handle = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') { onChange(emptyValue); return; }
    const n = Number(raw);
    if (!Number.isNaN(n)) onChange(n);
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={e => handle(e.target.value)}
      className={className}
    />
  );
}
