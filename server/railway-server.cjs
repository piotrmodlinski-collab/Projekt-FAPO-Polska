const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { handleMailRequest } = require('./mail-handler.cjs');

const root = path.resolve(__dirname, '..');
const publicRoot = fs.existsSync(path.join(root, 'dist'))
  ? path.join(root, 'dist')
  : root;
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleApiContact(req, res) {
  try {
    const body = await collectBody(req);
    const result = await handleMailRequest({
      method: req.method,
      body,
    });
    const payload = typeof result.body === 'string'
      ? JSON.parse(result.body || '{}')
      : (result.body || {});
    sendJson(res, result.status, payload);
  } catch (error) {
    console.error('Contact endpoint failed', error);
    sendJson(res, 500, { ok: false, error: 'SERVER_ERROR' });
  }
}

function resolveStaticPath(pathname) {
  let requestedPath = pathname;
  if (requestedPath === '/' || requestedPath === '') requestedPath = '/index.html';
  if (requestedPath === '/pl') requestedPath = '/index.html';
  if (requestedPath === '/en') requestedPath = '/en.html';

  const decodedPath = decodeURIComponent(requestedPath);
  const safePath = decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(publicRoot, safePath);
  if (!filePath.startsWith(publicRoot + path.sep) && filePath !== publicRoot) {
    return null;
  }
  return filePath;
}

function serveStatic(req, res, pathname) {
  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
    };
    if (/\.(?:css|js|jpg|jpeg|png|webp|svg|mp4|webm|woff2)$/i.test(filePath)) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
      headers['Cache-Control'] = 'public, max-age=300';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/contact') {
    handleApiContact(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }

  serveStatic(req, res, requestUrl.pathname);
});

server.listen(port, () => {
  console.log(`FAPO server listening on port ${port}, root: ${publicRoot}`);
});
