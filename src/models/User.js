import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema(
  {
    googleId:         { type: String, unique: true, sparse: true },
    email:            { type: String, required: true, unique: true },
    username:         { type: String, required: true },
    password:         { type: String },                        // only for email/password users
    avatarUrl:        { type: String },
    status:           { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastSeen:         { type: Date, default: Date.now },
    emailVerified:    { type: Boolean, default: false },
    verifyToken:      { type: String },
    resetToken:       { type: String },
    resetTokenExpiry: { type: Date },
  },
  { timestamps: true }
)

const User = mongoose.model('User', UserSchema)

export { User }
