/**
 * Simulated Bengaluru garbage-collection fleet. Each route is a loop: the first
 * stop is the transfer station / depot where the truck starts and unloads.
 * `rounds` are the local (IST) times a collection round leaves the depot: every
 * truck does a morning round; the busy commercial routes also run one in the afternoon.
 * Road geometry for these routes lives in truckRoutes.json (npm run build:routes).
 */
export const FLEET = [
  {
    id: 1,
    code: 'KA-01-GT-2041',
    rounds: ['06:00', '14:30'],
    driver: 'Ramesh K.',
    zone: 'Central · Majestic',
    color: '#34d399',
    capacityKg: 6000,
    stops: [
      { name: 'Majestic Transfer Station', lat: 12.9767, lng: 77.5713 },
      { name: 'Chickpet', lat: 12.97, lng: 77.578 },
      { name: 'KR Market', lat: 12.9634, lng: 77.5776 },
      { name: 'Lalbagh West Gate', lat: 12.9507, lng: 77.5848 },
      { name: 'Richmond Circle', lat: 12.9636, lng: 77.5997 },
      { name: 'Shivajinagar', lat: 12.9857, lng: 77.6057 },
      { name: 'Cubbon Park', lat: 12.9763, lng: 77.5929 },
    ],
  },
  {
    id: 2,
    code: 'KA-05-GT-3310',
    rounds: ['06:30'],
    driver: 'Suresh M.',
    zone: 'South-East · Koramangala',
    color: '#a78bfa',
    capacityKg: 5000,
    stops: [
      { name: 'Koramangala Depot', lat: 12.9279, lng: 77.6271 },
      { name: 'Koramangala 5th Block', lat: 12.9352, lng: 77.6245 },
      { name: 'Forum Mall Junction', lat: 12.9346, lng: 77.6113 },
      { name: 'Ejipura', lat: 12.9446, lng: 77.6292 },
      { name: 'Agara Lake', lat: 12.9237, lng: 77.648 },
      { name: 'HSR Layout Sector 1', lat: 12.9116, lng: 77.6474 },
    ],
  },
  {
    id: 3,
    code: 'KA-04-GT-1187',
    rounds: ['06:15'],
    driver: 'Manjunath R.',
    zone: 'North · Hebbal',
    color: '#60a5fa',
    capacityKg: 6000,
    stops: [
      { name: 'Hebbal Transfer Station', lat: 13.0358, lng: 77.597 },
      { name: 'Kempapura', lat: 13.046, lng: 77.602 },
      { name: 'Nagawara', lat: 13.0433, lng: 77.6206 },
      { name: 'RT Nagar', lat: 13.0213, lng: 77.5946 },
      { name: 'Mekhri Circle', lat: 13.0144, lng: 77.5838 },
      { name: 'Sanjay Nagar', lat: 13.0376, lng: 77.576 },
    ],
  },
  {
    id: 4,
    code: 'KA-03-GT-4452',
    rounds: ['06:45', '15:00'],
    driver: 'Imran S.',
    zone: 'East · Indiranagar',
    color: '#fbbf24',
    capacityKg: 5500,
    stops: [
      { name: 'Indiranagar Depot', lat: 12.9719, lng: 77.6412 },
      { name: 'Old Madras Road', lat: 12.9905, lng: 77.652 },
      { name: 'CV Raman Nagar', lat: 12.9855, lng: 77.6632 },
      { name: 'HAL Old Airport Rd', lat: 12.958, lng: 77.666 },
      { name: 'Domlur', lat: 12.961, lng: 77.6387 },
    ],
  },
  {
    id: 5,
    code: 'KA-02-GT-2968',
    rounds: ['06:30'],
    driver: 'Lakshmi P.',
    zone: 'South · Jayanagar',
    color: '#f472b6',
    capacityKg: 5000,
    stops: [
      { name: 'Jayanagar Transfer Station', lat: 12.925, lng: 77.5838 },
      { name: 'Basavanagudi', lat: 12.9422, lng: 77.575 },
      { name: 'Banashankari', lat: 12.9255, lng: 77.5468 },
      { name: 'JP Nagar', lat: 12.9077, lng: 77.5851 },
      { name: 'BTM Layout', lat: 12.9166, lng: 77.6101 },
    ],
  },
];
