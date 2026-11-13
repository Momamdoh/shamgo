'use strict';
const router = require('express').Router();
const axios = require('axios');
const MODEL =
  process.env.GEMINI_OPINION_MODEL || 'gemini-2.5-flash';
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 900;
const MAX_IMAGE_URL = 2048;
// =====================================
// Image URL Validation
// =====================================
function validImageUrl(value) {
  try {
    if (
      typeof value !== 'string' ||
      value.length > MAX_IMAGE_URL
    ) {
      return false;
    }

    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      u.hostname === 'res.cloudinary.com' &&
      /^\/[^/]+\/image\/upload\//.test(u.pathname) &&
      !u.username &&
      !u.password &&
      !u.port
    );
  } catch (_) {
    return false;
  }

}

// =====================================
// Normalize Avatar Name
// =====================================
function normalizeAvatar(value) {
  const name = String(value || '').trim().toLowerCase();
  const names = {
    nour: 'nour',
    noor: 'nour',
    'نور': 'nour',
    yazan: 'yazan',
    'يزن': 'yazan',
    sham: 'sham',
    'شام': 'sham',
  };

  return names[name] || null;
}

// =====================================
// Avatar Personalities
// =====================================
const personalities = {
  nour: {
    ar: `
إنتِ نور، ستايلست سورية مرحة وعصرية.
شخصيتك:
- خفيفة دم، عفوية، وبتحكي بطريقة لطيفة.
- بتحبي الموضة الجديدة والتنسيقات المبتكرة.
- ذوقك عصري، جريء أحياناً، بس مو مبالغ فيه.
- بتركزي على تناسق الألوان والتفاصيل الملفتة.
- بتحبي الإكسسوارات والشنط والأحذية العصرية.
طريقة تفكيرك:
- شو الألوان اللي بتليق مع القطع الظاهرة؟
- في شي ممكن يضيف حيوية للإطلالة؟
- هل الإكسسوارات رح تحسّن اللوك أو تزحمه؟
- هل في قطعة عصرية ممكن تكمل التنسيق؟
اعطي رأيك بحرية حسب الصورة.
مو ضروري تمدحي كل لوك.
إذا في شي مو مناسب، احكي بصراحة وبأسلوب لطيف.
`,

    en: `
You are Nour, a cheerful and creative fashion stylist.
Your taste is modern, colorful and trend-aware.
Focus on color coordination, stylish accessories,
shoes, bags and interesting outfit combinations.
Give genuine and practical advice based on the image.
`,

  },
  yazan: {
    ar: `
إنت يزن، ستايلست سوري شبابي وواثق.
شخصيتك:
- حباب، صريح، وعندك ذوق مرتب.
- بتحب الستايل الشبابي والكاجوال.
- بتركز على التناسق والراحة والطلة النظيفة.
- بتفضل الاقتراحات العملية اللي بتنلبس فعلاً.
- بتحب الجاكيتات والجينز والسنيكرز إذا كانوا مناسبين.
طريقة تفكيرك:
- هل القطع راكبة مع بعضها؟
- شو نوع البنطلون الأنسب للقطعة العلوية؟
- هل الحذاء مناسب لطابع الإطلالة؟
- هل الألوان متوازنة؟
- في شي ممكن يخلي اللوك أرتب من دون تكلف؟
إذا الجاكيت ظاهر بالصورة، فكر شو ممكن
ينلبس معه من بنطلون وحذاء مناسبين.
بس لا تقترح بنطلون أو سنيكرز بشكل تلقائي
إذا ما كانوا مناسبين للوك.
كون صريح ومحدد، واحكي متل شب سوري طبيعي.
`,

    en: `
You are Yazan, a confident Syrian fashion stylist.
Your taste is practical, youthful, casual and clean.
Focus on trousers, jeans, jackets, sneakers,
color balance and everyday styling.
Recommend combinations that actually suit the image.
`,

  },
  sham: {
    ar: `
إنتِ شام، ستايلست سورية راقية وهادية.
شخصيتك:
- ذوقك ناعم وراقي.
- بتحبي الأناقة الكلاسيكية والتفاصيل المرتبة.
- بتركزي على توازن الإطلالة وتناسق الألوان.
- بتحبي القطع البسيطة اللي بتعطي فخامة.
- ما بتحبي الإضافات الكتيرة من دون سبب.
طريقة تفكيرك:
- هل الإطلالة متوازنة وأنيقة؟
- شو التفاصيل اللي ممكن ترفع مستوى التنسيق؟
- هل في لون هادي بيكمل القطع؟
- هل الحذاء أو الشنطة أو الإكسسوار مناسب؟
- هل الأفضل نضيف شي أو نخلي اللوك متل ما هو؟
إذا اللوك مرتب ومتكامل،
قولي إنه ما بيحتاج إضافات.
احكي بأسلوب سوري هادي وطبيعي،
وكوني دقيقة برأيك.
`,

    en: `
You are Sham, an elegant Syrian fashion stylist.
Your taste is refined, timeless and understated.
Focus on harmony, elegant color combinations,
tasteful accessories and polished outfit details.
Avoid unnecessary additions when the look is complete.
`,

  },
};

