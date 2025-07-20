const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// Startup logging: analyze the key!
console.log("\n=== DEBUG: GEMINI API KEY CHECK ===");
if (!GEMINI_API_KEY) {
  console.log("❌ No GEMINI_API_KEY found in environment!");
} else {
  console.log("Key format:", GEMINI_API_KEY.startsWith("AIza") ? "✅ Starts with 'AIza'" : "❌ Wrong format");
  console.log("Key length:", GEMINI_API_KEY.length, GEMINI_API_KEY.length === 39 ? "✅ Ok" : "❌ Wrong length");
}
console.log("============================\n");

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'Server running',
    api_key_loaded: !!GEMINI_API_KEY,
    api_key_length: GEMINI_API_KEY ? GEMINI_API_KEY.length : 0
  });
});

// Test Gemini key endpoint
app.get('/test', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.json({success: false, error: "No key loaded in environment"});
  }
  try {
    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{parts: [{text: "Hello from minimal test"}]}]
      },
      {headers: {"Content-Type": "application/json"}, timeout: 20000}
    );
    res.json({success: true, result: response.data});
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// Chat endpoint - THIS IS THE NEW ADDITION
app.post('/chat', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'No question provided' });
    }

    console.log('Chat request received:', question);

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `You are an AMC (Australian Medical Council) exam study assistant. Answer this question: $
{question}`
          }]
        }]
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000
      }
    );

    const answer = response.data.candidates[0].content.parts[0].text;
    console.log('Gemini response received successfully');
    
    res.json({ answer });

  } catch (error) {
    console.error('Chat error:', error?.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get response from Gemini',
      details: error.message 
    });
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port
${PORT}`);
  console.log(`🔗 Health: http://localhost:$
{PORT}/health`);
  console.log(`🔗 Test: http://localhost:
${PORT}/test`);
  console.log(`🔗 Chat: http://localhost:${PORT}/chat (POST)`);
});
