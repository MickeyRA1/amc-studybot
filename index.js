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
app.post('/ask', upload.single('pdf'), async (req, res) => {
  // 1. Validate Input
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }
  if (!req.body.question) {
    return res.status(400).json({ error: 'No question was provided.' });
  }

  const { question } = req.body;
  console.log(`Received question: "$
{question}" for the uploaded PDF.`);

  try {
    // 2. Extract Text from PDF
    console.log('Step 1: Parsing PDF...');
    const dataBuffer = req.file.buffer;
    const pdfData = await pdf(dataBuffer);
    const fullPdfText = pdfData.text;
    console.log(`Successfully extracted
${fullPdfText.length} characters of text.`);

    // --- TEMPORARY FIX: Truncate text to avoid "Payload Too Large" errors ---
    const MAX_TEXT_LENGTH = 15000; // A safe character limit for the API request
    const truncatedText = fullPdfText.substring(0, MAX_TEXT_LENGTH);

    if (fullPdfText.length > MAX_TEXT_LENGTH) {
      console.warn(`⚠️ PDF text was truncated from ${fullPdfText.length} to${MAX_TEXT_LENGTH} characters to fit the API limit.`);
    }
    
    // 3. Construct the Prompt for Gemini
    console.log('Step 2: Constructing the prompt for Gemini...');
    const prompt = `
      You are a world-class medical examination expert. Your task is to analyze the provided text from an official exam specification document and answer the user's question based *only* on the information within that document. Do not use outside knowledge.

      Here is the content from the PDF:
      ---
      $
{truncatedText}
      ---

      Based on the document above, please answer this question: "
${question}"
    `;

    // 4. Call Gemini API
    console.log('Step 3: Calling Gemini API...');
    const response = await axios.post(GEMINI_API_URL, {
      contents: [{ parts: [{ text: prompt }] }]
    }, { headers: { 'Content-Type': 'application/json' } });

    console.log('Step 4: Successfully received a response from Gemini.');

    // 5. Parse and Send the Answer Back
    if (!response.data.candidates || response.data.candidates.length === 0) {
      throw new Error('API returned no candidates. The prompt may have been blocked for safety reasons.');
    }
    const answer = response.data.candidates[0].content.parts[0].text;
    res.status(200).json({ answer });

  } catch (error) {
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
