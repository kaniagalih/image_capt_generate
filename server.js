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
    const encoding = String(req.query.encoding || process.env.FORM_ENCODING || 'form').toLowerCase(); // 'form' | 'json'
    const formId = process.env.FORM_ID;

    // Build body with variant keys to maximize capture on n8n Form node
    const src = req.body || {};
    const canonical = {
      accountName: src.accountName,
      category: src.category,
      prompt: src.prompt,
      submittedAt: src.submittedAt || new Date().toISOString(),
    };

    let headers = { ...(process.env.N8N_SECRET ? { 'x-n8n-secret': process.env.N8N_SECRET } : {}) };
    let bodyToSend;

    if (encoding === 'json') {
      headers['Content-Type'] = 'application/json';
      bodyToSend = JSON.stringify({
        ...canonical,
        ...(formId ? { formId } : {}),
        'Account Name': canonical.accountName,
        'Category': canonical.category,
        'Prompt': canonical.prompt,
        account_name: canonical.accountName,
        // include any extra keys
        ...Object.fromEntries(Object.entries(src).filter(([k]) => !['accountName','category','prompt','submittedAt'].includes(k))),
      });
    } else {
      const form = new URLSearchParams();
      if (canonical.accountName) form.append('accountName', canonical.accountName);
      if (canonical.category) form.append('category', canonical.category);
      if (canonical.prompt) form.append('prompt', canonical.prompt);
      if (canonical.accountName) form.append('Account Name', canonical.accountName);
      if (canonical.category) form.append('Category', canonical.category);
      if (canonical.prompt) form.append('Prompt', canonical.prompt);
      if (canonical.accountName) form.append('account_name', canonical.accountName);
      form.append('submittedAt', canonical.submittedAt);
      if (formId) form.append('formId', formId);
      Object.entries(src).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (!['accountName', 'category', 'prompt', 'Account Name', 'Category', 'Prompt', 'account_name', 'submittedAt', 'formId'].includes(k)) {
          try { form.append(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (_) {}
        }
      });
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      bodyToSend = form.toString();
      console.log('[form-proxy] Keys sent:', Array.from(form.keys()));
    }

    console.log('[form-proxy] Forwarding to:', target, '| encoding:', encoding);

    const resp = await fetch(target, {
      method: 'POST',
      headers,
      body: bodyToSend,
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

// (Removed stray code that was outside of any route handler)
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
    const fullUrl = process.env.N8N_FULL_URL;
    const base = process.env.N8N_BASE_URL;
    const pathPart = process.env.N8N_PATH;

    let n8nUrl = fullUrl || (base && pathPart ? `${base.replace(/\/$/, '')}/${String(pathPart).replace(/^\//, '')}` : null);

    if (!n8nUrl) {
      console.error('Missing n8n configuration: set N8N_FULL_URL or N8N_BASE_URL + N8N_PATH');
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