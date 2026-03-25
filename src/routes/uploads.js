import { Router } from 'express'
import asyncHandler from '../middleware/asyncHandler.js'
import isAuthenticated from '../middleware/isAuthenticated.js'
import multer from 'multer'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { cloudinary } from '../config/cloudinary.js'

const router = Router()

router.use(isAuthenticated)

const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1GB
const ALLOWED_DOCUMENT_MIMETYPES = new Set([
  'application/pdf',
  'application/msword',                                                      // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',                                                // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/vnd.ms-powerpoint',                                           // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'text/plain',
  'text/csv',
])

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '')
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
    cb(null, name)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype?.startsWith('image/') ||
      file.mimetype?.startsWith('video/') ||
      file.mimetype?.startsWith('audio/') ||
      ALLOWED_DOCUMENT_MIMETYPES.has(file.mimetype)
    if (!ok) return cb(new Error('Unsupported file type'))
    cb(null, true)
  },
})

router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File is required' })
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ success: false, message: 'Cloudinary is not configured' })
    }

    const filePath = req.file.path
    const isLarge = req.file.size > 100 * 1024 * 1024

    try {
      const uploadOptions = {
        resource_type: 'auto',
        folder: 'chat_uploads',
        use_filename: true,
        unique_filename: true,
      }

      const result = isLarge
        ? await cloudinary.uploader.upload_large(filePath, {
            ...uploadOptions,
            chunk_size: 20 * 1024 * 1024,
          })
        : await cloudinary.uploader.upload(filePath, uploadOptions)

      return res.json({
        success: true,
        attachment: {
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          duration: result.duration,
          originalName: req.file.originalname,
        },
      })
    } finally {
      await fs.unlink(filePath).catch(() => {})
    }
  })
)

export default router
