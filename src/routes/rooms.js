import { Router } from 'express'
import asyncHandler from '../middleware/asyncHandler.js'
import isAuthenticated from '../middleware/isAuthenticated.js'
import { Room } from '../models/Room.js'
import { Message } from '../models/Message.js'
import { User } from '../models/User.js'
import { redisClient } from '../config/redis.js'

const router = Router()

// All room routes require authentication
router.use(isAuthenticated)

// ── List user's rooms ────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user._id.toString()
    const rooms = await Room.find({ 'members.userId': req.user._id })
      .sort({ 'lastMessage.sentAt': -1, updatedAt: -1 })
      .lean()

    // Attach unread counts and member info
    const enrichedRooms = await Promise.all(
      rooms.map(async (room) => {
        const unreadKey = `unread:${userId}:${room._id}`
        const unreadCount = parseInt(await redisClient.get(unreadKey) || '0', 10)

        // For DMs, get the other user's info
        let dmUser = null
        if (room.type === 'dm') {
          const otherMember = room.members.find((m) => m.userId.toString() !== userId)
          if (otherMember) {
            dmUser = await User.findById(otherMember.userId).select('username avatarUrl status lastSeen').lean()
          }
        }

        return { ...room, unreadCount, dmUser }
      })
    )

    res.json({ success: true, rooms: enrichedRooms })
  })
)

// ── Create a room ────────────────────────────────────────────────────────────
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { type, name, memberIds } = req.body
    const userId = req.user._id.toString()

    if (!type || !['dm', 'group'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Type must be "dm" or "group"' })
    }

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ success: false, message: 'memberIds required' })
    }

    // For DM: check if room already exists between these two users
    if (type === 'dm') {
      if (memberIds.length !== 1) {
        return res.status(400).json({ success: false, message: 'DM must have exactly one other member' })
      }

      const otherUserId = memberIds[0]
      const existingDm = await Room.findOne({
        type: 'dm',
        $and: [
          { 'members.userId': req.user._id },
          { 'members.userId': otherUserId },
        ],
      })

      if (existingDm) {
        return res.json({ success: true, room: existingDm, existing: true })
      }
    }

    // Build members array
    const allMemberIds = [userId, ...memberIds.filter((id) => id !== userId)]
    const members = allMemberIds.map((id) => ({
      userId: id,
      role: id === userId ? 'admin' : 'member',
      lastReadSeq: 0,
    }))

    const room = await Room.create({
      type,
      name: type === 'group' ? name || 'New Group' : undefined,
      members,
    })

    // Notify all members via socket so they join the room in real-time
    const io = req.app.get('io')
    if (io) {
      const roomIdStr = room._id.toString()
      for (const memberId of allMemberIds) {
        // Force-join all member sockets into this new room
        const memberSockets = await io.in(`user:${memberId}`).fetchSockets()
        for (const s of memberSockets) {
          s.join(roomIdStr)
        }
        // Notify them about the new room
        io.to(`user:${memberId}`).emit('room:created', room)
      }
    }

    res.status(201).json({ success: true, room })
  })
)

// ── Get room details ─────────────────────────────────────────────────────────
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id).lean()
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' })
    }

    // Validate membership
    const isMember = room.members.some(
      (m) => m.userId.toString() === req.user._id.toString()
    )
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Not a member of this room' })
    }

    // Populate member info
    const memberIds = room.members.map((m) => m.userId)
    const users = await User.find({ _id: { $in: memberIds } })
      .select('username avatarUrl status lastSeen')
      .lean()

    const membersWithInfo = room.members.map((m) => ({
      ...m,
      user: users.find((u) => u._id.toString() === m.userId.toString()),
    }))

    res.json({ success: true, room: { ...room, members: membersWithInfo } })
  })
)

// ── Update room (group only) ─────────────────────────────────────────────────
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id)
    if (!room || room.type !== 'group') {
      return res.status(404).json({ success: false, message: 'Group not found' })
    }

    const member = room.members.find(
      (m) => m.userId.toString() === req.user._id.toString()
    )
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }

    const { name, avatarUrl, addMemberIds, removeMemberIds } = req.body

    if (name) room.name = name
    if (avatarUrl) room.avatarUrl = avatarUrl

    if (addMemberIds?.length) {
      for (const id of addMemberIds) {
        if (!room.members.some((m) => m.userId.toString() === id)) {
          room.members.push({ userId: id, role: 'member', lastReadSeq: 0 })
        }
      }
    }

    if (removeMemberIds?.length) {
      room.members = room.members.filter(
        (m) => !removeMemberIds.includes(m.userId.toString())
      )
    }

    await room.save()
    res.json({ success: true, room })
  })
)

// ── Get room messages (cursor-based pagination) ──────────────────────────────
router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id).lean()
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' })
    }

    const isMember = room.members.some(
      (m) => m.userId.toString() === req.user._id.toString()
    )
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Not a member' })
    }

    const before = parseInt(req.query.before, 10) || Infinity
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 50)

    const query = { roomId: req.params.id }
    if (before !== Infinity) {
      query.sequenceNo = { $lt: before }
    }

    const messages = await Message.find(query)
      .sort({ sequenceNo: -1 })
      .limit(limit)
      .populate('senderId', 'username avatarUrl')
      .lean()

    res.json({
      success: true,
      messages: messages.reverse(),    // return in ascending order
      hasMore: messages.length === limit,
    })
  })
)

export default router
