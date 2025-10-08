const axios = require('axios');

/**
 * n8n Client Helper
 * Provides convenience methods to trigger n8n workflows either via public webhooks
 * (including ngrok-exposed local instance) or through the authenticated REST API.
 *
 * Environment variables used:
 * - N8N_BASE_URL (e.g., https://your-subdomain.ngrok-free.app or https://n8n.yourdomain.com)
 * - N8N_API_KEY (API key from n8n user settings for REST API calls)
 */
class N8NClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.N8N_BASE_URL || 'http://localhost:5678';
    this.apiKey = options.apiKey || process.env.N8N_API_KEY || null;
    this.timeout = options.timeout || 15000;

    if (this.baseUrl.endsWith('/')) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }
  }

  /**
   * Trigger a webhook (public) workflow
   * @param {string} path - The webhook path portion after the domain. For full URL just pass it.
   * @param {object} payload - Data to send
   * @param {string} method - HTTP method (POST default)
   * @returns {Promise<object>} Response data
   */
  async triggerWebhook(path, payload = {}, method = 'POST') {
    const url = path.startsWith('http') ? path : `${this.baseUrl}/${path.replace(/^\//,'')}`;
    try {
      const res = await axios({
        url,
        method: method.toUpperCase(),
        data: payload,
        timeout: this.timeout,
        headers: { 'Content-Type': 'application/json' }
      });
      return { success: true, url, data: res.data, status: res.status };
    } catch (error) {
      return this._handleError(error, { url, context: 'triggerWebhook' });
    }
  }

  /**
   * Execute a workflow via REST API (requires API Key)
   * Endpoint: POST /api/v1/workflows/:id/run
   * @param {number|string} workflowId - ID of the workflow
   * @param {object} payload - Optional input data overriding nodes
   * @returns {Promise<object>} Execution data
   */
  async runWorkflow(workflowId, payload = {}) {
    if (!this.apiKey) {
      throw new Error('N8N_API_KEY not set. Cannot call authenticated API.');
    }
    const url = `${this.baseUrl}/api/v1/workflows/${workflowId}/run`;
    try {
      const res = await axios.post(url, { workflowData: payload }, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': this.apiKey
        }
      });
      return { success: true, url, data: res.data, status: res.status };
    } catch (error) {
      return this._handleError(error, { url, workflowId, context: 'runWorkflow' });
    }
  }

  /**
   * Get workflow metadata (authenticated)
   */
  async getWorkflow(workflowId) {
    if (!this.apiKey) {
      throw new Error('N8N_API_KEY not set. Cannot call authenticated API.');
    }
    const url = `${this.baseUrl}/api/v1/workflows/${workflowId}`;
    try {
      const res = await axios.get(url, {
        timeout: this.timeout,
        headers: { 'X-N8N-API-KEY': this.apiKey }
      });
      return { success: true, url, data: res.data, status: res.status };
    } catch (error) {
      return this._handleError(error, { url, workflowId, context: 'getWorkflow' });
    }
  }

  _handleError(error, meta = {}) {
    if (error.response) {
      return {
        success: false,
        error: 'HTTP_ERROR',
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        meta
      };
    } else if (error.request) {
      return {
        success: false,
        error: 'NO_RESPONSE',
        message: 'No response received from n8n server',
        meta
      };
    } else {
      return {
        success: false,
        error: 'REQUEST_SETUP_ERROR',
        message: error.message,
        meta
      };
    }
  }
}

module.exports = { N8NClient };
