import { expect, test } from '@playwright/test'
import { unzipSync } from 'fflate'

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
  buf.writeUInt16LE(2, 22)
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

test('batch download zips multiple finished tasks', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', [
    { name: 'alpha.wav', mimeType: 'audio/wav', buffer: makeWav() },
    { name: 'beta.wav', mimeType: 'audio/wav', buffer: makeWav(0.4, 44100, 660) },
  ])

  const allBtn = page.getByRole('button', { name: /全部下载/ })
  await expect(allBtn).toBeVisible({ timeout: 120_000 })

  const [download] = await Promise.all([page.waitForEvent('download'), allBtn.click()])
  expect(download.suggestedFilename()).toBe('localconv-converted.zip')
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  const zipped = readFileSync(path!)

  const files = unzipSync(new Uint8Array(zipped))
  expect(Object.keys(files).sort()).toEqual(['alpha.mp3', 'beta.mp3'])
  for (const data of Object.values(files)) {
    expect(data.byteLength).toBeGreaterThan(500)
    const isMp3 = (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)
    expect(isMp3).toBe(true)
  }
})

test('zip button is hidden with a single finished task', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', {
    name: 'solo.wav',
    mimeType: 'audio/wav',
    buffer: makeWav(),
  })
  await expect(page.getByRole('button', { name: '下载', exact: true }).first()).toBeVisible({
    timeout: 90_000,
  })
  await expect(page.getByRole('button', { name: /全部下载/ })).toHaveCount(0)
})
