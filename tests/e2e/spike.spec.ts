import { expect, test } from '@playwright/test'

async function openSpikePanel(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '诊断' }).click()
}

test.describe('M0 engine spikes', () => {
  test('page is cross-origin isolated (SharedArrayBuffer available)', async ({ page }) => {
    await openSpikePanel(page)
    expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true)
    await expect(page.getByText('M0 引擎验证面板')).toBeVisible()
  })

  test('ffmpeg loads from chunks and converts WAV to MP3', async ({ page }) => {
    await openSpikePanel(page)
    await page.getByRole('button', { name: /测试 ffmpeg/ }).click()
    await expect(page.getByText('[FFMPEG_OK]')).toBeVisible({ timeout: 180_000 })
    const err = page.getByText('[FFMPEG_FAIL]')
    await expect(err).toHaveCount(0)
  })

  test('LibreOffice loads from chunks and converts DOCX to PDF', async ({ page }) => {
    await openSpikePanel(page)
    await page.getByRole('button', { name: /测试 LibreOffice/ }).click()
    await expect(page.getByText('[LO_OK]')).toBeVisible({ timeout: 240_000 })
    const err = page.getByText('[LO_FAIL]')
    await expect(err).toHaveCount(0)
  })
})
