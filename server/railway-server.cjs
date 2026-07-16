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
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
    const result = await handleMailRequest({
      method: req.method,
      body,
      ip,
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

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch {
    return null;
  }

  // Reject encoded NUL/control characters before passing a path to fs/path.
  // Node's fs methods validate these arguments synchronously, so an unhandled
  // value such as "/.env%00" would otherwise terminate the whole process.
  if (/[\x00-\x1f\x7f]/.test(decodedPath)) {
    return null;
  }

  const resolveInsidePublic = (candidatePath) => {
    const safePath = candidatePath.replace(/^\/+/, '');
    const filePath = path.resolve(publicRoot, safePath);
    if (!filePath.startsWith(publicRoot + path.sep) && filePath !== publicRoot) {
      return null;
    }
    return filePath;
  };

  const filePath = resolveInsidePublic(decodedPath);
  if (!filePath) return null;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return filePath;
  }

  const hasExtension = Boolean(path.extname(decodedPath));
  if (!hasExtension) {
    const cleanPath = decodedPath.replace(/\/+$/, '');
    const htmlPath = resolveInsidePublic(`${cleanPath}.html`);
    if (htmlPath && fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
      return htmlPath;
    }

    const indexPath = resolveInsidePublic(`${cleanPath}/index.html`);
    if (indexPath && fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      return indexPath;
    }
  }

  return filePath;
}

function serveStatic(req, res, pathname) {
  let filePath;
  try {
    filePath = resolveStaticPath(pathname);
  } catch (error) {
    console.warn('Rejected invalid request path', error.code || error.message);
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
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
      if (/\.(?:css|js)$/i.test(filePath)) {
        headers['Cache-Control'] = 'public, max-age=300, must-revalidate';
      } else if (/\.(?:jpg|jpeg|png|webp|svg|mp4|webm|woff2)$/i.test(filePath)) {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      } else {
        headers['Cache-Control'] = 'public, max-age=300';
      }

      res.writeHead(200, headers);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.on('error', (error) => {
        console.error('Static file stream failed', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('Server error');
      });
      stream.pipe(res);
    });
  } catch (error) {
    console.warn('Rejected invalid static path', error.code || error.message);
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
  }
}

const server = http.createServer((req, res) => {
  let requestUrl;
  try {
    requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch (error) {
    console.error('Invalid request URL', error);
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  const hostname = String(req.headers.host || '').split(':')[0].toLowerCase();

  if (hostname === 'fapomoto.pl') {
    res.writeHead(308, {
      Location: `https://www.fapomoto.pl${requestUrl.pathname}${requestUrl.search}`,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end();
    return;
  }

  if (requestUrl.pathname === '/healthz') {
    sendJson(res, 200, { ok: true });
    return;
  }

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

server.on('clientError', (error, socket) => {
  console.error('HTTP client error', error.message);
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  }
});

server.listen(port, () => {
  console.log(`FAPO server listening on port ${port}, root: ${publicRoot}`);
});
