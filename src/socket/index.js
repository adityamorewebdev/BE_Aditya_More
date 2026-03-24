import { Room } from '../models/Room.js'
import { Message } from '../models/Message.js'
import { Counter } from '../models/Counter.js'
import { Notification } from '../models/Notification.js'
import { User } from '../models/User.js'
import { redisClient } from '../config/redis.js'

/**
 * Initialize all Socket.IO event handlers.
 * @param {import('socket.io').Server} io
 */
export function initSocket(io) {
  // ── Auth middleware — reject unauthenticated sockets ──────────────────────
  io.use((socket, next) => {
    const session = socket.request.session
    const userId = session?.passport?.user
    if (!userId) {
      return next(new Error('Authentication required'))
    }
    socket.userId = userId
    next()
  })

  io.on('connection', async (socket) => {
    const userId = socket.userId
    console.log(`[Socket] Connected: ${userId}`)

    // Auto-join personal room for direct notifications
    socket.join(`user:${userId}`)

    // ── Presence: INCR sockets counter ───────────────────────────────────
    const socketCount = await redisClient.incr(`sockets:${userId}`)

    if (socketCount === 1) {
      // User just came online — broadcast to all their rooms
      await User.findByIdAndUpdate(userId, { status: 'online' })
      const rooms = await Room.find({ 'members.userId': userId }).select('_id').lean()
      for (const room of rooms) {
        io.to(room._id.toString()).emit('presence:update', { userId, status: 'online' })
      }
    }

    // Join all user's rooms
    const userRooms = await Room.find({ 'members.userId': userId }).select('_id').lean()
    for (const room of userRooms) {
      socket.join(room._id.toString())
    }

    // ── room:join ────────────────────────────────────────────────────────
    socket.on('room:join', async (roomId) => {
      try {
        const room = await Room.findById(roomId).lean()
        if (!room) return
        const isMember = room.members.some((m) => m.userId.toString() === userId)
        if (!isMember) return

        socket.join(roomId)
      } catch (err) {
        console.error('[Socket] room:join error:', err.message)
      }
    })

    // ── message:send ─────────────────────────────────────────────────────
    socket.on('message:send', async (data, ack) => {
      try {
        const { roomId, content, clientId, mentions } = data

        if (!roomId || !content || !clientId) {
          return ack?.({ error: 'roomId, content, and clientId are required' })
        }

        // Validate room membership
        const room = await Room.findById(roomId)
        if (!room) return ack?.({ error: 'Room not found' })

        const isMember = room.members.some((m) => m.userId.toString() === userId)
        if (!isMember) return ack?.({ error: 'Not a member of this room' })

        // Ensure ALL member sockets have joined this Socket.IO room
        // (handles rooms created after initial socket connect)
        for (const member of room.members) {
          const memberSockets = await io.in(`user:${member.userId}`).fetchSockets()
          for (const s of memberSockets) {
            s.join(roomId)
          }
        }

        // Get next sequence number atomically
        const sequenceNo = await Counter.getNextSeq(room._id)

        // Insert message (unique clientId index drops duplicates)
        let message
        try {
          message = await Message.create({
            roomId,
            senderId: userId,
            content,
            clientId,
            sequenceNo,
            status: 'sent',
            mentions: mentions || [],
          })
        } catch (dupErr) {
          if (dupErr.code === 11000) {
            // Duplicate clientId — return existing message
            message = await Message.findOne({ clientId }).lean()
            return ack?.({ ok: true, messageId: message._id, sequenceNo: message.sequenceNo })
          }
          throw dupErr
        }

        // Denormalize lastMessage on room
        room.lastMessage = { content, sentAt: message.createdAt, senderId: userId }
        await room.save()

        // Increment unread counters for other members
        for (const member of room.members) {
          if (member.userId.toString() !== userId) {
            await redisClient.incr(`unread:${member.userId}:${roomId}`)
          }
        }

        // Broadcast to room (excluding sender)
        const populatedMsg = await Message.findById(message._id)
          .populate('senderId', 'username avatarUrl')
          .lean()

        socket.to(roomId).emit('message:new', populatedMsg)

        // Emit delivered status to all room members after broadcast
        socket.to(roomId).emit('message:status', {
          messageId: message._id,
          roomId,
          status: 'delivered',
        })

        // Update message status to delivered
        await Message.findByIdAndUpdate(message._id, { status: 'delivered' })

        // Handle @mentions → create notifications
        if (mentions?.length) {
          for (const mentionedUserId of mentions) {
            if (mentionedUserId !== userId) {
              const sender = await User.findById(userId).select('username').lean()
              const notification = await Notification.create({
                userId: mentionedUserId,
                type: 'mention',
                roomId,
                messageId: message._id,
                content: `${sender?.username || 'Someone'} mentioned you: "${content.substring(0, 50)}"`,
              })
              io.to(`user:${mentionedUserId}`).emit('notification:new', notification)
            }
          }
        }

        // ACK to sender
        ack?.({ ok: true, messageId: message._id, sequenceNo })
      } catch (err) {
        console.error('[Socket] message:send error:', err.message)
        ack?.({ error: 'Failed to send message' })
      }
    })

    // ── message:read ─────────────────────────────────────────────────────
    socket.on('message:read', async ({ roomId, sequenceNo }) => {
      try {
        // Update lastReadSeq for this member
        await Room.updateOne(
          { _id: roomId, 'members.userId': userId },
          { $set: { 'members.$.lastReadSeq': sequenceNo } }
        )

        // Reset unread counter
        await redisClient.del(`unread:${userId}:${roomId}`)

        // Update all messages up to this seq as read (from other senders)
        const updatedMessages = await Message.find({
          roomId,
          sequenceNo: { $lte: sequenceNo },
          senderId: { $ne: userId },
          status: { $ne: 'read' },
        }).select('_id senderId').lean()

        if (updatedMessages.length > 0) {
          await Message.updateMany(
            {
              roomId,
              sequenceNo: { $lte: sequenceNo },
              senderId: { $ne: userId },
              status: { $ne: 'read' },
            },
            { $set: { status: 'read' } }
          )

          // Notify senders that their messages were read
          const senderIds = [...new Set(updatedMessages.map((m) => m.senderId.toString()))]
          for (const senderId of senderIds) {
            io.to(`user:${senderId}`).emit('message:status', {
              roomId,
              status: 'read',
              readBy: userId,
              upToSeq: sequenceNo,
            })
          }
        }
      } catch (err) {
        console.error('[Socket] message:read error:', err.message)
      }
    })

    // ── typing:start ─────────────────────────────────────────────────────
    socket.on('typing:start', async ({ roomId }) => {
      try {
        if (!roomId) return

        // Validate membership + ensure all member sockets are in the room
        const room = await Room.findById(roomId).lean()
        if (!room) return
        const isMember = room.members.some((m) => m.userId.toString() === userId)
        if (!isMember) return

        for (const member of room.members) {
          const memberSockets = await io.in(`user:${member.userId}`).fetchSockets()
          for (const s of memberSockets) {
            s.join(roomId.toString())
          }
        }

        await redisClient.sAdd(`typing:${roomId}`, userId)
        await redisClient.expire(`typing:${roomId}`, 5)

        const typingUsers = await redisClient.sMembers(`typing:${roomId}`)
        socket.to(roomId.toString()).emit('typing:update', { roomId: roomId.toString(), typingUsers })
      } catch (err) {
        console.error('[Socket] typing:start error:', err.message)
      }
    })

    // ── typing:stop ──────────────────────────────────────────────────────
    socket.on('typing:stop', async ({ roomId }) => {
      try {
        if (!roomId) return

        // Validate membership + ensure all member sockets are in the room
        const room = await Room.findById(roomId).lean()
        if (!room) return
        const isMember = room.members.some((m) => m.userId.toString() === userId)
        if (!isMember) return

        for (const member of room.members) {
          const memberSockets = await io.in(`user:${member.userId}`).fetchSockets()
          for (const s of memberSockets) {
            s.join(roomId.toString())
          }
        }

        await redisClient.sRem(`typing:${roomId}`, userId)

        const typingUsers = await redisClient.sMembers(`typing:${roomId}`)
        socket.to(roomId.toString()).emit('typing:update', { roomId: roomId.toString(), typingUsers })
      } catch (err) {
        console.error('[Socket] typing:stop error:', err.message)
      }
    })

    // ── Reconnect: replay missing messages ───────────────────────────────
    socket.on('sync', async (roomSeqs) => {
      try {
        // roomSeqs: { roomId: lastSeenSeq, ... }
        for (const [roomId, lastSeenSeq] of Object.entries(roomSeqs)) {
          const room = await Room.findById(roomId).lean()
          if (!room) continue
          const isMember = room.members.some((m) => m.userId.toString() === userId)
          if (!isMember) continue

          const missedMessages = await Message.find({
            roomId,
            sequenceNo: { $gt: lastSeenSeq },
          })
            .sort({ sequenceNo: 1 })
            .limit(100)
            .populate('senderId', 'username avatarUrl')
            .lean()

          for (const msg of missedMessages) {
            socket.emit('message:new', msg)
          }
        }
      } catch (err) {
        console.error('[Socket] sync error:', err.message)
      }
    })

    // ── Disconnect ───────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${userId}`)

      const count = await redisClient.decr(`sockets:${userId}`)

      if (count <= 0) {
        // Clean up: ensure counter doesn't go negative
        await redisClient.del(`sockets:${userId}`)

        // User is fully offline
        await User.findByIdAndUpdate(userId, {
          status: 'offline',
          lastSeen: new Date(),
        })

        // Broadcast offline presence to all rooms
        const rooms = await Room.find({ 'members.userId': userId }).select('_id').lean()
        for (const room of rooms) {
          io.to(room._id.toString()).emit('presence:update', {
            userId,
            status: 'offline',
            lastSeen: new Date(),
          })
        }
      }
    })
  })
}
