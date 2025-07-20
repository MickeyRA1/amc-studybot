const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const pdf = require('pdf-parse');

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
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$
{GEMINI_API_KEY}`;

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
    const response = await axios.post(GEMINI_API_URL, {
      contents: [{ parts: [{ text: `You are a helpful medical exam tutor. Answer the following question:
${question}` }] }]
    }, { headers: { 'Content-Type': 'application/json' } });
    
    const answer = response.data.candidates[0].content.parts[0].text;
    res.json({ answer });
  } catch (error) {
    console.error('Chat Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get response from Gemini' });
  }
});

// --- NEW: PDF Question Answering Endpoint (with better logging) ---
// ... (keep your existing imports and app.use statements)

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
        const MAX_TEXT_LENGTH = 8000; // Keep this consistent

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
            `${GEMINI_API_URL}:generateContent`,
            {
                contents: [{ parts: [{ text: prompt }] }],
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': GEMINI_API_KEY,
                },
            }
        );

        console.log('[/ask] Received response from Gemini API. Status:', geminiResponse.status);
        console.log('[/ask] Gemini API Response Data:', JSON.stringify(geminiResponse.data, null, 2));


        const answer = geminiResponse.data.candidates[0]?.content?.parts[0]?.text || 'No answer found.';
        console.log('[/ask] Answer extracted from Gemini response.');

        res.json({ answer });

    } catch (error) {
        console.error('[/ask] Error during PDF processing or Gemini API call:', error.message);
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('[/ask] Gemini API Error Response Status:', error.response.status);
            console.error('[/ask] Gemini API Error Response Data:', JSON.stringify(error.response.data, null, 2));
            // Check for safety attributes
            if (error.response.data && error.response.data.promptFeedback && error.response.data.promptFeedback.safetyRatings) {
                console.error('[/ask] Gemini Safety Ratings:', JSON.stringify(error.response.data.promptFeedback.safetyRatings, null, 2));
                return res.status(500).json({ error: 'Content violated safety guidelines or was blocked by Gemini.' });
            }
            if (error.response.data && error.response.data.error) {
                return res.status(500).json({ error: `Gemini API Error: ${error.response.data.error.message}` });
            }
        } else if (error.request) {
            // The request was made but no response was received
            console.error('[/ask] No response received from Gemini API:', error.request);
            return res.status(500).json({ error: 'No response from Gemini API. Check network or API URL.' });
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('[/ask] Error setting up request:', error.message);
            return res.status(500).json({ error: `Failed to process the PDF or get an answer. Details: ${error.message}` });
        }
        res.status(500).json({ error: 'Failed to process the PDF or get an answer. Check server logs for details.' });
    }
});

// ... (keep your existing /health and /test-gemini endpoints)

    // --- ADVANCED ERROR LOGGING ---
    console.error('\n--- ❌ ASK PDF ENDPOINT CRASHED ❌ ---');
    if (error.response) {
      // This is an error from the Gemini API (e.g., 400 Bad Request, 429 Rate Limit)
      console.error('API Error Status:', error.response.status);
      console.error('API Error Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      // This is a server-side error (e.g., PDF parsing failed, code issue)
      console.error('Server-Side Error:', error.message);
    }
    console.error('---------------------------------------\n');
    res.status(500).json({ error: 'Failed to process the PDF or get an answer. Check server logs for details.' });
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server listening on port $
{PORT}`);
});
