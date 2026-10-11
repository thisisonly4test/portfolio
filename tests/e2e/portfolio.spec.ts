import { expect, test } from '@playwright/test';

// Le rendu WebGL logiciel des navigateurs de test est très lent : sauf dans
// le test dédié, on désactive la scène 3D comme le ferait un visiteur.
test.beforeEach(async ({ page }, info) => {
  if (!info.title.includes('[3d]')) await page.addInitScript(() => localStorage.setItem('aurele:world', 'off'));
});

test('[3d] la scène se charge, suit le défilement, et peut être désactivée', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Un seul rendu WebGL suffit');
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?intro=skip');
  await expect(page.locator('html')).toHaveClass(/has-world/, { timeout: 60_000 });
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await expect(page.locator('html')).toHaveAttribute('data-hop', '6', { timeout: 30_000 });
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Désactiver la 3D' }).click();
  await expect(page.locator('html')).toHaveClass(/no-world/);
  await expect(page.getByRole('button', { name: 'Activer la 3D' })).toBeVisible();
});

test.describe('intro', () => {
  test('démarrage, connexion, puis le site', async ({ page }) => {
    // Version complète à vitesse normale : le démarrage dure assez pour être observé.
    await page.goto('/?intro=full');
    await expect(page.locator('.boot-log')).toContainText('Linux version', { timeout: 5_000 });
    await expect(page.locator('.boot-log')).toContainText('nftables', { timeout: 8_000 });
    await expect(page.locator('.user')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.user')).toContainText('aurele');
    await page.locator('.user').click();
    await expect(page.locator('.pw-dots')).not.toBeEmpty();
    await expect(page.locator('.trace')).toContainText('wg0', { timeout: 8_000 });
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 8_000 });
    await expect(page.locator('.hero h1')).toBeVisible();
  });

  test('Entrée connecte depuis l’écran de connexion', async ({ page }) => {
    await page.goto('/?intro=fast');
    await expect(page.locator('.user')).toBeVisible({ timeout: 6_000 });
    await page.keyboard.press('Enter');
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 6_000 });
  });

  test('première visite : intro automatique, sans clic, en moins de 5 s', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.intro')).toBeVisible();
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator('.hero h1')).toBeVisible();
  });

  test('défiler pendant l’intro la passe aussitôt', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.locator('.intro')).toBeVisible();
    if (isMobile) await page.locator('.intro').tap();
    else await page.mouse.wheel(0, 400);
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 1_500 });
  });

  test('Échap passe l’intro, et elle ne revient pas', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.intro')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 3_000 });
    await page.reload();
    await page.waitForTimeout(400);
    await expect(page.locator('.intro')).toHaveCount(0);
  });

  test('le bouton Passer marche au toucher', async ({ page }) => {
    await page.goto('/');
    await page.locator('.intro-skip').click();
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 3_000 });
  });

  test('« Rejouer l’intro » la relance', async ({ page }) => {
    await page.goto('/?intro=skip');
    await page.getByRole('button', { name: 'Rejouer l’intro' }).click();
    await expect(page.locator('.intro')).toBeVisible();
  });
});

