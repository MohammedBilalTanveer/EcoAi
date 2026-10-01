import { useState } from 'react';
import { FiEye, FiEyeOff, FiLock } from 'react-icons/fi';
import { cx } from '../../components/ui';

export default function PasswordInput({ id, value, onChange, placeholder = 'Password', autoComplete, showStrength }) {
  const [visible, setVisible] = useState(false);
  const checks = [value.length >= 8, /\d/.test(value), /[^A-Za-z0-9]/.test(value) || /[A-Z]/.test(value)];
  const score = checks.filter(Boolean).length;
  const labels = ['Too short', 'Weak', 'Good', 'Strong'];
  const colors = ['bg-rose-400', 'bg-amber-400', 'bg-lime-400', 'bg-brand-400'];

  return (
    <div>
      <div className="relative">
        <FiLock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="input px-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          minLength={showStrength ? 8 : undefined}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:text-white"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <FiEyeOff /> : <FiEye />}
        </button>
      </div>
      {showStrength && value && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className={cx('h-1 flex-1 rounded-full', i < score ? colors[score] : 'bg-white/10')} />
            ))}
          </div>
          <span className="text-[11px] text-ink-400">{value.length < 8 ? labels[0] : labels[score]}</span>
        </div>
      )}
    </div>
  );
}
