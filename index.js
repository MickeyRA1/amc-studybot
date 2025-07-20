const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

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

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Minimal backend running on port $
{PORT}`);
  console.log(`🔗 Health: http://localhost:
${PORT}/health`);
  console.log(`🔗 Key Test: http://localhost:${PORT}/test`);
});
