import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SERVER_WAKING_EVENT } from '../../lib/api';

/** Explains the pause when a sleeping free-tier server is starting up. */
export default function ServerWakeNotice() {
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    const onWaking = (e) => setWaking(Boolean(e.detail));
    window.addEventListener(SERVER_WAKING_EVENT, onWaking);
    return () => window.removeEventListener(SERVER_WAKING_EVENT, onWaking);
  }, []);

  return (
    <AnimatePresence>
      {waking && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed inset-x-3 bottom-4 z-[950] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-ink-900/95 px-4 py-3 text-sm shadow-[0_24px_60px_-20px_rgba(0,0,0,.8)] backdrop-blur-xl"
        >
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand-400/30 border-t-brand-400" />
          <span className="text-ink-200">
            <b className="text-white">Waking up the server…</b> It sleeps when nobody is using it, so the first load can take
            up to a minute.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
