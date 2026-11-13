'use strict';
const router = require('express').Router();
const axios = require('axios');

const MODEL = process.env.GEMINI_OPINION_MODEL || 'gemini-2.5-flash';
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 650;
const MAX_IMAGE_URL = 2048;

function validImageUrl(value) {
  try {
    if (typeof value !== 'string' || value.length > MAX_IMAGE_URL) return false;
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' &&
      /^\/[^/]+\/image\/upload\//.test(u.pathname) && !u.username && !u.password && !u.port;
  } catch (_) { return false; }
}

router.post('/opinion', async (req, res) => {
  try {
    const { imageUrl, avatar, language } = req.body || {};
    if (!validImageUrl(imageUrl)) {
      return res.status(400).json({ error: 'Expected a generated Cloudinary image URL' });
    }
    if (!['nour', 'yazan', 'sham'].includes(avatar)) {
      return res.status(400).json({ error: 'Invalid avatar' });
    }
    if (!process.env.GOOGLE_API_KEY_BOT) {
      return res.status(503).json({ error: 'Gemini key not configured' });
    }
    // Cloudinary-hosted images only, to avoid arbitrary server-side URL fetching.
    const img = await axios.get(imageUrl, {
      responseType: 'arraybuffer', timeout: 18000, maxContentLength: MAX_BYTES,
      maxRedirects: 0, validateStatus: s => s === 200,
    });
    const mime = String(img.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      return res.status(415).json({ error: 'Invalid image type' });
    }
    if (img.data.byteLength > MAX_BYTES) return res.status(413).json({ error: 'Image too large' });

    const character = {
      nour: 'نور: بنت سورية لطيفة ومرحة، بتحكي بعفوية وحماس',
      yazan: 'يزن: شاب سوري واثق وحباب، كلامه شبابي خفيف',
      sham: 'شام: بنت سورية هادية وراقية، بتحب تفاصيل الأناقة',
    }[avatar];
    const arabic = language !== 'en';
    const instructions = arabic
      ? `إنت ${character}. هالصورة نتيجة تجربة لبس أو مكياج افتراضية. احكي مع صاحب الصورة باللهجة السورية الشامية الطبيعية حصراً، من دون مصري ولا فصحى. علّق على اللي شايفه فعلاً بالصورة: الألوان، تناسق القطع، الستايل. أعط رأي واضح ولطيف وملموس مع اقتراح عملي واحد. 3 إلى 4 جمل قصيرة بحد أقصى ${MAX_TEXT} حرف، ومن دون مقدمة طويلة أو عنوان. لا تدّعي إنك شايف شي مو ظاهر ولا تستنتج صفات شخصية أو مقاسات. لا تحكي عن دقة الصورة أو هوية الشخص.`
      : `You are ${avatar}, a friendly fashion stylist. Comment on the visible outfit and colors in the virtual try-on image. Give 3 short, grounded sentences with one specific practical styling suggestion. Avoid assumptions about identity or body measurements. Maximum ${MAX_TEXT} characters.`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
    const result = await axios.post(url, {
      contents: [{ role: 'user', parts: [
        { inline_data: { mime_type: mime, data: Buffer.from(img.data).toString('base64') } },
        { text: instructions },
      ] }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 320, responseModalities: ['TEXT'] },
    }, {
      timeout: 60000,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GOOGLE_API_KEY_BOT },
    });
    const text = (result.data?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '').join(' ').trim().slice(0, MAX_TEXT);
    if (!text) return res.status(502).json({ error: 'Gemini returned no opinion' });
    return res.json({ text });
  } catch (e) {
    console.error('Gemini opinion failed:', e.response?.status || e.message);
    return res.status(502).json({ error: 'Could not analyze the outfit image' });
  }
});

module.exports = router;