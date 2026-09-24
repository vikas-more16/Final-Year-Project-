import path from 'node:path'
import mongoose from 'mongoose'
import multer from 'multer'
import { BRD_MAX_BYTES, BRD_TYPES } from '../config/constants.js'
import { HttpError } from './HttpError.js'

// BRD files live in MongoDB GridFS (collections brd.files / brd.chunks), next to the project data.
let bucket
function getBucket() {
  bucket ??= new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'brd' })
  return bucket
}

// Kept in memory (max 10 MB) so nothing is stored until the whole request has been validated.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BRD_MAX_BYTES, files: 1, fields: 10 },
})

/** Parses a multipart request with an optional "brd" file, turning multer errors into friendly 4xx responses. */
export function acceptBrd(req, res, next) {
  upload.single('brd')(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(413, 'The BRD must be 10 MB or smaller', { brd: 'The BRD must be 10 MB or smaller' }))
    }
    next(new HttpError(400, 'Could not read the uploaded file', { brd: 'Upload a single BRD file' }))
  })
}

/** Returns an error message, or null when the file is an allowed, genuine document. */
export function checkBrd(file) {
  if (!file) return 'Upload the Business Requirements Document (BRD)'
  const ext = path.extname(file.originalname).toLowerCase()
  if (!BRD_TYPES[ext]) return 'Upload a PDF, DOCX, TXT or MD file'
  if (file.size === 0) return 'The uploaded file is empty'

  // Check the file content, not just the name, so a renamed executable is rejected.
  const head = file.buffer.subarray(0, 5).toString('latin1')
  if (ext === '.pdf' && head !== '%PDF-') return 'This file is not a valid PDF'
  if (ext === '.docx' && !head.startsWith('PK\x03\x04')) return 'This file is not a valid Word (.docx) document'
  if ((ext === '.txt' || ext === '.md') && file.buffer.subarray(0, 8192).includes(0)) return 'This does not look like a text file'
  return null
}

/** Stores a validated upload in GridFS and returns the metadata kept on the project. */
export async function saveBrd(file, { ownerId, projectKey }) {
  const ext = path.extname(file.originalname).toLowerCase()
  const originalName = path.basename(file.originalname).slice(0, 200)
  const stream = getBucket().openUploadStream(originalName, {
    metadata: { owner: ownerId, projectKey, mimeType: BRD_TYPES[ext] },
  })
  await new Promise((resolve, reject) => {
    stream.once('finish', resolve).once('error', reject)
    stream.end(file.buffer)
  })
  return {
    fileId: stream.id,
    originalName,
    mimeType: BRD_TYPES[ext],
    size: file.size,
    uploadedAt: new Date(),
  }
}

export async function deleteBrd(fileId) {
  if (!fileId) return
  try {
    await getBucket().delete(fileId)
  } catch (err) {
    // Already gone is fine; anything else should be visible in the logs but not fail the request.
    if (!/FileNotFound|not found/i.test(err.message)) console.error('Failed to delete BRD', fileId, err.message)
  }
}

export function openBrd(fileId) {
  return getBucket().openDownloadStream(fileId)
}
