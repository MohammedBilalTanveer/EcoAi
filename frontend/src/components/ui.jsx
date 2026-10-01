/* eslint-disable react-refresh/only-export-components */
import { useEffect, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import { initials } from '../lib/format';

export const TONES = {
  emerald: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25',
  sky: 'bg-sky-400/10 text-sky-300 ring-sky-400/25',
  amber: 'bg-amber-400/10 text-amber-300 ring-amber-400/25',
  orange: 'bg-orange-400/10 text-orange-300 ring-orange-400/25',
  rose: 'bg-rose-400/10 text-rose-300 ring-rose-400/25',
  violet: 'bg-violet-400/10 text-violet-300 ring-violet-400/25',
  slate: 'bg-white/5 text-ink-300 ring-white/10',
};

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Badge({ tone = 'slate', className, children, dot = false }) {
  return (
    <span className={cx('badge', TONES[tone] || TONES.slate, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Renders a badge for a value using a {value: {label, tone}} map. */
export const StatusBadge = ({ map, value, dot = true }) => (
  <Badge tone={map[value]?.tone} dot={dot}>
    {map[value]?.label || value}
  </Badge>
);

export function Spinner({ className = 'h-5 w-5', label }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-ink-300">
      <span className={cx('animate-spin rounded-full border-2 border-current border-t-transparent opacity-80', className)} />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

export const PageLoader = ({ label = 'Loading…' }) => (
  <div className="grid min-h-[50vh] place-items-center">
    <Spinner className="h-7 w-7 text-brand-400" label={label} />
  </div>
);

export function PageHeader({ eyebrow, title, subtitle, actions, className }) {
  return (
    <div className={cx('mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cx('card flex flex-col items-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-400/10 text-2xl text-brand-300">
          <Icon />
        </div>
      )}
      <h3 className="text-lg">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm text-ink-400">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <FiAlertTriangle className="mb-3 text-3xl text-amber-300" />
      <p className="font-semibold text-white">Something went wrong</p>
      <p className="mt-1 text-sm text-ink-400">{error?.message || 'Please try again.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary mt-5" onClick={() => onRetry()}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Alert({ tone = 'rose', children, className }) {
  const tones = {
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    sky: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
  };
  return <div className={cx('rounded-xl border px-4 py-3 text-sm', tones[tone], className)}>{children}</div>;
}

/** Label + control + hint/error, wiring up ids for accessibility. */
export function Field({ label, hint, error, optional, children, className }) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-500">(optional)</span>}
        </label>
      )}
      {typeof children === 'function' ? children(id) : children}
      {error ? <p className="mt-1.5 text-xs text-rose-300">{error}</p> : hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/** Segmented control / pill group for a small set of options. */
export function Segmented({ options, value, onChange, className, size = 'md' }) {
  return (
    <div role="radiogroup" className={cx('flex flex-wrap gap-2', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cx('chip', active && 'chip-active', size === 'lg' && 'px-4 py-2 text-sm')}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto rounded-xl bg-white/[0.04] p-1 scrollbar-none', className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cx(
              'flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition',
              active ? 'bg-ink-700 text-white shadow' : 'text-ink-400 hover:text-white',
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className={cx('rounded-full px-1.5 text-[11px]', active ? 'bg-brand-400/20 text-brand-200' : 'bg-white/10')}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'emerald', className }) {
  const iconTone = {
    emerald: 'bg-emerald-400/10 text-emerald-300',
    violet: 'bg-violet-400/10 text-violet-300',
    sky: 'bg-sky-400/10 text-sky-300',
    amber: 'bg-amber-400/10 text-amber-300',
    rose: 'bg-rose-400/10 text-rose-300',
  }[tone];
  return (
    <div className={cx('card p-5', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-400">{label}</p>
        {Icon && (
          <span className={cx('grid h-9 w-9 place-items-center rounded-xl text-lg', iconTone)}>
            <Icon />
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
    </div>
  );
}

export function Avatar({ name, src, size = 'h-9 w-9', className }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className={cx(size, 'shrink-0 rounded-full object-cover ring-1 ring-white/10', className)}
      />
    );
  }
  return (
    <span
      className={cx(
        size,
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400/30 to-accent/30 text-xs font-bold text-white ring-1 ring-white/10',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function ProgressBar({ value, max = 100, color = 'bg-brand-400', className }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]', className)}>
      <div className={cx('h-full rounded-full transition-all duration-700', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx('card w-full bg-ink-900 p-6', size)}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-lg">{title}</h2>
              <button type="button" onClick={onClose} className="btn btn-ghost -mr-2 -mt-1 p-2" aria-label="Close">
                <FiX />
              </button>
            </div>
            {children}
            {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-ink-100">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-brand-400' : 'bg-white/15',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}
