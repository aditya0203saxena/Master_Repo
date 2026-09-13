const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadDotEnv(path.join(ROOT, '.env'));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function sendTelegramAlert({ command, trigger }) {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error('Telegram is not configured. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env');
  }

  const text = `🚨 Patient Alert: ${command}\nAction: ${trigger}`;
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram request failed (${response.status})`);
  }
  return data;
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, cleanPath));
  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        sendJson(res, 404, { error: 'Not found' });
      } else {
        sendJson(res, 500, { error: 'Failed to read file' });
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, telegramConfigured: Boolean(BOT_TOKEN && CHAT_ID) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/send-alert') {
    let raw = '';
    req.setEncoding('utf8');

    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 100_000) req.destroy();
    });

    req.on('end', async () => {
      try {
        const body = JSON.parse(raw || '{}');
        const command = typeof body.command === 'string' ? body.command.trim() : '';
        const trigger = typeof body.trigger === 'string' ? body.trigger.trim() : '';

        if (!command || !trigger) {
          sendJson(res, 400, { error: 'command and trigger are required' });
          return;
        }

        await sendTelegramAlert({ command, trigger });
        sendJson(res, 200, { ok: true });
      } catch (error) {
        console.error('Telegram alert failed:', error.message);
        sendJson(res, 502, { error: error.message || 'Unable to send Telegram alert' });
      }
    });
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res, url.pathname);
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`i-Recon running at http://localhost:${PORT}`);
  console.log(`Telegram alerts: ${BOT_TOKEN && CHAT_ID ? 'configured' : 'NOT configured'}`);
});
