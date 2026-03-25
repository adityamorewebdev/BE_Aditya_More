import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import validate from "../middleware/validate.js";
import hmacAuth from "../middleware/hmacAuth.js";
import jwtAuth from "../middleware/jwtAuth.js";
import { registerSchema, loginSchema } from "../schemas/authSchema.js";
import {
  register,
  login,
  getProfile,
} from "../controllers/authController.js";
import passport from 'passport'
import env from '../config/env.js'
import isAuthenticated from '../middleware/isAuthenticated.js'

const { CLIENT_URL } = env;

const router = Router();

router.post(
  "/register",
  hmacAuth,
  validate(registerSchema),
  asyncHandler(register)
);

router.post(
  "/login",
  hmacAuth,
  validate(loginSchema),
  asyncHandler(login)
);

router.get(
  "/profile",
  hmacAuth,
  jwtAuth,
  asyncHandler(getProfile)
);

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',   // always show account picker
  })
)

// ── Step 2: Google redirects back here ───────────────────────────────────
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${CLIENT_URL}/login?error=auth_failed`,
    session: true,
  }),
  (req, res) => {
    // Session is set — send user back to the React app
    res.redirect(CLIENT_URL)
  }
)

// ── Current session user ─────────────────────────────────────────────────
router.get('/me', isAuthenticated, (req, res) => {
  const { _id, email, username, avatarUrl, status } = req.user
  res.json({ id: _id, email, username, avatarUrl, status })
})

// ── Logout ────────────────────────────────────────────────────────────────
router.post('/logout', isAuthenticated, (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' })
    req.session.destroy(() => {
      res.clearCookie('connect.sid')
      res.json({ message: 'Logged out' })
    })
  })
})

export default router;