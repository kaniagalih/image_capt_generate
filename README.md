# Image Caption Generator with Supabase Realtime

This app integrates a frontend with n8n workflows using Supabase Realtime for instant updates. Users submit image generation requests and see results appear in real-time as n8n processes them.

## How it works
1. **Job Creation**: Frontend creates initial record in Supabase `image_generation` table
2. **Workflow Trigger**: Frontend sends request to n8n via server proxy
3. **Real-time Listening**: Frontend subscribes to Supabase changes for the job ID
4. **Processing**: n8n generates image and caption (1m50s process)
5. **Result Update**: n8n updates Supabase record with results
6. **Instant Display**: Frontend receives real-time update and shows results

## Database Schema

### Supabase `image_generation` Table
```sql
CREATE TABLE image_generation (
  id TEXT PRIMARY KEY,
  image_name TEXT NOT NULL,
  username TEXT NOT NULL,
  caption TEXT NOT NULL,
  image_link TEXT NOT NULL,
  category TEXT NOT NULL,
  prompt TEXT NOT NULL
);

-- Enable real-time replication
ALTER PUBLICATION supabase_realtime ADD TABLE image_generation;
```

## API Endpoints

### Get Configuration
```
GET /api/config
```
Returns Supabase credentials for frontend initialization:
```json
{
  "supabaseUrl": "https://your-supabase-url",
  "supabaseKey": "your-anon-key"
}
```

### Health Check
```
GET /health
```

### Trigger n8n Workflow
```
POST /api/trigger-n8n
Content-Type: application/json
```
Body example:
```json
{
  "jobId": "uuid-generated-by-frontend",
  "accountName": "nia_dhanii",
  "category": "Fitness", 
  "prompt": "Generate a motivational fitness post",
  "chatInput": "Create inspiring gym content"
}
```

## Frontend Flow

### 1. Initialize Supabase Client
```javascript
// Fetch config from server
const config = await fetch('/api/config').then(r => r.json());
const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
```

### 2. Create Job Record
```javascript
const jobId = crypto.randomUUID();
await supabase.from('image_generation').insert({
  id: jobId,
  image_name: '',
  username: accountName,
  caption: '',
  image_link: '',
  category: category,
  prompt: prompt
});
```

### 3. Set Up Real-time Listener
```javascript
const channel = supabase
  .channel(`image-generation-${jobId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public', 
    table: 'image_generation',
    filter: `id=eq.${jobId}`
  }, (payload) => {
    // Display results when n8n updates the record
    displayResults(payload.new);
  })
  .subscribe();
```

### 4. Trigger n8n Workflow
```javascript
fetch('/api/trigger-n8n', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jobId, accountName, category, prompt })
});
```

## n8n Workflow Configuration

### 1. Webhook Node
- Set Response Mode to **"Respond Immediately"** or add a **"Respond to Webhook"** node
- Receive: `jobId`, `accountName`, `category`, `prompt`, `chatInput`

### 2. Processing Nodes
- Generate image and caption (your existing workflow)
- Process takes ~1m50s

### 3. Supabase Update Node  
- **Operation**: Update
- **Table**: `image_generation`
- **Update Key**: `id`
- **Update Value**: `{{ $('Webhook').item.json.jobId }}`
- **Fields to Update**:
  - `image_name`: Generated filename
  - `caption`: Generated caption text
  - `image_link`: Generated image URL

## Environment Variables

Create a `.env` file with these required variables:

### n8n Configuration
```env
# n8n webhook URL
N8N_FULL_URL=https://devstreams-agentic-apps.digital-lab.ai/webhook/cyber-army
N8N_SECRET=your-n8n-secret-token

### Supabase Configuration
```env
# Supabase connection
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```



## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Setup Supabase
1. Create a Supabase project
2. Create the `image_generation` table (see schema above)
3. Enable real-time replication for the table
4. Get your URL and anon key from project settings

### 4. Configure n8n Workflow
1. Add "Respond to Webhook" node after your Webhook node
2. At the end of your workflow, add Supabase UPDATE node:
   - Operation: Update
   - Table: image_generation  
   - Update Key: id
   - Update Value: `{{ $('Webhook').item.json.jobId }}`
   - Fields: image_name, caption, image_link

### 5. Run the Application
```bash
npm start
```

Open http://localhost:3000 and test the real-time image generation!
