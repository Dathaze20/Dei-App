// v0.1.7: Camera last in the navigation, Clear count with Undo, the assistant operating the real
// draft order (local commands, no AI model), the store's own ordering profile, backups, speech
// fallback, and no network traffic for any of it.
import { Page, expect, test } from '@playwright/test';
import { REAL, dumpStorage, exportViaUi, seed } from './helpers';
import { expectTargets, openPhone, overflowing } from './layout';

const order = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('inventory_currentOrder')!).items as { productId: string; quantity: number; unit?: string }[]);
const EMPTY = JSON.stringify({ items: [], createdAt: '2026-10-21T08:00:00.000Z' });
const ARIZONA = JSON.stringify({ favorites: [], recent: [], lastSupplier: 'sup6', mode: 'order', density: 'comfortable' });

const openAssistant = async (page: Page) => {
  await page.getByTestId('assistant-button').click();
  await expect(page.getByTestId('assistant-sheet')).toBeVisible();
};
const say = async (page: Page, text: string) => {
  await page.getByTestId('assistant-input').fill(text);
  await page.getByTestId('assistant-send').click();
};

test.describe('navigation and Clear count', () => {
  test('Camera is last: Counter | Orders | Catalog | Camera', async ({ page }) => {
    await seed(page, REAL, '/counter');
    await expect(page.getByTestId('counter-nav').getByRole('link')).toHaveText([/^Counter$/, /^\d*Orders$/, /^Catalog$/, /^\d*Camera$/]);
    await page.getByTestId('nav-camera').click();
    await expect(page).toHaveURL(/#\/counter\/shelf$/);
  });

  test('Clear count: confirm, the product is Not counted (not 0), Undo brings it back, a restart keeps it cleared', async ({ page }) => {
    await seed(page, { ...REAL, deliordernyc_sys_prefs: ARIZONA.replace('order', 'count') }, '/counter');
    const row = page.getByTestId('counter-row').filter({ hasText: 'Caution Low-Carb' });
    await row.getByTestId('row-count').click();
    await page.getByTestId('count-keypad').getByRole('button', { name: '3', exact: true }).click();
    await page.getByTestId('count-sheet').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(row).toContainText('3');

    await row.getByTestId('row-picture').click();
    await page.getByTestId('product-sheet').getByTestId('clear-count').click();
    await expect(page.getByTestId('confirm-sheet')).toContainText('That is not 0');
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Clear count' }).click();
    await expect(page.getByTestId('product-sheet')).toContainText(/Not counted/i);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('product-sheet')).toContainText('3');

    await page.getByTestId('product-sheet').getByTestId('clear-count').click();
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Clear count' }).click();
    const counts = JSON.parse((await dumpStorage(page)).inventory_stockCounts);
    expect(counts.products.az_rx_lowcarb_slim11_5.counts).toEqual([]);
    expect(counts.products.az_rx_lowcarb_slim11_5.cleared[0].counts[0].units).toBe(3);
    await page.reload();
    await expect(page.getByTestId('counter-row').filter({ hasText: 'Caution Low-Carb' })).toContainText(/Not counted/i);
  });
});

test.describe('the assistant operates the real draft order', () => {
  test('acceptance: two Green Tea + one Fruit Punch → asks the size → real draft changes → corrections → survives a restart; no network', async ({ page }) => {
    const external: string[] = [];
    page.on('request', r => {
      if (!r.url().startsWith('http://localhost')) external.push(r.url());
    });
    await seed(page, { ...REAL, inventory_currentOrder: EMPTY, deliordernyc_sys_prefs: ARIZONA }, '/counter');
    await openAssistant(page);
    await expect(page.getByTestId('assistant-mode')).toHaveText(/Local commands · no AI model/);

    await say(page, 'Put two cases of Arizona Green Tea and one Fruit Punch on my list.');
    await expect(page.getByTestId('assistant-choice').first()).toBeVisible();
    expect(await order(page)).toEqual([]);
    await page.getByTestId('assistant-choice').filter({ hasText: '16 oz. Bottle' }).click();
    await expect(page.getByTestId('assistant-changes').last()).toContainText('Arizona Green Tea 16 oz. Bottle');
    expect(await order(page)).toEqual([{ productId: 'az_gt_bot16', quantity: 2 }, { productId: 'az_fruitpunch_can23', quantity: 1 }]);

    await say(page, 'Remove Fruit Punch');
    await say(page, 'Make Green Tea three instead');
    await expect(page.getByTestId('assistant-changes').last()).toContainText('2 → 3');
    expect(await order(page)).toEqual([{ productId: 'az_gt_bot16', quantity: 3 }]);

    // The Counter screen shows the same draft (one order, not a copy).
    await page.getByRole('button', { name: /^Close/ }).first().click();
    await expect(page.getByTestId('order-tray')).toContainText('1 lines · 3 case(s)');
    await page.reload();
    expect(await order(page)).toEqual([{ productId: 'az_gt_bot16', quantity: 3 }]);
    await openAssistant(page);
    await expect(page.getByTestId('assistant-user').first()).toContainText('Put two cases');
    expect(external).toEqual([]);
  });

  test('Undo in the conversation; a repeated tap does nothing twice', async ({ page }) => {
    await seed(page, { ...REAL, inventory_currentOrder: EMPTY, deliordernyc_sys_prefs: ARIZONA }, '/counter');
    await openAssistant(page);
    await say(page, 'add 2 diet pepsi');
    await expect(page.getByTestId('assistant-undo')).toBeVisible();
    await page.getByTestId('assistant-undo').click();
    expect(await order(page)).toEqual([]);
    await expect(page.getByTestId('assistant-undo')).toHaveCount(0);
  });

  test('never sends; does not pretend to see photos; says when it does not understand', async ({ page }) => {
    await seed(page, { ...REAL, deliordernyc_sys_prefs: ARIZONA }, '/counter');
    const before = await order(page);
    await openAssistant(page);
    await say(page, 'send the Arizona order');
    await expect(page.getByTestId('assistant-reply').last()).toContainText('I never send or share orders');
    await say(page, 'look at the refrigerator photo I just took');
    await expect(page.getByTestId('assistant-reply').last()).toContainText('nothing in your photos has been analysed');
    await say(page, 'tell me a joke');
    await expect(page.getByTestId('assistant-reply').last()).toContainText('not an AI model');
    expect(await order(page)).toEqual(before);
    await expect(page.getByTestId('share-sheet')).toHaveCount(0);
  });

  test('speech: where the browser has no speech service it says so, and typing still works', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    });
    await seed(page, { ...REAL, deliordernyc_sys_prefs: ARIZONA }, '/counter');
    await openAssistant(page);
    await page.getByTestId('assistant-mic').click();
    await expect(page.getByTestId('assistant-speech-note')).toHaveText(/Speaking is not available/);
    await expect(page.getByTestId('assistant-listening')).toHaveCount(0);
    await say(page, 'show my order');
    await expect(page.getByTestId('assistant-order')).toBeVisible();
  });
});

