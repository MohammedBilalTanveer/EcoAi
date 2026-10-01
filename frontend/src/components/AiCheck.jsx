import { FiCheckCircle, FiHelpCircle, FiXCircle, FiZap } from 'react-icons/fi';
import { AI_DECISION, timeAgo } from '../lib/format';
import { Badge, cx, ProgressBar } from './ui';

const PROVIDER = { openai: 'OpenAI', gemini: 'Gemini', vision: 'Google Cloud Vision' };
const STAFF_LABEL = { passed: 'Accepted by staff', rejected: 'Rejected by staff' };
const ICON = { passed: FiCheckCircle, rejected: FiXCircle, review: FiHelpCircle };

/** "AI passed" / "AI rejected" / "Needs review", or the staff override. */
export function AiDecisionBadge({ screening, className }) {
  const decision = screening?.decision || 'review';
  const label = screening?.source === 'staff' ? STAFF_LABEL[decision] || AI_DECISION[decision].label : AI_DECISION[decision].label;
  return (
    <Badge tone={AI_DECISION[decision].tone} className={className}>
      {label}
    </Badge>
  );
}

/**
 * The photo check in full: decision, reason, confidence and what the AI saw.
 * `outcome` adds what happened as a result (e.g. "Sent to the city authority").
 */
export function AiCheckPanel({ ai, screening, outcome, title = 'AI photo check', children }) {
  const decision = screening?.decision || 'review';
  const Icon = ICON[decision];
  const pct = Math.round((ai?.confidence || 0) * 100);
  const tone = { passed: 'text-emerald-300', rejected: 'text-rose-300', review: 'text-amber-300' }[decision];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-white">
          <FiZap className="text-accent-300" /> {title}
        </p>
        <AiDecisionBadge screening={screening} />
      </div>

      <p className={cx('mt-3 flex items-start gap-2 text-sm', tone)}>
        <Icon className="mt-0.5 shrink-0" />
        <span>{screening?.reason || 'Not checked yet.'}</span>
      </p>
      {screening?.source === 'staff' && screening.note && (
        <p className="mt-1 pl-6 text-xs text-ink-400">Staff note: “{screening.note}”</p>
      )}
      {screening?.source === 'staff' && (
        <p className="mt-1 pl-6 text-[11px] text-ink-500">
          Reviewed {screening.reviewedAt ? timeAgo(screening.reviewedAt) : ''}
          {screening.reviewedBy?.name ? ` by ${screening.reviewedBy.name}` : ''}
          {ai?.analyzed ? ` · the AI originally said: ${ai.verified ? 'looks right' : 'does not match'}` : ''}
        </p>
      )}
      {outcome && <p className="mt-2 pl-6 text-xs text-ink-300">{outcome}</p>}

      {ai?.analyzed && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <ProgressBar value={pct} color={ai.verified ? 'bg-brand-400' : 'bg-rose-400'} />
            <span className="w-24 text-right text-xs text-ink-300">{pct}% confident</span>
          </div>
          {ai.summary && ai.summary !== screening?.reason && <p className="mt-3 text-sm text-ink-300">{ai.summary}</p>}
          {ai.labels?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ai.labels.map((l) => (
                <span key={l} className="chip cursor-default capitalize">
                  {l}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-ink-500">Checked by {PROVIDER[ai.provider] || 'AI'}</p>
        </>
      )}
      {children}
    </div>
  );
}
