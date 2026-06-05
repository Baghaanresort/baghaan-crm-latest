'use client';

import { useState, useTransition } from 'react';
import { Edit2, Trash2, PauseCircle, PlayCircle, KeyRound, LogOut, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { deactivateUser, updateUserRole, suspendUser, resumeUser, sendPasswordReset, forceLogoutUser } from '@/lib/actions/admin';
import { ALL_ROLES, type UserRole } from '@/lib/types/profile';
import { ROLE_COLORS } from '@/lib/constants/roles';

interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  suspended: boolean;
  lastSignIn: string | null;
}

function fmtLastSeen(iso: string | null): string {
  if (!iso) return 'Never logged in';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 2) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function UserTableClient({ users }: { users: User[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('Sales');
  const [isPending, startTransition] = useTransition();

  const startEdit = (u: User) => { setEditingId(u.id); setEditRole(u.role); };

  const handleUpdateRole = (userId: string) => {
    startTransition(async () => {
      const result = await updateUserRole({ userId, role: editRole });
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Role updated successfully');
      setEditingId(null);
    });
  };

  const handleSuspend = (u: User) => {
    if (!confirm(`Suspend ${u.name}? They will not be able to log in until you resume their account.`)) return;
    startTransition(async () => {
      const result = await suspendUser(u.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`${u.name}'s account has been suspended`);
    });
  };

  const handleResume = (u: User) => {
    startTransition(async () => {
      const result = await resumeUser(u.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`${u.name}'s account has been resumed`);
    });
  };

  const handlePasswordReset = (u: User) => {
    if (!confirm(`Send a password reset email to ${u.name} (${u.email})?`)) return;
    startTransition(async () => {
      const result = await sendPasswordReset(u.email);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`Password reset email sent to ${u.email}`);
    });
  };

  const handleForceLogout = (u: User) => {
    if (!confirm(`Force logout ${u.name}? They will be signed out from all devices immediately.`)) return;
    startTransition(async () => {
      const result = await forceLogoutUser(u.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`${u.name} has been signed out from all devices`);
    });
  };

  const handleDeactivate = (u: User) => {
    if (!confirm(`Permanently delete ${u.name}'s account? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deactivateUser(u.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`${u.name}'s account has been deleted`);
    });
  };

  return (
    <div className="bg-white border border-stone-200">
      <table className="w-full text-sm">
        <thead className="bg-stone-800 text-stone-100">
          <tr>
            <th className="text-left p-4 text-xs uppercase tracking-wider">Name</th>
            <th className="text-left p-4 text-xs uppercase tracking-wider">Email</th>
            <th className="text-left p-4 text-xs uppercase tracking-wider">Role</th>
            <th className="text-left p-4 text-xs uppercase tracking-wider">Last Seen</th>
            <th className="text-left p-4 text-xs uppercase tracking-wider">Status</th>
            <th className="text-right p-4 text-xs uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className={`border-t border-stone-100 hover:bg-stone-50 ${u.suspended ? 'opacity-60' : ''}`}>
              <td className="p-4 font-medium">{u.name}</td>
              <td className="p-4 text-stone-500 text-xs">{u.email}</td>
              <td className="p-4">
                {editingId === u.id ? (
                  <div className="flex items-center gap-2">
                    <select value={editRole} onChange={e => setEditRole(e.target.value as UserRole)}
                      className="px-2 py-1 border border-stone-300 text-sm bg-white outline-none">
                      {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button onClick={() => handleUpdateRole(u.id)} disabled={isPending}
                      className="text-xs bg-emerald-700 text-white px-3 py-1 hover:bg-emerald-800 disabled:opacity-50">
                      SAVE
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="text-xs border border-stone-300 px-2 py-1 hover:bg-stone-100">✕</button>
                  </div>
                ) : (
                  <span className={`text-xs px-2 py-0.5 text-white ${ROLE_COLORS[u.role] ?? 'bg-stone-500'}`}>
                    {u.role}
                  </span>
                )}
              </td>
              <td className="p-4 text-xs text-stone-500">
                <div className="flex items-center gap-1">
                  <Clock size={11} className="text-stone-400" />
                  {fmtLastSeen(u.lastSignIn)}
                </div>
              </td>
              <td className="p-4">
                {u.suspended ? (
                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">Suspended</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">Active</span>
                )}
              </td>
              <td className="p-4 text-right">
                <div className="flex gap-1 justify-end flex-wrap">
                  <button onClick={() => startEdit(u)} disabled={editingId !== null || isPending}
                    className="p-1.5 hover:bg-stone-100 text-stone-600 rounded disabled:opacity-30" title="Change role">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handlePasswordReset(u)} disabled={isPending}
                    className="p-1.5 hover:bg-blue-100 text-blue-600 rounded disabled:opacity-50" title="Send password reset email">
                    <KeyRound size={14} />
                  </button>
                  <button onClick={() => handleForceLogout(u)} disabled={isPending}
                    className="p-1.5 hover:bg-amber-100 text-amber-600 rounded disabled:opacity-50" title="Force logout from all devices">
                    <LogOut size={14} />
                  </button>
                  {u.suspended ? (
                    <button onClick={() => handleResume(u)} disabled={isPending}
                      className="p-1.5 hover:bg-emerald-100 text-emerald-600 rounded disabled:opacity-50" title="Resume account">
                      <PlayCircle size={14} />
                    </button>
                  ) : (
                    <button onClick={() => handleSuspend(u)} disabled={isPending}
                      className="p-1.5 hover:bg-orange-100 text-orange-600 rounded disabled:opacity-50" title="Suspend account">
                      <PauseCircle size={14} />
                    </button>
                  )}
                  <button onClick={() => handleDeactivate(u)} disabled={isPending}
                    className="p-1.5 hover:bg-red-100 text-red-600 rounded disabled:opacity-50" title="Permanently delete account">
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr><td colSpan={6} className="p-10 text-center text-stone-400 italic">No users found</td></tr>
          )}
        </tbody>
      </table>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-stone-100 bg-stone-50 flex gap-4 flex-wrap text-xs text-stone-500">
        <span className="flex items-center gap-1"><Edit2 size={11} /> Change Role</span>
        <span className="flex items-center gap-1"><KeyRound size={11} /> Send Password Reset</span>
        <span className="flex items-center gap-1"><LogOut size={11} /> Force Logout All Devices</span>
        <span className="flex items-center gap-1"><PauseCircle size={11} /> Suspend (blocks login)</span>
        <span className="flex items-center gap-1"><PlayCircle size={11} /> Resume Account</span>
        <span className="flex items-center gap-1"><Trash2 size={11} /> Delete Permanently</span>
      </div>
    </div>
  );
}
