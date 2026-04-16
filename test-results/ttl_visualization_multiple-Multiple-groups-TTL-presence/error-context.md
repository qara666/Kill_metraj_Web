# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ttl_visualization_multiple.spec.ts >> Multiple groups TTL presence
- Location: tests/e2e/ttl_visualization_multiple.spec.ts:3:5

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
  3  | test('Multiple groups TTL presence', async ({ page }) => {
  4  |   const baseURL = process.env.FRONTEND_BASE_URL || 'http://localhost:10000'
  5  |   await page.goto(baseURL, { waitUntil: 'networkidle' })
  6  |   // Expect at least one TTL badge in the first group header
  7  |   const badge = page.locator('.ttl-badge').first()
> 8  |   await badge.waitFor({ timeout: 20000 })
     |               ^ TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
  9  |   await expect(badge).toBeVisible()
  10 |   // Optional: try to click a calculate on first group if available
  11 |   const calcBtn = page.locator('button', { hasText: /^В МАРШРУТ$/i })
  12 |   if (await calcBtn.count() > 0) {
  13 |     await calcBtn.first().click()
  14 |     await page.waitForTimeout(1500)
  15 |   }
  16 | })
  17 | 
```