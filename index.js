const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
// Allow all cross-origin requests (for development)
app.use(cors({ origin: '*' }));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Multer setup for in-memory file storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- API Key and URL ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash`;

// --- Health Check Endpoint ---
// Responds with server status and checks for API key
app.get('/health', (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ status: 'error', message: 'GEMINI_API_KEY is not set' });
  }
  res.status(200).json({ status: 'ok', message: 'Server is running and API key is loaded' });
});

// --- Simple Chat Endpoint ---
// Handles general questions without PDF context
app.post('/chat', async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const response = await axios.post(
      `${GEMINI_API_URL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: `You are a helpful medical exam tutor. Answer the following question: ${question}` }] }]
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const answer = response.data.candidates[0].content.parts[0].text;
    res.json({ answer });
  } catch (error) {
    console.error('Chat Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get response from Gemini' });
  }
});

// --- PDF Question Answering Endpoint (with enhanced logging) ---
app.post('/ask', upload.single('pdf'), async (req, res) => {
    console.log('[/ask] Request received.');

    if (!req.file) {
        console.error('[/ask] No PDF file uploaded.');
        return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    try {
        console.log('[/ask] Attempting to parse PDF...');
        const data = await pdfParse(req.file.buffer);
        console.log('[/ask] PDF parsed successfully. Extracted text length:', data.text.length);

        if (!data.text || data.text.trim() === '') {
            console.error('[/ask] Extracted text is empty or whitespace only.');
            return res.status(500).json({ error: 'Failed to extract text from PDF.' });
        }

        const question = req.body.question;
        let documentText = data.text;
        const MAX_TEXT_LENGTH = 8000;

        if (documentText.length > MAX_TEXT_LENGTH) {
            documentText = documentText.substring(0, MAX_TEXT_LENGTH);
            console.log(`[/ask] Document text truncated to ${MAX_TEXT_LENGTH} characters.`);
        }

        const prompt = `You are an expert in medical education, specializing in preparing doctors for the Australian Medical Council (AMC) exam. Your task is to provide concise, accurate, and highly relevant information based *only* on the provided document.

        Document:
        "${documentText}"

        Question:
        "${question}"

        Based on the document, please answer the question thoroughly and concisely. If the information is not explicitly available in the document, state "The provided document does not contain information to answer this question."`;

        console.log('[/ask] Sending request to Gemini API. Prompt length:', prompt.length);

        const geminiResponse = await axios.post(
            `${GEMINI_API_URL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('[/ask] Received response from Gemini API. Status:', geminiResponse.status);
        console.log('[/ask] Gemini API Response Data:', JSON.stringify(geminiResponse.data, null, 2));

        const answer = geminiResponse.data.candidates[0]?.content?.parts[0]?.text || 'No answer found.';
        console.log('[/ask] Answer extracted from Gemini response.');

        res.json({ answer });

    } catch (error) {
        console.error('\n--- ❌ ASK PDF ENDPOINT ERROR ❌ ---');
        console.error('[/ask] Error during PDF processing or Gemini API call:', error.message);
        
        if (error.response) {
            console.error('[/ask] Gemini API Error Response Status:', error.response.status);
            console.error('[/ask] Gemini API Error Response Data:', JSON.stringify(error.response.data, null, 2));
            
            if (error.response.data && error.response.data.promptFeedback && error.response.data.promptFeedback.safetyRatings) {
                console.error('[/ask] Gemini Safety Ratings:', JSON.stringify(error.response.data.promptFeedback.safetyRatings, null, 2));
                return res.status(500).json({ error: 'Content violated safety guidelines or was blocked by Gemini.' });
            }
            if (error.response.data && error.response.data.error) {
                return res.status(500).json({ error: `Gemini API Error: ${error.response.data.error.message}` });
            }
        } else if (error.request) {
            console.error('[/ask] No response received from Gemini API:', error.request);
            return res.status(500).json({ error: 'No response from Gemini API. Check network or API URL.' });
        } else {
            console.error('[/ask] Error setting up request:', error.message);
        }
        
        console.error('---------------------------------------\n');
        res.status(500).json({ error: 'Failed to process the PDF or get an answer. Check server logs for details.' });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
