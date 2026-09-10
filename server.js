import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/config', (req, res) => {
  res.json({
    hasServerKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim())
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { contents, systemInstruction, temperature, apiKey } = req.body;
    const effectiveKey = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY;

    if (!effectiveKey) {
      return res.status(400).json({
        error: 'No Gemini API key available. Please configure GEMINI_API_KEY or provide an API key in setup.'
      });
    }

    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({ error: 'Invalid request: "contents" array is required.' });
    }

    const ai = new GoogleGenAI({ apiKey: effectiveKey });

    const config = {};
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    if (typeof temperature === 'number') {
      config.temperature = temperature;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config
    });

    let text = response.text;
    if (!text && response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content?.parts;
      if (parts && parts.length > 0) {
        text = parts.map(p => p.text || '').join('');
      }
    }

    res.json({ text: text || '' });
  } catch (err) {
    console.error('Gemini API error:', err);
    res.status(500).json({
      error: err.message || 'An error occurred while communicating with the Gemini API.'
    });
  }
});

// Serve static directory
app.use(express.static(__dirname));

// Serve index.html for root and fallback
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/ask-fletch.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Fallback for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ask Fletch server running on http://0.0.0.0:${PORT}`);
});
