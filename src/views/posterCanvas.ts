import QRCode from 'qrcode'
import { t } from '../i18n'
import { BUILTIN_SPONSOR, THEME_COLORS, wrapWords, type Poster } from '../logic/poster'
import albatrosSponsor from '../assets/sponsor-albatros.png'

/** A4 at 150 dpi. */
export const POSTER_W = 1240
export const POSTER_H = 1754
const M = 80
const DISPLAY = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif'
const BODY = '"Barlow", system-ui, "Segoe UI", Arial, sans-serif'
/** The lower band with the QR code. */
const BAND_TOP = 1330
/** The sponsor's column at the top right, next to the title. */
const SPONSOR_W = 270

type Ctx = CanvasRenderingContext2D

const font = (weight: number, px: number, family: string) => `${weight} ${Math.round(px)}px ${family}`

function lines(ctx: Ctx, text: string, width: number, maxLines: number): string[] {
  const out = wrapWords(text, (l) => ctx.measureText(l).width <= width)
  if (out.length <= maxLines) return out
  const kept = out.slice(0, maxLines)
  kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…'
  return kept
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function background(ctx: Ctx, p: Poster) {
  const c = THEME_COLORS[p.theme]
  const g = ctx.createLinearGradient(0, 0, POSTER_W * 0.4, POSTER_H)
  g.addColorStop(0, c.bg1)
  g.addColorStop(1, c.bg2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)
  // Soft shapes: a ball-like circle and two rings.
  ctx.globalAlpha = 0.09
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(POSTER_W - 60, 190, 360, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 0.12
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 6
  ctx.beginPath(); ctx.arc(POSTER_W - 60, 190, 250, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(120, BAND_TOP - 40, 300, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = c.accent
  ctx.fillRect(0, 0, POSTER_W, 22)
}

/** The sponsor's logo on a white plaque with its caption, top right (next to the title). */
function drawSponsor(ctx: Ctx, p: Poster, logo: HTMLImageElement) {
  const c = THEME_COLORS[p.theme]
  const x = POSTER_W - M - SPONSOR_W
  const y = 70
  const ph = Math.round(Math.min(260, Math.max(120, (logo.height / logo.width) * (SPONSOR_W - 44) + 44)))
  ctx.fillStyle = '#fff'
  roundRect(ctx, x, y, SPONSOR_W, ph, 22)
  ctx.fill()
  const k = Math.min((SPONSOR_W - 44) / logo.width, (ph - 44) / logo.height)
  ctx.drawImage(logo, x + (SPONSOR_W - logo.width * k) / 2, y + (ph - logo.height * k) / 2, logo.width * k, logo.height * k)
  ctx.fillStyle = c.accent
  ctx.font = font(800, 32, DISPLAY)
  ctx.textAlign = 'center'
  let ly = y + ph + 42
  for (const l of lines(ctx, (p.sponsorLabel || t('Sponsor główny turnieju')).toUpperCase(), SPONSOR_W, 3)) { ctx.fillText(l, x + SPONSOR_W / 2, ly); ly += 36 }
  ctx.textAlign = 'left'
}

/** Draws everything above the QR band; returns the bottom of the card. */
function drawTop(ctx: Ctx, p: Poster, scale: number, logo: HTMLImageElement | null): number {
  const c = THEME_COLORS[p.theme]
  const full = POSTER_W - 2 * M
  // With a sponsor's logo the kicker, title and slogan leave its column free on the right.
  const width = logo ? full - SPONSOR_W - 40 : full
  if (logo) drawSponsor(ctx, p, logo)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  let y = 96

  if (p.kicker) {
    ctx.fillStyle = c.accent
    ctx.font = font(700, 46 * scale, DISPLAY)
    for (const l of lines(ctx, p.kicker.toUpperCase(), width, 2)) { y += 50 * scale; ctx.fillText(l, M, y) }
    y += 26 * scale
  }

  // The title is as big as fits in three lines.
  ctx.fillStyle = c.ink
  const title = p.title.toUpperCase()
  let px = 210 * scale
  let tl: string[] = []
  for (; px > 70; px -= 6) {
    ctx.font = font(800, px, DISPLAY)
    tl = wrapWords(title, (l) => ctx.measureText(l).width <= width)
    if (tl.length <= 3 && tl.every((l) => ctx.measureText(l).width <= width)) break
  }
  for (const l of tl) { y += px * 0.96; ctx.fillText(l, M, y) }
  y += 30 * scale

  if (p.tagline) {
    ctx.fillStyle = c.ink
    ctx.globalAlpha = 0.9
    ctx.font = font(500, 52 * scale, BODY)
    for (const l of lines(ctx, p.tagline, width, 2)) { y += 62 * scale; ctx.fillText(l, M, y) }
    ctx.globalAlpha = 1
    y += 24 * scale
  }

  // The card: when, where and the extra lines.
  y += 20 * scale
  const top = y
  const pad = 44 * scale
  const inner = full - 2 * pad
  type Row = { label?: string; text: string[]; size: number; weight: number; family: string }
  const rows: Row[] = []
  ctx.font = font(800, 78 * scale, DISPLAY)
  if (p.when) rows.push({ label: t('Kiedy'), text: lines(ctx, p.when, inner, 2), size: 78 * scale, weight: 800, family: DISPLAY })
  ctx.font = font(800, 68 * scale, DISPLAY)
  if (p.where) rows.push({ label: t('Gdzie'), text: lines(ctx, p.where, inner, 2), size: 68 * scale, weight: 800, family: DISPLAY })
  ctx.font = font(500, 40 * scale, BODY)
  for (const l of p.lines) rows.push({ text: lines(ctx, l, inner - 40 * scale, 2), size: 40 * scale, weight: 500, family: BODY })
  let h = pad * 2
  for (const r of rows) h += (r.label ? 34 * scale : 0) + r.text.length * r.size * (r.family === DISPLAY ? 1.02 : 1.28) + 22 * scale
  ctx.fillStyle = c.card
  roundRect(ctx, M, top, full, h, 34)
  ctx.fill()
  ctx.fillStyle = c.accent
  roundRect(ctx, M, top, 16, h, 8)
  ctx.fill()
  let cy = top + pad
  for (const r of rows) {
    if (r.label) {
      cy += 30 * scale
      ctx.fillStyle = c.cardInk
      ctx.globalAlpha = 0.55
      ctx.font = font(700, 28 * scale, DISPLAY)
      ctx.fillText(r.label.toUpperCase(), M + pad, cy)
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = c.cardInk
    ctx.font = font(r.weight, r.size, r.family)
    for (const l of r.text) {
      cy += r.size * (r.family === DISPLAY ? 1.02 : 1.28)
      ctx.fillText(r.family === BODY ? `•  ${l}` : l, M + pad, cy)
    }
    cy += 22 * scale
  }
  return top + h
}

/** The QR band: the code, what it opens and the footer. */
function drawBand(ctx: Ctx, p: Poster, qr: HTMLCanvasElement | null) {
  const c = THEME_COLORS[p.theme]
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(0, BAND_TOP, POSTER_W, POSTER_H - BAND_TOP)
  const qy = BAND_TOP + 36
  const size = 250
  ctx.fillStyle = '#fff'
  roundRect(ctx, M, qy, size + 40, size + 40, 24)
  ctx.fill()
  if (qr) ctx.drawImage(qr, M + 20, qy + 20, size, size)
  const tx = M + size + 40 + 44
  const tw = POSTER_W - M - tx
  ctx.fillStyle = c.accent
  ctx.font = font(800, 50, DISPLAY)
  const capH = 52 * 2 + 2 + 38 * 3
  let y = qy + Math.max(50, (size + 40 - capH) / 2 + 40)
  for (const l of lines(ctx, t('Wyniki na żywo w telefonie').toUpperCase(), tw, 2)) { ctx.fillText(l, tx, y); y += 52 }
  ctx.fillStyle = '#fff'
  ctx.font = font(500, 30, BODY)
  y += 2
  for (const l of lines(ctx, t('Zeskanuj kod aparatem telefonu: tabele, terminarz i wyniki bez instalowania aplikacji.'), tw, 3)) { ctx.fillText(l, tx, y); y += 38 }
  if (p.footer) {
    ctx.fillStyle = '#fff'
    ctx.globalAlpha = 0.92
    ctx.font = font(500, 30, BODY)
    const fl = lines(ctx, p.footer, POSTER_W - 2 * M - 220, 1)
    ctx.fillText(fl[0], M, POSTER_H - 34)
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = '#fff'
  ctx.globalAlpha = 0.55
  ctx.font = font(500, 22, BODY)
  ctx.textAlign = 'right'
  ctx.fillText('SportLiveArena', POSTER_W - M, POSTER_H - 34)
  ctx.textAlign = 'left'
  ctx.globalAlpha = 1
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('logo'))
  img.src = src
})

/** The sponsor's logo (built-in or from the poster), or null when there is none or it cannot be read. */
async function loadLogo(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return null
  try { return await loadImage(src === BUILTIN_SPONSOR ? albatrosSponsor : src) } catch { return null }
}

/** A logo picked by the organiser: scaled down and flattened on white (a small JPEG), as a data: URL. */
export async function logoFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, 520 / Math.max(img.width, 1), 260 / Math.max(img.height, 1))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.9)
  } finally { URL.revokeObjectURL(url) }
}

