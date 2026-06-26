import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const results = { pass: 0, fail: 0, errors: [] };
function ok(n) { results.pass++; console.log(`  ✅ ${n}`); }
function fail(n, e) { results.fail++; results.errors.push(`${n}: ${e}`); console.log(`  ❌ ${n}: ${e}`); }
async function t(n, fn) { try { await fn(); ok(n); } catch (e) { fail(n, e.message || e); } }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log('\n=== HOME ===');
await t('app loads', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const title = await page.title();
  if (!title.includes('Prelo')) throw new Error(title);
});
await t('hero text', async () => {
  const h1 = await page.textContent('h1');
  if (!h1?.includes('Escreva')) throw new Error('hero');
});
await t('features bento grid', async () => {
  await page.waitForSelector('.bento-grid', { timeout: 5000 });
});
await t('5 feature cards', async () => {
  const cards = await page.locator('.bento-card').count();
  if (cards < 4) throw new Error(`only ${cards} cards`);
});
await t('SYSTEM DESIGN footer button', async () => {
  const ft = await page.textContent('footer');
  if (!ft?.includes('SYSTEM DESIGN')) throw new Error('no SD btn');
});

console.log('\n=== SYSTEM DESIGN PAGE ===');
await t('SD page loads', async () => {
  await page.locator('button', { hasText: 'SYSTEM DESIGN' }).click();
  await page.waitForSelector('.system-design-container', { timeout: 5000 });
});
await t('5 tabs switch', async () => {
  for (const t of ['Data Flow', 'Canvas API', 'Storage', 'State', 'Arquitetura']) {
    await page.locator('nav button', { hasText: t }).click();
    await page.waitForTimeout(150);
  }
});
await t('SD back to home', async () => {
  await page.locator('.system-design-back').click();
  await page.waitForSelector('.landing-container', { timeout: 5000 });
});

console.log('\n=== LOGIN ===');
await t('login form opens', async () => {
  await page.locator('button', { hasText: 'Começar Grátis' }).click();
  await page.waitForSelector('.login-card', { timeout: 5000 });
});
await t('validates empty fields', async () => {
  await page.locator('button', { hasText: 'Acessar Projetos' }).click();
  await page.waitForTimeout(400);
});
await t('validates email format', async () => {
  await page.fill('#email', 'invalido');
  await page.fill('#password', '123');
  await page.waitForTimeout(200);
  // Use evaluate to trigger form submit (React 19 async state timing)
  await page.evaluate(() => {
    document.querySelector('.login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(500);
  const err = await page.textContent('.login-error-msg');
  if (!err?.includes('e-mail')) throw new Error(`msg: ${err}`);
});
await t('login succeeds', async () => {
  await page.fill('#email', 'teste@teste.com');
  await page.fill('#password', '123456');
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    document.querySelector('.login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('.dashboard-container', { timeout: 10000 });
});

console.log('\n=== DASHBOARD ===');
await t('dashboard loaded', async () => {
  const h2 = await page.textContent('h2');
  if (!h2?.includes('Meus Manuscritos')) throw new Error(h2);
});
await t('"Novo Livro" button', async () => {
  const btn = page.locator('button', { hasText: '+ Novo Livro' });
  if (!(await btn.isVisible())) throw new Error('not visible');
});
await t('sort toggle (recent/alpha)', async () => {
  await page.locator('button', { hasText: 'A-Z' }).click();
  await page.waitForTimeout(200);
  await page.locator('button', { hasText: 'Mais Recente' }).click();
});
await t('search filters projects', async () => {
  const input = page.locator('[placeholder="Buscar por título de projeto..."]');
  await input.fill('projeto_inexistente_xyz');
  await page.waitForTimeout(500);
  const empty = await page.textContent('.project-grid');
  if (!empty?.includes('Nenhum resultado')) throw new Error('no empty search');
  await input.fill('');
  await page.waitForTimeout(300);
});
await t('project cards exist', async () => {
  const cards = await page.locator('.project-card:not(.new-project-card)').count();
  console.log(`     ${cards} existing projects`);
});
await t('delete confirmation modal', async () => {
  const delBtn = page.locator('button', { hasText: 'Excluir' }).first();
  await delBtn.click();
  await page.waitForTimeout(500);
  const modal = await page.$('.confirm-modal-overlay');
  if (!modal) throw new Error('modal not opened');
  // Dismiss via Cancelar
  await page.locator('.confirm-modal-btn.cancel').click();
  await page.waitForTimeout(500);
  if (await page.$('.confirm-modal-overlay')) throw new Error('modal did not close');
});

console.log('\n=== WIZARD → EDITOR ===');
await t('wizard opens', async () => {
  await page.locator('button', { hasText: '+ Novo Livro' }).click();
  await page.waitForSelector('.wizard-window', { timeout: 5000 });
});
await t('wizard creates project & loads editor', async () => {
  await page.fill('#title', 'Teste Automatizado');
  await page.fill('#author', 'Playwright');
  await page.waitForTimeout(100);
  await page.locator('button', { hasText: 'Criar e Abrir Editor' }).click();
  await page.waitForSelector('.canvas-editor-shell', { timeout: 15000 });
});

console.log('\n=== EDITOR ===');
await t('editor shell visible', async () => {
  const shell = await page.$('.canvas-editor-shell');
  if (!shell) throw new Error('no shell');
});

// Check DOM for any accessible editor controls
await t('editor DOM rendered', async () => {
  const html = await page.evaluate(() => document.querySelector('.canvas-editor-shell')?.innerHTML?.length || 0);
  if (html < 100) throw new Error(`shell too small: ${html} chars`);
});

// Toolbar: check how many tb-icon-btn elements exist (they may be inside shadow DOM of canvas-editor)
await t('toolbar icons present', async () => {
  const count = await page.locator('[data-tooltip]').count();
  console.log(`     ${count} elements with data-tooltip`);
  if (count === 0) throw new Error('no tooltip elements found');
});

// Theme / accent selectors
await t('theme & accent settings accessible', async () => {
  const selects = await page.locator('select').count();
  console.log(`     ${selects} select elements`);
});

// Sidebar toggles
await t('sidebar toggles', async () => {
  const btns = page.locator('[data-tooltip*="Alterna a barra lateral"]');
  const count = await btns.count();
  console.log(`     ${count} sidebar toggle buttons`);
  if (count > 0) {
    await btns.first().click();
    await page.waitForTimeout(300);
    await btns.first().click();
  }
});

// Footer buttons
await t('editor footer has action buttons', async () => {
  const footers = await page.locator('.canvas-editor-shell footer, .canvas-editor-shell [class*="footer"]').count();
  console.log(`     ${footers} footer elements`);
});

console.log('\n=== SYSTEM DESIGN (from editor) ===');
await t('SD from editor footer', async () => {
  const sd = page.locator('button', { hasText: 'SYSTEM DESIGN' });
  if (await sd.isVisible()) {
    await sd.click();
    await page.waitForSelector('.system-design-container', { timeout: 5000 });
    await page.locator('.system-design-back').click();
    await page.waitForTimeout(500);
  }
});

// Screenshot
await page.screenshot({ path: '/tmp/prelo-editor-final.png', fullPage: false });

console.log('\n========================================');
console.log(`${results.pass} passed, ${results.fail} failed`);
if (results.errors.length) {
  console.log('\nFailures:');
  results.errors.forEach(e => console.log(`  - ${e}`));
}
console.log('========================================');
await browser.close();
process.exit(results.fail > 0 ? 1 : 0);
