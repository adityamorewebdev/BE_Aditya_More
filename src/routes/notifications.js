import { Router } from 'express'
import asyncHandler from '../middleware/asyncHandler.js'
import isAuthenticated from '../middleware/isAuthenticated.js'
import { Notification } from '../models/Notification.js'

const router = Router()

router.use(isAuthenticated)

// ── Get user's notifications ─────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()

    res.json({ success: true, notifications })
  })
)

// ── Mark notification as read ────────────────────────────────────────────────
router.put(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true }
    )
    res.json({ success: true })
  })
)

export default router
