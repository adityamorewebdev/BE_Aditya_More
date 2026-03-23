import mongoose from 'mongoose'

const CounterSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId },   // roomId
  seq: { type: Number, default: 0 },
})

/**
 * Atomically increment and return the next sequence number for a room.
 * Creates the counter document if it doesn't exist (upsert).
 */
CounterSchema.statics.getNextSeq = async function (roomId) {
  const counter = await this.findOneAndUpdate(
    { _id: roomId },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  )
  return counter.seq
}

const Counter = mongoose.model('Counter', CounterSchema)

export { Counter }
