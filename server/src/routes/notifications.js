import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Notification } from '../models/index.js';
import { notificationDTO } from '../utils/serialize.js';
import { assertObjectId } from '../utils/validate.js';

const router = Router();
router.use(requireAuth);

// GET /api/notifications — latest notifications + unread count
router.get('/', async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ notifications: items.map(notificationDTO), unread });
});

// GET /api/notifications/unread-count — cheap endpoint for polling
router.get('/unread-count', async (req, res) => {
  res.json({ unread: await Notification.countDocuments({ user: req.user._id, read: false }) });
});

router.post('/read-all', async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ unread: 0 });
});

router.patch('/:id/read', async (req, res) => {
  assertObjectId(req.params.id, 'Notification');
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true });
  res.json({ unread: await Notification.countDocuments({ user: req.user._id, read: false }) });
});

export default router;