test.describe("the store's own ordering knowledge", () => {
  test('taught in conversation (confirmed), shown with its source, editable in Store ordering, used for a labelled suggestion, in the backup', async ({ page }) => {
    await seed(page, { ...REAL, inventory_currentOrder: EMPTY, deliordernyc_sys_prefs: ARIZONA }, '/counter');
    await openAssistant(page);
    await say(page, 'We usually take eight cases of Green Tea every Tuesday');
    await page.getByTestId('assistant-choice').filter({ hasText: '16 oz. Bottle' }).click();
    await expect(page.getByTestId('assistant-confirm').last()).toContainText('your estimate');
    expect((await dumpStorage(page)).inventory_storeProfile).toBeUndefined();
    await page.getByTestId('assistant-yes').last().click();
    const profile = JSON.parse((await dumpStorage(page)).inventory_storeProfile);
    expect(profile.products.az_gt_bot16.weeklyCases).toMatchObject({ value: 8, source: 'owner-estimate' });
    expect(profile.suppliers.sup6.deliveryDays.value).toEqual([2]);

    await say(page, "What do we need for tomorrow's Arizona delivery?");
    await expect(page.getByTestId('assistant-proposal')).toContainText('your estimate');
    await expect(page.getByTestId('assistant-proposal')).toContainText('Stock was not counted');
    expect(await order(page)).toEqual([]);
    await page.getByTestId('assistant-yes').last().click();
    expect(await order(page)).toEqual([{ productId: 'az_gt_bot16', quantity: 8 }]);

    // Editable outside the chat.
    await page.getByRole('button', { name: /^Close/ }).first().click();
    await page.goto(page.url().split('#')[0] + '#/counter/store');
    const weekly = page.getByTestId('store-product').filter({ hasText: '16 oz. Bottle' }).getByTestId('store-weekly');
    await expect(weekly).toHaveValue('8');
    await weekly.fill('6');
    await weekly.blur();
    await expect(page.getByTestId('store-product').filter({ hasText: '16 oz. Bottle' })).toContainText('your estimate');
    await page.reload();
    await expect(page.getByTestId('store-product').filter({ hasText: '16 oz. Bottle' }).getByTestId('store-weekly')).toHaveValue('6');

    // Backed up like the rest of the deli data; the conversation is not.
    const backup = JSON.parse(await exportViaUi(page));
    const keys = Object.keys(backup.data ?? backup.raw ?? backup);
    expect(JSON.stringify(backup)).toContain('inventory_storeProfile');
    expect(JSON.stringify(backup)).not.toContain('deliordernyc_sys_assistant');
    expect(keys.length).toBeGreaterThan(0);
  });
});

test.describe('assistant layout on the phone', () => {
  for (const [width, text, lang] of [[320, 200, 'en'], [360, 160, 'es'], [412, 130, 'ar']] as const) {
    test(`${width}px, text ${text}%, ${lang}: the sheet fits, its buttons are 44px, nothing spills sideways`, async ({ browser }) => {
      const phone = await openPhone(browser, { width, text, lang, storage: { deliordernyc_sys_prefs: ARIZONA } }, '/counter');
      const { page } = phone;
      await expectTargets(page, '[data-testid="assistant-button"]');
      await page.getByTestId('assistant-button').click();
      await page.getByTestId('assistant-input').fill('add two cases of arizona green tea');
      await page.getByTestId('assistant-send').click();
      await expect(page.getByTestId('assistant-choice').first()).toBeVisible();
      expect(await overflowing(page)).toEqual([]);
      await expectTargets(page, '[data-testid="assistant-choice"], [data-testid="assistant-mic"], [data-testid="assistant-send"]');
      expect(phone.errors).toEqual([]);
      await phone.close();
    });
  }
});
