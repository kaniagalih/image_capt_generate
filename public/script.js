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
      // Build payload for n8n webhook trigger
      const fallbackPrompt = `Generate an image and caption for account "${accountName}" with theme "${category}".`;
      const requestData = {
        accountName: accountName,
        category: category,
        prompt: prompt || '',
        chatInput: (prompt || '').trim() || fallbackPrompt,
        submittedAt: new Date().toISOString(),
      };

      // Send to n8n webhook endpoint
      const resp = await fetch('/api/trigger-n8n', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      let parsed;
      try { parsed = await resp.json(); }
      catch (_) { try { parsed = await resp.text(); } catch (__) { parsed = null; } }

      loading.classList.remove('show');

      if (!resp.ok || parsed?.ok === false) {
        const errMsg = parsed?.error || parsed?.n8nBody || parsed || `HTTP ${resp.status}`;
        throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
      }

      displayResults(parsed);
      showStatus('Successfully submitted to n8n webhook', 'success');
      // Quiet success path; use Raw Response block for details
    } catch (error) {
      console.error('Error:', error);
      loading.classList.remove('show');
      showStatus(`Error: ${error.message}`, 'error');
    } finally {
      generateBtn.disabled = false;
    }
  });

  function displayResults(apiResponse) {
    const payload = normalizePayload(apiResponse);

    const hasImage = typeof payload.image === 'string' && payload.image.length > 0;
    const hasCaption = typeof payload.caption === 'string' && payload.caption.length > 0;

    // Build display blocks
    let blocks = '';

    if (hasImage) {
      const imgSrc = toRenderableImageSrc(payload.image);
      if (imgSrc) {
        blocks += `
          <div class="result-item">
            <h3>Generated Image</h3>
            <img class="generated-image" src="${escapeHtml(imgSrc)}" alt="Generated" />
          </div>
        `;
      } else {
        blocks += `
          <div class="result-item">
            <h3>Generated Image</h3>
            <div class="generated-caption">Received image value but it's not a URL or data URI. Value: ${escapeHtml(String(payload.image))}</div>
          </div>
        `;
      }
    }

    if (hasCaption) {
      blocks += `
        <div class="result-item">
          <h3>Generated Caption</h3>
          <div class="generated-caption">${escapeHtml(payload.caption)}</div>
        </div>
      `;
    }

    // Always show the raw response as a fallback/debug
    blocks += `
      <div class="result-item">
        <h3>Raw Response</h3>
        <pre style="white-space: pre-wrap">${escapeHtml(JSON.stringify(apiResponse, null, 2))}</pre>
      </div>
    `;

    resultsContent.innerHTML = blocks;
    results.classList.add('show');
  }

  function normalizePayload(apiResponse) {
    try {
      // If shape is { ok, n8nStatus, n8nBody }
      const body = apiResponse?.n8nBody ?? apiResponse?.body ?? apiResponse;
      if (typeof body === 'string') {
        try { return JSON.parse(body); } catch { return { message: body }; }
      }
      if (body && typeof body === 'object') return body;
    } catch (_) {}
    return {};
  }

  function toRenderableImageSrc(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    if (!v) return null;
    // Accept http/https URLs
    if (/^https?:\/\//i.test(v)) return v;
    // Accept data URIs
    if (/^data:image\//i.test(v)) return v;
    return null;
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