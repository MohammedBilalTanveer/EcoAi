import { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, EffectCoverflow, Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/pagination';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const workSamples = [
  {
    id: 1,
    title: 'Plastic Recycling Drive',
    icon: '♻️',
    img: 'https://cdn.prod.website-files.com/62733f1361e2ad64f8790984/627401a21a9afd937033647b_61318a06f5468d6f1dccd147_sustainlife-how-to-recycle-plastic.jpeg',
    desc: 'We collected and recycled over 10 tons of plastic waste in the city.',
  },
  {
    id: 2,
    title: 'Food Donation Camps',
    icon: '🍱',
    img: 'https://childvikasfoundation.org/assets/images/food-distribution/1.jpg',
    desc: 'Partnered with local NGOs to distribute meals to 5000+ families.',
  },
  {
    id: 3,
    title: 'Clean Streets Initiative',
    // Wikimedia Commons, public domain (U.S. Air Force photo by Senior Airman Catherine Daniel)
    img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d6/U_S_volunteers_join_Okinawans_in_city_clean_up_%289305829%29.jpg/960px-U_S_volunteers_join_Okinawans_in_city_clean_up_%289305829%29.jpg',
    icon: '🧹',
    desc: 'Organized volunteers to clean and beautify public spaces.',
  },
  {
    id: 4,
    title: 'Tree Plantation',
    icon: '🌳',
    img: 'https://sc0.blr1.cdn.digitaloceanspaces.com/article/176795-mvavbtrydc-1657103806.jpg',
    desc: 'Planted 2000+ trees across urban and rural areas.',
  },
  {
    id: 5,
    title: 'E-Waste Recycling',
    // Wikimedia Commons, CC0 (photo by Reconrabbit)
    img: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Keyboards_and_mice_in_pile_of_ewaste.jpg/960px-Keyboards_and_mice_in_pile_of_ewaste.jpg',
    icon: '🔌',
    desc: 'Collected and recycled old electronics responsibly.',
  },
  {
    id: 6,
    title: 'River Clean-Up',
    icon: '🌊',
    img: 'https://media.river-cleanup.org/4468/conversions/2024-03_press_release_2-1600.jpeg',
    desc: 'Mobilized 300 volunteers to clean 5 km of polluted riverside.',
  },
];

/** Photo that falls back to a branded placeholder if the remote image ever disappears. */
function WorkImage({ work }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="grid aspect-[16/10] w-full place-items-center bg-gradient-to-br from-brand-500/30 via-ink-850 to-accent/20">
        <span className="text-5xl" aria-hidden="true">
          {work.icon || '🌱'}
        </span>
      </div>
    );
  }
  return (
    <img
      src={work.img}
      alt={work.title}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="aspect-[16/10] w-full bg-ink-850 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export default function WorkCarousel() {
  return (
    <div className="relative">
      <Swiper
        modules={[EffectCoverflow, Autoplay, Navigation, Pagination]}
        effect="coverflow"
        grabCursor
        centeredSlides
        loop
        slidesPerView={1.15}
        breakpoints={{ 640: { slidesPerView: 1.6 }, 1024: { slidesPerView: 2.6 } }}
        coverflowEffect={{ rotate: 0, stretch: 0, depth: 140, modifier: 1.4, slideShadows: false }}
        autoplay={{ delay: 3500, disableOnInteraction: false, pauseOnMouseEnter: true }}
        navigation={{ nextEl: '.work-next', prevEl: '.work-prev' }}
        pagination={{ clickable: true, el: '.work-pagination' }}
        className="!py-4"
      >
        {workSamples.map((work) => (
          <SwiperSlide key={work.id}>
            <article className="card overflow-hidden">
              <WorkImage work={work} />
              <div className="p-5">
                <h3 className="text-lg">{work.title}</h3>
                <p className="mt-1 text-sm text-ink-400">{work.desc}</p>
              </div>
            </article>
          </SwiperSlide>
        ))}
      </Swiper>
      <div className="mt-4 flex items-center justify-center gap-4">
        <button type="button" className="work-prev btn btn-secondary h-10 w-10 rounded-full p-0" aria-label="Previous">
          <FiChevronLeft />
        </button>
        <div className="work-pagination !static flex !w-auto gap-1 [&_.swiper-pagination-bullet]:bg-ink-400 [&_.swiper-pagination-bullet-active]:!bg-brand-400" />
        <button type="button" className="work-next btn btn-secondary h-10 w-10 rounded-full p-0" aria-label="Next">
          <FiChevronRight />
        </button>
      </div>
    </div>
  );
}
