import Link from 'next/link';
import { getAdminUsers } from '@/lib/actions/admin';
import { ROLE_COLORS } from '@/lib/constants/roles';
import { UserTableClient } from './UserTableClient';

export default async function AdminUsersPage() {
  const result = await getAdminUsers();
  const users = result.success ? result.data : [];

  return (
    <div>
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-stone-800" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>User Management</h2>
          <p className="text-sm text-stone-500 italic">{users.length} staff accounts</p>
        </div>
        <Link href="/admin/users/new" className="bg-stone-900 hover:bg-stone-800 text-amber-100 px-5 py-2.5 text-sm tracking-wider transition">
          + INVITE USER
        </Link>
      </div>

      <UserTableClient users={users} />
    </div>
  );
}
