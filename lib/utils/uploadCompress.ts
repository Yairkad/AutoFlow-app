// Client-side only (uses canvas / FileReader).

// Vercel's serverless functions reject request bodies over ~4.5MB with a 413 before our route
// code even runs, so we stay safely under that for anything we can shrink client-side.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

// Downscale/recompress an oversized image (camera capture or a large photo) so it clears the upload limit.
export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= MAX_UPLOAD_BYTES) return file
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = dataUrl
    })
    const maxSide = 2000
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const baseName = file.name.replace(/\.\w+$/, '') || 'scan'
    for (const quality of [0.8, 0.6, 0.45, 0.3]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= MAX_UPLOAD_BYTES) return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
    }
    return file
  } catch {
    return file
  }
}

// Re-rasterize an oversized scanned PDF (each page → JPEG at a shrinking quality) and rebuild
// a smaller PDF, so a high-DPI scan from external scanner software also clears the upload limit.
export async function compressPdfIfNeeded(file: File): Promise<File> {
  if (file.type !== 'application/pdf' || file.size <= MAX_UPLOAD_BYTES) return file
  try {
    const [{ getDocument, GlobalWorkerOptions }, { PDFDocument: PDFLibDocument }] = await Promise.all([
      import('pdfjs-dist'),
      import('pdf-lib'),
    ])
    GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const srcBytes = await file.arrayBuffer()
    const baseName = file.name.replace(/\.\w+$/, '') || 'scan'
    for (const quality of [0.7, 0.5, 0.35, 0.25]) {
      const loadingTask = getDocument({ data: srcBytes.slice(0) })
      const pdfDoc = await loadingTask.promise
      const out = await PDFLibDocument.create()
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: 1.5 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const canvasContext = canvas.getContext('2d')
        if (!canvasContext) continue
        await page.render({ canvasContext, viewport }).promise
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
        if (!blob) continue
        const img = await out.embedJpg(await blob.arrayBuffer())
        const p = out.addPage([img.width, img.height])
        p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      }
      await loadingTask.destroy()
      const outBytes = await out.save()
      if (outBytes.byteLength <= MAX_UPLOAD_BYTES) {
        return new File([outBytes.buffer as ArrayBuffer], `${baseName}.pdf`, { type: 'application/pdf' })
      }
    }
    return file
  } catch {
    return file
  }
}

/** Shrink an image or scanned PDF so it fits under MAX_UPLOAD_BYTES (returns the original if it can't). */
export async function shrinkForUpload(file: File): Promise<File> {
  return compressPdfIfNeeded(await compressImageIfNeeded(file))
}
