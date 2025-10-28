require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch'); 

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', message: 'server running', timestamp: new Date().toISOString() });
});

// Proxy endpoint to forward requests to n8n webhook
app.post('/api/trigger-n8n', async (req, res) => {
  try {
    const payload = req.body || {};
    debug('payload', payload);

    const fallbackPrompt = `Generate an image and caption for account "${payload.accountName || 'unknown'}" with theme "${payload.category || 'general'}".`;
    const enriched = {
      ...payload,
      chatInput: (payload.chatInput || payload.prompt || '').toString().trim() || fallbackPrompt,
      _serverTimestamp: new Date().toISOString(),
      _ip: req.ip,
      _ua: req.headers['user-agent'] || null,
      _source: 'web-ui',
    };

    debug('enriched', enriched);

  // Get webhook URL from env vars
  const fullUrl = process.env.N8N_FULL_URL;
    const base = process.env.N8N_BASE_URL;
    const pathPart = process.env.N8N_PATH;

    let n8nUrl = fullUrl || (base && pathPart ? `${base.replace(/\/$/, '')}/${String(pathPart).replace(/^\//, '')}` : null);

  debug('target', n8nUrl);

    if (!n8nUrl) {
      console.error('Missing n8n configuration: set N8N_FULL_URL or N8N_BASE_URL + N8N_PATH');
      return res.status(500).json({ error: 'Server not configured for n8n' });
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(process.env.N8N_SECRET ? { 'x-n8n-secret': process.env.N8N_SECRET } : {}),
    };

    debug('headers', headers);

    const n8nResp = await fetch(n8nUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(enriched),
    });

    const contentType = n8nResp.headers.get('content-type') || '';
    const status = n8nResp.status || 200;
    let n8nBody;
    try {
      n8nBody = contentType.includes('application/json') ? await n8nResp.json() : await n8nResp.text();
    } catch (e) {
      n8nBody = await n8nResp.text();
    }

    debug('response', { status, n8nBody });

    return res.status(status).json({ ok: n8nResp.ok, n8nStatus: status, n8nBody });
  } catch (err) {
    console.error('Error forwarding to n8n:', err);
    return res.status(500).json({ error: 'Failed to forward to n8n' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`UI:     http://localhost:${PORT}/`);
});

module.exports = app;

// Simple debug logger controlled by DEBUG env
function debug(label, value) {
  if (!process.env.DEBUG) return;
  try {
    const pretty = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    console.log(`[debug:${label}]`, pretty);
  } catch (_) {
    console.log(`[debug:${label}]`, value);
  }
}