import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import passport from '../config/passport.js'
import asyncHandler from '../middleware/asyncHandler.js'
import isAuthenticated from '../middleware/isAuthenticated.js'
import { User } from '../models/User.js'
import { sendVerificationEmail, sendResetEmail } from '../config/mailer.js'

const router = Router()

// ── Register (email/password) ────────────────────────────────────────────────
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, username } = req.body
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Email and password (min 8 chars) required' })
    }

    const existing = await User.findOne({ email: normalizedEmail })
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const verifyToken = crypto.randomBytes(32).toString('hex')

    await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      username: username || normalizedEmail.split('@')[0],
      verifyToken,
      emailVerified: false,
    })

    // Send verification email (fire-and-forget in dev)
    sendVerificationEmail(normalizedEmail, verifyToken).catch((err) =>
      console.error('[Mailer] Verification email failed:', err.message)
    )

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Check your email to verify your account.',
    })
  })
)

// ── Verify email ─────────────────────────────────────────────────────────────
router.get(
  '/verify/:token',
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ verifyToken: req.params.token })
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification link' })
    }

    user.emailVerified = true
    user.verifyToken = undefined
    await user.save()

    return res.json({ success: true, message: 'Email verified successfully. You can now log in.' })
  })
)

// ── Login (email/password) ───────────────────────────────────────────────────
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err)
    if (!user) {
      return res.status(401).json({ success: false, message: info?.message || 'Login failed' })
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr)
      const { _id, email, username, avatarUrl, status } = user
      return res.json({ success: true, user: { id: _id, email, username, avatarUrl, status } })
    })
  })(req, res, next)
})

// ── Google OAuth ─────────────────────────────────────────────────────────────
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  })
)

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/project/4/login?error=auth_failed', session: true }),
  (req, res) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
    res.redirect(`${clientUrl}/project/4/chat`)
  }
)

// ── Current session user ─────────────────────────────────────────────────────
router.get('/me', isAuthenticated, (req, res) => {
  const { _id, email, username, avatarUrl, status } = req.user
  res.json({ id: _id, email, username, avatarUrl, status })
})

// ── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', isAuthenticated, (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' })
    req.session.destroy(() => {
      res.clearCookie('connect.sid')
      res.json({ message: 'Logged out' })
    })
  })
})

// ── Forgot password ──────────────────────────────────────────────────────────
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = req.body
    const normalizedEmail = email?.trim().toLowerCase()
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'Email is required' })
    }

    const user = await User.findOne({ email: normalizedEmail })
    if (!user || !user.password) {
      // Don't reveal whether user exists
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' })
    }

    const resetToken = crypto.randomBytes(32).toString('hex')
    user.resetToken = resetToken
    user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await user.save()

    sendResetEmail(normalizedEmail, resetToken).catch((err) =>
      console.error('[Mailer] Reset email failed:', err.message)
    )

    return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' })
  })
)

// ── Reset password ───────────────────────────────────────────────────────────
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = req.body
    if (!token || !password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Token and new password (min 8 chars) required' })
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() },
    })

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' })
    }

    user.password = await bcrypt.hash(password, 10)
    user.resetToken = undefined
    user.resetTokenExpiry = undefined
    await user.save()

    return res.json({ success: true, message: 'Password reset successful. You can now log in.' })
  })
)

export default router
