'use client';

import { TrendingUp, Home, LogIn, LogOut, DollarSign, Wrench } from 'lucide-react';

interface KPIData {
  occupancyRate: number;
  occupiedRooms: number;
  totalRooms: number;
  todayCheckIns: number;
  todayCheckOuts: number;
  revenueImpact: number;
  maintenanceRooms: number;
}

interface Props {
  kpis: KPIData;
}

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
  bgColor: string;
}

function KPICard({ icon, label, value, sub, color, bgColor }: KPICardProps) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${bgColor}`}>
        <span className={color}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-stone-500 mb-0.5 font-medium">{label}</p>
        <p className="text-xl font-semibold text-stone-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function OccupancyKPIs({ kpis }: Props) {
  const {
    occupancyRate,
    occupiedRooms,
    totalRooms,
    todayCheckIns,
    todayCheckOuts,
    revenueImpact,
    maintenanceRooms,
  } = kpis;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
      <KPICard
        icon={<TrendingUp size={18} />}
        label="Occupancy Rate"
        value={`${occupancyRate}%`}
        sub={`${occupiedRooms} of ${totalRooms} rooms`}
        color="text-emerald-700"
        bgColor="bg-emerald-50"
      />
      <KPICard
        icon={<Home size={18} />}
        label="Occupied Rooms"
        value={`${occupiedRooms}/${totalRooms}`}
        sub="today"
        color="text-blue-700"
        bgColor="bg-blue-50"
      />
      <KPICard
        icon={<LogIn size={18} />}
        label="Today's Check-ins"
        value={String(todayCheckIns)}
        sub="arrivals"
        color="text-violet-700"
        bgColor="bg-violet-50"
      />
      <KPICard
        icon={<LogOut size={18} />}
        label="Today's Check-outs"
        value={String(todayCheckOuts)}
        sub="departures"
        color="text-orange-700"
        bgColor="bg-orange-50"
      />
      <KPICard
        icon={<DollarSign size={18} />}
        label="Revenue Impact"
        value={`₹${(revenueImpact / 100000).toFixed(1)}L`}
        sub="month total"
        color="text-amber-700"
        bgColor="bg-amber-50"
      />
      <KPICard
        icon={<Wrench size={18} />}
        label="Maintenance"
        value={String(maintenanceRooms)}
        sub="blocked rooms"
        color="text-red-700"
        bgColor="bg-red-50"
      />
    </div>
  );
}
