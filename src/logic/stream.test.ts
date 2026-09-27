import { describe, expect, it } from 'vitest'
import { streamEmbed } from './stream'

describe('streamEmbed', () => {
  it('turns YouTube links into the player', () => {
    for (const link of ['https://www.youtube.com/watch?v=abcDEF12345', 'https://youtu.be/abcDEF12345', 'youtube.com/live/abcDEF12345?si=x', 'https://m.youtube.com/watch?v=abcDEF12345&t=3']) {
      expect(streamEmbed(link, 'x')).toBe('https://www.youtube.com/embed/abcDEF12345?autoplay=1&mute=1&playsinline=1')
    }
  })
  it('supports Facebook and Twitch', () => {
    expect(streamEmbed('https://www.facebook.com/klub/videos/123/', 'x')).toContain('facebook.com/plugins/video.php?href=')
    expect(streamEmbed('https://twitch.tv/klub', 'sportlivearena.com')).toBe('https://player.twitch.tv/?channel=klub&parent=sportlivearena.com&muted=true')
  })
  it('rejects anything else', () => {
    expect(streamEmbed('https://example.com/video', 'x')).toBeNull()
    expect(streamEmbed('', 'x')).toBeNull()
    expect(streamEmbed('https://www.youtube.com/channel/UCx', 'x')).toBeNull()
  })
})
