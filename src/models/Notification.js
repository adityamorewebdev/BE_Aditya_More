import mongoose from 'mongoose'

const NotificationSchema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type:      { type: String, enum: ['message', 'mention'], required: true },
    roomId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    content:   { type: String },
    read:      { type: Boolean, default: false },
  },
  { timestamps: true }
)

NotificationSchema.index({ userId: 1, createdAt: -1 })

const Notification = mongoose.model('Notification', NotificationSchema)

export { Notification }
