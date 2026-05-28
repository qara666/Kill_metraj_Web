# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ttl_visualization.spec.ts >> TTL badge appears in route group header
- Location: tests/e2e/ttl_visualization.spec.ts:3:5

# Error details

```
TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('.ttl-badge').first() to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - img [ref=e7]
    - heading "Вход в" [level=1] [ref=e9]
    - paragraph [ref=e10]: K_M - Система управления маршрутами
  - generic [ref=e11]:
    - generic [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]: Имя пользователя
        - generic [ref=e15]:
          - generic:
            - img
          - textbox "Имя пользователя" [ref=e16]:
            - /placeholder: Введите имя пользователя
      - generic [ref=e17]:
        - generic [ref=e18]: Пароль
        - generic [ref=e19]:
          - generic:
            - img
          - textbox "Пароль" [ref=e20]:
            - /placeholder: Введите пароль
      - button "Войти" [ref=e21] [cursor=pointer]
    - paragraph [ref=e23]: Для восстановления доступа обратитесь к администратору
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test('TTL badge appears in route group header', async ({ page }) => {
  4  |   const baseURL = process.env.FRONTEND_BASE_URL || 'http://localhost:10000'
  5  |   await page.goto(baseURL, { waitUntil: 'networkidle' })
  6  |   const badge = page.locator('.ttl-badge').first()
> 7  |   await badge.waitFor({ timeout: 20000 })
     |               ^ TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
  8  |   await expect(badge).toBeVisible()
  9  |   const text = await badge.textContent()
  10 |   expect(text).toContain('TTL')
  11 | 
  12 |   // Optional: trigger a route calculation if a button is present
  13 |   const calcBtn = page.locator('button', { hasText: /^В МАРШРУТ$/i })
  14 |   if (await calcBtn.count() > 0) {
  15 |     await calcBtn.first().click()
  16 |     // wait for potential UI update after calculation
  17 |     await page.waitForTimeout(1500)
  18 |     // ensure TTL badge still visible after recalculation
  19 |     await badge.waitFor({ timeout: 20000 })
  20 |   }
  21 | })
  22 | 
```