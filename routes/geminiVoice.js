'use strict';
const express = require('express');
const axios = require('axios');
const router = express.Router();

// This route is intentionally separate from the existing /api/chatbot/chat route.
// Apply your existing user authentication and a rate limiter before deploying.
const VOICES = Object.freeze({ nour: 'Aoede', yazan: 'Puck', sham: 'Kore' });
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';

function pcm16ToWav(pcm, sampleRate = 24000) {
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav;
}

router.post('/voice', async (req, res) => {
  const { text, avatar = 'sham', language = 'ar' } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 600 || !Object.hasOwn(VOICES, avatar)) {
    return res.status(400).json({ error: 'Invalid text or avatar' });
  }
  const apiKey = process.env.GOOGLE_API_KEY_BOT;
  if (!apiKey) return res.status(503).json({ error: 'Gemini API key not configured' });

  const instructions = language === 'en'
    ? 'Speak naturally in English.'
    : 'انطق الكلام التالي بلهجة سورية شامية طبيعية، بنبرة بشرية سلسة، دون إضافة أو حذف كلمات. حافظ على النص كما هو.';
  const payload = {
    contents: [{ parts: [{ text: `${instructions}\n\n${text.trim()}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[avatar] } },
      },
    },
  };

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(TTS_MODEL)}:generateContent`,
      payload,
      { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, timeout: 90000 },
    );
    const parts = response.data?.candidates?.[0]?.content?.parts ?? [];
    const audio = parts.find(p => p.inlineData?.data || p.inline_data?.data);
    const inline = audio?.inlineData || audio?.inline_data;
    if (!inline?.data) return res.status(502).json({ error: 'Gemini did not return audio' });
    const pcm = Buffer.from(inline.data, 'base64');
    // Gemini TTS produces 24kHz 16-bit mono PCM.
    const wav = pcm16ToWav(pcm);
    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'no-store');
    res.set('Content-Length', String(wav.length));
    return res.status(200).send(wav);
  } catch (error) {
    console.error('Gemini TTS:', error.response?.status || error.message);
    return res.status(502).json({ error: 'Voice generation failed' });
  }
});

module.exports = router;