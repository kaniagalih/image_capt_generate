document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('generateForm');
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    const resultsContent = document.getElementById('resultsContent');
    const status = document.getElementById('status');
    const generateBtn = document.getElementById('generateBtn');
    const webhookUrl = document.getElementById('webhookUrl');
    
    // Update webhook URL with current host
    const currentHost = window.location.origin;
    webhookUrl.textContent = `${currentHost}/form-test/1bc429ed-c5a2-4783-9dd8-40eaac8a59f1`;
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const accountName = document.getElementById('accountName').value;
        const category = document.getElementById('category').value;
        const prompt = document.getElementById('prompt').value.trim();
        const type = document.getElementById('type').value;
        
        if (!accountName) {
            showStatus('Please select an Account Name', 'error');
            return;
        }
        
        if (!category) {
            showStatus('Please select a Category', 'error');
            return;
        }
        
        // Show loading state
        loading.classList.add('show');
        results.classList.remove('show');
        generateBtn.disabled = true;
        status.innerHTML = '';
        
        try {
            const requestData = {
                accountName: accountName,
                category: category,
                type: type
            };
            
            if (prompt) {
                requestData.prompt = prompt;
            }
            
            const response = await fetch('/form-test/1bc429ed-c5a2-4783-9dd8-40eaac8a59f1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Failed to generate content');
            }
            
            // Hide loading
            loading.classList.remove('show');
            
            // Show results
            displayResults(data.data);
            showStatus(`Content generated successfully! Job ID: ${data.jobId}`, 'success');
            
        } catch (error) {
            console.error('Error:', error);
            loading.classList.remove('show');
            showStatus(`Error: ${error.message}`, 'error');
        } finally {
            generateBtn.disabled = false;
        }
    });
    
    function displayResults(data) {
        let html = '';
        
        html += `<div class="result-item">
            <h3>📋 Generation Details</h3>
            <p><strong>Job ID:</strong> ${data.jobId}</p>
            <p><strong>Account Name:</strong> ${data.accountName}</p>
            <p><strong>Category:</strong> ${data.category}</p>
            <p><strong>Prompt:</strong> ${data.prompt || 'N/A'}</p>
            <p><strong>Type:</strong> ${data.type}</p>
            <p><strong>Status:</strong> ${data.status}</p>
            <p><strong>Generated:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
        </div>`;
        
        if (data.result.image) {
            html += `<div class="result-item">
                <h3>🖼️ Generated Image</h3>
                <img src="${data.result.image.url}" alt="Generated Image" class="generated-image" />
                <p style="margin-top: 10px; font-size: 14px; color: #6b7280;">
                    Size: ${data.result.image.width}x${data.result.image.height} | Format: ${data.result.image.format}
                </p>
            </div>`;
        }
        
        if (data.result.caption) {
            html += `<div class="result-item">
                <h3>📝 Generated Caption</h3>
                <div class="generated-caption">
                    ${data.result.caption.text}
                </div>
                <p style="margin-top: 10px; font-size: 14px; color: #6b7280;">
                    Confidence: ${(data.result.caption.confidence * 100).toFixed(1)}%
                </p>
            </div>`;
        }
        
        resultsContent.innerHTML = html;
        results.classList.add('show');
    }
    
    function showStatus(message, type) {
        status.innerHTML = `<div class="status ${type}">${message}</div>`;
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                status.innerHTML = '';
            }, 5000);
        }
    }
    
    // Test form endpoint functionality
    window.testN8nForm = async function() {
        const testData = {
            accountName: "nia_dhanii",
            category: "Lifestyle",
            prompt: "A beautiful sunset over mountains",
            type: "image"
        };
        
        try {
            const response = await fetch('/form-test/1bc429ed-c5a2-4783-9dd8-40eaac8a59f1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testData)
            });
            
            const data = await response.json();
            console.log('Test form response:', data);
            return data;
        } catch (error) {
            console.error('Test form error:', error);
            return error;
        }
    };
    
    // Test legacy webhook functionality
    window.testLegacyWebhook = async function() {
        const testData = {
            prompt: "A beautiful sunset over mountains",
            type: "both",
            userId: "test-user"
        };
        
        try {
            const response = await fetch('/api/n8n/webhook', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testData)
            });
            
            const data = await response.json();
            console.log('Test legacy webhook response:', data);
            return data;
        } catch (error) {
            console.error('Test legacy webhook error:', error);
            return error;
        }
    };
    
    // Add test functions to console
    console.log('💡 To test the n8n form endpoint from console, run: testN8nForm()');
    console.log('💡 To test the legacy webhook from console, run: testLegacyWebhook()');
});