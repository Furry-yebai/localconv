import { expect, test } from '@playwright/test'

test('ffmpeg core supports lavfi testsrc (fixture bootstrap)', async ({ page }) => {
  await page.goto('/?e2e=1')
  const res = await page.evaluate(async () => {
    const eng = window.__e2e
    if (!eng) return { ok: false, err: 'no hook' }
    try {
      const data = await eng.runFFmpeg({
        inputs: [],
        args: [
          '-f',
          'lavfi',
          '-i',
          'testsrc2=duration=1:size=128x72:rate=10',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          'out.mp4',
        ],
        output: 'out.mp4',
      })
      return { ok: true, size: data.byteLength }
    } catch (e) {
      return { ok: false, err: e instanceof Error ? e.message : String(e) }
    }
  })
  console.log('[lavfi check]', JSON.stringify(res))
  expect(res.ok, res.err).toBe(true)
})
