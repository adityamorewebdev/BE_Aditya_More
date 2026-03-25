import mongoose from 'mongoose'

const MemberSchema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role:        { type: String, enum: ['admin', 'member'], default: 'member' },
    isAdmin:     { type: Boolean, default: false },
    lastReadSeq: { type: Number, default: 0 },
    lastClearedSeq: { type: Number, default: 0 },
  },
  { _id: false }
)

const RoomSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['dm', 'group'], required: true },
    name: { type: String },           // group name
    avatarUrl: { type: String },       // group avatar
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [MemberSchema],
    lastMessage: {
      content:  { type: String },
      sentAt:   { type: Date },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  },
  { timestamps: true }
)

// Index for fetching user's rooms efficiently
RoomSchema.index({ 'members.userId': 1 })

const Room = mongoose.model('Room', RoomSchema)

export { Room }
