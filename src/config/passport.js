import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';import { User } from '../models/User.js'
import config from './env.js'
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL} = config

// Store only the user ID in the session
passport.serializeUser((user, done) => {
  done(null, user._id.toString())
})

// Restore full user from DB on each authenticated request
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id)
    done(null, user)
  } catch (err) {
    done(err, null)
  }
})

passport.use(
  new GoogleStrategy(
    {
      clientID:     GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL:  GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
        if (!email) return done(new Error('No email returned from Google'), null)

        // Find existing user or create a new one
        let user = await User.findOne({ googleId: profile.id })

        if (!user) {
          user = await User.create({
            googleId:  profile.id,
            email,
            username:  profile.displayName,
            avatarUrl: profile.photos?.[0]?.value,
          })
          console.log(`[Auth] New user created: ${email}`)
        } else {
          console.log(`[Auth] Existing user logged in: ${email}`)
        }

        return done(null, user)
      } catch (err) {
        return done(err, null)
      }
    }
  )
)

export default passport
