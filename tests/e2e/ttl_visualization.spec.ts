import { test, expect } from '@playwright/test'

test('TTL badge appears in route group header', async ({ page }) => {
  const baseURL = process.env.FRONTEND_BASE_URL || 'http://localhost:10000'
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  const badge = page.locator('.ttl-badge').first()
  await badge.waitFor({ timeout: 20000 })
  await expect(badge).toBeVisible()
  const text = await badge.textContent()
  // TTL could be 'TTL <time>' or 'TTL pending' depending on data readiness
  if (!text || (!text.includes('TTL') && !text.includes('TTL pending'))) {
    throw new Error(`Unexpected TTL badge text: ${text}`)
  }

  // Optional: trigger a route calculation if a button is present
  const calcBtn = page.locator('button', { hasText: /^В МАРШРУТ$/i })
  if (await calcBtn.count() > 0) {
    await calcBtn.first().click()
    // wait for potential UI update after calculation
    await page.waitForTimeout(1500)
    // ensure TTL badge still visible after recalculation
    await badge.waitFor({ timeout: 20000 })
  }
})
