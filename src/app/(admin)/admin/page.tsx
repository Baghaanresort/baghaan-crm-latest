import { createClient } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/queries/dashboard';
import { getEffectiveStatus } from '@/lib/utils/booking';
import { fmtDate } from '@/lib/utils/date';

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const data = await getDashboardData();
  const { bookings, payments } = data;

  const today = data.today;
  const effStatus = (b: (typeof bookings)[0]) => getEffectiveStatus(b, payments);

  const totalBookings = bookings.length;
  const confirmedBookings = bookings.filter(b => effStatus(b) === 'confirmed').length;
  const holdBookings = bookings.filter(b => effStatus(b) === 'hold').length;
  const totalRevenue = bookings.filter(b => effStatus(b) !== 'hold').reduce((s, b) => s + b.totalAmount, 0);
  const totalPaid = payments.filter(p => p.verified).reduce((s, p) => s + p.amount, 0);
  const pendingVerification = payments.filter(p => !p.verified).length;

  const recentBookings = bookings.slice(0, 10);

  const { data: profilesData } = await supabase.from('profiles').select('name, role');
  const users = profilesData ?? [];

  return (
    <div>
      <h2 className="text-2xl text-stone-800 mb-6" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
        Admin Overview
      </h2>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          ['Total Bookings', totalBookings, ''],
          ['Confirmed', confirmedBookings, 'text-emerald-700'],
          ['On Hold', holdBookings, 'text-amber-700'],
          ['Total Revenue', `₹${(totalRevenue / 100000).toFixed(1)}L`, 'text-emerald-800'],
          ['Verified Paid', `₹${(totalPaid / 100000).toFixed(1)}L`, 'text-emerald-700'],
          ['Pending Verification', pendingVerification, pendingVerification > 0 ? 'text-purple-700' : ''],
          ['Staff Accounts', users.length, ''],
          ['Today', fmtDate(today), 'text-stone-600'],
        ].map(([label, val, color]) => (
          <div key={String(label)} className="bg-white border border-stone-200 p-4">
            <div className="text-xs text-stone-500 uppercase tracking-wider">{label}</div>
            <div className={`text-xl mt-1.5 font-semibold ${color}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{val}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent bookings */}
        <div className="bg-white border border-stone-200 p-5">
          <h3 className="text-sm uppercase tracking-wider text-stone-600 border-b border-stone-200 pb-2 mb-3">Recent Bookings</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-stone-500 uppercase"><th className="text-left pb-2">Guest</th><th className="text-left pb-2">Arrival</th><th className="text-right pb-2">Amount</th></tr></thead>
            <tbody>
              {recentBookings.map(b => (
                <tr key={b.id} className="border-t border-stone-100">
                  <td className="py-1.5 font-medium">{b.guestName}</td>
                  <td className="py-1.5 text-xs text-stone-500">{fmtDate(b.arrival)}</td>
                  <td className="py-1.5 text-right text-xs">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Staff overview */}
        <div className="bg-white border border-stone-200 p-5">
          <h3 className="text-sm uppercase tracking-wider text-stone-600 border-b border-stone-200 pb-2 mb-3">Staff Accounts</h3>
          <div className="space-y-2">
            {(users as Array<{ name: string; role: string }>).map(u => (
              <div key={u.name} className="flex items-center justify-between text-sm border-b border-stone-100 pb-1.5">
                <span>{u.name}</span>
                <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5">{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
