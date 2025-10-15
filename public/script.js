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
      // Build payload (include multiple naming variants to help n8n Form mapping)
      const base = { accountName, category };
      if (prompt) base.prompt = prompt;

      const requestData = {
        // canonical
        accountName: base.accountName,
        category: base.category,
        prompt: base.prompt,
        // labels often used by n8n Form fields
        'Account Name': base.accountName,
        'Category': base.category,
        'Prompt': base.prompt,
        // fallbacks
        account_name: base.accountName,
        text: base.prompt,
        message: base.prompt,
        submittedAt: new Date().toISOString(),
      };

      // Always send to our server which forwards to the n8n Form endpoint
      const resp = await fetch('/api/forward-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      let parsed;
      try { parsed = await resp.json(); }
      catch (_) { try { parsed = await resp.text(); } catch (__) { parsed = null; } }

      loading.classList.remove('show');

      if (!resp.ok || parsed?.ok === false) {
        const errMsg = parsed?.error || parsed?.body || parsed || `HTTP ${resp.status}`;
        throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
      }

      const finalData = parsed?.body ?? parsed;
      displayResults(finalData);
      showStatus('Submitted to n8n Form successfully', 'success');
      console.log('[n8n-form-debug] Sent payload variants:', requestData);
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
    <h3>n8n Form Response</h3>
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