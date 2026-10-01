import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiBell, FiCheck } from 'react-icons/fi';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { useClickOutside } from '../../hooks/useClickOutside';
import { cx, Spinner } from '../ui';

const TYPE_ICON = {
  food_nearby: '🍱',
  claim_new: '📦',
  claim_cancelled: '↩️',
  claim_picked_up: '✅',
  claim_expired: '⌛',
  claim_no_show: '⌛',
  listing_cancelled: '🚫',
  listing_removed: '🚫',
  listing_approved: '✅',
  report_status: '🧹',
  report_new: '🚨',
  report_review: '🔍',
  food_flagged: '⚠️',
  account_pending: '🆕',
  account_active: '✅',
  account_rejected: '🚫',
  account_suspended: '⛔',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const ref = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const refreshCount = useCallback(() => {
    api('/notifications/unread-count')
      .then((d) => setUnread(d.unread))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const id = setInterval(() => document.visibilityState === 'visible' && refreshCount(), 30000);
    return () => clearInterval(id);
  }, [refreshCount, location.pathname]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        const d = await api('/notifications');
        setItems(d.notifications);
        setUnread(d.unread);
      } catch {
        setItems([]);
      }
    }
  };

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      api(`/notifications/${n.id}/read`, { method: 'PATCH' })
        .then((d) => setUnread(d.unread))
        .catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST' }).catch(() => {});
    setUnread(0);
    setItems((list) => list?.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-lg text-ink-300 transition hover:bg-white/5 hover:text-white"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <FiBell />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="card fixed inset-x-3 top-16 z-50 overflow-hidden bg-ink-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <p className="font-semibold text-white">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={readAll} className="flex items-center gap-1 text-xs text-brand-300 hover:text-brand-200">
                  <FiCheck /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {items === null ? (
                <div className="grid place-items-center py-10">
                  <Spinner />
                </div>
              ) : items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-ink-400">You're all caught up.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openItem(n)}
                    className={cx(
                      'flex w-full gap-3 border-b border-white/5 px-4 py-3 text-left transition last:border-0 hover:bg-white/[0.03]',
                      !n.read && 'bg-brand-400/[0.04]',
                    )}
                  >
                    <span className="mt-0.5 text-lg">{TYPE_ICON[n.type] || '🔔'}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block text-sm', n.read ? 'text-ink-200' : 'font-semibold text-white')}>
                        {n.title}
                      </span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-ink-400">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-ink-500">{timeAgo(n.createdAt)}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
