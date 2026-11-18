import { isUtf8 } from 'node:buffer';
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';

const origin = 'https://gggodlin.com';
const legalPaths = ['/privacy', '/terms', '/refund'];
const experimentLinks = [
  'https://youtu.be/cE3SuZF7sic',
  'https://github.com/GGGODLIN/paypal-credit-roll-live',
  'https://youtu.be/2H3QmFD4D20',
  'https://github.com/GGGODLIN/firebase-flow-witness',
  'https://youtu.be/NO--HeY-e3A',
  'https://github.com/GGGODLIN/reserverail',
  'https://youtu.be/xFWynDts-Ow',
  'https://github.com/GGGODLIN/atlassian-clause-clock',
];
const forbiddenCopy = [
  /\bMagpie\b/i,
  /\bcredential\s+pool\b/i,
  /\bquota\s+pool\b/i,
  /\bEnterprise\s+VPC\b/i,
  /\bSAML\b/i,
  /\bSSO\b/i,
  /\bper-seat\b/i,
  /\b100,000\s+routed\s+LLM\s+requests\b/i,
  /\bmulti-model\s+routing\s+infrastructure\b/i,
  /\bsingle\s+sign-on\b/i,
  /\bprivate\s+cloud\b/i,
];
const protectedHosts = [
  'paypal-credit-roll-live.onrender.com',
  '144.202.121.72',
  'firebase-flow-witness.vercel.app',
  'reserverail.gggodlin.com',
  'atlassian-clause-clock.vercel.app',
];

function* listFiles(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) yield* listFiles(join(directory, entry.name), `${path}/`);
    if (entry.isFile()) yield path;
  }
}

function references(html, attributes = 'href|src|poster') {
  const attribute = new RegExp(`\\s(?:${attributes})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'gi');
  return [...html.matchAll(/<[a-z][^>]*>/gi)].flatMap(([tag]) =>
    [...tag.matchAll(attribute)].map(([, double, single, bare]) =>
      (double ?? single ?? bare).replaceAll('&amp;', '&')));
}

function routeFor(file) {
  if (file === 'index.html') return '/';
  return `/${file.replace(/(?:\/index)?\.html$/, '')}`;
}

function fileFor(path, files) {
  const name = path.replace(/^\//, '');
  if (!name || name.endsWith('/')) return files.has(`${name}index.html`) ? `${name}index.html` : undefined;
  return [name, `${name}.html`, `${name}/index.html`].find((candidate) => files.has(candidate));
}

function checkReference(from, reference, files, text, errors) {
  try {
    const url = new URL(reference, `${origin}${routeFor(from)}`);
    if (!['http:', 'https:'].includes(url.protocol) || !['gggodlin.com', 'www.gggodlin.com'].includes(url.hostname)) return;

    const path = posix.normalize(decodeURIComponent(url.pathname));
    const target = fileFor(path, files);
    const fragment = decodeURIComponent(url.hash.slice(1));
    const ids = target?.endsWith('.html') && fragment ? references(text.get(target) ?? '', 'id') : [];
    if (!target || (fragment && target.endsWith('.html') && !ids.includes(fragment))) {
      errors.push(`${from}: broken internal link ${reference}`);
    }
  } catch {
    errors.push(`${from}: invalid link ${reference}`);
  }
}

function checkHome(home, errors) {
  let organization;
  for (const [, json] of home.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(json);
      if (data['@type'] === 'Organization') organization = data;
    } catch {
      errors.push('index.html: invalid JSON-LD');
    }
  }
  if (organization?.['@context'] !== 'https://schema.org' || organization.name !== 'GGGODLIN Labs' ||
      organization.url !== `${origin}/` || organization.email !== 'philip@gggodlin.com' ||
      !/PR Review Cloud/.test(organization.description ?? '')) {
    errors.push('index.html: missing or outdated Organization JSON-LD');
  }

  const footer = home.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1] ?? '';
  const footerLinks = references(footer, 'href');
  for (const link of [...legalPaths, 'mailto:philip@gggodlin.com', 'https://github.com/GGGODLIN-Labs', 'https://blog.gggodlin.com']) {
    if (!footerLinks.includes(link)) errors.push(`index.html: missing footer link ${link}`);
  }

  const pricing = home.match(/<section\b[^>]*\bid=["']pricing["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? '';
  if (references(pricing, 'href').some((link) => /^mailto:/i.test(link.trim()))) {
    errors.push('index.html: pricing must not use mailto links');
  }

  const experiments = home.match(/<section\b[^>]*\bid=["']experiments["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? '';
  const links = references(experiments);
  if (links.length !== experimentLinks.length || experimentLinks.some((link) => !links.includes(link))) {
    errors.push('index.html: Experiments must link only to the approved videos and source repositories');
  }
}

function checkPublic(directory) {
  const files = new Set();
  const text = new Map();
  for (const file of listFiles(directory)) {
    const bytes = readFileSync(join(directory, file));
    if (bytes.length === 0) continue;
    files.add(file);
    if (!bytes.includes(0) && isUtf8(bytes)) text.set(file, bytes.toString('utf8'));
  }
  if (files.size === 0) throw new Error('No public files (0 non-empty files)');

  const errors = [];
  for (const file of ['index.html', 'robots.txt', 'sitemap.xml', ...legalPaths.map((path) => `${path.slice(1)}/index.html`)]) {
    if (!text.has(file)) errors.push(`Missing required page or file: ${file}`);
  }
  if (!files.has('codex-ambassador.mp4')) errors.push('Missing required file: codex-ambassador.mp4');

  const robots = text.get('robots.txt') ?? '';
  if (!/^User-agent:\s*\*\s*$/im.test(robots) || !/^Allow:\s*\/\s*$/im.test(robots) ||
      /^Disallow:[ \t]*\S/im.test(robots) || !robots.split(/\r?\n/).includes(`Sitemap: ${origin}/sitemap.xml`)) {
    errors.push('robots.txt: expected open crawling and a canonical sitemap');
  }
  const locations = [...(text.get('sitemap.xml') ?? '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(([, url]) => url);
  for (const path of ['/', ...legalPaths]) {
    if (!locations.includes(`${origin}${path}`)) errors.push(`sitemap.xml: missing ${path}`);
  }
  for (const location of locations) checkReference('sitemap.xml', location, files, text, errors);
  checkHome(text.get('index.html') ?? '', errors);

  for (const [file, content] of text) {
    for (const term of forbiddenCopy) {
      const match = term.exec(content);
      if (match) errors.push(`${file}: forbidden copy: ${match[0]}`);
    }
    const lowercase = content.toLowerCase();
    for (const host of protectedHosts) {
      if (lowercase.includes(host)) errors.push(`${file}: protected experiment hostname: ${host}`);
    }
    if (file.endsWith('.html')) {
      for (const reference of references(content)) checkReference(file, reference, files, text, errors);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return files.size;
}

try {
  const directory = resolve(process.argv[2] ?? 'public');
  const count = checkPublic(directory);
  process.stdout.write(`Public contract passed: ${count} non-empty files checked\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
