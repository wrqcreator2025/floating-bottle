import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error(msg.text());
});
page.on('pageerror', (e) => console.error(e));
await page.goto(process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:5174');
await page.locator('#loading').waitFor({ state: 'hidden' });
await page.waitForTimeout(500);
await page.screenshot({ path: '../前端实测-24-简化海面-定稿.png' });
await page.locator('#navigation [data-action="island"]').click();
await page.waitForTimeout(1400);
await page.locator('#navigation [data-action="room"]').click();
await page.waitForTimeout(1400);
await page.screenshot({ path: '../前端实测-25-柜子与窗外天空-定稿.png' });
await page.locator('#navigation [data-action="diary"]').click();
await page.waitForTimeout(1400);
await page.evaluate(() => {
  document.querySelector('#sheet')?.close();
  document.body.classList.remove('reading');
});
await page.waitForTimeout(600);
await page.screenshot({ path: '../前端实测-26-书本开合修复-定稿.png' });
await page.locator('.brand').click();
await page.locator('#navigation [data-action="write"]').click();
await page.waitForTimeout(460);
await page.screenshot({ path: '../前端实测-27-拾起瓶子过程-定稿.png' });
await page.locator('[data-action="uncork"]').waitFor();
await page.waitForTimeout(160);
await page.screenshot({ path: '../前端实测-28-拾起后开瓶-定稿.png' });
await browser.close();
