import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import connectDB from './config/db.js'
import contactRoutes from './routes/contacts.js'
import authRoutes from './routes/auth.js'
import chatAuthRoutes from './routes/chatAuth.js'
import roomRoutes from './routes/rooms.js'
import userRoutes from './routes/users.js'
import notificationRoutes from './routes/notifications.js'
import errorHandler from './middleware/errorHandler.js'
import env from './config/env.js'
import { redisClient, connectRedis } from './config/redis.js'
import { sessionMiddleware } from './config/session.js'
import passport from './config/passport.js'
import { initSocket } from './socket/index.js'

const { PORT, CLIENT_URL } = env
const app = express()
const httpServer = createServer(app)

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}))

app.use(express.json())
app.use(sessionMiddleware)
app.use(passport.initialize())
app.use(passport.session())

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/contacts', contactRoutes)
app.use('/api/auth', authRoutes)             // existing JWT+HMAC auth
app.use('/api/chat/auth', chatAuthRoutes)    // chat session-based auth
app.use('/api/rooms', roomRoutes)
app.use('/api/users', userRoutes)
app.use('/api/notifications', notificationRoutes)

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

app.use(errorHandler)

// ── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
})

// Share session middleware with Socket.IO
io.engine.use(sessionMiddleware)

// Make io accessible to Express routes
app.set('io', io)

// ── Start ────────────────────────────────────────────────────────────────────
connectRedis().then(async () => {
  console.log('[Redis] Connected')

  // Redis adapter for multi-node Socket.IO
  const pubClient = redisClient.duplicate()
  const subClient = redisClient.duplicate()
  await Promise.all([pubClient.connect(), subClient.connect()])
  io.adapter(createAdapter(pubClient, subClient))

  // Initialize socket handlers
  initSocket(io)

  await connectDB()
  httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))
})
