'use strict';
const router = require('express').Router();
const axios = require('axios');

const MODEL = process.env.GEMINI_OPINION_MODEL || 'gemini-2.5-flash';
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 1200;
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
    const { imageUrl, language, productTitle, category, userMessage, history } = req.body || {};
    const names = { nour: 'nour', noor: 'nour', 'نور': 'nour', yazan: 'yazan', 'يزن': 'yazan', sham: 'sham', 'شام': 'sham' };
    const avatar = names[String(req.body?.avatar || req.body?.advisorName || '').trim().toLowerCase()];
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

    const characters = {
      nour: 'نور: سورية مرحة بتحب الألوان والستايلات العصرية واللمسات الجريئة، بتحكي بحماس وبعفوية',
      yazan: 'يزن: شاب سوري صريح وعملي، ذوقه شبابي، مهتم بالبنطلون والحذاء والتناسق والراحة',
      sham: 'شام: سورية هادية وراقية، بتحب التنسيق الكلاسيكي والتفاصيل الناعمة والقطع البسيطة',
    };
    const safeMessage = typeof userMessage === 'string' ? userMessage.trim().slice(0, 300) : '';
    const safeHistory = Array.isArray(history) ? history.slice(-12)
      .filter(t => t && ['user', 'assistant'].includes(t.role) && typeof t.text === 'string')
      .map(t => ({ role: t.role, text: t.text.slice(0, 1200) })) : [];
    const arabic = language !== 'en';
    const context = [
      `Selected product: ${String(productTitle || '').slice(0, 120)}`,
      `Category: ${String(category || '').slice(0, 70)}`,
      'Recent conversation:',
      ...safeHistory.map(t => `${t.role}: ${t.text}`),
      `Latest customer message: ${safeMessage || '(First opinion on this image)'}`,
    ].join('\n');
    const instructions = arabic
      ? `إنت ${characters[avatar]}، مستشار أو مستشارة موضة عم تحكي مع زبون عالصورة المرفقة. ${context}.
      حلل القطع الظاهرة وألوانها بواقعية، لا تخترع تفاصيل. احكي بالشامي السوري الطبيعي فقط.
      خلي الحديث حي ومفيد، مش تقييم من كلمتين ولا حكي محفوظ. اذكر ملاحظة محددة عن اللوك، وقيمة عملية مثل تنسيق بنطلون أو حذاء أو شنطة إذا مناسبة، ووضّح ليش.
      إذا الزبون سأل سؤال أو جاوب على سؤال سابق، جاوبه مباشرة وخد كلامه بعين الاعتبار، ولا تعيد تقييم الصورة من الصفر.
      اختم ردك بسؤال واحد جديد ومحدد مرتبط باللبس أو المناسبة أو تفضيل اللون، يخليه يقدر يرد وتكملوا الحوار. تجنب تكرار سؤال سبق سؤاله أو الإجابة عليه.
      4 إلى 6 جمل مفيدة، بحد أقصى ${MAX_TEXT} حرف، من دون قوائم أو عناوين. لا تفترض عمر أو جنس أو مقاس المستخدم، ولا تقول إنك شايف شي مش ظاهر.`
      : `You are ${avatar}, a friendly personal fashion stylist. ${context}.
      Analyze only what is actually visible. Respond to the customer's last message based on prior dialogue; give concrete outfit advice and the reason behind it.
      Use 4-6 natural sentences, end with one specific follow-up question related to the look, without repeating previous questions. Max ${MAX_TEXT} characters.`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
    const result = await axios.post(url, {
      contents: [{ role: 'user', parts: [
        { inline_data: { mime_type: mime, data: Buffer.from(img.data).toString('base64') } },
        { text: instructions },
      ] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 650, responseModalities: ['TEXT'] },
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