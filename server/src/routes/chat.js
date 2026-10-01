import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { limiter } from '../middleware/rateLimit.js';
import { chatReply } from '../services/ai.js';
import { parse } from '../utils/validate.js';

const router = Router();

const chatLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 15,
  perUser: true,
  message: 'You are sending messages too quickly. Take a breath and try again.',
});

const ROLE_CONTEXT = {
  citizen: 'a citizen who reports dumping and can reserve discounted surplus food',
  restaurant: 'a restaurant / food business that lists surplus food for NGOs and at a discount',
  ngo: 'an NGO that gets alerts about nearby surplus food and collects it',
  staff: 'a municipal staff member who reviews dumping reports',
  admin: 'an EcoAI administrator who approves partner accounts and oversees reports and users',
};

const systemPrompt = (user) => `You are GreenBot, the friendly sustainability assistant inside EcoAI — a platform for Indian cities.
EcoAI features you can guide people to:
- "Report Dumping" (/report-waste): photograph illegal garbage dumping; AI verifies the photo and municipal staff are alerted. Track status in "My Reports".
- "Food Rescue" (/food): restaurants list surplus food free for NGOs or at a discount; nearby NGOs get alerts, reserve a quantity and get a 6-digit pickup code that the restaurant verifies at handover.
- "Live Trucks" (/live-map): live garbage truck locations, routes and ETAs to the next stops.
The user is ${user.name}, ${ROLE_CONTEXT[user.role] || 'an EcoAI user'}.
Style: warm, concise and practical. Prefer short paragraphs and bullet points (markdown). When asked for tips on a habit, give 3 actionable tips.
Keep answers under ~200 words unless asked for detail. Stay on sustainability, waste, food, recycling, climate and EcoAI topics; politely steer back if asked about unrelated things.
For food safety questions be conservative (e.g. cooked food at room temperature is safe for about 2–3 hours).`;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(4000),
});

const chatSchema = z
  .object({
    message: z.string().trim().max(4000).optional(),
    messages: z.array(messageSchema).max(40).optional(),
  })
  .refine((d) => d.message || d.messages?.length, { message: 'Message is required.' });

// POST /api/chat — { messages: [{role, text}] } (or legacy { message })
router.post('/', requireAuth, chatLimiter, async (req, res) => {
  const data = parse(chatSchema, req.body);
  let history = data.messages?.length ? data.messages : [{ role: 'user', text: data.message }];
  history = history.slice(-16);
  while (history.length && history[0].role !== 'user') history = history.slice(1);
  if (!history.length || history[history.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'The last message must come from you.', code: 'BAD_HISTORY' });
  }

  const reply = await chatReply({ system: systemPrompt(req.user), history });
  res.json({ reply });
});

export default router;
