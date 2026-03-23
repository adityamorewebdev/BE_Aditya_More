import mongoose from 'mongoose'

const MessageSchema = new mongoose.Schema(
  {
    roomId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content:    { type: String, required: true },
    clientId:   { type: String, required: true },   // client-generated UUID for dedup
    sequenceNo: { type: Number, required: true },    // per-room ordering
    status:     { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    mentions:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
)

// Compound index for efficient room message queries (cursor-based pagination)
MessageSchema.index({ roomId: 1, sequenceNo: -1 })

// Unique index on clientId for deduplication
MessageSchema.index({ clientId: 1 }, { unique: true })

const Message = mongoose.model('Message', MessageSchema)

export { Message }
