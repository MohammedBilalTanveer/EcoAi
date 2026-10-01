import { Link } from 'react-router-dom';
import { FiMapPin } from 'react-icons/fi';
import { km } from '../../lib/format';
import { cx } from '../ui';
import { Countdown, DietMark, DiscountBadge, PriceTag, QuantityLeft } from './FoodBits';

export default function ListingCard({ listing, active, onHover }) {
  const donorName = listing.donor?.organization || listing.donor?.name;
  return (
    <Link
      to={`/food/${listing.id}`}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cx('card card-hover group block overflow-hidden', active && 'border-brand-400/40 bg-ink-900')}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-ink-850">
        {listing.images[0] && (
          <img
            src={listing.images[0]}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink-950/90 to-transparent" />
        <DiscountBadge pricing={listing.pricing} className="absolute left-3 top-3" />
        {listing.distanceKm != null && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-ink-950/70 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <FiMapPin /> {km(listing.distanceKm)}
          </span>
        )}
        <Countdown to={listing.pickup.end} prefix="Ends in" className="absolute bottom-3 left-3 !text-white" />
      </div>
      <div className="space-y-3 p-4">
        <div>
          <div className="flex items-start gap-2">
            <DietMark diet={listing.dietType} className="mt-1" />
            <h3 className="line-clamp-1 text-base">{listing.title}</h3>
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-400">{donorName}</p>
        </div>
        <PriceTag pricing={listing.pricing} unit={listing.quantity.unit} />
        <QuantityLeft quantity={listing.quantity} />
      </div>
    </Link>
  );
}
