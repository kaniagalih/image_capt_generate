const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Store for generated images/captions (in production, use a database)
const generatedContent = new Map();

// Mock image generation function (replace with actual AI service)
async function generateImage(prompt) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // This is a mock implementation
    // In production, integrate with services like:
    // - OpenAI DALL-E
    // - Stability AI
    // - Midjourney API
    // - Local Stable Diffusion
    
    return {
        url: `https://via.placeholder.com/512x512/4f46e5/ffffff?text=${encodeURIComponent(prompt.substring(0, 50))}`,
        prompt: prompt,
        width: 512,
        height: 512,
        format: 'png',
        generated_at: new Date().toISOString()
    };
}

// Mock caption generation function (replace with actual AI service)
async function generateCaption(prompt) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // This is a mock implementation
    // In production, integrate with services like:
    // - OpenAI GPT-4
    // - Google Cloud Vision API
    // - AWS Rekognition
    // - Local LLM models
    
    const captions = [
        `A creative interpretation of "${prompt}" showcasing vibrant colors and dynamic composition.`,
        `An artistic representation featuring "${prompt}" with modern aesthetic elements.`,
        `A compelling visual narrative inspired by "${prompt}" with attention to detail and atmosphere.`,
        `An imaginative scene depicting "${prompt}" in a contemporary artistic style.`
    ];
    
    return {
        text: captions[Math.floor(Math.random() * captions.length)],
        prompt: prompt,
        confidence: 0.85 + Math.random() * 0.1,
        generated_at: new Date().toISOString()
    };
}

// Basic health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Image Caption Generate API is running',
        timestamp: new Date().toISOString()
    });
});

// n8n form endpoint matching the ngrok URL pattern
app.post('/form-test/:formId', async (req, res) => {
    try {
        const { formId } = req.params;
        console.log(`Received n8n form submission for form ID: ${formId}`);
        console.log('Request body:', req.body);
        console.log('Request headers:', req.headers);
        
        // Extract form data matching the n8n form structure
        const formData = req.body;
        const accountName = formData.accountName || formData.account_name || formData['Account Name'];
        const category = formData.category || formData.Category;
        const prompt = formData.prompt || formData.Prompt || formData.text || formData.message;
        
        // Define valid options based on the form
        const validAccountNames = [
            'nia_dhanii',
            'budi_hartono26', 
            'hendra_wijaya_brave',
            'tikaamelia30',
            'mama_yuni_53',
            'raka_pradanaaa.a'
        ];
        
        const validCategories = [
            'Lifestyle',
            'Health', 
            'Nutrition',
            'Fitness',
            'Medical',
            'Mental Health',
            'Routines'
        ];
        
        // Validate required fields
        if (!accountName) {
            return res.status(400).json({
                success: false,
                error: 'Account Name is required',
                message: 'Please provide an accountName field in the request body',
                formId: formId,
                validOptions: validAccountNames,
                received: formData
            });
        }
        
        if (!category) {
            return res.status(400).json({
                success: false,
                error: 'Category is required', 
                message: 'Please provide a category field in the request body',
                formId: formId,
                validOptions: validCategories,
                received: formData
            });
        }
        
        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'Prompt is required',
                message: 'Please provide a prompt field in the request body',
                formId: formId,
                received: formData
            });
        }
        
        // Validate field values
        if (!validAccountNames.includes(accountName)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Account Name',
                message: `Account Name must be one of: ${validAccountNames.join(', ')}`,
                formId: formId,
                provided: accountName,
                validOptions: validAccountNames
            });
        }
        
        if (!validCategories.includes(category)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Category',
                message: `Category must be one of: ${validCategories.join(', ')}`,
                formId: formId,
                provided: category,
                validOptions: validCategories
            });
        }

        // Validate form ID (you can add specific form ID validation here)
        if (!formId || formId.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Invalid form ID',
                message: 'Form ID must be provided and valid',
                formId: formId
            });
        }

        const jobId = uuidv4();
        const timestamp = new Date().toISOString();
        
        // Process the request based on type
        let result = {};
        
        if (type === 'image' || type === 'both') {
            result.image = await generateImage(prompt);
        }
        
        if (type === 'caption' || type === 'both') {
            result.caption = await generateCaption(prompt);
        }
        
        // Store the result with form ID tracking and form fields
        const response = {
            jobId,
            formId,
            timestamp,
            accountName,
            category,
            prompt,
            type,
            result,
            status: 'completed',
            source: 'n8n-form'
        };
        
        generatedContent.set(jobId, response);
        
        // Send response back to n8n in expected format
        res.json({
            success: true,
            jobId,
            formId,
            timestamp,
            message: 'Image generated successfully',
            data: {
                accountName,
                category,
                prompt,
                type,
                result,
                metadata: {
                    jobId,
                    formId,
                    accountName,
                    category,
                    processedAt: timestamp
                }
            }
        });
        
    } catch (error) {
        console.error('Error processing n8n form submission:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message,
            timestamp: new Date().toISOString(),
            formId: req.params.formId
        });
    }
});

