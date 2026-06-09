'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Edit2, Archive, RotateCcw, Printer, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { createMenuItem, updateMenuItem, setMenuItemActive } from '@/lib/actions/menu';
import { MENU_CATEGORIES, VEG_TYPES } from '@/lib/constants/menu';
import type { MenuItem, VegType } from '@/lib/types/menu';
import type { UserRole } from '@/lib/types/profile';

interface Props {
  initialItems: MenuItem[];
  currentUser: { id: string; name: string; role: UserRole };
}

type EditorState = { mode: 'add' | 'edit'; item: MenuItem | null };

export function MenuClient({ initialItems, currentUser }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const canManage = currentUser.role === 'Sales' || currentUser.role === 'Admin';

  const active = useMemo(() => initialItems.filter(i => i.isActive), [initialItems]);
  const archived = useMemo(() => initialItems.filter(i => !i.isActive), [initialItems]);

  // Known categories first, then any custom ones that exist on items.
  const categories = useMemo(() => {
    const present = Array.from(new Set(active.map(i => i.category)));
    const extra = present.filter(c => !(MENU_CATEGORIES as readonly string[]).includes(c));
    return [...MENU_CATEGORIES, ...extra];
  }, [active]);

  const handleArchive = (item: MenuItem, isActive: boolean) => {
    startTransition(async () => {
      const res = await setMenuItemActive(item.id, isActive);
      if (!res.success) { toast.error(res.error); return; }
      toast.success(isActive ? 'Item restored' : 'Item archived');
      router.refresh();
    });
  };

  const openMenu = (print: boolean) => {
    const win = window.open('/api/print/menu', '_blank', print ? '' : 'noopener,noreferrer');
    if (print) win?.addEventListener('load', () => setTimeout(() => win.print(), 300));
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <button onClick={() => router.push('/corporate')} className="text-xs text-stone-500 hover:text-emerald-800 flex items-center gap-1 mb-1">
            <ArrowLeft size={12} /> Back to Corporate
          </button>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Menu</h2>
          <p className="text-sm text-stone-500 italic">Standard food &amp; snacks menu shared with corporate clients</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openMenu(false)} className="bg-white border border-emerald-700 text-emerald-800 px-3 py-2 text-sm flex items-center gap-1.5 hover:bg-emerald-50 transition">
            <Eye size={14} /> VIEW
          </button>
          <button onClick={() => openMenu(true)} className="bg-white border border-stone-300 text-stone-600 px-3 py-2 text-sm flex items-center gap-1.5 hover:bg-stone-50 transition">
            <Printer size={14} /> PRINT / PDF
          </button>
          {canManage && (
            <button onClick={() => setEditor({ mode: 'add', item: null })} className="bg-emerald-900 hover:bg-emerald-800 text-amber-100 px-5 py-2 text-sm tracking-wider flex items-center gap-2 transition">
              <Plus size={16} /> ADD ITEM
            </button>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-5">
        {categories.map(cat => {
          const rows = active.filter(i => i.category === cat);
          if (rows.length === 0) return null;
          return (
            <div key={cat} className="bg-white border border-stone-200">
              <div className="bg-emerald-900 text-amber-100 px-4 py-2 text-xs uppercase tracking-widest">{cat}</div>
              <table className="w-full text-sm">
                <tbody>
                  {rows.map(i => {
                    const veg = VEG_TYPES.find(v => v.value === i.vegType);
                    return (
                      <tr key={i.id} className="border-t border-stone-100 hover:bg-stone-50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {i.vegType !== 'none' && <span className={`w-2.5 h-2.5 rounded-sm ${veg?.dot}`} title={veg?.label} />}
                            <span className="font-medium text-stone-800">{i.name}</span>
                          </div>
                          {i.description && <div className="text-xs text-stone-500 italic mt-0.5">{i.description}</div>}
                        </td>
                        <td className="p-3 text-right text-emerald-800 font-medium whitespace-nowrap w-28">
                          {i.price != null ? `₹${i.price.toLocaleString('en-IN')}` : '—'}
                        </td>
                        {canManage && (
                          <td className="p-3 text-right w-24">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => setEditor({ mode: 'edit', item: i })} className="p-1.5 hover:bg-stone-100 text-stone-600 rounded" title="Edit"><Edit2 size={13} /></button>
                              <button onClick={() => handleArchive(i, false)} disabled={isPending} className="p-1.5 hover:bg-amber-100 text-amber-700 rounded disabled:opacity-50" title="Archive (hide from menu)"><Archive size={13} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
        {active.length === 0 && (
          <div className="bg-white border border-stone-200 p-10 text-center text-stone-400 italic">
            No menu items yet. {canManage ? 'Click "Add Item" to start building the menu.' : ''}
          </div>
        )}
      </div>

      {/* Archived */}
      {canManage && archived.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowArchived(s => !s)} className="text-xs text-stone-500 hover:text-stone-700 uppercase tracking-wider">
            {showArchived ? '▼' : '▶'} Archived items ({archived.length})
          </button>
          {showArchived && (
            <div className="bg-stone-50 border border-stone-200 mt-2">
              {archived.map(i => (
                <div key={i.id} className="flex items-center justify-between px-4 py-2 border-t border-stone-100 first:border-t-0">
                  <span className="text-sm text-stone-500">
                    <span className="text-xs uppercase tracking-wider text-stone-400 mr-2">{i.category}</span>
                    {i.name}{i.price != null ? ` · ₹${i.price.toLocaleString('en-IN')}` : ''}
                  </span>
                  <button onClick={() => handleArchive(i, true)} disabled={isPending} className="text-xs flex items-center gap-1 text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded disabled:opacity-50">
                    <RotateCcw size={12} /> Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editor && (
        <MenuItemEditor
          state={editor}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function MenuItemEditor({ state, onClose, onSaved }: { state: EditorState; onClose: () => void; onSaved: () => void }) {
  const { mode, item } = state;
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    category: item?.category ?? MENU_CATEGORIES[0],
    name: item?.name ?? '',
    price: item?.price != null ? String(item.price) : '',
    vegType: (item?.vegType ?? 'veg') as VegType,
    description: item?.description ?? '',
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    if (!form.name.trim()) { toast.error('Item name is required'); return; }
    const priceStr = form.price.trim();
    const price = priceStr === '' ? null : Number(priceStr);
    if (price != null && (Number.isNaN(price) || price < 0)) { toast.error('Price must be a positive number'); return; }

    const payload = {
      category: form.category,
      name: form.name.trim(),
      price,
      vegType: form.vegType,
      description: form.description.trim(),
      sortOrder: item?.sortOrder ?? 0,
    };

    startTransition(async () => {
      const res = mode === 'edit' && item
        ? await updateMenuItem(item.id, payload)
        : await createMenuItem(payload);
      if (!res.success) { toast.error(res.error); return; }
      toast.success(mode === 'edit' ? 'Item updated' : 'Item added');
      onSaved();
    });
  };

  const field = 'w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white focus:border-emerald-700';
  const label = 'text-xs text-stone-600 uppercase tracking-wider block mb-1';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-stone-50 max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">
            {mode === 'edit' ? 'Edit Menu Item' : 'Add Menu Item'}
          </h2>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Section</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={field}>
                {MENU_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Veg / Non-veg</label>
              <select value={form.vegType} onChange={e => setForm(f => ({ ...f, vegType: e.target.value as VegType }))} className={field}>
                {VEG_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Item Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={field} autoFocus />
          </div>
          <div>
            <label className={label}>Price (₹) — optional</label>
            <input type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="Leave blank to hide price" className={field} />
          </div>
          <div>
            <label className={label}>Description — optional</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={field} />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-stone-300">
            <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 tracking-wider">CANCEL</button>
            <button onClick={handleSave} disabled={isPending} className="px-6 py-2.5 text-sm bg-emerald-900 hover:bg-emerald-800 text-amber-100 tracking-wider disabled:opacity-50">
              {isPending ? 'SAVING…' : mode === 'edit' ? 'UPDATE' : 'ADD'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
