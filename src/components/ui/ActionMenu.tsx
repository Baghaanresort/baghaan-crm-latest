'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger';
}

// A small "⋯ More" overflow menu for table rows. The panel is rendered into a
// document.body portal with fixed positioning so it is never clipped by the
// table's overflow-x-auto container. Closes on outside-click, scroll, or resize.
export function ActionMenu({ items, label = 'More actions' }: { items: ActionMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1.5 hover:bg-stone-100 rounded text-stone-600"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 50 }}
          className="min-w-[190px] bg-white border border-stone-200 shadow-lg py-1"
        >
          {items.map((it, i) => (
            <button
              key={i}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-stone-50 ${it.tone === 'danger' ? 'text-red-600' : 'text-stone-700'}`}
            >
              {it.icon && <span className="text-stone-400 flex-shrink-0">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
