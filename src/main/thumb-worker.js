const { parentPort } = require('worker_threads')
const sharp = require('sharp')

parentPort.on('message', async ({ id, buf, ext }) => {
  try {
    const input = Buffer.from(buf)
    let result

    try {
      // sharp uses libvips thread pool — decodes HEIC natively on Windows
      result = await sharp(input, { failOn: 'none' })
        .resize(160, 160, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 25 })
        .toBuffer()
    } catch {
      // Fallback: heic-convert (WASM) then sharp resize
      const convert = (await import('heic-convert')).default
      const jpeg = Buffer.from(await convert({ buffer: input, format: 'JPEG', quality: 0.6 }))
      result = await sharp(jpeg)
        .resize(160, 160, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 25 })
        .toBuffer()
    }

    parentPort.postMessage({ id, ok: true, buf: result.buffer }, [result.buffer])
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e.message })
  }
})