// =====================================
// Build Intelligent Fashion Prompt
// =====================================
function buildOpinionPrompt({
  avatar,
  language,
  productTitle,
  category,
}) {
  const arabic = language !== 'en';
  const personality = personalities[avatar];
  const productContext = String(productTitle || '')
    .trim()
    .slice(0, 150);
  const categoryContext = String(category || '')
    .trim()
    .slice(0, 80);
  if (!arabic) {
    return `
${personality.en}

You are looking at an actual virtual try-on image.
Selected product:
${productContext || 'Not specified'}

Product category:
${categoryContext || 'Not specified'}

Analyze the visible image carefully before responding.
Identify the visible clothing or makeup,
their actual colors, style and coordination.
Give an intelligent, independent fashion opinion.
Your recommendations must depend on the image,
not on a memorized response.
Suggest complementary items only when useful.
Do not recommend the same combinations every time.
Do not invent clothing or details that are not visible.
If the outfit is already complete, say so naturally.
Be specific, honest, friendly and conversational.
Avoid generic praise and repetitive openings.
Respond in 3 to 5 natural sentences.
Do not use bullet points or headings.
Maximum ${MAX_TEXT} characters.
`;
  }

  return `
${personality.ar}

=====================================
المهمة الأساسية
=====================================
قدامك صورة ناتجة عن تجربة ملابس
أو مكياج افتراضية.
لازم تحلل الصورة بعناية قبل ما تجاوب.
اسم المنتج المختار:
${productContext || 'غير محدد'}

نوع المنتج:
${categoryContext || 'غير محدد'}

=====================================
كيف لازم تفكر؟
=====================================
أول شي افهم شو الموجود بالصورة فعلاً.
حدد:
- قطع الملابس الظاهرة.
- ألوانها.
- نوع الستايل.
- مدى تناسق القطع مع بعضها.
- إذا في قطعة ممكن تكمل الإطلالة.
وبعدها كوّن رأيك الخاص
بناءً على شخصيتك وذوقك.
=====================================
اقتراحات التنسيق
=====================================
إذا المنتج جاكيت:
فكر إذا في بنطلون أو جينز
وحذاء مناسبين ممكن يكملوا اللوك.
إذا المنتج فستان:
فكر بالحذاء والشنطة والإكسسوارات
اللي ممكن تتناسب مع لونه وستايله.
إذا المنتج قطعة علوية:
فكر شو القطعة السفلية المناسبة إلها.
إذا المنتج بنطلون:
فكر شو القطعة العلوية والحذاء المناسبين.
إذا المنتج مكياج:
قيّم الألوان والتناسق
واقترح لمسة مكياج مناسبة إذا لزم.
هاي مجرد أمثلة لطريقة التفكير،
مو اقتراحات إجبارية.
اختار الاقتراح المناسب للصورة نفسها.
=====================================
قواعد الذكاء
=====================================
- لا تعتمد على ردود محفوظة.
- لا تعطي نفس الاقتراح لكل صورة.
- لا تمدح اللوك إذا في مشكلة واضحة بالتنسيق.
- إذا في لون مو متناسق، وضح السبب.
- إذا في قطعة ناقصة، اقترح قطعة محددة.
- إذا اللوك مكتمل، لا تضيف شي بلا داعي.
- لا تفترض وجود تفاصيل مو واضحة بالصورة.
- لا تستنتج مقاسات أو صفات شخصية.
- لا تتعامل مع الصورة كأنها دليل على الهوية.
- خليك واقعي وصريح ولطيف.
إذا الصورة ما بتوضح تفاصيل كافية،
احكي عن التفاصيل اللي بتقدر تشوفها فقط.
=====================================
أسلوب الكلام
=====================================
احكي باللهجة السورية الشامية الطبيعية حصراً.
ممنوع اللهجة المصرية.
تجنب اللغة العربية الرسمية قدر الإمكان.
خلي كلامك متل ستايلست سوري
عم يحكي مع زبون بشكل طبيعي.
لا تبدأ كل مرة بنفس الجملة.
لا تستخدم افتتاحيات محفوظة.
لا تستخدم قوائم أو عناوين.
لا تذكر إنك ذكاء اصطناعي.
احكي من 3 إلى 5 جمل مفيدة.
خلي نصيحتك واضحة ومحددة.
لا تتجاوز ${MAX_TEXT} حرف.
=====================================
الرد النهائي
=====================================
حلل الصورة الحالية،
واختار رأيك بناءً على تفاصيلها
وعلى ذوق شخصيتك المميز.
رجّع الكلام النهائي فقط.
`;
}

