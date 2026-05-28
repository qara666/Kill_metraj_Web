import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message, error.stack));
  page.on('response', response => {
    if (!response.ok()) console.log('NETWORK ERROR:', response.url(), response.status());
  });

  console.log('Navigating to the site...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'screenshot.png', fullPage: true });
  console.log('Done.');
  await browser.close();
})();
