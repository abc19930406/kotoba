const MAX_DIMENSION = 1280
const INITIAL_QUALITY = 0.8
const MIN_QUALITY = 0.4
const QUALITY_STEP = 0.1
const MAX_BYTES = 800 * 1024

/** Scales `width`x`height` down so its longest side is at most `maxDimension`, preserving aspect ratio. No-op if already within bounds. */
export function scaleToFit(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxDimension) return { width, height }
  const scale = maxDimension / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob 失敗'))), 'image/jpeg', quality)
  })
}

/**
 * Downscales `file` to at most 1280px on its longest side and re-encodes it
 * as JPEG (quality 0.8, stepping down to a floor of 0.4 if still over
 * 800KB). Re-encoding via canvas also normalizes whatever format the source
 * was (including HEIC from an iPhone camera, which browsers can decode into
 * a bitmap fine) into a single consistent JPEG output — no separate format
 * handling needed.
 */
export async function compressImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, MAX_DIMENSION)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('無法取得 canvas context')
    ctx.drawImage(bitmap, 0, 0, width, height)

    let quality = INITIAL_QUALITY
    let blob = await canvasToBlob(canvas, quality)
    while (blob.size > MAX_BYTES && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP)
      blob = await canvasToBlob(canvas, quality)
    }
    return blob
  } finally {
    bitmap.close()
  }
}
