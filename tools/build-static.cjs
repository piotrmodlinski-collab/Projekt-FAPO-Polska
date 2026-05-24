const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');

const entries = [
  'index.html',
  'en.html',
  'sklep.html',
  'produkty',
  'app.js',
  'styles.css',
  'assets',
  'robots.txt',
  'sitemap.xml',
  '_headers',
  '_redirects',
];

const excluded = [
  'assets/media/shorts',
  'assets/data/products.backup.before-pricing.json',
  'assets/data/youtube-shorts-mapped.json',
  '.tmp-media',
  'dist',
  'node_modules',
];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function relativePath(filePath) {
  return toPosix(path.relative(root, filePath));
}

function shouldExclude(filePath) {
  const rel = relativePath(filePath);
  return excluded.some((item) => rel === item || rel.startsWith(`${item}/`));
}

function copyRecursive(source, target) {
  if (shouldExclude(source)) return;

  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const item of fs.readdirSync(source)) {
      copyRecursive(path.join(source, item), path.join(target, item));
    }
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function directorySize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const item of fs.readdirSync(dir)) {
    const filePath = path.join(dir, item);
    const stat = fs.statSync(filePath);
    total += stat.isDirectory() ? directorySize(filePath) : stat.size;
  }
  return total;
}

if (path.basename(outDir) !== 'dist' || path.dirname(outDir) !== root) {
  throw new Error(`Refusing to clean unexpected output directory: ${outDir}`);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  const source = path.join(root, entry);
  if (!fs.existsSync(source)) continue;
  copyRecursive(source, path.join(outDir, entry));
}

const sizeMb = (directorySize(outDir) / 1024 / 1024).toFixed(2);
console.log(`Built dist in ${outDir}`);
console.log(`Deploy size: ${sizeMb} MB`);
