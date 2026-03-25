import { createClient } from 'redis'
import config from './env.js'

const { REDIS_URL } = config
const redisClient = createClient({ url: REDIS_URL })

redisClient.on('error', (err) => console.error('[Redis] Error:', err))
redisClient.on('connect', () => console.log('[Redis] Connected'))

async function connectRedis() {
  await redisClient.connect()
}

export { redisClient, connectRedis }