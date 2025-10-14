# n8n Frontend + Proxy Backend

This app serves a simple frontend and a single backend proxy endpoint that forwards requests to your n8n Webhook. Secrets remain on the server, and the webhook URL is not exposed to the browser.

## How it works
- Frontend (static HTML in `public/`) collects form data.
- Backend (`/api/trigger-n8n`) enriches and forwards the payload to your n8n Webhook URL.
- Optional shared secret header `x-n8n-secret` can be set to verify the server call in n8n.

## Endpoints

### Health
```
GET /health
```

### Trigger n8n (proxy)
```
POST /api/trigger-n8n
Content-Type: application/json
```
Body (example):
```json
{
  "accountName": "nia_dhanii",
  "category": "Lifestyle",
  "prompt": "Cyber cat on neon hoverboard"
}
```

Server forwards this payload to the configured n8n webhook and returns n8n's response.

## Environment variables
Set one of the following:
- `N8N_FULL_WEBHOOK_URL` (e.g., https://n8n.example.com/webhook/my-workflow)

Or both of:
- `N8N_WEBHOOK_BASE_URL` (e.g., https://n8n.example.com/webhook)
- `N8N_WEBHOOK_PATH` (e.g., my-workflow)

Optional:
- `N8N_SECRET` (shared secret added as header `x-n8n-secret`)
- `PORT` (default 3000)

## Run locally
```bash
npm install
npm start
```

Then open http://localhost:3000 and submit the form.

## Notes
- The server uses a single route `/api/trigger-n8n` based on the Next.js example in `nextjs_n_8_n_integration.jsx` (adapted to Express here).
- Old mock endpoints and unused files were removed to keep the code minimal and focused.

## License
ISC
