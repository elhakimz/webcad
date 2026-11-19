import { test, expect } from '@playwright/test';

test('check browser console for errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
      errors.push(msg.location() ? JSON.stringify(msg.location()) : '');
    }
  });
  page.on('pageerror', err => {
    errors.push(err.message);
    errors.push(err.stack || '');
  });

  await page.goto('/');
  await page.waitForTimeout(5000);

  console.log('Console errors found:', errors.length);
  for (const e of errors) {
    console.log('  -', e);
  }

  expect(errors).toEqual([]);
});
