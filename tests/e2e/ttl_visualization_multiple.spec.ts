import { test, expect } from '@playwright/test'

test('Multiple groups TTL presence', async ({ page }) => {
  const baseURL = process.env.FRONTEND_BASE_URL || 'http://localhost:10000'
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  // Expect at least one TTL badge in the first group header
  const badge = page.locator('.ttl-badge').first()
  await badge.waitFor({ timeout: 20000 })
  await expect(badge).toBeVisible()
  // Optional: try to click a calculate on first group if available
  const calcBtn = page.locator('button', { hasText: /^В МАРШРУТ$/i })
  if (await calcBtn.count() > 0) {
    await calcBtn.first().click()
    await page.waitForTimeout(1500)
  }
})
