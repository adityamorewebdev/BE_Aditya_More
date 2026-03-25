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
    const members = allMemberIds.map((id) => {
      const isCreator = id === userId
      const isGroupAdmin = type === 'group' && isCreator
      return {
        userId: id,
        role: isGroupAdmin ? 'admin' : 'member',
        isAdmin: isGroupAdmin,
        lastReadSeq: 0,
        lastClearedSeq: 0,
      }
    })

    const room = await Room.create({
      type,
      name: type === 'group' ? name || 'New Group' : undefined,
      createdBy: type === 'group' ? userId : undefined,
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

// Clear chat for current user in a room
router.post(
  '/:id/clear',
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id)
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' })
    }

    const member = room.members.find(
      (m) => m.userId.toString() === req.user._id.toString()
    )
    if (!member) {
      return res.status(403).json({ success: false, message: 'Not a member' })
    }

    const lastMsg = await Message.findOne({ roomId: req.params.id })
      .sort({ sequenceNo: -1 })
      .select('sequenceNo')
      .lean()

    const lastSeq = lastMsg?.sequenceNo || 0
    member.lastClearedSeq = Math.max(member.lastClearedSeq || 0, lastSeq)
    member.lastReadSeq = Math.max(member.lastReadSeq || 0, lastSeq)
    await room.save()

    const unreadKey = `unread:${req.user._id.toString()}:${req.params.id}`
    await redisClient.del(unreadKey)

    res.json({ success: true, clearedUpToSeq: lastSeq })
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
    const isAdmin = member?.isAdmin || member?.role === 'admin'
    if (!member || !isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }

    const { name, avatarUrl, addMemberIds, removeMemberIds } = req.body

    if (name) room.name = name
    if (avatarUrl) room.avatarUrl = avatarUrl

    const addedMemberIds = []
    if (addMemberIds?.length) {
      for (const id of addMemberIds) {
        if (!room.members.some((m) => m.userId.toString() === id)) {
          room.members.push({ userId: id, role: 'member', isAdmin: false, lastReadSeq: 0, lastClearedSeq: 0 })
          addedMemberIds.push(id)
        }
      }
    }

    if (removeMemberIds?.length) {
      room.members = room.members.filter(
        (m) => !removeMemberIds.includes(m.userId.toString())
      )
    }

    await room.save()

    const io = req.app.get('io')
    if (io && addedMemberIds.length > 0) {
      const roomIdStr = room._id.toString()
      for (const memberId of addedMemberIds) {
        const memberSockets = await io.in(`user:${memberId}`).fetchSockets()
        for (const s of memberSockets) {
          s.join(roomIdStr)
        }
        io.to(`user:${memberId}`).emit('room:created', room)
      }
    }
    res.json({ success: true, room })
  })
)

// -- Leave group (group only) ---------------------------------------------
router.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id)
    if (!room || room.type !== 'group') {
      return res.status(404).json({ success: false, message: 'Group not found' })
    }

    const memberId = req.user._id.toString()
    const memberIndex = room.members.findIndex((m) => m.userId.toString() === memberId)
    if (memberIndex === -1) {
      return res.status(403).json({ success: false, message: 'Not a member' })
    }

    const leaving = room.members[memberIndex]
    const isAdmin = leaving?.isAdmin || leaving?.role === 'admin'
    if (isAdmin) {
      const adminCount = room.members.filter((m) => m.isAdmin || m.role === 'admin').length
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'At least one admin required' })
      }
    }

    room.members.splice(memberIndex, 1)
    await room.save()

    const io = req.app.get('io')
    if (io) {
      io.to(room._id.toString()).emit('room:updated', { roomId: room._id.toString(), type: 'leave' })
      io.to(`user:${memberId}`).emit('room:removed', { roomId: room._id.toString() })
    }

    res.json({ success: true })
  })
)
// -- Remove admin (group only) -------------------------------------------
router.post(
  '/:id/admins/remove',
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id)
    if (!room || room.type !== 'group') {
      return res.status(404).json({ success: false, message: 'Group not found' })
    }

    const requester = room.members.find(
      (m) => m.userId.toString() === req.user._id.toString()
    )
    const requesterIsAdmin = requester?.isAdmin || requester?.role === 'admin'
    if (!requester || !requesterIsAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }

    const { memberId } = req.body
    if (!memberId) {
      return res.status(400).json({ success: false, message: 'memberId required' })
    }

    const target = room.members.find((m) => m.userId.toString() === memberId.toString())
    if (!target) {
      return res.status(404).json({ success: false, message: 'Member not found' })
    }

    const creatorId =
      (room.createdBy ? room.createdBy.toString() : null) ||
      (room.members?.[0]?.userId ? room.members[0].userId.toString() : null)
    if (creatorId && creatorId === memberId.toString()) {
      return res.status(400).json({ success: false, message: 'Creator admin cannot be removed' })
    }

    const adminCount = room.members.filter((m) => m.isAdmin || m.role === 'admin').length
    if (adminCount <= 1) {
      return res.status(400).json({ success: false, message: 'At least one admin required' })
    }

    target.isAdmin = false
    target.role = 'member'

    await room.save()

    const io = req.app.get('io')
    if (io) {
      io.to(room._id.toString()).emit('room:updated', { roomId: room._id.toString(), type: 'admin' })
    }
    res.json({ success: true, room })
  })
)
// -- Promote member to admin (group only) -------------------------------
router.post(
  '/:id/admins',
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id)
    if (!room || room.type !== 'group') {
      return res.status(404).json({ success: false, message: 'Group not found' })
    }

    const requester = room.members.find(
      (m) => m.userId.toString() === req.user._id.toString()
    )
    const requesterIsAdmin = requester?.isAdmin || requester?.role === 'admin'
    if (!requester || !requesterIsAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }

    const { memberId } = req.body
    if (!memberId) {
      return res.status(400).json({ success: false, message: 'memberId required' })
    }

    const target = room.members.find((m) => m.userId.toString() === memberId.toString())
    if (!target) {
      return res.status(404).json({ success: false, message: 'Member not found' })
    }

    target.isAdmin = true
    target.role = 'admin'

    await room.save()

    const io = req.app.get('io')
    if (io) {
      io.to(room._id.toString()).emit('room:updated', { roomId: room._id.toString(), type: 'admin' })
    }
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

    const member = room.members.find(
      (m) => m.userId.toString() === req.user._id.toString()
    )
    const clearedSeq = member?.lastClearedSeq || 0

    const before = parseInt(req.query.before, 10) || Infinity
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 50)

    if (before !== Infinity && before <= clearedSeq) {
      return res.json({ success: true, messages: [], hasMore: false })
    }

    const query = {
      roomId: req.params.id,
      deletedFor: { $nin: [req.user._id] },
    }
    if (before !== Infinity) {
      query.sequenceNo = { $lt: before, ...(clearedSeq > 0 ? { $gt: clearedSeq } : {}) }
    } else if (clearedSeq > 0) {
      query.sequenceNo = { $gt: clearedSeq }
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



