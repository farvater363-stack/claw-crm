// Renders src/page.html once per language into dist/<lang>/index.html,
// plus the language picker at dist/index.html. No dependencies: `node build.mjs`.
// Set SITE_URL (e.g. https://profmet.uz) to add og:image link previews.
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { GRILLE_ART } from './src/grille-art.mjs';

const SITE = import.meta.dirname;
const SOURCE = join(SITE, 'src');
const OUTPUT = join(SITE, 'dist');
const LANGUAGES = ['ru', 'uz'];
const WORK_PHOTO_PATTERN = /\.(jpe?g|png|webp)$/i;
const WORKS_SECTION_PATTERN = /<!--works-->[\s\S]*?<!--\/works-->/;
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/$/, '');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const fill = (template, values, label) =>
  template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`${label}: no value for {{${key}}}`);

    return values[key];
  });

const [template, gate, settings, styles, script, ...dictionaries] = await Promise.all([
  readFile(join(SOURCE, 'page.html'), 'utf8'),
  readFile(join(SOURCE, 'gate.html'), 'utf8'),
  readJson(join(SOURCE, 'settings.json')),
  readFile(join(SOURCE, 'assets/styles.css')),
  readFile(join(SOURCE, 'assets/app.js')),
  ...LANGUAGES.map((language) => readJson(join(SOURCE, `copy/${language}.json`))),
]);

const [firstKeys, ...otherKeys] = dictionaries.map((copy) => Object.keys(copy).sort().join('\n'));

if (otherKeys.some((keys) => keys !== firstKeys)) {
  throw new Error('copy/ru.json and copy/uz.json must have the same keys');
}

// Business numbers live in settings.json; copy refers to them as {minutes} and {days}.
// The monthly discount is set in the CRM and reaches the page at runtime, as {percent}.
const withSettings = (text) =>
  text
    .replaceAll('{minutes}', String(settings.callbackMinutes))
    .replaceAll('{days}', String(settings.priceHoldDays))
    // Keeps a number on the same line as its unit: «5 минут», «1 год».
    .replace(/(\d) (?=\S)/g, '$1\u00a0');

const version = createHash('sha256').update(styles).update(script).digest('hex').slice(0, 10);
const workPhotos = (await readdir(join(SOURCE, 'assets/works')).catch(() => []))
  .filter((file) => WORK_PHOTO_PATTERN.test(file))
  .sort();
const photoUrl = (file) => `/assets/works/${encodeURIComponent(file)}`;

const workFigure = (copy, file, index) => {
  const caption = copy[`works.${index + 1}`];
  const alt = caption ?? `${copy['works.title']} ${index + 1}`;

  return (
    `<figure class="work"><div class="work__image"><img src="${photoUrl(file)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" /></div>` +
    (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '') +
    `</figure>`
  );
};

const heroMedia = (copy) =>
  workPhotos.length > 0
    ? `<img src="${photoUrl(workPhotos[0])}" alt="${escapeHtml(copy['works.1'] ?? copy['hero.eyebrow'])}" fetchpriority="high" />`
    : `<div class="hero__media--empty"></div>`;

const hasTeamPhoto = await readFile(join(SOURCE, 'assets/team.jpg')).then(
  () => true,
  () => false,
);

const ogImage =
  SITE_URL && workPhotos.length > 0 ? `<meta property="og:image" content="${SITE_URL}${photoUrl(workPhotos[0])}" />` : '';

// Empty handles stay off the page rather than linking to someone else's account.
const contactLinks = [
  `<li><a href="tel:${escapeHtml(settings.phone.replace(/\s/g, ''))}">${escapeHtml(settings.phone)}</a></li>`,
  settings.telegram && `<li><a href="https://t.me/${encodeURIComponent(settings.telegram)}" rel="noopener">Telegram</a></li>`,
  settings.instagram && `<li><a href="https://instagram.com/${encodeURIComponent(settings.instagram)}" rel="noopener">Instagram</a></li>`,
]
  .filter(Boolean)
  .join('');

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
await cp(join(SOURCE, 'assets'), join(OUTPUT, 'assets'), { recursive: true });

// Without real photos the works section is left out instead of showing empty frames.
const pageTemplate = workPhotos.length > 0 ? template : template.replace(WORKS_SECTION_PATTERN, '');

for (const [index, language] of LANGUAGES.entries()) {
  const copy = Object.fromEntries(Object.entries(dictionaries[index]).map(([key, value]) => [key, withSettings(value)]));
  const scriptCopy = Object.fromEntries(Object.entries(copy).filter(([key]) => key.startsWith('js.')));
  const clientConfig = JSON.stringify({
    lang: language,
    copy: scriptCopy,
    contactPhone: settings.phone,
    designArt: GRILLE_ART,
    callbackMinutes: settings.callbackMinutes,
    priceHoldDays: settings.priceHoldDays,
  }).replaceAll('<', '\\u003c');

  const values = {
    ...Object.fromEntries(Object.entries(copy).map(([key, value]) => [key, escapeHtml(value)])),
    lang: language,
    otherLang: LANGUAGES[(index + 1) % LANGUAGES.length],
    version,
    year: String(new Date().getFullYear()),
    craftModifier: hasTeamPhoto ? ' craft--photo' : '',
    teamPhoto: hasTeamPhoto
      ? `<figure class="craft__photo"><img src="/assets/team.jpg" alt="${escapeHtml(copy['craft.team'])}" loading="lazy" decoding="async" /><figcaption>${escapeHtml(copy['craft.team'])}</figcaption></figure>`
      : '',
    'contact.phone': escapeHtml(settings.phone),
    'contact.phoneHref': escapeHtml(settings.phone.replace(/\s/g, '')),
    contactLinks,
    ogImage,
    heroMedia: heroMedia(copy),
    works: workPhotos.map((file, workIndex) => workFigure(copy, file, workIndex)).join(''),
    clientConfig,
  };

  await mkdir(join(OUTPUT, language), { recursive: true });
  await writeFile(join(OUTPUT, language, 'index.html'), fill(pageTemplate, values, language));
}

await writeFile(join(OUTPUT, 'index.html'), fill(gate, { version }, 'gate'));

console.log(`Built ${LANGUAGES.join(', ')} with ${workPhotos.length} work photo(s) into ${OUTPUT}`);
