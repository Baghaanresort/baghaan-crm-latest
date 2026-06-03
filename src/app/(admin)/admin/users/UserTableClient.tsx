'use client';

import { useState, useTransition } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deactivateUser, updateUserRole } from '@/lib/actions/admin';
import { ALL_ROLES, type UserRole } from '@/lib/types/profile';
import { ROLE_COLORS } from '@/lib/constants/roles';

interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
}

export function UserTableClient({ users }: { users: User[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('Sales');
  const [isPending, startTransition] = useTransition();

  const startEdit = (u: User) => {
    setEditingId(u.id);
    setEditRole(u.role);
  };

  const handleUpdateRole = (userId: string) => {
    startTransition(async () => {
      const result = await updateUserRole({ userId, role: editRole });
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Role updated');
      setEditingId(null);
    });
  };

  const handleDeactivate = (u: User) => {
    if (!confirm(`Deactivate ${u.name}? They will lose all access immediately.`)) return;
    startTransition(async () => {
      const result = await deactivateUser(u.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`${u.name} deactivated`);
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
            <th className="text-right p-4 text-xs uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-t border-stone-100 hover:bg-stone-50">
              <td className="p-4 font-medium">{u.name}</td>
              <td className="p-4 text-stone-500 text-xs">{u.email}</td>
              <td className="p-4">
                {editingId === u.id ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={editRole}
                      onChange={e => setEditRole(e.target.value as UserRole)}
                      className="px-2 py-1 border border-stone-300 text-sm bg-white outline-none"
                    >
                      {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                      onClick={() => handleUpdateRole(u.id)}
                      disabled={isPending}
                      className="text-xs bg-emerald-700 text-white px-3 py-1 hover:bg-emerald-800 disabled:opacity-50"
                    >
                      SAVE
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs border border-stone-300 px-2 py-1 hover:bg-stone-100"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span className={`text-xs px-2 py-0.5 text-white ${ROLE_COLORS[u.role] ?? 'bg-stone-500'}`}>
                    {u.role}
                  </span>
                )}
              </td>
              <td className="p-4 text-right">
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => startEdit(u)}
                    disabled={editingId !== null}
                    className="p-1.5 hover:bg-stone-100 text-stone-600 rounded disabled:opacity-30"
                    title="Edit role"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDeactivate(u)}
                    disabled={isPending}
                    className="p-1.5 hover:bg-red-100 text-red-600 rounded disabled:opacity-50"
                    title="Deactivate user"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr><td colSpan={4} className="p-10 text-center text-stone-400 italic">No users found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
