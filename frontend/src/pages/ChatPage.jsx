import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FiRefreshCw, FiSend, FiTrash2 } from 'react-icons/fi';
import { LeafMark } from '../components/layout/Logo';
import { Avatar, cx } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { api, storage } from '../lib/api';

const SUGGESTIONS = {
  common: [
    'How do I segregate waste at home?',
    'Easy ways to cut plastic use this week',
    'How can I start composting in an apartment?',
  ],
  citizen: ['How do I report illegal dumping on EcoAI?', 'Where can I dispose of old electronics?'],
  restaurant: ['Tips to reduce food waste in my restaurant kitchen', 'How does listing surplus food on EcoAI work?'],
  ngo: ['How should we store rescued cooked food safely?', 'How do pickup codes work on EcoAI?'],
  staff: ['How can we prevent repeat dumping at a hotspot?', 'Ideas for a neighbourhood clean-up drive'],
  admin: ['What should I check before approving a restaurant or NGO?', 'How can we get more restaurants to share surplus food?'],
};

const MAX_STORED = 60;

function Typing() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 animate-blink rounded-full bg-brand-300" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const { features } = useConfig();
  const storageKey = `ecoai_chat_${user.id}`;
  const [messages, setMessages] = useState(() => {
    try {
      return JSON.parse(storage.get(storageKey) || '[]');
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    storage.set(storageKey, JSON.stringify(messages.filter((m) => !m.error).slice(-MAX_STORED)));
  }, [messages, storageKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const send = async (text, base = messages) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const history = [...base.filter((m) => !m.error), { role: 'user', text: content }];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      const data = await api('/chat', {
        method: 'POST',
        body: { messages: history.slice(-16).map(({ role, text: t }) => ({ role, text: t })) },
      });
      setMessages((m) => [...m, { role: 'assistant', text: data.reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: err.message, error: true, retry: content }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const retry = (content) => {
    // Drop the failed user message and error bubble; send() re-adds the message.
    const base = messages.filter((m) => !m.error);
    if (base[base.length - 1]?.role === 'user') base.pop();
    send(content, base);
  };

  const suggestions = [...(SUGGESTIONS[user.role] || []), ...SUGGESTIONS.common].slice(0, 4);

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4">
      <div className="flex items-center justify-between border-b border-white/5 py-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <LeafMark className="h-10 w-10" />
            <span
              className={cx(
                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-950',
                features?.chat ? 'bg-brand-400' : 'bg-ink-500',
              )}
            />
          </div>
          <div>
            <h1 className="text-lg">GreenBot</h1>
            <p className="text-xs text-ink-400">
              {features?.chat ? 'Your sustainability advisor · AI-powered' : 'AI is currently unavailable'}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMessages([])}>
            <FiTrash2 /> Clear chat
          </button>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto py-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center pt-8 text-center">
            <LeafMark className="h-16 w-16" />
            <h2 className="mt-5 text-2xl">Hi {user.name.split(' ')[0]}, how can I help you go greener?</h2>
            <p className="mt-2 max-w-md text-sm text-ink-400">
              Ask about waste segregation, composting, reducing food waste, or how to use EcoAI.
            </p>
            <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="card card-hover p-4 text-left text-sm text-ink-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cx('flex gap-3', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && <LeafMark className="mt-1 h-8 w-8 shrink-0" />}
            <div
              className={cx(
                'max-w-[85%] rounded-2xl px-4 py-3 text-sm sm:max-w-[75%]',
                m.role === 'user'
                  ? 'rounded-br-md bg-brand-500 text-white'
                  : m.error
                    ? 'rounded-bl-md border border-rose-500/30 bg-rose-500/10 text-rose-200'
                    : 'rounded-bl-md border border-white/[0.07] bg-ink-900 text-ink-100',
              )}
            >
              {m.role === 'assistant' && !m.error ? (
                <div className="prose-chat">
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.text}</p>
              )}
              {m.error && m.retry && (
                <button type="button" className="mt-2 flex items-center gap-1 text-xs font-semibold underline" onClick={() => retry(m.retry)}>
                  <FiRefreshCw /> Try again
                </button>
              )}
            </div>
            {m.role === 'user' && <Avatar name={user.name} src={user.avatar} size="mt-1 h-8 w-8" />}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <LeafMark className="mt-1 h-8 w-8 shrink-0" />
            <div className="rounded-2xl rounded-bl-md border border-white/[0.07] bg-ink-900 px-4 py-2">
              <Typing />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-ink-900 p-2 focus-within:border-brand-400/50">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask GreenBot anything about sustainable living…"
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink-100 outline-none placeholder:text-ink-500"
            maxLength={2000}
          />
          <button type="submit" className="btn btn-primary h-10 w-10 p-0" disabled={loading || !input.trim()} aria-label="Send">
            <FiSend />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-500">
          GreenBot can make mistakes. For food safety, follow local health guidelines. Enter to send · Shift+Enter for a new line
        </p>
      </form>
    </div>
  );
}
