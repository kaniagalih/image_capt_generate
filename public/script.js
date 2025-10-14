document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('generateForm');
  const loading = document.getElementById('loading');
  const results = document.getElementById('results');
  const resultsContent = document.getElementById('resultsContent');
  const status = document.getElementById('status');
  const generateBtn = document.getElementById('generateBtn');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const accountName = document.getElementById('accountName').value;
    const category = document.getElementById('category').value;
    const prompt = document.getElementById('prompt').value.trim();

    if (!accountName) {
      showStatus('Please select an Account Name', 'error');
      return;
    }
    if (!category) {
      showStatus('Please select a Category', 'error');
      return;
    }

    loading.classList.add('show');
    results.classList.remove('show');
    generateBtn.disabled = true;
    status.innerHTML = '';

    try {
      // Build rich payload with multiple naming variants so n8n Form / Webhook nodes can map any of them.
      const base = { accountName, category };
      if (prompt) base.prompt = prompt;

      const requestData = {
        // canonical camelCase
        accountName: base.accountName,
        category: base.category,
        prompt: base.prompt,
        // snake_case
        account_name: base.accountName,
        // space labels (common when using n8n form component exported field names)
        'Account Name': base.accountName,
        'Category': base.category,
        'Prompt': base.prompt,
        // generic fallbacks
        text: base.prompt,
        message: base.prompt,
        submittedAt: new Date().toISOString(),
      };

      // Try direct first, then fall back to proxy; allow override via ?mode=direct|proxy
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      const preferDirect = mode ? mode === 'direct' : true;
      const directUrl = 'https://devstreams-agentic-apps.digital-lab.ai/form/1bc429ed-c5a2-4783-9dd8-40eaac8a59f1';
      const proxyUrl = '/api/forward-form';

      let finalData = null;
      let lastError = null;

      const encoding = params.get('encoding') || 'json'; // json | form | multipart

      function buildRequestInit() {
        if (encoding === 'form') {
          const formBody = new URLSearchParams();
            Object.entries(requestData).forEach(([k,v]) => { if (v !== undefined) formBody.append(k, v); });
          return { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formBody.toString() };
        }
        if (encoding === 'multipart') {
          const fd = new FormData();
          Object.entries(requestData).forEach(([k,v]) => { if (v !== undefined) fd.append(k, v); });
          return { body: fd }; // browser sets multipart boundary automatically
        }
        // default json
        return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData) };
      }

      async function post(url) {
        const init = buildRequestInit();
        const resp = await fetch(url, {
          method: 'POST',
          ...init,
        });
        let parsed;
        try { parsed = await resp.json(); }
        catch (_) { try { parsed = await resp.text(); } catch (__) { parsed = null; } }
        return { resp, parsed };
      }

      const order = preferDirect ? [directUrl, proxyUrl] : [proxyUrl, directUrl];
      for (const url of order) {
        try {
          const { resp, parsed } = await post(url);
          if (url === proxyUrl) {
            if (!resp.ok || parsed?.ok === false) {
              const errMsg = parsed?.error || parsed?.body || `Upstream error (${parsed?.status || resp.status})`;
              throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
            }
            finalData = parsed?.body ?? parsed;
            break;
          }
          // direct
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          if (!parsed) throw new Error('Empty response');
          finalData = parsed;
          break;
        } catch (err) {
          console.warn(`Request to ${url} failed:`, err);
          lastError = err;
          // try next option
        }
      }

      loading.classList.remove('show');

      if (!finalData) {
        throw lastError || new Error('Failed to trigger endpoint');
      }

      displayResults(finalData);
  showStatus('Triggered endpoint successfully', 'success');
  console.log('[n8n-debug] Sent payload variants:', requestData);
  console.log('[n8n-debug] Mode:', preferDirect ? 'direct-first' : 'proxy-first', 'Encoding:', encoding);
    } catch (error) {
      console.error('Error:', error);
      loading.classList.remove('show');
      showStatus(`Error: ${error.message}`, 'error');
    } finally {
      generateBtn.disabled = false;
    }
  });

  function displayResults(apiResponse) {
    const html = `<div class="result-item">
        <h3>� n8n Response</h3>
        <pre style="white-space: pre-wrap">${escapeHtml(JSON.stringify(apiResponse, null, 2))}</pre>
      </div>`;
    resultsContent.innerHTML = html;
    results.classList.add('show');
  }

  function showStatus(message, type) {
    status.innerHTML = `<div class="status ${type}">${message}</div>`;
    if (type === 'success') {
      setTimeout(() => (status.innerHTML = ''), 5000);
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
});