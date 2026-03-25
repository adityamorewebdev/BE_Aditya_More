import session from 'express-session'
import {RedisStore} from 'connect-redis'
import { redisClient } from './redis.js'
import config from './env.js'
const { SESSION_SECRET, NODE_ENV } = config
const sessionMiddleware = session({
  store: new RedisStore({ client: redisClient }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: NODE_ENV === 'production',   // HTTPS only in prod
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,    // 7 days
  },
})

export { sessionMiddleware }
