import { FiClock } from 'react-icons/fi';
import { useNow } from '../../hooks/useNow';
import { DIET, duration, money, unitLabel } from '../../lib/format';
import { cx } from '../ui';

/** The Indian FSSAI-style veg / non-veg square mark. */
export function DietMark({ diet, withLabel = false, className }) {
  const d = DIET[diet] || DIET.veg;
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)} title={d.label}>
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border-2 bg-white" style={{ borderColor: d.color }}>
        {diet === 'non_veg' ? (
          <span
            className="h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent"
            style={{ borderBottomColor: d.color }}
          />
        ) : (
          <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
        )}
      </span>
      {withLabel && <span className="text-xs font-medium text-ink-300">{d.label}</span>}
    </span>
  );
}

export function PriceTag({ pricing, unit, size = 'md' }) {
  const big = size === 'lg';
  if (pricing.isFree) {
    return (
      <div className="flex items-baseline gap-2">
        <span className={cx('font-extrabold text-brand-300', big ? 'text-3xl' : 'text-lg')}>Free</span>
        {pricing.original > 0 && (
          <span className="text-xs text-ink-400">worth {money(pricing.original)}/{unitLabel(unit, 1)}</span>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className={cx('font-extrabold text-white', big ? 'text-3xl' : 'text-lg')}>{money(pricing.offer)}</span>
      <span className={cx('text-ink-500 line-through', big ? 'text-base' : 'text-xs')}>{money(pricing.original)}</span>
      <span className="text-xs text-ink-400">/ {unitLabel(unit, 1)}</span>
    </div>
  );
}

export const DiscountBadge = ({ pricing, className }) => (
  <span
    className={cx(
      'rounded-lg px-2 py-1 text-[11px] font-bold shadow-lg',
      pricing.isFree ? 'bg-brand-500 text-white' : 'bg-amber-300 text-ink-950',
      className,
    )}
  >
    {pricing.isFree ? 'FREE · NGOs' : `${pricing.discountPct}% OFF`}
  </span>
);

/** "Ends in 1h 20m" style countdown that turns amber / red as time runs out. */
export function Countdown({ to, prefix = 'Pickup ends in', endedLabel = 'Pickup window ended', className }) {
  const now = useNow(15000);
  const left = new Date(to).getTime() - now;
  const tone = left <= 0 ? 'text-ink-500' : left < 30 * 60000 ? 'text-rose-300' : left < 90 * 60000 ? 'text-amber-300' : 'text-ink-300';
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-medium', tone, className)}>
      <FiClock className="shrink-0" />
      {left <= 0 ? endedLabel : `${prefix} ${duration(left)}`}
    </span>
  );
}

export function QuantityLeft({ quantity }) {
  const pct = (quantity.available / quantity.total) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-ink-100">
          {quantity.available} {unitLabel(quantity.unit, quantity.available)} left
        </span>
        <span className="text-ink-500">of {quantity.total}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className={cx('h-full rounded-full', pct > 50 ? 'bg-brand-400' : pct > 20 ? 'bg-amber-300' : 'bg-rose-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
