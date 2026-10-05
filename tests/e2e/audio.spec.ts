import { expect, test, type Page } from '@playwright/test'

/** Builds a 0.5 s 440 Hz mono 16-bit PCM WAV file in Node. */
function makeWav(seconds = 0.5, sampleRate = 44100, freq = 440): Buffer {
  const numSamples = Math.floor(seconds * sampleRate)
  const dataSize = numSamples * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < numSamples; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 32000), 44 + i * 2)
  }
  return buf
}

async function downloadTask(page: Page, expectFilename: string): Promise<Buffer> {
  const downloadBtn = page.getByRole('button', { name: '下载', exact: true }).first()
  await expect(downloadBtn).toBeVisible({ timeout: 90_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()])
  expect(download.suggestedFilename()).toBe(expectFilename)
  const path = await download.path()
  expect(path).toBeTruthy()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = await import('node:fs')
  return readFileSync(path!)
}

test.describe('audio module (M2)', () => {
  test('wav -> mp3 conversion', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type=file]', {
      name: 'sine.wav',
      mimeType: 'audio/wav',
      buffer: makeWav(),
    })
    const mp3 = await downloadTask(page, 'sine.mp3')
    expect(mp3.byteLength).toBeGreaterThan(500)
    // MP3 frames start with 0xFF 0xEx/0xFx sync or an ID3 tag.
    const isMp3 =
      mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33 /* ID3 */ || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0)
    expect(isMp3).toBe(true)
  })

  test('wav -> flac with format selector', async ({ page }) => {
    await page.goto('/')
    await page.locator('.setting select').first().selectOption('flac')
    await page.setInputFiles('input[type=file]', {
      name: 'sine.wav',
      mimeType: 'audio/wav',
      buffer: makeWav(),
    })
    const flac = await downloadTask(page, 'sine.flac')
    expect(flac.subarray(0, 4).toString('ascii')).toBe('fLaC')
  })

  test('unsupported input surfaces an error', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type=file]', {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not audio'),
    })
    await expect(page.locator('.task-card.task-error')).toBeVisible({ timeout: 90_000 })
    await expect(page.locator('.task-error-msg')).toContainText('ffmpeg')
  })
})
