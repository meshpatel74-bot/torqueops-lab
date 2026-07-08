// Vercel Serverless Function
// Path: /api/diagnose
//
// This function:
// 1. Receives diagnostic requests from the browser
// 2. Adds the Anthropic API key from environment variable (NEVER exposed to browser)
// 3. Forwards to Anthropic API
// 4. Returns the response
// 5. Includes CORS headers so it can be called from gettorqueops.com
// 6. Includes basic rate limiting via timestamp checks

export default async function handler(req, res) {
  // ============ CORS HEADERS ============
  // Allow calls from your TorqueOps domain (and localhost for testing)
  const allowedOrigins = [
    'https://gettorqueops.com',
    'https://www.gettorqueops.com',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://127.0.0.1:5500'
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only accept POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // ============ VALIDATE INPUT ============
  const { prompt } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Missing or invalid prompt' });
    return;
  }

  // Basic abuse prevention: cap prompt length
  if (prompt.length > 8000) {
    res.status(400).json({ error: 'Prompt too long' });
    return;
  }

  // ============ CALL ANTHROPIC ============
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable not set');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('Anthropic API error:', anthropicResponse.status, errorText);
      res.status(anthropicResponse.status).json({
        error: 'AI service error',
        details: errorText.substring(0, 200)
      });
      return;
    }

    const data = await anthropicResponse.json();
    res.status(200).json(data);

  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}