/**
 * Live video: the organiser streams from a phone to YouTube, Facebook or Twitch (free, for
 * any number of viewers) and pastes the link; the site shows that player next to the
 * results. Returns the address to embed, or null when the link is not one of these.
 */
export function streamEmbed(link: string | undefined, host = typeof location === 'undefined' ? '' : location.hostname): string | null {
  if (!link) return null
  let url: URL
  try {
    url = new URL(link.trim().startsWith('http') ? link.trim() : `https://${link.trim()}`)
  } catch {
    return null
  }
  const h = url.hostname.replace(/^(www|m)\./, '')
  // YouTube: watch?v=ID, youtu.be/ID, /live/ID, /shorts/ID, /embed/ID
  if (h === 'youtu.be') return youtube(url.pathname.split('/')[1])
  if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v')
    if (v) return youtube(v)
    const [, kind, id] = url.pathname.split('/')
    if (['live', 'shorts', 'embed'].includes(kind) && id) return youtube(id)
    return null
  }
  // Facebook live video (facebook.com/…/videos/…, fb.watch/…)
  if (h === 'facebook.com' || h === 'fb.watch') {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.toString())}&show_text=false`
  }
  // Twitch channel (twitch.tv/name); Twitch needs the page's own address as "parent".
  if (h === 'twitch.tv') {
    const channel = url.pathname.split('/')[1]
    return channel ? `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(host)}&muted=true` : null
  }
  return null
}

function youtube(id: string | undefined): string | null {
  return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1` : null
}
