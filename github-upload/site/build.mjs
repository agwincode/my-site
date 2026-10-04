import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('./', import.meta.url);
mkdirSync(new URL('../.generated/', root), { recursive: true });
const read = path => readFileSync(new URL(path, root), 'utf8');
const motion = read('src/motion.mjs').replace(/^export /gm, '');
const app = read('src/app.mjs').replace(/^import .*from '\.\/motion\.mjs';\n/, '');
const art = readFileSync(new URL('assets/balloons-transparent.png', root)).toString('base64');
const background = read('src/background.mjs');
const script = (background + '\n' + motion + '\n' + app).replace('assets/balloons-transparent.png', `data:image/png;base64,${art}`);
new Function(script);
for (const [source, destination] of [['index.html','index.html'],['portfolio.html','portfolio.html'],['research.html','research.html']]) {
  const activePage = destination;
  const nav = read('src/shared/nav.html').replace(`href="${activePage}"`, `href="${activePage}" aria-current="page"`);
  let html = read(source).replace('<!-- shared-nav -->', () => nav)
    .replace('<!-- shared-footer -->', () => read('src/shared/footer.html'))
    .replace('/* shared-chrome */', () => read('src/shared/chrome.css')).replace('/* shared-typography */', () => read('src/shared/typography.css')).replace(/<script\b(?=[^>]*\bsrc=["']src\/background\.mjs["'])[^>]*>\s*<\/script>/g, () => source==='index.html'?'':`<script type="module">${background}</script>`)
    .replace(/<script\b(?=[^>]*\bsrc=["']src\/app\.mjs["'])[^>]*>\s*<\/script>/g, () => `<script type="module">${script}</script>`);
  html = html.replace(/src="(assets\/invisible\/[a-z0-9-]+\.png)"/g, (_, path) => `src="data:image/png;base64,${readFileSync(new URL(path, root)).toString('base64')}"`);
  html = html.replace(/src="(assets\/portfolio\/[a-z0-9-]+\.(?:svg|png))"/g, (_, path) => `src="data:${path.endsWith('.svg') ? 'image/svg+xml' : 'image/png'};base64,${readFileSync(new URL(path, root)).toString('base64')}"`);
  html = html.replace(/src="(assets\/podcasts\/[a-z0-9-]+\.(?:jpg|png))"/g, (_, path) => `src="data:${path.endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${readFileSync(new URL(path, root)).toString('base64')}"`);
  html = html.replace(/src="(assets\/portrait\/[a-z0-9-]+\.avif)"/g, (_, path) => `src="data:image/avif;base64,${readFileSync(new URL(path, root)).toString('base64')}"`);
  if (/<script\b[^>]*\bsrc=["']src\//.test(html)) throw new Error(`Unbundled script in ${destination}`);
  if (source === 'index.html' && !html.includes('function prepareArtwork')) throw new Error('Homepage animation missing');
  html = html.replaceAll('href="balloon-breeze.html', 'href="/').replaceAll('href="index.html', 'href="/').replaceAll('href="portfolio.html', 'href="/investments/').replaceAll('href="research.html', 'href="/content/');
  // Cache image assets independently instead of shipping base64 inside every HTML page.
  mkdirSync(new URL('../public/assets/site/', root), { recursive: true });
  html = html.replace(/data:image\/(png|jpeg|avif|svg\+xml);base64,([A-Za-z0-9+/=]+)/g, (_, mime, data) => {
    const bytes = Buffer.from(data, 'base64');
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0,16);
    const ext = ({png:'png',jpeg:'jpg',avif:'avif','svg+xml':'svg'})[mime];
    const filename = `${hash}.${ext}`;
    writeFileSync(new URL('../public/assets/site/'+filename, root), bytes);
    return '/assets/site/'+filename;
  });
  writeFileSync(new URL('../.generated/'+destination, root), html);
}
console.log('Built Home, Investments, and Ideas with shared navigation and footer.');
