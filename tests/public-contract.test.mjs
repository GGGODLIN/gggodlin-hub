import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = join(root, 'public');
const workspace = 'https://app.gggodlin.com';
const openSource = 'https://github.com/GGGODLIN/claude-pr-review';

function runContract(directory) {
  const result = spawnSync(process.execPath, ['scripts/check-public-contract.mjs', directory], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  assert.ok(Number.isInteger(result.status), 'contract checker must return an exit code');
  return result;
}

function tempDir(t) {
  const directory = mkdtempSync(join(root, '.public-contract-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('published output passes the non-empty public contract', () => {
  const result = runContract(publicDir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Public contract passed: [1-9]\d* non-empty files checked/);
});

test('site publishes shared SVG favicon, themed 404 page and security headers', () => {
  const config = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));
  assert.equal(config.assets.not_found_handling, '404-page');

  const favicon = readFileSync(join(publicDir, 'favicon.svg'), 'utf8');
  assert.match(favicon, /<svg\b[^>]*viewBox="0 0 32 32"/);

  const notFound = readFileSync(join(publicDir, '404.html'), 'utf8');
  assert.match(notFound, /<h1>Page not found<\/h1>/);
  assert.match(notFound, /<meta name="robots" content="noindex" \/>/);

  const headers = readFileSync(join(publicDir, '_headers'), 'utf8');
  for (const header of ['X-Content-Type-Options: nosniff', 'Referrer-Policy:', 'X-Frame-Options: DENY']) {
    assert.ok(headers.includes(header), `missing security header ${header}`);
  }

  for (const file of ['index.html', 'privacy/index.html', 'terms/index.html', 'refund/index.html', '404.html']) {
    const html = readFileSync(join(publicDir, file), 'utf8');
    assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'), `${file} missing favicon link`);
  }
});

