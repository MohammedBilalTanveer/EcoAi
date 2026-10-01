import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiAlertTriangle,
  FiArrowRight,
  FiBell,
  FiCamera,
  FiCheckCircle,
  FiMessageCircle,
  FiShoppingBag,
  FiTruck,
  FiUsers,
  FiZap,
} from 'react-icons/fi';
import Contact from '../components/home/Contact';
import Reviews from '../components/home/Reviews';
import WorkCarousel from '../components/home/WorkCarousel';
import { Countdown, DietMark } from '../components/food/FoodBits';
import { cx } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { compact, money } from '../lib/format';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5 },
};

function heroActions(user) {
  if (!user) {
    return [
      { to: '/signup', label: 'Get started free', primary: true },
      { to: '/food', label: 'Browse surplus food' },
    ];
  }
  return (
    {
      restaurant: [
        { to: '/food/new', label: 'Share surplus food', primary: true },
        { to: '/food/dashboard', label: 'My listings' },
      ],
      ngo: [
        { to: '/food', label: 'Find food nearby', primary: true },
        { to: '/food/dashboard', label: 'My pickups' },
      ],
      staff: [
        { to: '/staff/dashboard', label: 'Open staff portal', primary: true },
        { to: '/live-map', label: 'Live trucks' },
      ],
    }[user.role] || [
      { to: '/report-waste', label: 'Report dumping', primary: true },
      { to: '/food', label: 'Find discounted food' },
    ]
  );
}

