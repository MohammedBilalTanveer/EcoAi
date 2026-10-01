import { motion } from 'framer-motion';
import { FiStar } from 'react-icons/fi';

const reviews = [
  {
    name: 'Amit Sharma',
    service: 'Food Donation',
    stars: 5,
    img: 'https://randomuser.me/api/portraits/men/32.jpg',
    text: 'EcoAI connected me with NGOs effortlessly. I was able to donate food surplus from my restaurant within hours. Knowing the food reached families in need makes me grateful for this service.',
  },
  {
    name: 'Priya Singh',
    service: 'Waste Reporting',
    stars: 4,
    img: 'https://randomuser.me/api/portraits/women/44.jpg',
    text: 'I reported overflowing garbage bins in my neighborhood, and within a day authorities responded. The app keeps you updated on progress — I feel empowered to contribute towards a cleaner city.',
  },
  {
    name: 'Rahul Mehta',
    service: 'Live Truck Map',
    stars: 5,
    img: 'https://randomuser.me/api/portraits/men/65.jpg',
    text: 'Real-time garbage truck tracking has completely changed how we manage waste disposal at home. No more missed pickups or confusion about timings.',
  },
  {
    name: 'Sneha Kapoor',
    service: 'Tree Plantation',
    stars: 5,
    img: 'https://randomuser.me/api/portraits/women/68.jpg',
    text: 'I joined a tree plantation drive organized via EcoAI. Seeing hundreds of volunteers come together for the environment was inspiring.',
  },
  {
    name: 'Vikram Desai',
    service: 'E-Waste Recycling',
    stars: 4,
    img: 'https://randomuser.me/api/portraits/men/77.jpg',
    text: 'I finally found a reliable way to dispose of my old electronics. EcoAI guided me to the nearest e-waste collection point and made it hassle-free.',
  },
  {
    name: 'Ananya Rao',
    service: 'River Clean-Up',
    stars: 5,
    img: 'https://randomuser.me/api/portraits/women/21.jpg',
    text: 'The river clean-up initiative through EcoAI was one of the most rewarding weekends I’ve had. The visible difference we made keeps me involved.',
  },
];

export default function Reviews() {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {reviews.map((rev, i) => (
        <motion.figure
          key={rev.name}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: (i % 3) * 0.08 }}
          className="card flex flex-col p-6"
        >
          <div className="flex gap-0.5 text-amber-300" aria-label={`${rev.stars} out of 5 stars`}>
            {Array.from({ length: 5 }).map((_, s) => (
              <FiStar key={s} fill={s < rev.stars ? 'currentColor' : 'none'} className={s < rev.stars ? '' : 'text-ink-600'} />
            ))}
          </div>
          <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-ink-300">“{rev.text}”</blockquote>
          <figcaption className="mt-5 flex items-center gap-3">
            <img src={rev.img} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-brand-400/30" loading="lazy" />
            <span>
              <span className="block text-sm font-semibold text-white">{rev.name}</span>
              <span className="block text-xs text-brand-300">{rev.service}</span>
            </span>
          </figcaption>
        </motion.figure>
      ))}
    </div>
  );
}