test('all pages prevent dark-mode FOUC before CSS and theme script handles system sync and menu closing', () => {
  for (const file of ['index.html', 'privacy/index.html', 'terms/index.html', 'refund/index.html', '404.html']) {
    const html = readFileSync(join(publicDir, file), 'utf8');
    const bootIdx = html.indexOf("localStorage.getItem('gggodlin-mode')");
    const cssIdx = html.indexOf('<link rel="stylesheet" href="/site.css" />');
    assert.ok(bootIdx > 0 && cssIdx > bootIdx, `${file} must run theme boot script before /site.css`);
  }
  const themeScript = readFileSync(join(publicDir, 'theme.mjs'), 'utf8');
  assert.match(themeScript, /addEventListener\('change'/);
  assert.match(themeScript, /details\.menu/);
  assert.match(themeScript, /Escape/);
});

test('home has main landmark, skip link, two-column hero rows and consistent legal subnav', () => {
  const home = readFileSync(join(publicDir, 'index.html'), 'utf8');
  assert.ok(home.includes('<a class="skip-link" href="#main-content">Skip to main content</a>'));
  assert.ok(home.includes('<main id="main-content">'));
  assert.ok(home.includes('class="run-row run-row--two"'));
  assert.ok(home.includes('min-height: 32px;'));

  for (const file of ['privacy/index.html', 'terms/index.html', 'refund/index.html']) {
    const html = readFileSync(join(publicDir, file), 'utf8');
    assert.ok(html.includes('<a class="skip-link" href="#main-content">'), `${file} missing skip link`);
    assert.ok(html.includes('class="subnav"'), `${file} missing subnav`);
    assert.ok(html.includes('<a href="mailto:philip@gggodlin.com">philip@gggodlin.com</a>'), `${file} footer email label mismatch`);
  }
});

test('home links to the cloud workspace, live sample and open-source installation', () => {
  const home = readFileSync(join(publicDir, 'index.html'), 'utf8');
  const hero = home.match(/<section class="hero">([\s\S]*?)<\/section>/)?.[1] ?? '';
  for (const link of [`${workspace}/sample`, `${workspace}/workspace`, openSource]) {
    assert.ok(hero.includes(`href="${link}"`), `missing hero link ${link}`);
  }
  for (const name of ['cc-translate-proxy', 'gggodlin-cc-harness', 'cc-mod-image-view']) {
    assert.ok(home.includes(`href="https://github.com/GGGODLIN/${name}"`), `missing link to ${name}`);
  }
  for (const label of ['Report projection schema: 2', 'Cross-model verification', 'Prior review continuity: CHECKED', 'FIXED', 'STILL_OPEN']) {
    assert.ok(hero.includes(label), `missing review example label ${label}`);
  }
  assert.ok(home.includes('data-site-release="pr-review-cloud-v1"'), 'home must expose the release marker');
});

test('all three pricing plans describe the published price, capacity and workspace CTA', () => {
  const home = readFileSync(join(publicDir, 'index.html'), 'utf8');
  const pricing = home.match(/<section\b[^>]*id="pricing"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
  const plans = [...pricing.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map(([, body]) => body);
  assert.equal(plans.length, 3);
  const expected = [
    ['Free', '$0', 'Up to 20 stored reports', 'GitHub sign-in', 'Private by default', 'revocable share links', 'curl', 'web upload'],
    ['Pro', '$19', '/ month', 'Up to 500 stored reports', 'across rounds', 'API key management', 'revocable share links'],
    ['Pro Pass', '$49', 'one-time', 'Up to 500 stored reports'],
  ];
  for (const [i, [name, ...details]] of expected.entries()) {
    assert.ok(plans[i].includes(`<h3>${name}</h3>`), `missing ${name} plan`);
    for (const detail of [...details, '128 KB', `href="${workspace}/workspace"`]) {
      assert.ok(plans[i].includes(detail), `${name} is missing ${detail}`);
    }
  }
});

test('legal pages are published at extensionless routes and state the same pass and subscription terms', () => {
  const config = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));
  assert.equal(config.assets.directory, './public');
  assert.equal(config.assets.html_handling, 'drop-trailing-slash', 'canonical legal routes must serve without a slash');
  assert.ok(config.routes.some((route) => route.pattern === 'gggodlin.com' && route.custom_domain === true));
  const home = readFileSync(join(publicDir, 'index.html'), 'utf8');
  const privacy = readFileSync(join(publicDir, 'privacy/index.html'), 'utf8');
  const terms = readFileSync(join(publicDir, 'terms/index.html'), 'utf8');
  const refund = readFileSync(join(publicDir, 'refund/index.html'), 'utf8');
  for (const [name, html] of [['privacy', privacy], ['terms', terms], ['refund', refund]]) {
    for (const statement of ['GGGODLIN Labs', 'philip@gggodlin.com', 'GitHub', 'API key hashes', 'Markdown review reports', 'private by default', 'does not run LLMs', 'Merchant of Record']) {
      assert.ok(html.includes(statement), `${name} is missing ${statement}`);
    }
  }
  const pass = /No monthly fee for as long as the service operates\. We guarantee at least 12 months of operation from purchase\. If we retire the service, we will give you at least 30 days' advance notice to export your reports\. If we retire the service within 12 months of purchase, we will issue a pro-rata refund for unused months in that 12-month period\./;
  for (const [name, html] of [['home', home], ['terms', terms], ['refund', refund]]) {
    assert.match(html.replace(/\s+/g, ' '), pass, `${name} must state the agreed Pro Pass guarantee and refund`);
  }
  const subscription = /Cancel before your next renewal to avoid the next charge\.[^<]+through the end of the paid billing period\.[^<]+refunded except where required by law[^<]+/;
  const billingTerms = terms.replace(/\s+/g, ' ').match(subscription)?.[0];
  assert.ok(billingTerms, 'terms must state the monthly subscription refund policy');
  assert.equal(refund.replace(/\s+/g, ' ').match(subscription)?.[0], billingTerms);
});

test('Experiments retains the four named video and source showcases', () => {
  const home = readFileSync(join(publicDir, 'index.html'), 'utf8');
  const experiments = home.match(/<section\b[^>]*id="experiments"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
  for (const name of ['CreditRoll Live', 'FlowWitness', 'ReserveRail', 'ClauseClock']) {
    assert.ok(experiments.includes(name), `missing experiment ${name}`);
  }
});

test('pushes to main run the contract before deploying, then probe all production routes', () => {
  let workflow;
  try {
    workflow = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    assert.fail('missing deployment workflow');
  }
  assert.match(workflow, /^on:\s*\n  push:\s*\n    branches:\s*\n      - main\s*\n  workflow_dispatch:/m);
  const requiredInOrder = [
    'uses: actions/checkout@', 'uses: actions/setup-node@', 'node --test',
    'node scripts/check-public-contract.mjs public', 'npx wrangler deploy', 'curl -fsSL', 'curl -fsSI',
  ];
  let previous = -1;
  for (const value of requiredInOrder) {
    const position = workflow.indexOf(value);
    assert.ok(position > previous, `missing or out of order: ${value}`);
    previous = position;
  }
  assert.ok(workflow.includes('secrets.CLOUDFLARE_API_TOKEN'));
  assert.ok(workflow.includes('secrets.CLOUDFLARE_ACCOUNT_ID'));
  const smoke = workflow.slice(workflow.indexOf('npx wrangler deploy'));
  for (const target of ['https://gggodlin.com/', '/privacy', '/terms', '/refund', '/robots.txt', '/codex-ambassador.mp4', 'data-site-release="pr-review-cloud-v1"', '%{http_code}', '200']) {
    assert.ok(smoke.includes(target), `missing production check: ${target}`);
  }
});

test('contract fails with zero files, including empty placeholders', (t) => {
  const directory = tempDir(t);
  mkdirSync(join(directory, 'empty'));
  for (const phase of ['empty directories', 'zero-byte placeholder']) {
    if (phase === 'zero-byte placeholder') writeFileSync(join(directory, 'empty', 'index.html'), '');
    const result = runContract(directory);
    assert.notEqual(result.status, 0, phase);
    assert.match(result.stderr, /No public files \(0 non-empty files\)/);
  }
});

for (const [name, fixture, diagnostics] of [
  ['forbidden copy', '<p>mAgPiE · credential pool · quota pool · Enterprise VPC · SAML · SSO · per-seat · 100,000 routed LLM requests</p>',
    ['mAgPiE', 'credential pool', 'quota pool', 'Enterprise VPC', 'SAML', 'SSO', 'per-seat', '100,000 routed LLM requests']
      .map((term) => `forbidden copy: ${term}`)],
  ['broken links', '<a title="1 > 0" href="/contract-missing.html">Missing</a><a href="#not-an-id">Missing ID</a>',
    ['broken internal link /contract-missing.html', 'broken internal link #not-an-id']],
  ['protected experiment hostnames', '<a href="https://paypal-credit-roll-live.onrender.com/demo">Demo</a>\n144.202.121.72 firebase-flow-witness.vercel.app reserverail.gggodlin.com atlassian-clause-clock.vercel.app',
    ['paypal-credit-roll-live.onrender.com', '144.202.121.72', 'firebase-flow-witness.vercel.app', 'reserverail.gggodlin.com', 'atlassian-clause-clock.vercel.app']
      .map((host) => `protected experiment hostname: ${host}`)],
]) {
  test(`contract rejects ${name} injected into a nested public artifact`, (t) => {
    const directory = tempDir(t);
    cpSync(publicDir, directory, { recursive: true });
    mkdirSync(join(directory, 'nested'));
    writeFileSync(join(directory, 'nested/probe.html'), '<p>Fixture control</p>');
    const control = runContract(directory);
    writeFileSync(join(directory, 'nested/probe.html'), fixture);
    const result = runContract(directory);
    assert.notEqual(result.status, 0);
    for (const diagnostic of diagnostics) {
      const expected = `nested/probe.html: ${diagnostic}`;
      assert.ok(!control.stderr.includes(expected), `control unexpectedly reports ${diagnostic}`);
      assert.ok(result.stderr.includes(expected), `missing injected violation ${diagnostic}`);
    }
  });
}

test('contract rejects commented-out footer legal links', (t) => {
  const directory = tempDir(t);
  cpSync(publicDir, directory, { recursive: true });
  const home = readFileSync(join(directory, 'index.html'), 'utf8')
    .replace('<a href="/privacy">Privacy</a>', '<!-- <a href="/privacy">Privacy</a> -->');
  writeFileSync(join(directory, 'index.html'), home);
  const result = runContract(directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /index\.html: missing footer link \/privacy/);
});
