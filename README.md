# Minimal Image & Caption Mock Service

Single-purpose Node.js service exposing exactly one functional endpoint plus a health check.

## Endpoints

### Health
```
GET /health
```
Returns JSON status.

### Form Submission (only accepted formId)
```
POST /form/1bc429ed-c5a2-4783-9dd8-40eaac8a59f1
```
Body (JSON):
```json
{
  "accountName": "nia_dhanii",
  "category": "Lifestyle",
  "prompt": "Cyber cat on neon hoverboard"
}
```
Optional: set environment variable `FORM_SHARED_TOKEN` and then include header:
```
X-Form-Token: <value>
```

### Sample curl
```bash
curl -X POST http://localhost:3000/form/1bc429ed-c5a2-4783-9dd8-40eaac8a59f1 \
  -H "Content-Type: application/json" \
  -d '{"accountName":"nia_dhanii","category":"Lifestyle","prompt":"Cyber cat on neon hoverboard"}'
```

Response (mock example):
```json
{
  "success": true,
  "jobId": "<uuid>",
  "formId": "1bc429ed-c5a2-4783-9dd8-40eaac8a59f1",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "message": "Image generated successfully",
  "data": {
    "accountName": "nia_dhanii",
    "category": "Lifestyle",
    "prompt": "Cyber cat on neon hoverboard",
    "type": "image",
    "result": {
      "image": {"url":"https://via.placeholder.com/..."},
      "caption": {"text":"A creative interpretation..."}
    },
    "metadata": {"jobId": "<uuid>", "processedAt": "2025-01-01T00:00:00.000Z"}
  }
}
```

## Install & Run
```bash
npm install
npm start
```
Dev (auto-reload if you keep nodemon):
```bash
npm run dev
```

## Environment (optional)
```
FORM_SHARED_TOKEN=supersecret123
PORT=3000
```

## Notes
- Other previous endpoints, web UI, and integration helpers were removed.
- Public folder can be deleted if not needed (still present if you want to serve a static page, but unused by code).
- Dependencies trimmed to only express + uuid.

## License
ISC
