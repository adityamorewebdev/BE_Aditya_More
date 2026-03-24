import mongoose from 'mongoose'

const MessageSchema = new mongoose.Schema(
  {
    roomId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content:    { type: String, default: '' },
    clientId:   { type: String, required: true },   // client-generated UUID for dedup
    sequenceNo: { type: Number, required: true },    // per-room ordering
    status:     { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    mentions:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    attachments: [
      {
        url: { type: String, required: true },
        publicId: { type: String },
        resourceType: { type: String },
        format: { type: String },
        bytes: { type: Number },
        width: { type: Number },
        height: { type: Number },
        duration: { type: Number },
        originalName: { type: String },
      },
    ],
  },
  { timestamps: true }
)

// Compound index for efficient room message queries (cursor-based pagination)
MessageSchema.index({ roomId: 1, sequenceNo: -1 })

// Unique index on clientId for deduplication
MessageSchema.index({ clientId: 1 }, { unique: true })

const Message = mongoose.model('Message', MessageSchema)

export { Message }
