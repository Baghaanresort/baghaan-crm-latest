'use client';

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const unread = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) {
          setNotifications(data.map(n => ({
            id: n['id'] as string,
            type: n['type'] as string,
            title: n['title'] as string,
            body: n['body'] as string,
            link: n['link'] as string,
            read: n['read'] as boolean,
            createdAt: n['created_at'] as string,
          })));
        }
      });

    // Realtime: listen for new notifications
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as Record<string, unknown>;
          setNotifications(prev => [{
            id: n['id'] as string,
            type: n['type'] as string,
            title: n['title'] as string,
            body: n['body'] as string,
            link: n['link'] as string,
            read: n['read'] as boolean,
            createdAt: n['created_at'] as string,
          }, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const markAllRead = async () => {
    const supabase = createClient();
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 hover:bg-emerald-800 rounded transition text-stone-50"
        title="Notifications"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center px-0.5">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 bg-white border border-stone-200 shadow-xl w-80 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200 bg-stone-50">
              <span className="text-xs font-medium uppercase tracking-wider text-stone-600">Notifications</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-stone-400 hover:text-stone-600 underline">
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-stone-400 text-sm italic">No notifications</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`border-b border-stone-100 px-4 py-3 hover:bg-stone-50 ${!n.read ? 'bg-amber-50/40' : ''}`}
                >
                  {n.link ? (
                    <Link href={n.link} onClick={() => setOpen(false)} className="block">
                      <NotifContent n={n} />
                    </Link>
                  ) : (
                    <NotifContent n={n} />
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NotifContent({ n }: { n: { title: string; body: string; read: boolean; createdAt: string } }) {
  return (
    <>
      <div className={`text-sm ${!n.read ? 'font-medium' : ''}`}>{n.title}</div>
      {n.body && <div className="text-xs text-stone-500 mt-0.5">{n.body}</div>}
      <div className="text-xs text-stone-400 mt-1">
        {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </div>
    </>
  );
}
