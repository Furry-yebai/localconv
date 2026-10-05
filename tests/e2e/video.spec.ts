import { expect, test, type Page } from '@playwright/test'

/**
 * Bootstraps a 1-second 128x72 H.264+AAC MP4 fixture through the wasm
 * engine itself (lavfi testsrc2 + sine), avoiding binary fixtures in git.
 */
async function makeSampleMp4(page: Page): Promise<Buffer> {
  await page.goto('/?e2e=1')
  const b64 = await page.evaluate(async () => {
    const eng = window.__e2e
    if (!eng) throw new Error('e2e hook missing')
    const data = await eng.runFFmpeg({
      inputs: [],
      args: [
        '-f',
        'lavfi',
        '-i',
        'testsrc2=duration=1:size=128x72:rate=10',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1',
        '-shortest',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        'out.mp4',
      ],
      output: 'out.mp4',
    })
    let s = ''
    const chunk = 0x8000
    for (let i = 0; i < data.length; i += chunk) {
      s += String.fromCharCode(...data.subarray(i, i + chunk))
    }
    return btoa(s)
  })
  return Buffer.from(b64, 'base64')
}

async function openVideoTab(page: Page) {
  await page.goto('/')
  await page.getByRole('tab', { name: /^视频/ }).click()
}

async function convertAndDownload(page: Page, fixture: Buffer, expectExt: string): Promise<Buffer> {
  await page.setInputFiles('input[type=file]', {
    name: 'sample.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  })
  const downloadBtn = page.getByRole('button', { name: '下载', exact: true }).first()
  await expect(downloadBtn).toBeVisible({ timeout: 120_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()])
  expect(download.suggestedFilename()).toBe(`sample.${expectExt}`)
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  return readFileSync(path!)
}

test.describe('video module (M3)', () => {
  test.describe.configure({ mode: 'serial' })
  let fixture: Buffer

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    fixture = await makeSampleMp4(page)
    await page.close()
    expect(fixture.byteLength).toBeGreaterThan(1000)
  })

  test('smart mp4(h264) -> webm falls back to VP8 re-encode', async ({ page }) => {
    await openVideoTab(page)
    await page.locator('.setting select').nth(1).selectOption('webm')
    const out = await convertAndDownload(page, fixture, 'webm')
    expect(out.byteLength).toBeGreaterThan(500)
    expect([...out.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]) // EBML
  })

  test('remux mp4 -> mkv without re-encoding', async ({ page }) => {
    await openVideoTab(page)
    await page.getByRole('combobox', { name: '转换方式' }).selectOption('remux')
    await page.locator('.setting select').nth(1).selectOption('mkv')
    const out = await convertAndDownload(page, fixture, 'mkv')
    expect(out.byteLength).toBeGreaterThan(500)
    expect(out[0]).toBe(0x1a)
    expect(out[1]).toBe(0x45)
    expect(out[2]).toBe(0xdf)
    expect(out[3]).toBe(0xa3)
  })

  test('remux to incompatible container fails with a helpful error', async ({ page }) => {
    await openVideoTab(page)
    await page.getByRole('combobox', { name: '转换方式' }).selectOption('remux')
    await page.locator('.setting select').nth(1).selectOption('webm')
    await page.setInputFiles('input[type=file]', {
      name: 'sample.mp4',
      mimeType: 'video/mp4',
      buffer: fixture,
    })
    await expect(page.locator('.task-card.task-error')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.task-error-msg')).toContainText('无法在不重编码')
  })

  test('extract audio track as mp3', async ({ page }) => {
    await openVideoTab(page)
    await page.getByRole('combobox', { name: '转换方式' }).selectOption('audio')
    const out = await convertAndDownload(page, fixture, 'mp3')
    expect(out.byteLength).toBeGreaterThan(500)
    const isMp3 =
      (out[0] === 0x49 && out[1] === 0x44 && out[2] === 0x33) || (out[0] === 0xff && (out[1] & 0xe0) === 0xe0)
    expect(isMp3).toBe(true)
  })

  test('compress re-encode to mp4', async ({ page }) => {
    await openVideoTab(page)
    await page.getByRole('combobox', { name: '转换方式' }).selectOption('compress')
    await page.getByRole('combobox', { name: '体积目标' }).selectOption('small')
    const out = await convertAndDownload(page, fixture, 'mp4')
    expect(out.byteLength).toBeGreaterThan(500)
    // ftyp box at offset 4
    expect(out.subarray(4, 8).toString('ascii')).toBe('ftyp')
  })
})
