import { expect, test } from '@playwright/test';
import { collectErrors, open, searchAndAdd, seed, visible } from './helpers';

test.describe('existing Arizona ordering workflow (must be unchanged)', () => {
  test('two Arizona RX cases total $77.98 and share by QR, Copy Text and SMS', async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page, {}); // a fresh device: the app creates its 141-product sample catalog
    for (const flavor of ['Caution Extreme Fruit Punch', 'Caution Extreme Performance']) await searchAndAdd(page, flavor);
    await open(page, '/order'); // the old address opens Orders
    await expect(page).toHaveURL(/#\/counter\/orders$/);
    await expect(page.getByText('$77.98').first()).toBeVisible();

    await visible(page).button('Share Arizona order').click();
    // The order QR code (react-qr-code renders its title inside the SVG).
    await expect(page.getByTestId('share-qr').locator('svg')).toBeVisible();
    await expect(visible(page).button('Copy Text')).toBeVisible();
    const sms = page.getByRole('link', { name: 'Send as Text' });
    await expect(sms).toHaveAttribute('href', /^sms:\?&body=/);
    const text = await page.locator('textarea[readonly]').first().inputValue();
    expect(text).toContain('Caution Extreme Fruit Punch');
    expect(text).toContain('Caution Extreme Performance');
    expect(text).toContain('77.98');
    expect(errors).toEqual([]);
  });

  test('Arabic still renders right-to-left, including the new safety panels', async ({ page }) => {
    await seed(page, { language: 'ar' }, '/manage');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(visible(page).button('تصدير بياناتي')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'الاستعادة من نسخة احتياطية' })).toBeVisible();
  });

  test('Spanish shows the new safety panels in Spanish', async ({ page }) => {
    await seed(page, { language: 'es' }, '/manage');
    await expect(page.getByRole('heading', { name: 'Restaurar desde Copia de Seguridad' })).toBeVisible();
  });
});
