import { expect, test, type Page } from '@playwright/test'

async function openDocTab(page: Page) {
  await page.goto('/')
  await page.getByRole('tab', { name: /^文档/ }).click()
}

async function downloadTask(page: Page, expectFilename: string, timeout = 180_000): Promise<Buffer> {
  const downloadBtn = page.getByRole('button', { name: '下载', exact: true }).first()
  await expect(downloadBtn).toBeVisible({ timeout })
  const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()])
  expect(download.suggestedFilename()).toBe(expectFilename)
  const path = await download.path()
  expect(path).toBeTruthy()
  const { readFileSync } = await import('node:fs')
  return readFileSync(path!)
}

async function sampleDocx(page: Page): Promise<Buffer> {
  const res = await page.request.get('/fixtures/sample.docx')
  expect(res.ok()).toBeTruthy()
  return Buffer.from(await res.body())
}

test.describe('doc module (M4)', () => {
  test.describe.configure({ mode: 'serial' })
  let fixture: Buffer

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    fixture = await sampleDocx(page)
    await page.close()
    expect(fixture.byteLength).toBeGreaterThan(100)
  })

  test('docx -> pdf converts and downloads a real PDF', async ({ page }) => {
    await openDocTab(page)
    await page.setInputFiles('input[type=file]', {
      name: 'report.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: fixture,
    })
    const pdf = await downloadTask(page, 'report.pdf')
    expect(pdf.byteLength).toBeGreaterThan(500)
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })

  test('docx -> txt conversion', async ({ page }) => {
    await openDocTab(page)
    await page.locator('.setting select').selectOption('txt')
    await page.setInputFiles('input[type=file]', {
      name: 'report.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: fixture,
    })
    const txt = await downloadTask(page, 'report.txt')
    expect(txt.byteLength).toBeGreaterThan(0)
  })

  test('incompatible input -> output combo surfaces a friendly error', async ({ page }) => {
    await openDocTab(page)
    // .docx is a text document: xlsx/csv/pptx outputs are rejected before any engine work.
    await page.locator('.setting select').selectOption('csv')
    await page.setInputFiles('input[type=file]', {
      name: 'report.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: fixture,
    })
    await expect(page.locator('.task-card.task-error')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.task-error-msg')).toContainText('暂不支持 .docx → .csv')
  })

  test('unsupported input extension surfaces an error', async ({ page }) => {
    await openDocTab(page)
    await page.setInputFiles('input[type=file]', {
      name: 'mystery.xyz',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('not a document'),
    })
    await expect(page.locator('.task-card.task-error')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.task-error-msg')).toContainText('暂不支持的输入格式')
  })
})
