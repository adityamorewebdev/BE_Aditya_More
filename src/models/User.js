import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema(
  {
    googleId:  { type: String, required: true, unique: true },
    email:     { type: String, required: true, unique: true },
    username:  { type: String, required: true },
    avatarUrl: { type: String },
    status:    { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastSeen:  { type: Date, default: Date.now },
  },
  { timestamps: true }
)

const User = mongoose.model('User', UserSchema)

export { User }