/** The poster as a canvas (A4 portrait). */
export async function renderPoster(p: Poster): Promise<HTMLCanvasElement> {
  try {
    await Promise.all([
      document.fonts.load(`800 100px ${DISPLAY}`), document.fonts.load(`700 100px ${DISPLAY}`),
      document.fonts.load(`500 40px ${BODY}`), document.fonts.load(`700 40px ${BODY}`),
    ])
  } catch { /* fallback fonts are fine */ }
  const qr = document.createElement('canvas')
  let qrOk = false
  try {
    if (p.url) { await QRCode.toCanvas(qr, p.url, { margin: 0, width: 500, errorCorrectionLevel: 'M' }); qrOk = true }
  } catch { /* poster without a code */ }
  const logo = await loadLogo(p.sponsorLogo)
  const canvas = document.createElement('canvas')
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')!
  // Content that is too tall is drawn smaller until the card ends above the QR band.
  const limit = BAND_TOP - 30
  let scale = 1
  for (; scale > 0.55; scale -= 0.05) {
    ctx.clearRect(0, 0, POSTER_W, POSTER_H)
    background(ctx, p)
    if (drawTop(ctx, p, scale, logo) <= limit) break
  }
  drawBand(ctx, p, qrOk ? qr : null)
  return canvas
}

export const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'))