// =====================================
// Gemini Opinion Endpoint
// =====================================
router.post('/opinion', async (req, res) => {
  try {
    const {
      imageUrl,
      avatar,
      advisorName,
      language,
      productTitle,
      category,
    } = req.body || {};

    // =====================================
    // Validate Image
    // =====================================
    if (!validImageUrl(imageUrl)) {
      return res.status(400).json({
        error: 'Expected a generated Cloudinary image URL',
      });
    }

    // =====================================
    // Validate Avatar
    // =====================================
    const selectedAvatar = normalizeAvatar(
      avatar || advisorName
    );
    if (!selectedAvatar) {
      return res.status(400).json({
        error: 'Invalid avatar',
      });
    }

    // =====================================
    // Validate Gemini Key
    // =====================================
    const GOOGLE_API_KEY =
      process.env.GOOGLE_API_KEY_BOT;
    if (!GOOGLE_API_KEY) {
      return res.status(503).json({
        error: 'Gemini key not configured',
      });
    }

    // =====================================
    // Download Generated Image
    // =====================================
    const img = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 18000,
      maxContentLength: MAX_BYTES,
      maxRedirects: 0,
      validateStatus: (s) => s === 200,
    });
    // =====================================
    // Validate MIME Type
    // =====================================
    const mime = String(
      img.headers['content-type'] || ''
    )
      .split(';')[0]
      .toLowerCase();
    if (
      ![
        'image/jpeg',
        'image/png',
        'image/webp',
      ].includes(mime)
    ) {
      return res.status(415).json({
        error: 'Invalid image type',
      });
    }

    if (img.data.byteLength > MAX_BYTES) {
      return res.status(413).json({
        error: 'Image too large',
      });
    }

    // =====================================
    // Build Personality-Based Prompt
    // =====================================
    const instructions = buildOpinionPrompt({
      avatar: selectedAvatar,
      language,
      productTitle,
      category,
    });
    // =====================================
    // Gemini API
    // =====================================
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
    const result = await axios.post(
      url,
      {
        contents: [
          {
            role: 'user',
            parts: [
              {
                inline_data: {
                  mime_type: mime,
                  data: Buffer.from(
                    img.data
                  ).toString('base64'),
                },
              },
              {
                text: instructions,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 500,
          responseModalities: ['TEXT'],
        },
      },
      {
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GOOGLE_API_KEY,
        },
      }

    );
    // =====================================
    // Read Gemini Response
    // =====================================
    const text = (
      result.data?.candidates?.[0]
        ?.content?.parts || []
    )
      .map((part) => part.text || '')
      .join(' ')
      .trim()
      .slice(0, MAX_TEXT);
    if (!text) {
      return res.status(502).json({
        error: 'Gemini returned no opinion',
      });
    }

    // =====================================
    // Return Intelligent Opinion
    // =====================================
    return res.json({
      text,
      avatar: selectedAvatar,
    });
  } catch (e) {
    const status = e.response?.status;
    const apiError = e.response?.data?.error;
    console.error('GEMINI OPINION FAILED', {
      status: status || 'NO_HTTP_STATUS',
      code: apiError?.code || e.code || 'UNKNOWN',
      message: apiError?.message || e.message,
    });
    return res.status(502).json({
      error: 'Could not analyze the outfit image',
    });
  }
});
module.exports = router;