test.describe('site', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?intro=skip');
    await expect(page.locator('.hero h1')).toBeVisible();
  });

  test('aucune erreur et pas de défilement horizontal', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.reload();
    await page.waitForTimeout(1200);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('le paquet traverse chaque équipement au défilement', async ({ page }) => {
    const hops = [
      ['apropos', 'fw'],
      ['projets', 'web'],
      ['competences', 'core'],
      ['parcours', 'ad'],
      ['veille', 'siem'],
      ['contact', 'vpn'],
    ];
    for (const [id] of hops) {
      await page.locator(`#${id} h2`).scrollIntoViewIfNeeded();
      await expect(page.locator(`#${id} h2`)).toHaveClass(/in/);
    }
    // Arrivé en bas : le paquet est au dernier saut.
    await expect(page.locator('html')).toHaveAttribute('data-hop', '6');
  });

  test('l’empreinte du navigateur est repliée, puis s’affiche', async ({ page }) => {
    await expect(page.locator('.probe-grid')).toBeHidden();
    await page.getByText('Ce que ton navigateur révèle').click();
    await expect(page.locator('.probe-grid')).toContainText('Navigateur');
    await expect(page.locator('.probe-note')).toContainText('bits');
  });

  test('chaque projet montre un visuel chargé', async ({ page }) => {
    await page.locator('#projets').scrollIntoViewIfNeeded();
    const imgs = page.locator('.p-media img');
    await expect(imgs).toHaveCount(2);
    for (const img of await imgs.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    await expect(page.locator('.p-media svg')).toHaveCount(2);
  });

  test('un projet se déplie', async ({ page }) => {
    const proj = page.locator('.unit[data-project="databroke"]');
    await proj.locator('summary').click();
    await expect(proj).toHaveAttribute('open', '');
    await expect(proj.locator('.unit-body')).toContainText('Le problème');
  });

  test('le terminal s’ouvre, exécute et navigue', async ({ page }) => {
    await page.locator('.nav-term').click();
    const input = page.locator('.console .term-input');
    await expect(input).toBeFocused();
    await input.fill('cat about.txt');
    await input.press('Enter');
    await expect(page.locator('.console .term-out')).toContainText('BTS SIO');
    await input.fill('goto veille');
    await input.press('Enter');
    await expect(page.locator('.console')).toBeHidden();
    await expect(page.locator('#veille .hop-head')).toBeInViewport();
  });

  test('Échap ferme le terminal', async ({ page }) => {
    await page.locator('.nav-term').click();
    await expect(page.locator('.console')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.console')).toBeHidden();
  });
});

test('desktop seulement : la touche ` ouvre le terminal', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Pas de clavier physique sur mobile');
  await page.goto('/?intro=skip');
  await page.keyboard.press('Backquote');
  await expect(page.locator('.console .term-input')).toBeFocused();
  await page.keyboard.type('nmap localhost');
  await page.keyboard.press('Enter');
  await expect(page.locator('.console .term-out')).toContainText('51820/udp');
});

test('mobile seulement : le menu ouvre la navigation', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Menu replié seulement sur petit écran');
  await page.goto('/?intro=skip');
  await page.locator('.nav-menu').click();
  await page.locator('.nav-links a[data-section="contact"]').click();
  await expect(page.locator('#contact .hop-head')).toBeInViewport();
});

test.describe('sécurité et CTF', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?intro=skip');
    await page.evaluate(() => localStorage.removeItem('aurele:flags'));
  });

  test('le dissecteur chiffre puis déchiffre la charge utile', async ({ page }) => {
    await page.getByText('Inspecter ton paquet').click();
    const dx = page.locator('.dx');
    await dx.scrollIntoViewIfNeeded();
    await expect(dx.locator('.dx-hex')).toContainText('GET');
    await dx.getByRole('button', { name: 'Chiffrer avec TLS' }).click();
    await expect(dx.locator('.dx-bytes span.enc').first()).toBeAttached();
    await dx.getByRole('button', { name: 'Déchiffrer' }).click();
    await expect(dx.locator('.dx-bytes span.enc')).toHaveCount(0, { timeout: 3_000 });
  });

  test('un flag trouvé dans le terminal est validé et compté', async ({ page }) => {
    await page.locator('.nav-term').click();
    const input = page.locator('.console .term-input');
    await input.fill('cat .secret');
    await input.press('Enter');
    const flag = (await page.locator('.console .term-out').textContent())!.match(/FLAG\{[^}]+\}/)![0];
    await input.fill(`submit ${flag}`);
    await input.press('Enter');
    await expect(page.locator('.console .term-out')).toContainText('Flag correct');
    await expect(page.locator('.ctf-count')).toHaveText('1/5');
    await page.reload();
    await expect(page.locator('.ctf-count')).toHaveText('1/5');
  });

  test('les commandes sensibles remontent dans le SIEM', async ({ page }) => {
    await page.locator('.nav-term').click();
    const input = page.locator('.console .term-input');
    await input.fill('cat /etc/shadow');
    await input.press('Enter');
    await expect(page.locator('.toast.t-err')).toContainText('Alerte niveau 10');
    await page.keyboard.press('Escape');
    await expect(page.locator('.feed')).toContainText('empreintes de mots de passe');
    await expect(page.locator('.k-alerts strong')).toHaveText('1');
  });

  test('le panneau CTF liste cinq défis', async ({ page }) => {
    await page.locator('.ctf-pill').click();
    await expect(page.locator('.ctf-list li')).toHaveCount(5);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ctf-panel')).toBeHidden();
  });

  test('robots.txt et la sauvegarde oubliée sont servis', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /backup-2024/notes.txt');
    expect(await (await request.get('/backup-2024/notes.txt')).text()).toContain('FLAG{');
    expect(await (await request.get('/')).text()).toContain('debug: ');
  });

  test('l’objet window.aurele répond dans la console', async ({ page }) => {
    const hex = await page.evaluate(() => (window as unknown as { aurele: { secret: () => string } }).aurele.secret());
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });
});
