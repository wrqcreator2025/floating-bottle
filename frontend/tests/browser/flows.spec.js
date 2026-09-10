import { test, expect } from '@playwright/test';
const saved = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('episode-island-v1')));
async function openBottle(page, kind = 'write') {
  if (kind === 'bottle') {
    const bounds = await page.locator('[data-action="bottle"]').boundingBox();
    await page.mouse.click(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
  } else await page.locator(`[data-action="${kind}"]`).first().click();
  await page.locator('[data-action="uncork"]').click();
  await expect(page.locator('#sheet')).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).not.toBeVisible();
});
test('3D 渲染、拒收后抛回海面且可继续接收', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('#scene canvas')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/no-webgl/);
  await openBottle(page, 'receive');
  await page.getByRole('button', { name: '这次不聊', exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).bottles[0].status)
    .toBe('declined');
  await expect(page.locator('#navigation')).not.toHaveAttribute('inert', '');
  await page.reload();
  await expect(page.locator('[data-action="receive"]').first()).toBeVisible();
  await expect(page.locator('[data-action="bottle"]')).toHaveCount(1);
  await page.locator('#navigation [data-action="receive"]').click();
  await expect(page.locator('[data-action="uncork"]')).toBeVisible();
  await page.locator('#navigation [data-action="home"]').click();
  await page.locator('#navigation [data-action="island"]').click();
  await expect(
    page.getByRole('button', { name: '远离小岛', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '远离小岛', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'home');
  expect(errors).toEqual([]);
});
test('连续抛出两只瓶子，日记独立保存、编辑和关闭接收', async ({ page }) => {
  for (const body of [
    '第一次找实习，不知道如何开始。',
    '新的选择：要不要读研。',
  ]) {
    await openBottle(page);
    await page.locator('#bottle-body').fill(body);
    await page.locator('#bottle-target').fill('亲自走过这段路的人');
    await page.locator('#write-form button[type=submit]').click();
    await expect(page.locator('#toast')).toHaveClass(/show/, {
      timeout: 12000,
    });
    await expect(page.locator('#navigation')).not.toHaveAttribute('inert', '');
  }
  expect((await saved(page)).bottles).toHaveLength(2);
  await page.locator('#navigation [data-action="island"]').click();
  await page.locator('#navigation [data-action="room"]').click();
  await page.locator('#navigation [data-action="diary"]').click();
  await page.locator('#experience-title').fill('找到了第一份实习');
  await page
    .locator('#experience-body')
    .fill('投递很久，也怀疑过自己，后来学着向别人介绍项目。');
  await page.locator('#confirmed').check();
  await page.locator('#receive-open').check();
  await page.locator('#diary-form button[type=submit]').click();
  await expect(page.locator('#diary-saved')).toContainText('保存');
  await page.locator('#receive-open').uncheck();
  await page.locator('#diary-form button[type=submit]').click();
  await page.reload();
  const state = await saved(page);
  expect(state.experiences).toHaveLength(1);
  expect(state.experiences[0].open).toBe(false);
  expect(state.bottles).toHaveLength(2);
});
test('接住示例并保存回应，可从柜中查看', async ({ page }) => {
  await openBottle(page, 'receive');
  await page
    .getByRole('button', { name: '我演过，接住这封信', exact: true })
    .click();
  await page
    .locator('#reply-body')
    .fill('当时我也害怕投递，后来我先整理了自己的小项目。');
  await page.locator('#reply-form button[type=submit]').click();
  await expect(page.locator('#toast')).toHaveClass(/show/, { timeout: 12000 });
  await page.locator('#navigation [data-action="island"]').click();
  await page.locator('#navigation [data-action="room"]').click();
  await page.locator('#navigation [data-action="cabinet"]').click();
  await page.locator('#navigation [data-action="records"]').click();
  await page.locator('.record').first().click();
  await expect(page.locator('.reply-saved')).toContainText('当时我也害怕投递');
});
test('从已发出瓶子查看回信、邀请并进入匿名聊天', async ({ page }) => {
  await openBottle(page);
  await page.locator('#bottle-body').fill('换方向以后，我不知道该从哪里开始。');
  await page.locator('#bottle-target').fill('曾经换过方向并走出来的人');
  await page.locator('#write-form button[type=submit]').click();
  await expect(page.locator('#navigation')).not.toHaveAttribute('inert', '');

  await page.locator('#navigation [data-action="island"]').click();
  await page.locator('#navigation [data-action="room"]').click();
  await page.locator('#navigation [data-action="cabinet"]').click();
  await page.locator('#navigation [data-action="records"]').click();
  await page.locator('[data-action="tab:sent"]').click();
  await page.locator('.record').first().click();
  await expect(page.locator('.connection-panel')).toContainText('相遇的人');
  await page.locator('.contact-card').first().click();
  await expect(page.locator('.received-letter')).toContainText('TA 寄回的信');
  await page.locator('[data-action="request-chat"]').click();
  await expect(page.locator('.demo-decision')).toContainText('回信者的选择');
  await page.locator('[data-action="demo-accept-chat"]').click();
  await page.locator('#chat-body').fill('谢谢你，我想再听听你当时怎么做的。');
  await page.locator('#chat-form button[type=submit]').click();
  await expect(page.locator('.message.me')).toContainText(
    '谢谢你，我想再听听你当时怎么做的。',
  );
});
