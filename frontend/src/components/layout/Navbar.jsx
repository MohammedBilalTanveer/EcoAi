import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiAlertTriangle,
  FiArrowRight,
  FiChevronDown,
  FiClock,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiMessageCircle,
  FiPlus,
  FiSearch,
  FiSettings,
  FiShield,
  FiShoppingBag,
  FiTruck,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { ACCOUNT_STATUS, ROLE_LABEL } from '../../lib/format';
import { Avatar, cx } from '../ui';
import Logo from './Logo';
import NotificationBell from './NotificationBell';

const FEATURES = [
  { to: '/report-waste', label: 'Report Dumping', desc: 'Snap a photo — AI verifies it and alerts the city', icon: FiAlertTriangle, tone: 'bg-rose-400/10 text-rose-300' },
  { to: '/food', label: 'Food Rescue', desc: 'Surplus food free for NGOs or up to 90% off', icon: FiShoppingBag, tone: 'bg-brand-400/15 text-brand-300' },
  { to: '/live-map', label: 'Live Trucks', desc: 'Garbage trucks on real routes, with ETAs', icon: FiTruck, tone: 'bg-sky-400/10 text-sky-300' },
  { to: '/chatbot', label: 'GreenBot', desc: 'AI advice on waste, recycling and more', icon: FiMessageCircle, tone: 'bg-accent/10 text-accent-300' },
];

const QUICK_ACTION = {
  citizen: { to: '/report-waste', label: 'Report', icon: FiAlertTriangle },
  restaurant: { to: '/food/new', label: 'Share food', icon: FiPlus },
  ngo: { to: '/food', label: 'Find food', icon: FiSearch },
};

/** Restaurants/NGOs awaiting approval (and rejected or suspended accounts) only get Profile + Sign out. */
const isLimited = (user) => Boolean(user?.status && user.status !== 'active');

const ACCOUNT_LINKS = [
  { to: '/profile', label: 'Profile & settings', icon: FiUser },
  { to: '/my-reports', label: 'My dumping reports', icon: FiAlertTriangle },
];

function accountLinks(user) {
  if (isLimited(user)) return ACCOUNT_LINKS.slice(0, 1);
  return [
    ...ACCOUNT_LINKS,
    { to: '/food/dashboard', label: user.role === 'restaurant' ? 'My food listings' : 'My food activity', icon: FiGrid },
  ];
}

function StatusPill({ user }) {
  const s = ACCOUNT_STATUS[user.status];
  return (
    <Link to="/" className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-amber-200">
      <FiClock /> {s?.label || 'Account restricted'}
    </Link>
  );
}

function appLinks(user) {
  const links = FEATURES.map(({ to, label, icon }) => ({ to, label, icon }));
  if (user?.role === 'admin') links.push({ to: '/admin', label: 'Admin', icon: FiSettings });
  if (['staff', 'admin'].includes(user?.role)) links.push({ to: '/staff/dashboard', label: 'Staff', icon: FiShield });
  return links;
}

/** Scrolls to a section of the home page, navigating there first if needed. */
function useGoToSection() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (id) => {
      const tryScroll = (attempt = 0) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else if (attempt < 30) setTimeout(() => tryScroll(attempt + 1), 100);
      };
      if (location.pathname !== '/') navigate('/');
      tryScroll();
    },
    [location.pathname, navigate],
  );
}

/** A top-level link with an animated "you are here" pill that slides between items. */
function PillLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink to={to} end={end} className="relative rounded-lg px-3 py-1.5 text-sm font-medium outline-none">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active-pill"
              className="absolute inset-0 rounded-lg bg-white/[0.08] ring-1 ring-inset ring-white/10"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <span className={cx('relative flex items-center gap-2 transition-colors', isActive ? 'text-white' : 'text-ink-300 hover:text-white')}>
            {Icon && <Icon className={cx('hidden text-[15px] xl:block', isActive ? 'text-brand-300' : 'text-ink-400')} />}
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

function FeaturesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);
  const location = useLocation();
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Hover opens it on desktop (with a short grace period), click toggles it for touch and keyboard.
  const hover = (next) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), next ? 60 : 160);
  };

  return (
    <div ref={ref} className="relative" onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cx(
          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          open ? 'bg-white/[0.06] text-white' : 'text-ink-300 hover:text-white',
        )}
      >
        Features <FiChevronDown className={cx('transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute left-1/2 top-full z-50 w-[560px] -translate-x-1/2 pt-3"
          >
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 shadow-[0_24px_60px_-20px_rgba(0,0,0,.8)] backdrop-blur-xl">
              <div className="grid grid-cols-2 gap-1 p-2">
                {FEATURES.map(({ to, label, desc, icon: Icon, tone }) => (
                  <Link key={to} to={to} className="group flex gap-3 rounded-xl p-3 transition hover:bg-white/[0.05]">
                    <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg', tone)}>
                      <Icon />
                    </span>
                    <span>
                      <span className="flex items-center gap-1 text-sm font-semibold text-white">
                        {label}
                        <FiArrowRight className="-translate-x-1 text-xs text-brand-300 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-ink-400">{desc}</span>
                    </span>
                  </Link>
                ))}
              </div>
              <Link
                to="/signup?role=restaurant"
                className="flex items-center justify-between gap-3 border-t border-white/5 bg-gradient-to-r from-brand-500/15 via-transparent to-accent/10 px-5 py-3 text-sm transition hover:from-brand-500/25"
              >
                <span>
                  <span className="font-semibold text-white">Restaurant or NGO?</span>{' '}
                  <span className="text-ink-300">Join the food rescue network in a minute.</span>
                </span>
                <FiArrowRight className="shrink-0 text-brand-300" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const links = [
    ...accountLinks(user),
    ...(user.role === 'admin' ? [{ to: '/admin', label: 'Admin panel', icon: FiSettings }] : []),
    ...(['staff', 'admin'].includes(user.role) ? [{ to: '/staff/dashboard', label: 'Staff portal', icon: FiShield }] : []),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 ring-1 ring-inset transition',
          open ? 'bg-white/[0.08] ring-white/15' : 'ring-transparent hover:bg-white/[0.05]',
        )}
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar name={user.name} src={user.avatar} size="h-8 w-8" />
        <span className="hidden max-w-[8rem] truncate text-sm font-semibold text-ink-100 xl:block">
          {user.organization || user.name.split(' ')[0]}
        </span>
        <FiChevronDown className={cx('text-ink-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 shadow-[0_24px_60px_-20px_rgba(0,0,0,.8)] backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 bg-gradient-to-br from-brand-500/20 via-transparent to-accent/10 p-4">
              <Avatar name={user.name} src={user.avatar} size="h-11 w-11" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="truncate text-xs text-ink-400">{user.email}</p>
                <span className="badge mt-1.5 bg-brand-400/15 text-brand-200 ring-brand-400/30">{ROLE_LABEL[user.role]}</span>
              </div>
            </div>
            <div className="p-1.5">
              {links.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={close}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-200 transition hover:bg-white/5 hover:text-white"
                >
                  <Icon className="text-ink-400" /> {label}
                </Link>
              ))}
            </div>
            <div className="border-t border-white/5 p-1.5">
              <button
                type="button"
                onClick={() => {
                  close();
                  onSignOut();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10"
              >
                <FiLogOut /> Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileMenu({ user, onSignOut, goToSection }) {
  const limited = isLimited(user);
  const links = user ? appLinks(user) : [];
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="mx-auto mt-2 max-h-[calc(100dvh-5.5rem)] max-w-7xl overflow-y-auto rounded-2xl border border-white/10 bg-ink-900/95 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,.8)] backdrop-blur-xl lg:hidden"
    >
      {user && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-gradient-to-br from-brand-500/20 via-transparent to-accent/10 p-3">
          <Avatar name={user.name} src={user.avatar} size="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="text-xs text-ink-400">
              {ROLE_LABEL[user.role]}
              {limited && <span className="text-amber-200"> · {ACCOUNT_STATUS[user.status]?.label}</span>}
            </p>
          </div>
        </div>
      )}

      {!limited && (
      <>
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Explore</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {FEATURES.map(({ to, label, desc, icon: Icon, tone }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cx('flex gap-3 rounded-xl p-3 transition', isActive ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]')}
          >
            <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg', tone)}>
              <Icon />
            </span>
            <span>
              <span className="block text-sm font-semibold text-white">{label}</span>
              <span className="block text-xs text-ink-400">{desc}</span>
            </span>
          </NavLink>
        ))}
        {links
          .filter((l) => !FEATURES.some((f) => f.to === l.to))
          .map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="flex items-center gap-3 rounded-xl p-3 text-sm font-semibold text-white hover:bg-white/[0.04]">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-lg text-ink-200">
                <Icon />
              </span>
              {label} portal
            </NavLink>
          ))}
      </div>
      </>
      )}

      {user ? (
        <>
          <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Account</p>
          {accountLinks(user).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-200 hover:bg-white/[0.04]">
              <Icon className="text-ink-400" /> {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={onSignOut}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-rose-300 hover:bg-rose-500/10"
          >
            <FiLogOut /> Sign out
          </button>
        </>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button type="button" onClick={() => goToSection('how-it-works')} className="rounded-xl px-3 py-2.5 text-left text-sm text-ink-200 hover:bg-white/[0.04]">
              How it works
            </button>
            <button type="button" onClick={() => goToSection('contact')} className="rounded-xl px-3 py-2.5 text-left text-sm text-ink-200 hover:bg-white/[0.04]">
              Contact
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
            <Link to="/login" className="btn btn-secondary">
              Sign in
            </Link>
            <Link to="/signup" className="btn btn-primary">
              Get started
            </Link>
          </div>
        </>
      )}
    </motion.div>
  );
}

export default function Navbar() {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const goToSection = useGoToSection();
  const limited = isLimited(user);
  const quick = user && !limited && QUICK_ACTION[user.role];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleSignOut = () => {
    setMobileOpen(false);
    signOut();
    navigate('/login');
  };

  const solid = scrolled || mobileOpen;

  return (
    <header className="fixed inset-x-0 top-0 z-[900] px-2 pt-2 sm:px-4">
      <nav
        className={cx(
          'relative mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 rounded-2xl border pl-3 pr-2 transition-all duration-300',
          solid
            ? 'border-white/10 bg-ink-950/80 shadow-[0_12px_40px_-18px_rgba(0,0,0,.9)] backdrop-blur-xl'
            : 'border-white/[0.06] bg-ink-900/40 backdrop-blur-md',
        )}
      >
        {/* Purple glow line along the bottom edge once the page scrolls */}
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute inset-x-10 -bottom-px h-px bg-gradient-to-r from-transparent via-brand-400/70 to-transparent transition-opacity duration-300',
            solid ? 'opacity-100' : 'opacity-0',
          )}
        />

        <Logo />

        <div className="hidden items-center gap-0.5 rounded-xl bg-white/[0.03] p-1 ring-1 ring-inset ring-white/[0.06] lg:flex">
          {limited ? (
            <StatusPill user={user} />
          ) : user ? (
            appLinks(user).map((l) => <PillLink key={l.to} {...l} />)
          ) : (
            <>
              <FeaturesMenu />
              <PillLink to="/food" label="Food Rescue" />
              <button type="button" onClick={() => goToSection('how-it-works')} className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-300 transition-colors hover:text-white">
                How it works
              </button>
              <button type="button" onClick={() => goToSection('contact')} className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-300 transition-colors hover:text-white">
                Contact
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {user ? (
            <>
              {quick && (
                <Link to={quick.to} className="btn btn-primary btn-sm hidden h-9 px-3 md:inline-flex">
                  <quick.icon /> {quick.label}
                </Link>
              )}
              {!limited && <NotificationBell />}
              <div className="hidden lg:block">
                <UserMenu user={user} onSignOut={handleSignOut} />
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Link to="/login" className="btn btn-ghost h-9 px-3">
                Sign in
              </Link>
              <Link to="/signup" className="btn btn-primary group h-9 px-4">
                Get started <FiArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl text-xl text-ink-200 transition hover:bg-white/5 lg:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <MobileMenu
            user={user}
            onSignOut={handleSignOut}
            goToSection={(id) => {
              setMobileOpen(false);
              goToSection(id);
            }}
          />
        )}
      </AnimatePresence>
    </header>
  );
}
