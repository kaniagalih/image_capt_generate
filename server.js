require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch'); 
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Accept plain text bodies for flexible n8n HTTP Request configurations
app.use(express.text({ type: ['text/plain'] }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory job store (simple; replace with Redis for production)
const jobs = new Map();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', message: 'server running', timestamp: new Date().toISOString() });
});

// Serve client configuration
app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY
  });
});

// Utility to get the publicly reachable base URL for callbacks
function getPublicBaseUrl(req) {
  // Prefer explicit configuration, else infer from request headers
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

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

// New: Async job kickoff endpoint to avoid 504 timeouts
// Returns quickly with a jobId, while n8n posts the result back to our callback.
app.post('/api/generate', async (req, res) => {
  try {
    const payload = req.body || {};
    const jobId = uuidv4();
    const createdAt = new Date().toISOString();
    
    // Debug the callback URL we're sending to n8n
    const callbackUrl = `${getPublicBaseUrl(req)}/api/n8n/callback?jobId=${encodeURIComponent(jobId)}`;
    console.log('Generated job:', { jobId, callbackUrl });

    jobs.set(jobId, { id: jobId, status: 'queued', createdAt, updatedAt: createdAt });

    const fallbackPrompt = `Generate an image and caption for account "${payload.accountName || 'unknown'}" with theme "${payload.category || 'general'}".`;
    const enriched = {
      ...payload,
      chatInput: (payload.chatInput || payload.prompt || '').toString().trim() || fallbackPrompt,
      jobId,
      callbackUrl: `${getPublicBaseUrl(req)}/api/n8n/callback?jobId=${encodeURIComponent(jobId)}`,
      _serverTimestamp: createdAt,
      _source: 'web-ui-async',
    };

    // Resolve n8n webhook URL
    const fullUrl = process.env.N8N_FULL_URL;
    const base = process.env.N8N_BASE_URL;
    const pathPart = process.env.N8N_PATH;
    const n8nUrl = fullUrl || (base && pathPart ? `${base.replace(/\/$/, '')}/${String(pathPart).replace(/^\//, '')}` : null);
    if (!n8nUrl) {
      console.error('Missing n8n configuration: set N8N_FULL_URL or N8N_BASE_URL + N8N_PATH');
      jobs.set(jobId, { id: jobId, status: 'failed', error: 'Server not configured for n8n', createdAt, updatedAt: new Date().toISOString() });
      return res.status(500).json({ error: 'Server not configured for n8n' });
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(process.env.N8N_SECRET ? { 'x-n8n-secret': process.env.N8N_SECRET } : {}),
    };

    // Fire-and-forget call to n8n. Configure your Webhook node to "Respond immediately".
    fetch(n8nUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(enriched),
    })
      .then(async (n8nResp) => {
        // We don't rely on this response, but log for visibility
        const text = await n8nResp.text().catch(() => '');
        debug('async-n8n-kickoff', { status: n8nResp.status, text: text?.slice(0, 200) });
      })
      .catch((err) => {
        console.error('Failed to POST job to n8n:', err);
        const now = new Date().toISOString();
        const job = jobs.get(jobId);
        if (job && job.status === 'queued') jobs.set(jobId, { ...job, status: 'failed', error: 'Failed to reach n8n', updatedAt: now });
      });

    // Respond immediately with job details
    return res.status(202).json({ jobId, status: 'queued' });
  } catch (err) {
    console.error('Error starting async job:', err);
    return res.status(500).json({ error: 'Failed to start job' });
  }
});

// n8n will POST (or GET) results here: { jobId, caption, image_link, image, ... }
function handleN8nCallback(req, res) {
  try {
    // Debug incoming request
    console.log('Callback received:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: req.query,
      body: req.body
    });
    
    const contentType = req.headers['content-type'] || '';
    let body = req.body;
    // If body came as text/plain, try to parse JSON
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = { raw: req.body }; }
    }
    const payload = { ...(req.query || {}), ...(body || {})};
    const jobId = payload.jobId || payload.id || payload.job_id;
    if (!jobId) {
      debug('n8n-callback-missing-jobId', { contentType, query: req.query, body: req.body });
      return res.status(400).json({ ok: false, error: 'Missing jobId in callback' });
    }

    const now = new Date().toISOString();
    const prev = jobs.get(jobId) || { id: jobId, createdAt: now };
    const result = { ...payload };

    jobs.set(jobId, { ...prev, id: jobId, status: 'completed', result, updatedAt: now });
    debug('n8n-callback', { jobId, contentType, keys: Object.keys(result) });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error handling n8n callback:', err);
    return res.status(500).json({ ok: false });
  }
}

app.post('/api/n8n/callback', handleN8nCallback);
app.get('/api/n8n/callback', handleN8nCallback);

// Client polls job status
app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  return res.json(job);
});

// Simple debug endpoint to list current jobs (ids and statuses only)
app.get('/api/jobs', (req, res) => {
  const list = [];
  for (const [id, j] of jobs.entries()) {
    list.push({ id, status: j.status, updatedAt: j.updatedAt, createdAt: j.createdAt });
  }
  res.json({ count: list.length, jobs: list.sort((a,b)=> (a.updatedAt > b.updatedAt ? -1 : 1)) });
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