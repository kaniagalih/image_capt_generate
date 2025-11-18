document.addEventListener('DOMContentLoaded', async function () {
  const form = document.getElementById('generateForm');
  const loading = document.getElementById('loading');
  const results = document.getElementById('results');
  const resultsContent = document.getElementById('resultsContent');
  const status = document.getElementById('status');
  const generateBtn = document.getElementById('generateBtn');

  // Initialize Supabase client from server config
  let supabase;
  try {
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
    console.log('✅ Supabase client initialized from server config');
  } catch (error) {
    console.error('Failed to load config:', error);
    showStatus('Failed to initialize Supabase client', 'error');
    return;
  }

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

    // Generate unique jobId for this request
    const jobId = crypto.randomUUID();
    
    loading.classList.add('show');
    results.classList.remove('show');
    generateBtn.disabled = true;
    status.innerHTML = '';

    try {
      showStatus('Setting up realtime listener...', 'info');

      // Set up Supabase Realtime listener for both INSERT and UPDATE events
      const channel = supabase
        .channel(`image-generation-${jobId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'image_generation',
            filter: `id=eq.${jobId}`
          },
          (payload) => {
            console.log('✅ Job record created:', payload.new);
            showStatus('Job created! Processing in progress...', 'info');
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'image_generation',
            filter: `id=eq.${jobId}`
          },
          (payload) => {
            console.log('🎉 Job updated with results!', payload.new);
            
            // Check if we have both image and caption (job completed)
            if (payload.new.image_link && payload.new.caption) {
              loading.classList.remove('show');
              displayResults(payload.new);
              showStatus('Image generated successfully!', 'success');
              
              // Clean up the realtime listener
              supabase.removeChannel(channel);
            } else {
              showStatus('Processing... results will appear when ready', 'info');
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Subscribed to realtime updates for jobId:', jobId);
            showStatus('Connected! Sending request to n8n...', 'info');
            
            // Now trigger n8n workflow
            triggerN8nWorkflow(jobId, accountName, category, prompt);
          }
        });

    } catch (error) {
      console.error('Error:', error);
      loading.classList.remove('show');
      showStatus(`Error: ${error.message}`, 'error');
      generateBtn.disabled = false;
    }
  });

  async function triggerN8nWorkflow(jobId, accountName, category, prompt) {
    try {
      // First, insert the initial row with just the ID and prompt data
      const { error: insertError } = await supabase
        .from('image_generation')
        .insert({
          id: jobId,
          image_name: '', // Required field - will be updated by n8n
          username: accountName,
          caption: '', // Initialize as empty - will be updated by n8n
          image_link: '', // Initialize as empty - will be updated by n8n
          category: category,
          prompt: prompt || `Generate an image and caption for account "${accountName}" with theme "${category}".`
        });

      if (insertError) {
        throw new Error(`Failed to create job record: ${insertError.message}`);
      }

      showStatus('Job created! Sending to n8n for processing...', 'info');

      const fallbackPrompt = `Generate an image and caption for account "${accountName}" with theme "${category}".`;
      const requestData = {
        jobId: jobId, // n8n will use this to UPDATE the existing row
        accountName: accountName,
        category: category,
        prompt: prompt || '',
        chatInput: (prompt || '').trim() || fallbackPrompt,
        submittedAt: new Date().toISOString(),
      };

      // Send to n8n webhook (fire-and-forget since we use Supabase Realtime)
      fetch('/api/trigger-n8n', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      }).catch(async (error) => {
        console.error('Error sending to n8n:', error);
        
        // If n8n fails, update the record to show error
        await supabase
          .from('image_generation')
          .update({ 
            caption: `Error: Failed to send to n8n - ${error.message}`,
            image_link: null 
          })
          .eq('id', jobId);
      });

      showStatus('Request sent to n8n! Processing will update automatically...', 'info');
      
    } catch (error) {
      console.error('Error triggering n8n:', error);
      loading.classList.remove('show');
      showStatus(`Error: ${error.message}`, 'error');
      generateBtn.disabled = false;
    }
  }

  function displayResults(data) {
    // Extract image and caption from Supabase data
    const imgCandidate = data.image_link || data.image_url || data.image || data.url;
    const hasImage = typeof imgCandidate === 'string' && imgCandidate.length > 0;
    const hasCaption = typeof data.caption === 'string' && data.caption.length > 0;

    let blocks = '';

    if (hasImage) {
      const { src: imgSrc, altSrc } = toRenderableImageSrc(imgCandidate);
      if (imgSrc) {
        blocks += `
          <div class="result-item">
            <h3>Generated Image</h3>
            <img class="generated-image" src="${escapeHtml(imgSrc)}" ${altSrc ? `data-alt="${escapeHtml(altSrc)}" onerror="this.onerror=null; if(this.dataset.alt) this.src=this.dataset.alt;"` : ''} alt="Generated" />
          </div>
        `;
      } else {
        blocks += `
          <div class="result-item">
            <h3>Generated Image</h3>
            <div class="generated-caption">Received image value but it's not a URL or data URI. Value: ${escapeHtml(String(imgCandidate))}</div>
          </div>
        `;
      }
    }

    if (hasCaption) {
      blocks += `
        <div class="result-item">
          <h3>Generated Caption</h3>
          <div class="generated-caption">${escapeHtml(data.caption)}</div>
        </div>
      `;
    }

    if (!hasImage && !hasCaption) {
      blocks = `
        <div class="result-item">
          <h3>Result Received</h3>
          <div class="generated-caption">Data received from n8n but no image or caption found.</div>
          <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
        </div>
      `;
    }

    resultsContent.innerHTML = blocks;
    results.classList.add('show');
    generateBtn.disabled = false;
  }

  function toRenderableImageSrc(value) {
    if (typeof value !== 'string') return { src: null, altSrc: null };
    const v = value.trim();
    if (!v) return { src: null, altSrc: null };
    // Accept http/https URLs
    if (/^https?:\/\//i.test(v)) {
      // If it's a Google Drive share link, convert to a direct view URL
      if (/^https?:\/\/drive\.google\.com\//.test(v)) {
        const id = extractGoogleDriveId(v);
        if (id) {
          return {
            src: `https://drive.google.com/uc?export=view&id=${id}`,
            // Some orgs block view, fall back to download URL which many browsers can still render in <img>
            altSrc: `https://drive.google.com/uc?export=download&id=${id}`,
          };
        }
      }
      return { src: v, altSrc: null };
    }
    // Accept data URIs
    if (/^data:image\//i.test(v)) return { src: v, altSrc: null };
    return { src: null, altSrc: null };
  }

  function extractGoogleDriveId(url) {
    try {
      // Patterns: /file/d/<id>/view, open?id=<id>, uc?id=<id>, thumbnail?id=<id>
      const m1 = url.match(/\/file\/d\/([^/]+)\//);
      if (m1) return m1[1];
      const m2 = url.match(/[?&]id=([^&#]+)/);
      if (m2) return m2[1];
      return null;
    } catch (_) { return null; }
  }

  function showStatus(message, type) {
    status.innerHTML = `<div class="status ${type}">${message}</div>`;
    if (type === 'success' || type === 'info') {
      setTimeout(() => (status.innerHTML = ''), 8000);
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