/** Hero panel with real, current data: food you can reserve now plus live city numbers. */
function LiveNow() {
  const { data: food } = useApi('/food', { query: { sort: 'ending', limit: 3 }, pollMs: 60000 });
  const { data: stats } = useApi('/stats/public');
  const listings = food?.listings ?? [];
  const numbers = [
    { icon: FiTruck, label: 'Trucks on duty', value: stats?.trucks.active },
    { icon: FiShoppingBag, label: 'Food listings live', value: stats?.food.availableNow },
    { icon: FiUsers, label: 'NGOs ready', value: stats?.community.ngos },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      className="relative mx-auto w-full max-w-md"
    >
      <div aria-hidden="true" className="absolute -inset-8 rounded-[2.5rem] bg-gradient-to-br from-brand-500/25 via-accent/10 to-transparent blur-3xl" />
      <div className="card relative overflow-hidden bg-ink-900/90">
        <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <p className="font-semibold text-white">Live on EcoAI</p>
            <p className="text-xs text-ink-400">Surplus food you can reserve right now</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-1 text-[11px] font-semibold text-brand-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" /> Live
          </span>
        </div>

        <div className="divide-y divide-white/5">
          {!food ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="skeleton h-12 w-12 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-2/3" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </div>
            ))
          ) : listings.length ? (
            listings.map((l) => (
              <Link key={l.id} to={`/food/${l.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/[0.03]">
                <img src={l.images[0]} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    <DietMark diet={l.dietType} />
                    <span className="truncate">{l.title}</span>
                  </p>
                  <p className="truncate text-xs text-ink-400">{l.donor?.organization || l.donor?.name}</p>
                  <Countdown to={l.pickup.end} prefix="Ends in" className="mt-0.5 !text-[11px]" />
                </div>
                <div className="shrink-0 text-right">
                  <p className={cx('text-sm font-bold', l.pricing.isFree ? 'text-brand-300' : 'text-white')}>
                    {l.pricing.isFree ? 'Free' : money(l.pricing.offer)}
                  </p>
                  <p className="text-[11px] text-ink-500">
                    {l.pricing.isFree ? 'for NGOs' : <span className="text-amber-300">{l.pricing.discountPct}% off</span>}
                  </p>
                </div>
              </Link>
            ))
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-semibold text-white">No surplus food listed right now</p>
              <p className="mt-1 text-xs text-ink-400">Restaurants usually post after lunch and dinner service.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 bg-white/[0.02]">
          {numbers.map(({ icon: Icon, label, value }) => (
            <div key={label} className="px-3 py-4 text-center">
              <Icon className="mx-auto text-brand-300" aria-hidden="true" />
              <p className="mt-1.5 text-xl font-bold text-white">{value ?? '—'}</p>
              <p className="text-[11px] leading-tight text-ink-400">{label}</p>
            </div>
          ))}
        </div>

        <Link to="/food" className="flex items-center justify-center gap-1.5 border-t border-white/5 px-5 py-3 text-sm font-semibold text-brand-300 transition hover:bg-white/[0.03] hover:text-brand-200">
          Browse all surplus food <FiArrowRight />
        </Link>
      </div>
    </motion.div>
  );
}

function ImpactBand() {
  const { data } = useApi('/stats/public');
  const stats = [
    { label: 'Meals rescued', value: data ? compact(data.food.meals) : '—' },
    { label: 'kg CO₂ avoided', value: data ? compact(data.food.co2Kg) : '—' },
    { label: 'Dumping reports resolved', value: data ? compact(data.reports.resolved) : '—' },
    { label: 'NGOs & restaurants', value: data ? compact(data.community.ngos + data.community.restaurants) : '—' },
  ];
  return (
    <section className="container-page">
      <div className="card grid grid-cols-2 gap-y-6 px-6 py-8 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center lg:border-r lg:border-white/5 lg:last:border-0">
            <p className="text-3xl font-extrabold text-white sm:text-4xl">{s.value}</p>
            <p className="mt-1 text-xs text-ink-400 sm:text-sm">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: FiAlertTriangle,
    title: 'Report illegal dumping',
    text: 'Snap a photo — GPS from the photo pins the spot, AI verifies the garbage and high-confidence reports go straight to the city authority.',
    points: ['AI photo verification', 'Status updates as it’s cleaned', 'Community hotspot map'],
    to: '/report-waste',
    tone: 'from-rose-500/20',
  },
  {
    icon: FiShoppingBag,
    title: 'Food rescue marketplace',
    text: 'Restaurants list surplus food free for NGOs or at 20–90% off. Nearby NGOs are alerted instantly and collect with a pickup code.',
    points: ['AI fills in the listing', 'Food-safety windows enforced', 'Impact: meals, kg & CO₂'],
    to: '/food',
    tone: 'from-amber-500/20',
  },
  {
    icon: FiTruck,
    title: 'Live garbage trucks',
    text: 'Follow every truck on real road routes with its fill level, next stops and when it reaches the collection point nearest you.',
    points: ['Updates every 3 seconds', 'ETA to your nearest stop', 'Route & load details'],
    to: '/live-map',
    tone: 'from-sky-500/20',
  },
  {
    icon: FiMessageCircle,
    title: 'GreenBot advisor',
    text: 'Ask anything about segregation, composting, reducing food waste or using EcoAI — answers tailored to your role.',
    points: ['Multi-turn conversations', 'Practical, local tips', 'Powered by OpenAI'],
    to: '/chatbot',
    tone: 'from-violet-500/20',
  },
];

const STEPS = [
  { icon: FiCamera, title: 'Restaurant snaps the surplus', text: 'AI recognises the dish, estimates quantity and suggests a fair price.' },
  { icon: FiZap, title: 'Priced & safety-checked', text: 'Free for NGOs or at least 20% off, with a pickup window inside the safe-to-eat time.' },
  { icon: FiBell, title: 'Nearby NGOs are alerted', text: 'Every NGO whose alert radius covers the restaurant gets an instant notification and email.' },
  { icon: FiCheckCircle, title: 'Reserve, collect, confirm', text: 'Reserve a quantity, show the 6-digit pickup code, and the restaurant confirms the handover.' },
];

const AUDIENCES = [
  { emoji: '🙋', title: 'Citizens', text: 'Report dumping, track trucks and pick up great food at a discount.', role: 'citizen', cta: 'Join as a citizen' },
  { emoji: '🍽️', title: 'Restaurants', text: 'Turn surplus into goodwill and recovered cost instead of waste.', role: 'restaurant', cta: 'Join as a restaurant' },
  { emoji: '🤝', title: 'NGOs & food banks', text: 'Get alerts the moment free food is listed within your radius.', role: 'ngo', cta: 'Join as an NGO' },
];

export default function Home() {
  const { user } = useAuth();
  const actions = heroActions(user);

  return (
    <div className="space-y-24 pb-8">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="container-page relative grid items-center gap-12 pb-8 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-xs font-semibold text-brand-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> AI for sustainable cities
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-6xl"
            >
              {user ? (
                <>
                  Welcome back, <span className="text-gradient">{user.name.split(' ')[0]}</span>.
                </>
              ) : (
                <>
                  Cleaner streets.
                  <br />
                  <span className="text-gradient">Fuller plates.</span>
                </>
              )}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-5 max-w-xl text-lg text-ink-300"
            >
              EcoAI helps cities stop illegal dumping, follow garbage trucks live, and rescue surplus restaurant food for
              NGOs — at a fraction of its cost, before it goes to waste.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8 flex flex-wrap gap-3">
              {actions.map((a) => (
                <Link key={a.to} to={a.to} className={`btn btn-lg ${a.primary ? 'btn-primary' : 'btn-secondary'}`}>
                  {a.label} {a.primary && <FiArrowRight />}
                </Link>
              ))}
            </motion.div>
            {!user && (
              <p className="mt-4 text-sm text-ink-500">
                Restaurant or NGO?{' '}
                <Link to="/signup?role=restaurant" className="link">
                  Join as a partner
                </Link>
              </p>
            )}
          </div>
          <LiveNow />
        </div>
      </section>

      <ImpactBand />

      {/* Features */}
      <section id="features" className="container-page scroll-mt-24">
        <motion.div {...fadeUp} className="mx-auto mb-12 max-w-2xl text-center">
          <p className="eyebrow">What EcoAI does</p>
          <h2 className="mt-3 text-3xl sm:text-4xl">Four tools, one greener city</h2>
        </motion.div>
        <div className="grid gap-5 md:grid-cols-2">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} {...fadeUp} transition={{ duration: 0.5, delay: (i % 2) * 0.1 }}>
              <Link to={f.to} className={`card card-hover group relative block h-full overflow-hidden bg-gradient-to-br ${f.tone} to-transparent p-7`}>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.06] text-2xl text-white">
                  <f.icon />
                </span>
                <h3 className="mt-5 text-xl">{f.title}</h3>
                <p className="mt-2 text-ink-300">{f.text}</p>
                <ul className="mt-5 space-y-1.5">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-sm text-ink-300">
                      <FiCheckCircle className="text-brand-300" /> {p}
                    </li>
                  ))}
                </ul>
                <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-300 transition group-hover:gap-2">
                  Open <FiArrowRight />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How food rescue works */}
      <section id="how-it-works" className="container-page scroll-mt-24">
        <motion.div {...fadeUp} className="mb-12 max-w-2xl">
          <p className="eyebrow">Food rescue, reimagined</p>
          <h2 className="mt-3 text-3xl sm:text-4xl">From kitchen surplus to someone’s dinner in under an hour</h2>
          <p className="mt-3 text-ink-400">
            No more “click a photo and hope”. Every listing carries a real price, a safety window and a pickup code so food
            reaches people quickly and accountably.
          </p>
        </motion.div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <motion.div key={s.title} {...fadeUp} transition={{ duration: 0.5, delay: i * 0.08 }} className="card relative p-6">
              <span className="absolute right-5 top-5 text-5xl font-extrabold text-white/[0.04]">{i + 1}</span>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-400/15 text-xl text-brand-300">
                <s.icon />
              </span>
              <h3 className="mt-5 text-base">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-400">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Audiences */}
      {!user && (
        <section className="container-page">
          <div className="grid gap-5 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <motion.div key={a.role} {...fadeUp} className="card flex flex-col p-6">
                <span className="text-3xl">{a.emoji}</span>
                <h3 className="mt-4 text-lg">{a.title}</h3>
                <p className="mt-1 flex-1 text-sm text-ink-400">{a.text}</p>
                <Link to={`/signup?role=${a.role}`} className="btn btn-secondary mt-5 w-fit">
                  {a.cta} <FiArrowRight />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Our work */}
      <section className="container-page">
        <motion.div {...fadeUp} className="mx-auto mb-8 max-w-2xl text-center">
          <p className="eyebrow">On the ground</p>
          <h2 className="mt-3 text-3xl sm:text-4xl">Our work</h2>
        </motion.div>
        <WorkCarousel />
      </section>

      {/* Reviews */}
      <section className="container-page">
        <motion.div {...fadeUp} className="mx-auto mb-10 max-w-2xl text-center">
          <p className="eyebrow">Community</p>
          <h2 className="mt-3 text-3xl sm:text-4xl">What people say</h2>
        </motion.div>
        <Reviews />
      </section>

      {/* Contact */}
      <section id="contact" className="container-page scroll-mt-24">
        <Contact />
      </section>
    </div>
  );
}
