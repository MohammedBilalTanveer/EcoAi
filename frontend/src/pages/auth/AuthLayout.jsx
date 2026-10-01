import { motion } from 'framer-motion';

const previews = [
  { icon: '🍱', title: '25 servings of Veg Pulao available', sub: 'Spice Garden · 1.2 km away · Free for NGOs' },
  { icon: '✅', title: 'Pickup confirmed — 30 meals rescued', sub: 'Annapurna Food Bank · just now' },
  { icon: '🚛', title: 'Truck KA-01-GT-2041 arriving', sub: 'Chickpet · in 6 min' },
  { icon: '🧹', title: 'Your dumping report was resolved', sub: 'Agara Lake, HSR Layout' },
];

function AuthAside() {
  return (
    <div className="relative hidden overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-500/15 via-ink-900 to-accent/15 p-10 lg:block">
      <div className="grid-bg absolute inset-0 opacity-60" />
      <div className="relative">
        <p className="eyebrow">One platform · three communities</p>
        <h2 className="mt-3 text-3xl leading-tight">
          Cleaner streets. <span className="text-gradient">Fuller plates.</span>
        </h2>
        <p className="mt-3 max-w-md text-ink-300">
          Citizens report dumping, restaurants share surplus food, and NGOs get alerted the moment food is available
          nearby.
        </p>
        <div className="mt-8 space-y-3">
          {previews.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.12 }}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-950/60 p-3.5 backdrop-blur"
              style={{ marginLeft: `${(i % 2) * 28}px` }}
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-xl">{p.icon}</span>
              <span>
                <span className="block text-sm font-semibold text-white">{p.title}</span>
                <span className="block text-xs text-ink-400">{p.sub}</span>
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="container-page grid min-h-[calc(100vh-4rem)] items-center gap-12 py-10 lg:grid-cols-2">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-md"
      >
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-ink-400">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </motion.div>
      <AuthAside />
    </div>
  );
}

export function OrDivider({ label = 'or' }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-ink-500">
      <span className="h-px flex-1 bg-white/10" />
      {label}
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
