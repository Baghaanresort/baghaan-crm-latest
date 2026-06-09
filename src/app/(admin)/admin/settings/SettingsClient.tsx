'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateCounter } from '@/lib/actions/admin';
import { createClient } from '@/lib/supabase/client';
import { ALL_ROOMS } from '@/lib/constants/rooms';
import { fmtDate, todayISO } from '@/lib/utils/date';
import { DateInput } from '@/components/ui/DateInput';
import { NumberInput } from '@/components/ui/NumberInput';

interface MaintenanceBlock {
  id: string;
  roomName: string;
  dateFrom: string;
  dateTo: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}

interface Props {
  bookingCounter: number;
  piCounter: number;
  enquiryCounter: number;
  maintenanceBlocks: MaintenanceBlock[];
}

export function SettingsClient({ bookingCounter, piCounter, enquiryCounter, maintenanceBlocks: initialBlocks }: Props) {
  const today = todayISO();
  const [isPending, startTransition] = useTransition();
  const [counters, setCounters] = useState({ booking_counter: bookingCounter, pi_counter: piCounter, enquiry_counter: enquiryCounter });
  const [blocks, setBlocks] = useState(initialBlocks);

  const [newBlock, setNewBlock] = useState({ roomName: ALL_ROOMS[0] ?? '', dateFrom: today, dateTo: today, reason: '' });
  const [addingBlock, setAddingBlock] = useState(false);

  const handleSaveCounter = (key: 'booking_counter' | 'pi_counter' | 'enquiry_counter') => {
    startTransition(async () => {
      const result = await updateCounter({ key, value: counters[key] });
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Counter updated');
    });
  };

  const handleAddBlock = async () => {
    if (!newBlock.roomName || !newBlock.dateFrom || !newBlock.dateTo) { toast.error('All fields required'); return; }
    const supabase = createClient();
    const { data: profile } = await supabase.from('profiles').select('name').single();
    const id = `MB-${Date.now()}`;
    const { error } = await supabase.from('maintenance_blocks').insert({
      id,
      room_name: newBlock.roomName,
      date_from: newBlock.dateFrom,
      date_to: newBlock.dateTo,
      reason: newBlock.reason,
      created_by: (profile?.['name'] as string) ?? 'Admin',
      created_at: new Date().toISOString(),
    });
    if (error) { toast.error('Failed to add maintenance block'); return; }
    setBlocks(prev => [...prev, { id, roomName: newBlock.roomName, dateFrom: newBlock.dateFrom, dateTo: newBlock.dateTo, reason: newBlock.reason, createdBy: 'Admin', createdAt: new Date().toISOString() }]);
    setAddingBlock(false);
    setNewBlock({ roomName: ALL_ROOMS[0] ?? '', dateFrom: today, dateTo: today, reason: '' });
    toast.success('Maintenance block added');
  };

  const handleDeleteBlock = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('maintenance_blocks').delete().eq('id', id);
    if (error) { toast.error('Failed to delete'); return; }
    setBlocks(prev => prev.filter(b => b.id !== id));
    toast.success('Block removed');
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl text-stone-800" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Settings</h2>

      {/* Counters */}
      <div className="bg-white border border-stone-200 p-6">
        <h3 className="text-sm uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-4">Reference Number Counters</h3>
        <p className="text-xs text-stone-500 italic mb-4">Use these to correct counter values if needed (e.g. after data migration). Next booking will use counter + 1.</p>
        <div className="grid grid-cols-3 gap-6">
          {([
            ['booking_counter', 'Booking Counter', 'BOR/HO/YY/NNN'],
            ['pi_counter', 'Proforma Invoice Counter', 'BOR/NNNN'],
            ['enquiry_counter', 'Enquiry Counter', 'ENQ-NNNN'],
          ] as const).map(([key, label, format]) => (
            <div key={key}>
              <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">{label}</label>
              <p className="text-xs text-stone-400 italic mb-2">Format: {format}</p>
              <div className="flex gap-2">
                <NumberInput
                  value={counters[key] ?? 0}
                  min={0}
                  onChange={n => setCounters(c => ({ ...c, [key]: Math.floor(n) }))}
                  className="flex-1 px-3 py-2 border border-stone-300 text-sm outline-none bg-white"
                />
                <button
                  onClick={() => handleSaveCounter(key)}
                  disabled={isPending}
                  className="text-xs bg-stone-700 hover:bg-stone-800 text-white px-3 py-2 disabled:opacity-50"
                >
                  SAVE
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resort info */}
      <div className="bg-white border border-stone-200 p-6">
        <h3 className="text-sm uppercase tracking-wider text-stone-700 border-b border-stone-200 pb-2 mb-4">Property Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm text-stone-600">
          <div><span className="font-medium">Name:</span> Baghaan Orchard Retreat</div>
          <div><span className="font-medium">GST:</span> 09AADCM6620L1Z8</div>
          <div><span className="font-medium">Address:</span> Village - Kachrot, Garhmukteshwar, UP</div>
          <div><span className="font-medium">Corp Office:</span> A-20, Sector-35, Noida - 201301</div>
          <div><span className="font-medium">Phones:</span> 07599053402, 09410083460</div>
          <div><span className="font-medium">Total Rooms:</span> 54 (16 KK + 29 OC + 7 POC + 2 Kothi)</div>
        </div>
        <p className="text-xs text-stone-400 italic mt-3">Property info is compiled into print templates. Edit in billing.ts to change.</p>
      </div>

      {/* Maintenance blocks */}
      <div className="bg-white border border-stone-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm uppercase tracking-wider text-stone-700">Room Maintenance Blocks</h3>
            <p className="text-xs text-stone-500 italic mt-1">Blocked rooms appear greyed-out in BookingModal and Calendar</p>
          </div>
          <button onClick={() => setAddingBlock(true)} className="flex items-center gap-1.5 text-xs bg-stone-700 hover:bg-stone-800 text-white px-3 py-2">
            <Plus size={12} /> ADD BLOCK
          </button>
        </div>

        {addingBlock && (
          <div className="bg-stone-50 border border-stone-200 p-4 mb-4 grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-stone-600 block mb-1">Room</label>
              <select value={newBlock.roomName} onChange={e => setNewBlock(f => ({ ...f, roomName: e.target.value }))} className="w-full px-2 py-1.5 border border-stone-300 text-sm bg-white">
                {ALL_ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-600 block mb-1">From</label>
              <DateInput value={newBlock.dateFrom} onChange={v => setNewBlock(f => ({ ...f, dateFrom: v }))} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-stone-600 block mb-1">To</label>
              <DateInput value={newBlock.dateTo} onChange={v => setNewBlock(f => ({ ...f, dateTo: v }))} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-stone-600 block mb-1">Reason</label>
              <input value={newBlock.reason} onChange={e => setNewBlock(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Renovation" className="w-full px-2 py-1.5 border border-stone-300 text-sm bg-white" />
            </div>
            <div className="col-span-4 flex gap-2">
              <button onClick={handleAddBlock} className="text-xs bg-emerald-700 text-white px-4 py-1.5 hover:bg-emerald-800">ADD</button>
              <button onClick={() => setAddingBlock(false)} className="text-xs border border-stone-300 px-3 py-1.5 hover:bg-stone-100">Cancel</button>
            </div>
          </div>
        )}

        {blocks.length === 0 ? (
          <div className="text-sm text-stone-400 italic py-4 text-center">No maintenance blocks</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-stone-100">
              <tr>
                <th className="text-left p-2 text-xs uppercase tracking-wider text-stone-600">Room</th>
                <th className="text-left p-2 text-xs uppercase tracking-wider text-stone-600">From</th>
                <th className="text-left p-2 text-xs uppercase tracking-wider text-stone-600">To</th>
                <th className="text-left p-2 text-xs uppercase tracking-wider text-stone-600">Reason</th>
                <th className="text-right p-2 text-xs uppercase tracking-wider text-stone-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map(b => (
                <tr key={b.id} className="border-t border-stone-100">
                  <td className="p-2 font-medium text-xs">{b.roomName}</td>
                  <td className="p-2 text-xs">{fmtDate(b.dateFrom)}</td>
                  <td className="p-2 text-xs">{fmtDate(b.dateTo)}</td>
                  <td className="p-2 text-xs text-stone-500">{b.reason || '—'}</td>
                  <td className="p-2 text-right">
                    <button onClick={() => handleDeleteBlock(b.id)} className="p-1 hover:bg-red-100 text-red-600 rounded"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
