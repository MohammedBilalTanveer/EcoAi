import { Link } from 'react-router-dom';
import Logo from './Logo';

const columns = [
  {
    title: 'Platform',
    links: [
      { to: '/report-waste', label: 'Report dumping' },
      { to: '/food', label: 'Food rescue' },
      { to: '/live-map', label: 'Live trucks' },
      { to: '/chatbot', label: 'GreenBot advisor' },
    ],
  },
  {
    title: 'Join',
    links: [
      { to: '/signup?role=restaurant', label: 'For restaurants' },
      { to: '/signup?role=ngo', label: 'For NGOs' },
      { to: '/signup', label: 'For citizens' },
      { to: '/staff-login', label: 'Staff & admin login' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-white/5 bg-ink-950/60">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-ink-400">
            AI tools for cleaner streets and fuller plates — report illegal dumping, follow garbage trucks live and
            rescue surplus food for people who need it.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <p className="text-sm font-semibold text-white">{col.title}</p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-ink-400 transition hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5">
        <p className="container-page py-5 text-xs text-ink-500">
          © {new Date().getFullYear()} EcoAI — Building a greener future 🌱
        </p>
      </div>
    </footer>
  );
}
