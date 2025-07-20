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

// --- NEW: PDF Question Answering Endpoint ---
// Handles a PDF file and a question
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
    const dataBuffer = req.file.buffer;
    const pdfData = await pdf(dataBuffer);
    const pdfText = pdfData.text;
    console.log(`Extracted
${pdfText.length} characters from the PDF.`);
    
    // 3. Construct the Prompt for Gemini
    const prompt = `
      You are a world-class medical examination expert. Your task is to analyze the provided text from an official exam specification document and answer the user's question based *only* on the information within that document. Do not use outside knowledge.

      Here is the content from the PDF:
      ---
      $
{pdfText}
      ---

      Based on the document above, please answer this question: "
${question}"
    `;

    // 4. Call Gemini API
    const response = await axios.post(GEMINI_API_URL, {
      contents: [{ parts: [{ text: prompt }] }]
    }, { headers: { 'Content-Type': 'application/json' } });

    if (!response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('No response from Gemini API.');
    }

    const answer = response.data.candidates[0].content.parts[0].text;
    
    // 5. Send the Answer Back
    res.status(200).json({ answer });

  } catch (error) {
    console.error('Ask PDF Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to process the PDF or get an answer.' });
  }
});


// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
