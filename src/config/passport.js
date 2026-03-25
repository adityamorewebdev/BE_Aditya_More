import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as LocalStrategy } from 'passport-local'
import bcrypt from 'bcrypt'
import { User } from '../models/User.js'
import config from './env.js'

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = config

// ── Serialize / Deserialize ─────────────────────────────────────────────────
passport.serializeUser((user, done) => {
  done(null, user._id.toString())
})

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id)
    done(null, user)
  } catch (err) {
    done(err, null)
  }
})

// ── Google OAuth Strategy ───────────────────────────────────────────────────
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
        if (!email) return done(new Error('No email returned from Google'), null)

        let user = await User.findOne({ googleId: profile.id })

        if (!user) {
          user = await User.create({
            googleId: profile.id,
            email,
            username: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
            emailVerified: true,   // Google emails are already verified
          })
          console.log(`[Auth] New Google user created: ${email}`)
        } else {
          console.log(`[Auth] Google user logged in: ${email}`)
        }

        return done(null, user)
      } catch (err) {
        return done(err, null)
      }
    }
  )
)

// ── Local (Email/Password) Strategy ─────────────────────────────────────────
passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const normalizedEmail = email.trim().toLowerCase()
        const user = await User.findOne({ email: normalizedEmail })

        if (!user || !user.password) {
          return done(null, false, { message: 'Invalid email or password' })
        }

        if (!user.emailVerified) {
          return done(null, false, { message: 'Please verify your email before logging in' })
        }

        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) {
          return done(null, false, { message: 'Invalid email or password' })
        }

        return done(null, user)
      } catch (err) {
        return done(err)
      }
    }
  )
)

export default passport
