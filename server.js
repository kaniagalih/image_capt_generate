require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch'); // v2 commonjs

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'n8n proxy is running', timestamp: new Date().toISOString() });
});

// Proxy endpoint to forward to a specific form URL (CORS-safe fallback for the browser)
app.post('/api/forward-form', async (req, res) => {
  try {
    const target = process.env.FORM_ENDPOINT_URL || 'https://devstreams-agentic-apps.digital-lab.ai/form/1bc429ed-c5a2-4783-9dd8-40eaac8a59f1';

    const headers = {
      'Content-Type': 'application/json',
      ...(process.env.N8N_SECRET ? { 'x-n8n-secret': process.env.N8N_SECRET } : {}),
    };

    const resp = await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body || {}),
    });

    const contentType = resp.headers.get('content-type') || '';
    const status = resp.status || 200;
    let body;
    try {
      body = contentType.includes('application/json') ? await resp.json() : await resp.text();
    } catch (e) {
      body = await resp.text();
    }

    if (!resp.ok) {
      return res.status(status).json({ ok: false, error: 'upstream_error', status, body, target });
    }
    return res.status(status).json({ ok: true, status, body, target });
  } catch (err) {
    console.error('Error forwarding to form endpoint:', err);
    return res.status(500).json({ ok: false, error: 'proxy_failed', message: String(err) });
  }
});

// Proxy endpoint to forward requests to n8n webhook
app.post('/api/trigger-n8n', async (req, res) => {
  try {
    const payload = req.body || {};

    // Enrich with server metadata if needed
    const enriched = {
      ...payload,
      _serverTimestamp: new Date().toISOString(),
      _ip: req.ip,
      _ua: req.headers['user-agent'] || null,
    };

    // Support either base+path or full URL via env
    const fullUrl = process.env.N8N_FULL_WEBHOOK_URL;
    const base = process.env.N8N_WEBHOOK_BASE_URL;
    const pathPart = process.env.N8N_WEBHOOK_PATH;

    let n8nUrl = fullUrl || (base && pathPart ? `${base.replace(/\/$/, '')}/${String(pathPart).replace(/^\//, '')}` : null);

    if (!n8nUrl) {
      console.error('Missing n8n configuration: set N8N_FULL_WEBHOOK_URL or N8N_WEBHOOK_BASE_URL + N8N_WEBHOOK_PATH');
      return res.status(500).json({ error: 'Server not configured for n8n' });
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(process.env.N8N_SECRET ? { 'x-n8n-secret': process.env.N8N_SECRET } : {}),
    };

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