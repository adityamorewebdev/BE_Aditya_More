import { Router } from 'express'
import asyncHandler from '../middleware/asyncHandler.js'
import isAuthenticated from '../middleware/isAuthenticated.js'
import { User } from '../models/User.js'

const router = Router()

router.use(isAuthenticated)

// ── Search users by username or email ────────────────────────────────────────
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = req.query.q?.trim()
    if (!q || q.length < 2) {
      return res.json({ success: true, users: [] })
    }

    const regex = new RegExp(q, 'i')
    const users = await User.find({
      _id: { $ne: req.user._id },        // exclude self
      $or: [{ username: regex }, { email: regex }],
    })
      .select('username email avatarUrl status')
      .limit(20)
      .lean()

    res.json({ success: true, users })
  })
)

export default router