// Legacy webhook endpoint for backward compatibility
app.post('/api/n8n/webhook', async (req, res) => {
    try {
        console.log('Received legacy n8n webhook:', req.body);
        
        const { prompt, type = 'both', userId, sessionId } = req.body;
        
        if (!prompt) {
            return res.status(400).json({
                error: 'Prompt is required',
                received: req.body
            });
        }

        const jobId = uuidv4();
        const timestamp = new Date().toISOString();
        
        // Process the request based on type
        let result = {};
        
        if (type === 'image' || type === 'both') {
            result.image = await generateImage(prompt);
        }
        
        if (type === 'caption' || type === 'both') {
            result.caption = await generateCaption(prompt);
        }
        
        // Store the result
        const response = {
            jobId,
            timestamp,
            prompt,
            type,
            userId: userId || 'anonymous',
            sessionId: sessionId || jobId,
            result,
            status: 'completed',
            source: 'legacy-webhook'
        };
        
        generatedContent.set(jobId, response);
        
        // Send response back to n8n
        res.json({
            success: true,
            jobId,
            timestamp,
            data: response
        });
        
    } catch (error) {
        console.error('Error processing n8n webhook:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Endpoint to retrieve generated content by jobId
app.get('/api/content/:jobId', (req, res) => {
    const { jobId } = req.params;
    const content = generatedContent.get(jobId);
    
    if (!content) {
        return res.status(404).json({
            error: 'Content not found',
            jobId
        });
    }
    
    res.json(content);
});

// Endpoint to list all generated content (for debugging)
app.get('/api/content', (req, res) => {
    const allContent = Array.from(generatedContent.values());
    res.json({
        total: allContent.length,
        content: allContent
    });
});

// GET endpoint for form testing (shows form info)
app.get('/form-test/:formId', (req, res) => {
    const { formId } = req.params;
    
    const validAccountNames = [
        'nia_dhanii',
        'budi_hartono26', 
        'hendra_wijaya_brave',
        'tikaamelia30',
        'mama_yuni_53',
        'raka_pradanaaa.a'
    ];
    
    const validCategories = [
        'Lifestyle',
        'Health', 
        'Nutrition',
        'Fitness',
        'Medical',
        'Mental Health',
        'Routines'
    ];
    
    res.json({
        success: true,
        formId: formId,
        title: 'Image generation',
        description: 'This form will allow you to generate images',
        message: 'Form endpoint is active',
        instructions: {
            method: 'POST',
            url: `/form-test/${formId}`,
            requiredFields: ['accountName', 'category', 'prompt'],
            optionalFields: ['type'],
            defaultType: 'image'
        },
        formFields: {
            accountName: {
                label: 'Account Name',
                type: 'select',
                required: true,
                options: validAccountNames
            },
            category: {
                label: 'Category',
                type: 'select', 
                required: true,
                options: validCategories
            },
            prompt: {
                label: 'Prompt',
                type: 'textarea',
                required: false,
                placeholder: 'Input your prompt or image idea'
            }
        },
        example: {
            accountName: 'nia_dhanii',
            category: 'Lifestyle',
            prompt: 'A beautiful sunset over mountains',
            type: 'image'
        }
    });
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
        title: 'Image & Caption Generator API',
        version: '1.0.0',
        endpoints: {
            health: {
                method: 'GET',
                url: '/health',
                description: 'Health check endpoint'
            },
            n8nForm: {
                method: 'POST',
                url: '/form-test/{formId}',
                description: 'n8n form submission endpoint',
                example: `${baseUrl}/form-test/1bc429ed-c5a2-4783-9dd8-40eaac8a59f1`,
                body: {
                    prompt: 'Your generation prompt (required)',
                    type: 'both|image|caption (optional, default: both)',
                    userId: 'optional user identifier',
                    sessionId: 'optional session identifier'
                }
            },
            legacyWebhook: {
                method: 'POST',
                url: '/api/n8n/webhook',
                description: 'Legacy webhook endpoint (backward compatibility)'
            },
            getContent: {
                method: 'GET',
                url: '/api/content/{jobId}',
                description: 'Retrieve generated content by job ID'
            },
            listContent: {
                method: 'GET',
                url: '/api/content',
                description: 'List all generated content'
            }
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Frontend: http://localhost:${PORT}`);
});

module.exports = app;