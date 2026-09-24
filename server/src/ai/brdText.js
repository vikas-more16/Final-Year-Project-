import path from 'node:path'
import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'
import { openBrd } from '../utils/brdStorage.js'

async function readGridFs(fileId) {
  const chunks = []
  for await (const chunk of openBrd(fileId)) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** Reads the project's BRD from GridFS and returns plain text (PDF, DOCX, TXT or MD). */
export async function loadBrdText(brd) {
  const buffer = await readGridFs(brd.fileId)
  const ext = path.extname(brd.originalName).toLowerCase()
  let text
  if (ext === '.pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    text = (await extractText(pdf, { mergePages: true })).text
  } else if (ext === '.docx') {
    text = (await mammoth.extractRawText({ buffer })).value
  } else {
    text = buffer.toString('utf8')
  }
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/** Splits text into chunks of roughly `size` characters on paragraph boundaries. */
export function chunkText(text, size = 7000) {
  const chunks = []
  let current = ''
  for (const para of text.split(/\n\s*\n/)) {
    if (current && current.length + para.length > size) {
      chunks.push(current)
      current = ''
    }
    // A single oversized paragraph is hard-split so no chunk exceeds the budget.
    for (let i = 0; i < para.length; i += size) {
      const piece = para.slice(i, i + size)
      if (current && current.length + piece.length > size) { chunks.push(current); current = '' }
      current += (current ? '\n\n' : '') + piece
    }
  }
  if (current) chunks.push(current)
  return chunks
}
