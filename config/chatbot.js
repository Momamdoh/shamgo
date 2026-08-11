const axios = require("axios");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

const TEXT_MODEL = "gemini-2.5-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image";

const messagesStore = [];

/* =========================================================
   SAFE IMAGE CACHE
========================================================= */

const imageResultCache = new Map();
const inFlightImageRequests = new Map();

const IMAGE_CACHE_TTL = 24 * 60 * 60 * 1000;

function normalizePrompt(text = "") {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function createImageCacheKey(
  type,
  imageBuffer,
  userMessage
) {
  const imageHash = crypto
    .createHash("sha256")
    .update(imageBuffer)
    .digest("hex");

  return `${type}:${imageHash}:${normalizePrompt(userMessage)}`;
}

function getCachedImageResult(key) {
  const cached = imageResultCache.get(key);

  if (!cached) {
    return null;
  }

  const expired =
    Date.now() - cached.createdAt >
    IMAGE_CACHE_TTL;

  if (expired) {
    imageResultCache.delete(key);
    return null;
  }

  if (!cached.result?.imageUrl) {
    imageResultCache.delete(key);
    return null;
  }

  console.log(
    "💰 IMAGE CACHE HIT => GEMINI IMAGE REQUEST SKIPPED"
  );

  return cached.result;
}

function saveImageResultToCache(
  key,
  result
) {
  if (!result?.imageUrl) {
    console.log(
      "ℹ️ RESULT HAS NO IMAGE URL => NOT CACHED"
    );

    return;
  }

  imageResultCache.set(key, {
    createdAt: Date.now(),
    result,
  });

  console.log(
    "💾 SUCCESSFUL IMAGE RESULT SAVED TO CACHE"
  );
}

/* =========================================================
   LOG HELPERS
========================================================= */

function printSeparator(title = "") {
  console.log(
    "\n============================================================"
  );

  if (title) {
    console.log(title);

    console.log(
      "============================================================"
    );
  }
}

function safePayloadForLog(payload) {
  return JSON.parse(
    JSON.stringify(
      payload,
      (key, value) => {
        if (
          key === "data" &&
          typeof value === "string"
        ) {
          return `[BASE64 HIDDEN - LENGTH: ${value.length}]`;
        }

        return value;
      }
    )
  );
}

function logAxiosError(
  title,
  error
) {
  printSeparator(
    `❌ ${title}`
  );

  console.log(
    "MESSAGE =>",
    error.message
  );

  console.log(
    "CODE =>",
    error.code || "NO_CODE"
  );

  console.log(
    "HTTP STATUS =>",
    error.response?.status ||
      "NO_STATUS"
  );

  console.log(
    "HTTP STATUS TEXT =>",
    error.response?.statusText || ""
  );

  if (error.config) {
    console.log(
      "METHOD =>",
      error.config.method?.toUpperCase()
    );

    console.log(
      "URL =>",
      hideApiKey(
        error.config.url
      )
    );

    console.log(
      "TIMEOUT =>",
      error.config.timeout
    );
  }

  console.log(
    "RESPONSE DATA =>",
    JSON.stringify(
      error.response?.data ||
        error.message,
      null,
      2
    )
  );

  printSeparator();
}

function hideApiKey(url) {
  if (!url) {
    return url;
  }

  return url.replace(
    /([?&]key=)[^&]+/i,
    "$1[HIDDEN_API_KEY]"
  );
}

/* =========================================================
   MESSAGE STORE
========================================================= */

function updateConversationHistory(
  userMessage,
  botResponse
) {
  console.log(
    "💾 SAVING MESSAGE IN MEMORY"
  );

  messagesStore.push({
    id:
      messagesStore.length + 1,

    user:
      userMessage,

    bot:
      botResponse,
  });

  console.log(
    "💾 STORED MESSAGES COUNT =>",
    messagesStore.length
  );
}

function clearMessages() {
  console.log(
    "🧹 CLEARING ALL STORED MESSAGES"
  );

  messagesStore.length = 0;

  console.log(
    "✅ MESSAGES CLEARED"
  );
}

/* =========================================================
   CLOUDINARY
========================================================= */

function uploadBufferToCloudinary(
  buffer,
  mimeType = "image/png"
) {
  return new Promise(
    (resolve, reject) => {
      printSeparator(
        "☁️ CLOUDINARY UPLOAD START"
      );

      console.log(
        "IMAGE BUFFER SIZE =>",
        buffer.length
      );

      console.log(
        "IMAGE MIME TYPE =>",
        mimeType
      );

      console.log(
        "CLOUDINARY FOLDER => chatbot/generated-images"
      );

      const uploadStream =
        cloudinary.uploader.upload_stream(
          {
            folder:
              "chatbot/generated-images",

            resource_type:
              "image",
          },

          (
            error,
            result
          ) => {
            if (error) {
              console.log(
                "❌ CLOUDINARY UPLOAD FAILED"
              );

              console.log(
                JSON.stringify(
                  error,
                  null,
                  2
                )
              );

              reject(error);

              return;
            }

            console.log(
              "✅ CLOUDINARY UPLOAD SUCCESS"
            );

            console.log(
              "PUBLIC ID =>",
              result.public_id
            );

            console.log(
              "FORMAT =>",
              result.format
            );

            console.log(
              "WIDTH =>",
              result.width
            );

            console.log(
              "HEIGHT =>",
              result.height
            );

            console.log(
              "BYTES =>",
              result.bytes
            );

            console.log(
              "SECURE URL =>",
              result.secure_url
            );

            printSeparator();

            resolve(
              result.secure_url
            );
          }
        );

      uploadStream.on(
        "error",
        (error) => {
          console.log(
            "❌ CLOUDINARY STREAM ERROR =>",
            error
          );

          reject(error);
        }
      );

      uploadStream.end(
        buffer
      );
    }
  );
}

/* =========================================================
   REQUEST DETECTION
========================================================= */

function isMakeupImageRequest(
  userMessage
) {
  const message =
    String(
      userMessage || ""
    ).toLowerCase();

  const result =
    message.includes(
      "مكياج"
    ) ||
    message.includes(
      "ميكب"
    ) ||
    message.includes(
      "makeup"
    );

  console.log(
    "🔍 IS MAKEUP REQUEST =>",
    result
  );

  return result;
}

function isHairImageRequest(
  userMessage
) {
  const message =
    String(
      userMessage || ""
    ).toLowerCase();

  const result =
    message.includes(
      "قصة شعر"
    ) ||
    message.includes(
      "تسريحة"
    ) ||
    message.includes(
      "غير الشعر"
    ) ||
    message.includes(
      "غيّر الشعر"
    ) ||
    message.includes(
      "تغيير الشعر"
    ) ||
    message.includes(
      "haircut"
    ) ||
    message.includes(
      "hairstyle"
    );

  console.log(
    "🔍 IS HAIR REQUEST =>",
    result
  );

  return result;
}

function isImageGenerationRequest(
  userMessage
) {
  const message =
    String(
      userMessage || ""
    ).toLowerCase();

  const keywords = [
    "ولد صورة",
    "ولّد صورة",
    "توليد صورة",
    "انشئ صورة",
    "أنشئ صورة",
    "اعمل صورة",
    "اصنع صورة",
    "صمم صورة",
    "ارسم صورة",
    "generate image",
    "create image",
    "make an image",
    "draw an image",
  ];

  const matchedKeyword =
    keywords.find(
      (keyword) =>
        message.includes(
          keyword
        )
    );

  console.log(
    "🔍 IMAGE GENERATION KEYWORD =>",
    matchedKeyword ||
      "NO_MATCH"
  );

  return Boolean(
    matchedKeyword
  );
}

/* =========================================================
   GEMINI HELPERS
========================================================= */

function getGeminiUrl(
  model,
  apiKey
) {
  return (
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `${model}:generateContent?key=${apiKey}`
  );
}

function extractResponseText(
  responseData
) {
  const parts =
    responseData
      ?.candidates?.[0]
      ?.content?.parts ||
    [];

  console.log(
    "🧩 TEXT RESPONSE PARTS COUNT =>",
    parts.length
  );

  const text =
    parts
      .map(
        (part) =>
          part.text
      )
      .filter(Boolean)
      .join("\n")
      .trim();

  console.log(
    "📝 EXTRACTED TEXT =>",
    text ||
      "NO_TEXT"
  );

  return text;
}

function logGeminiResponse(
  responseData
) {
  const candidates =
    responseData?.candidates ||
    [];

  console.log(
    "📥 CANDIDATES COUNT =>",
    candidates.length
  );

  console.log(
    "📥 FINISH REASON =>",
    candidates[0]
      ?.finishReason ||
      "NO_FINISH_REASON"
  );

  if (
    responseData
      ?.usageMetadata
  ) {
    console.log(
      "📊 USAGE METADATA =>",
      JSON.stringify(
        responseData
          .usageMetadata,
        null,
        2
      )
    );
  }

  const parts =
    candidates[0]
      ?.content?.parts ||
    [];

  console.log(
    "🧩 RESPONSE PARTS COUNT =>",
    parts.length
  );

  parts.forEach(
    (part, index) => {
      console.log(
        `PART ${index + 1} HAS TEXT =>`,
        Boolean(
          part.text
        )
      );

      const inlineData =
        part.inlineData ||
        part.inline_data;

      console.log(
        `PART ${index + 1} HAS IMAGE =>`,
        Boolean(
          inlineData
            ?.data
        )
      );

      if (part.text) {
        console.log(
          `PART ${index + 1} TEXT =>`,
          part.text
        );
      }

      if (
        inlineData?.data
      ) {
        console.log(
          `PART ${index + 1} IMAGE MIME =>`,
          inlineData
            .mimeType ||
            inlineData
              .mime_type ||
            "UNKNOWN"
        );

        console.log(
          `PART ${index + 1} BASE64 LENGTH =>`,
          inlineData
            .data.length
        );
      }
    }
  );
}

/* =========================================================
   MAIN MODEL ROUTER
========================================================= */

async function modelTurn(
  userMessage,
  imageFile = null
) {
  printSeparator(
    "📩 NEW BOT REQUEST"
  );

  const GOOGLE_API_KEY =
    process.env
      .GOOGLE_API_KEY_BOT;

  console.log(
    "TIME =>",
    new Date()
      .toISOString()
  );

  console.log(
    "USER MESSAGE =>",
    userMessage
  );

  console.log(
    "HAS IMAGE =>",
    Boolean(
      imageFile
    )
  );

  console.log(
    "GOOGLE API KEY EXISTS =>",
    Boolean(
      GOOGLE_API_KEY
    )
  );

  console.log(
    "CLOUDINARY NAME EXISTS =>",
    Boolean(
      process.env
        .CLOUD_NAME
    )
  );

  console.log(
    "CLOUDINARY KEY EXISTS =>",
    Boolean(
      process.env
        .CLOUD_KEY
    )
  );

  console.log(
    "CLOUDINARY SECRET EXISTS =>",
    Boolean(
      process.env
        .CLOUD_SECRET
    )
  );

  if (imageFile) {
    console.log(
      "IMAGE FIELD NAME =>",
      imageFile.fieldname
    );

    console.log(
      "IMAGE ORIGINAL NAME =>",
      imageFile.originalname
    );

    console.log(
      "IMAGE MIME =>",
      imageFile.mimetype
    );

    console.log(
      "IMAGE SIZE =>",
      imageFile.buffer
        ?.length
    );

    console.log(
      "IMAGE BUFFER EXISTS =>",
      Boolean(
        imageFile.buffer
      )
    );
  }

  if (!GOOGLE_API_KEY) {
    console.log(
      "❌ GOOGLE_API_KEY_BOT IS MISSING"
    );

    throw new Error(
      "GOOGLE_API_KEY_BOT is missing"
    );
  }

  const message =
    String(
      userMessage || ""
    ).trim();

  console.log(
    "CLEAN MESSAGE =>",
    message
  );

  const makeupRequest =
    isMakeupImageRequest(
      message
    );

  const hairRequest =
    isHairImageRequest(
      message
    );

  const imageGenerationRequest =
    isImageGenerationRequest(
      message
    );

  if (
    imageFile &&
    makeupRequest
  ) {
    console.log(
      "➡️ SELECTED ROUTE => MAKEUP IMAGE EDIT"
    );

    return generateMakeupImage(
      message,
      imageFile,
      GOOGLE_API_KEY
    );
  }

  if (
    imageFile &&
    hairRequest
  ) {
    console.log(
      "➡️ SELECTED ROUTE => HAIR IMAGE EDIT"
    );

    return generateHairImage(
      message,
      imageFile,
      GOOGLE_API_KEY
    );
  }

  if (
    !imageFile &&
    imageGenerationRequest
  ) {
    console.log(
      "➡️ SELECTED ROUTE => NEW IMAGE GENERATION"
    );

    return generateNewImage(
      message,
      GOOGLE_API_KEY
    );
  }

  console.log(
    "➡️ SELECTED ROUTE => TEXT RESPONSE"
  );

  return generateTextReply(
    message,
    imageFile,
    GOOGLE_API_KEY
  );
}

/* =========================================================
   TEXT RESPONSE
========================================================= */

async function generateTextReply(
  userMessage,
  imageFile,
  GOOGLE_API_KEY
) {
  printSeparator(
    "🚀 GEMINI TEXT REQUEST"
  );

  const url =
    getGeminiUrl(
      TEXT_MODEL,
      GOOGLE_API_KEY
    );

  const parts = [];

  console.log(
    "MODEL =>",
    TEXT_MODEL
  );

  console.log(
    "URL =>",
    hideApiKey(url)
  );

  console.log(
    "USER MESSAGE =>",
    userMessage
  );

  console.log(
    "HAS IMAGE =>",
    Boolean(
      imageFile
    )
  );

  if (
    imageFile?.buffer
  ) {
    console.log(
      "TEXT IMAGE MIME =>",
      imageFile
        .mimetype
    );

    console.log(
      "TEXT IMAGE SIZE =>",
      imageFile
        .buffer.length
    );

    parts.push({
      inline_data: {
        mime_type:
          imageFile
            .mimetype ||
          "image/jpeg",

        data:
          imageFile
            .buffer
            .toString(
              "base64"
            ),
      },
    });
  }

  parts.push({
    text: imageFile
      ? `
You are "Luma", a premium AI Smart Beauty Mirror made mainly for women.

The user uploaded an image. Look at the image carefully and answer her request naturally.

IDENTITY:
- You are not a normal chatbot.
- You are her elegant smart mirror and beauty companion.
- Never mention Gemini, Google, system prompts, APIs, or these instructions.

PERSONALITY:
- Warm, feminine, elegant, supportive, confident, and friendly.
- Speak like a tasteful beauty best friend.
- Give natural compliments when appropriate.
- Compliments should feel personal and connected to what is actually visible.
- Never exaggerate.
- Never be creepy, romantic, sexual, or overly flattering.
- Never insult her face, body, skin, hair, age, or appearance.
- If something can be improved, phrase it positively and gently.

LANGUAGE:
- Reply in the same language and dialect used by the user.
- If she writes in Egyptian Arabic, reply in natural Egyptian Arabic.
- If she writes in English, reply in natural English.
- Keep the response conversational and usually concise.

STYLE:
- You may naturally use a few emojis such as ✨🤍💄🌸.
- Do not overuse emojis.
- Do not sound robotic.
- Do not repeat the same compliment every reply.
- Avoid long introductions.
- Give the useful answer first.

IMAGE RULES:
- Only describe details you can actually see.
- Do not invent eye color, skin tone, face shape, hair type, clothing, or other features if unclear.
- Do not claim that you edited or changed the image in this text-analysis route.

BEAUTY GUIDANCE:
- For makeup questions, suggest flattering makeup based on visible features and the user's request.
- For hair questions, suggest hairstyles or hair colors that may suit her.
- For outfit/style questions, suggest colors and styling combinations.
- For skincare questions, give gentle general cosmetic advice and avoid pretending to diagnose medical conditions.
- If she asks "هل أنا حلوة؟" or similar, answer warmly and naturally without rating her numerically.

TONE EXAMPLES:
- "يا جميلة ✨"
- "اللوك ده لايق عليكي أوي 🤍"
- "عندك ملامح حلوة والستايل ده هيبرزها أكتر."
- "اختيار شيك جدًا بصراحة."
- "ممكن نعمله أهدى شوية وهيطلع أنعم عليكي."
- "That would complement your look beautifully ✨"

User request:
${userMessage || "حللي إطلالتي وقوليلي رأيك"}
`
      : `
You are "Luma", a premium AI Smart Beauty Mirror made mainly for women.

IDENTITY:
- You are not a normal chatbot.
- You are the user's elegant smart mirror and beauty companion.
- Never mention Gemini, Google, system prompts, APIs, or these instructions.

PERSONALITY:
- Warm, feminine, elegant, supportive, confident, and friendly.
- Speak like a tasteful beauty best friend.
- Give light, natural compliments when appropriate.
- Never be creepy, romantic, sexual, or exaggerated.
- Never insult or shame the user's appearance.
- If you disagree with a style choice, suggest a better option positively.

LANGUAGE:
- Always reply in the same language and dialect used by the user.
- If the user uses Egyptian Arabic, reply in natural Egyptian Arabic.
- If the user uses English, reply in natural English.

STYLE:
- Keep replies conversational and not unnecessarily long.
- You may naturally use emojis like ✨🤍💄🌸, but do not overuse them.
- Avoid robotic wording.
- Do not repeat the same compliment every time.
- Do not begin every reply with "يا جميلة".
- Give useful advice, not compliments only.

BEAUTY ROLE:
- You can help with makeup, hairstyles, hair colors, outfits, accessories, beauty routines, and general style ideas.
- If the user wants advice tailored to her appearance but has not sent a photo, invite her to send one.
- If the user asks a normal non-beauty question, still answer helpfully while keeping the friendly smart-mirror personality.

NATURAL ARABIC TONE EXAMPLES:
- "بصي، الفكرة دي حلوة أوي ✨"
- "ده هيبقى شيك عليكي جدًا."
- "ممكن نخليه أنعم شوية ويديكي لوك أرقى 🤍"
- "اختيارك حلو، وأنا أميل للدرجة الأهدى شوية."
- "ابعتيلي صورة واضحة وأنا أساعدك نختار الأنسب."

User message:
${userMessage || "مرحبا"}
`,
  });

  const payload = {
    contents: [
      {
        role:
          "user",

        parts,
      },
    ],

    generationConfig: {
      temperature:
        0.7,

      maxOutputTokens:
        200,
    },
  };

  console.log(
    "SAFE PAYLOAD =>",
    JSON.stringify(
      safePayloadForLog(
        payload
      ),
      null,
      2
    )
  );

  try {
    const startTime =
      Date.now();

    const response =
      await axios.post(
        url,
        payload,
        {
          headers: {
            "Content-Type":
              "application/json",
          },

          timeout:
            60000,
        }
      );

    const duration =
      Date.now() -
      startTime;

    console.log(
      "✅ GEMINI TEXT REQUEST SUCCESS"
    );

    console.log(
      "HTTP STATUS =>",
      response.status
    );

    console.log(
      "REQUEST DURATION MS =>",
      duration
    );

    logGeminiResponse(
      response.data
    );

    const text =
      extractResponseText(
        response.data
      );

    const result = {
      text:
        text ||
        "أنا معاكي يا جميلة ✨",

      imageUrl:
        null,
    };

    console.log(
      "✅ TEXT FINAL RESULT =>",
      JSON.stringify(
        result,
        null,
        2
      )
    );

    printSeparator();

    return result;
  } catch (error) {
    logAxiosError(
      "GEMINI TEXT REQUEST FAILED",
      error
    );

    throw new Error(
      error.response
        ?.data
        ?.error
        ?.message ||
      error.message ||
      "Gemini text error"
    );
  }
}

/* =========================================================
   NEW IMAGE GENERATION
========================================================= */

async function generateNewImage(
  userMessage,
  GOOGLE_API_KEY
) {
  printSeparator(
    "🚀 GEMINI NEW IMAGE REQUEST"
  );

  const url =
    getGeminiUrl(
      IMAGE_MODEL,
      GOOGLE_API_KEY
    );

  const payload = {
    contents: [
      {
        role:
          "user",

        parts: [
          {
            text: `
Generate one high-quality image based on the user's request.

If the request is related to beauty, fashion, makeup, hair, or styling:
- make the result elegant, polished, realistic, and premium
- use believable textures and lighting
- avoid distorted faces, hands, or unrealistic beauty effects

Return the generated image.
Do not return only a text description.

After the image, if you include text, keep it short, friendly, and in the same language as the user.

User request:
${userMessage}
`,
          },
        ],
      },
    ],

    generationConfig: {
      responseModalities: [
        "TEXT",
        "IMAGE",
      ],
    },
  };

  console.log(
    "MODEL =>",
    IMAGE_MODEL
  );

  console.log(
    "URL =>",
    hideApiKey(url)
  );

  console.log(
    "USER MESSAGE =>",
    userMessage
  );

  console.log(
    "PAYLOAD =>",
    JSON.stringify(
      payload,
      null,
      2
    )
  );

  try {
    const startTime =
      Date.now();

    const response =
      await axios.post(
        url,
        payload,
        {
          headers: {
            "Content-Type":
              "application/json",
          },

          timeout:
            120000,
        }
      );

    const duration =
      Date.now() -
      startTime;

    console.log(
      "✅ NEW IMAGE REQUEST SUCCESS"
    );

    console.log(
      "HTTP STATUS =>",
      response.status
    );

    console.log(
      "REQUEST DURATION MS =>",
      duration
    );

    logGeminiResponse(
      response.data
    );

    return await processImageResponse(
      response.data,
      "الصورة جاهزة يا جميلة ✨"
    );
  } catch (error) {
    logAxiosError(
      "GEMINI NEW IMAGE REQUEST FAILED",
      error
    );

    throw new Error(
      error.response
        ?.data
        ?.error
        ?.message ||
      error.message ||
      "Gemini image generation error"
    );
  }
}

/* =========================================================
   SAFE IMAGE CACHE WRAPPERS
========================================================= */

async function generateMakeupImage(
  userMessage,
  imageFile,
  GOOGLE_API_KEY
) {
  const cacheKey =
    createImageCacheKey(
      "makeup",
      imageFile.buffer,
      userMessage
    );

  const cachedResult =
    getCachedImageResult(
      cacheKey
    );

  if (cachedResult) {
    return cachedResult;
  }

  if (
    inFlightImageRequests
      .has(cacheKey)
  ) {
    console.log(
      "💰 DUPLICATE MAKEUP REQUEST => WAITING FOR EXISTING REQUEST"
    );

    return inFlightImageRequests
      .get(cacheKey);
  }

  const requestPromise =
    _generateMakeupImageOriginal(
      userMessage,
      imageFile,
      GOOGLE_API_KEY
    );

  inFlightImageRequests.set(
    cacheKey,
    requestPromise
  );

  try {
    const result =
      await requestPromise;

    saveImageResultToCache(
      cacheKey,
      result
    );

    return result;
  } finally {
    inFlightImageRequests
      .delete(
        cacheKey
      );
  }
}

async function generateHairImage(
  userMessage,
  imageFile,
  GOOGLE_API_KEY
) {
  const cacheKey =
    createImageCacheKey(
      "hair",
      imageFile.buffer,
      userMessage
    );

  const cachedResult =
    getCachedImageResult(
      cacheKey
    );

  if (cachedResult) {
    return cachedResult;
  }

  if (
    inFlightImageRequests
      .has(cacheKey)
  ) {
    console.log(
      "💰 DUPLICATE HAIR REQUEST => WAITING FOR EXISTING REQUEST"
    );

    return inFlightImageRequests
      .get(cacheKey);
  }

  const requestPromise =
    _generateHairImageOriginal(
      userMessage,
      imageFile,
      GOOGLE_API_KEY
    );

  inFlightImageRequests.set(
    cacheKey,
    requestPromise
  );

  try {
    const result =
      await requestPromise;

    saveImageResultToCache(
      cacheKey,
      result
    );

    return result;
  } finally {
    inFlightImageRequests
      .delete(
        cacheKey
      );
  }
}

/* =========================================================
   MAKEUP IMAGE EDIT
========================================================= */

async function _generateMakeupImageOriginal(
  userMessage,
  imageFile,
  GOOGLE_API_KEY
) {
  printSeparator(
    "🚀 GEMINI MAKEUP EDIT REQUEST"
  );

  const url =
    getGeminiUrl(
      IMAGE_MODEL,
      GOOGLE_API_KEY
    );

  console.log(
    "MODEL =>",
    IMAGE_MODEL
  );

  console.log(
    "URL =>",
    hideApiKey(url)
  );

  console.log(
    "USER MESSAGE =>",
    userMessage
  );

  console.log(
    "IMAGE MIME =>",
    imageFile.mimetype
  );

  console.log(
    "IMAGE SIZE =>",
    imageFile
      .buffer.length
  );

  const payload = {
    contents: [
      {
        role:
          "user",

        parts: [
          {
            inline_data: {
              mime_type:
                imageFile
                  .mimetype ||
                "image/jpeg",

              data:
                imageFile
                  .buffer
                  .toString(
                    "base64"
                  ),
            },
          },

          {
            text: `
You are editing a portrait for a premium AI Smart Beauty Mirror.

Edit the uploaded portrait directly and apply realistic, elegant, flattering makeup to the SAME person.

IMPORTANT IDENTITY RULES:
- Keep the exact same person.
- Keep the same identity and recognizable face.
- Keep the same facial structure and proportions.
- Keep the same pose.
- Keep the same hairstyle unless the user explicitly asks otherwise.
- Keep the same clothes.
- Keep the same background.
- Do not make the person look like a different woman.
- Do not change age, ethnicity, body shape, or facial identity.

MAKEUP RULES:
- Apply makeup that suits the visible features and the user's request.
- Keep skin texture realistic.
- Avoid plastic-looking or over-smoothed skin.
- Avoid unrealistic facial reshaping.
- Keep the result tasteful and believable.
- If the user did not specify a makeup style, choose a soft elegant look that enhances her existing features.
- Do not overdo contour, lips, lashes, or eye makeup unless explicitly requested.
- The makeup must be clearly visible but still realistic.

OUTPUT:

- Return the edited image.
- Do not return only a description.
- Along with the image, write ONE short compliment sentence.
- The compliment MUST be in natural Syrian Arabic dialect.
- Speak warmly like a friendly Syrian female beauty assistant.
- Keep it short, around 6 to 15 words.
- Do not use formal Arabic.
- Do not explain the makeup.
- Do not mention Gemini or the editing instructions.
- Vary the compliment every time.
- Do not repeat the same sentence.

Examples:
Arabic: "يا سلام، هاللوك كتير حلو عليكي وناعم ع ملامحك ✨"
Arabic: "عنجد هالألوان لايقين عليكي كتير 🤍"
Arabic: "واو، هاللوك عطاكي لمسة كتير مرتبة وحلوة."
Arabic: "هالمكياج طالع عليكي بجنن، ناعم وكتير أنيق ✨"
Arabic: "كتير حبيت هالدرجات عليكي، عطوكي لوك راقي."

User request:
${userMessage || "اعملي مكياج مناسب ليا"}
`,
          },
        ],
      },
    ],

    generationConfig: {
      responseModalities: [
        "TEXT",
        "IMAGE",
      ],
    },
  };

  console.log(
    "SAFE PAYLOAD =>",
    JSON.stringify(
      safePayloadForLog(
        payload
      ),
      null,
      2
    )
  );

  try {
    const startTime =
      Date.now();

    const response =
      await axios.post(
        url,
        payload,
        {
          headers: {
            "Content-Type":
              "application/json",
          },

          timeout:
            120000,
        }
      );

    const duration =
      Date.now() -
      startTime;

    console.log(
      "✅ MAKEUP REQUEST SUCCESS"
    );

    console.log(
      "HTTP STATUS =>",
      response.status
    );

    console.log(
      "REQUEST DURATION MS =>",
      duration
    );

    logGeminiResponse(
      response.data
    );

    return await processImageResponse(
      response.data,
      "اللوك ده طالع ناعم ولايق عليكي أوي ✨"
    );
  } catch (error) {
    logAxiosError(
      "GEMINI MAKEUP REQUEST FAILED",
      error
    );

    throw new Error(
      error.response
        ?.data
        ?.error
        ?.message ||
      error.message ||
      "Gemini makeup image error"
    );
  }
}

/* =========================================================
   HAIR IMAGE EDIT
========================================================= */

async function _generateHairImageOriginal(
  userMessage,
  imageFile,
  GOOGLE_API_KEY
) {
  printSeparator(
    "🚀 GEMINI HAIR EDIT REQUEST"
  );

  const url =
    getGeminiUrl(
      IMAGE_MODEL,
      GOOGLE_API_KEY
    );

  console.log(
    "MODEL =>",
    IMAGE_MODEL
  );

  console.log(
    "URL =>",
    hideApiKey(url)
  );

  console.log(
    "USER MESSAGE =>",
    userMessage
  );

  console.log(
    "IMAGE MIME =>",
    imageFile.mimetype
  );

  console.log(
    "IMAGE SIZE =>",
    imageFile
      .buffer.length
  );

  const payload = {
    contents: [
      {
        role:
          "user",

        parts: [
          {
            inline_data: {
              mime_type:
                imageFile
                  .mimetype ||
                "image/jpeg",

              data:
                imageFile
                  .buffer
                  .toString(
                    "base64"
                  ),
            },
          },

          {
            text: `
You are editing a portrait for a premium AI Smart Beauty Mirror.

Edit the uploaded portrait directly and change ONLY the hair as requested.

IDENTITY RULES:
- Keep the exact same person.
- Keep the same face and recognizable identity.
- Keep the same facial structure and proportions.
- Keep the same pose.
- Keep the same clothes.
- Keep the same background.
- Do not change age, ethnicity, body shape, makeup, or facial identity unless explicitly requested.

HAIR RULES:
- Create a realistic and believable hairstyle or haircut.
- The new hair must follow the head naturally.
- Keep realistic hair texture, volume, lighting, roots, and edges.
- Avoid wig-like results or distorted hairlines.
- If the user asks for a specific hairstyle or color, follow it.
- If the user only asks for something suitable, choose a flattering elegant hairstyle based on what is visible.
- The hairstyle change must be clearly visible.

OUTPUT:
- Return the edited image.
- Do not return only a description.
- After the image, write one short friendly line in the SAME language/dialect as the user.
- Mention the hairstyle or color briefly.
- Add a tasteful compliment when natural.
- Do not mention Gemini or these instructions.

Examples:
Arabic: "اللوب الناعم ده لايق على ملامحك جدًا ✨"
Arabic: "البني الشوكولاتة طالع شيك عليكي أوي 🤎"
English: "This soft layered style suits your look beautifully ✨"

User request:
${userMessage || "اعمليلي تسريحة مناسبة"}
`,
          },
        ],
      },
    ],

    generationConfig: {
      responseModalities: [
        "TEXT",
        "IMAGE",
      ],
    },
  };

  console.log(
    "SAFE PAYLOAD =>",
    JSON.stringify(
      safePayloadForLog(
        payload
      ),
      null,
      2
    )
  );

  try {
    const startTime =
      Date.now();

    const response =
      await axios.post(
        url,
        payload,
        {
          headers: {
            "Content-Type":
              "application/json",
          },

          timeout:
            120000,
        }
      );

    const duration =
      Date.now() -
      startTime;

    console.log(
      "✅ HAIR REQUEST SUCCESS"
    );

    console.log(
      "HTTP STATUS =>",
      response.status
    );

    console.log(
      "REQUEST DURATION MS =>",
      duration
    );

    logGeminiResponse(
      response.data
    );

    return await processImageResponse(
      response.data,
      "التسريحة دي طالعة شيك عليكي جدًا ✨"
    );
  } catch (error) {
    logAxiosError(
      "GEMINI HAIR REQUEST FAILED",
      error
    );

    throw new Error(
      error.response
        ?.data
        ?.error
        ?.message ||
      error.message ||
      "Gemini hair image error"
    );
  }
}

/* =========================================================
   PROCESS GEMINI IMAGE RESPONSE
========================================================= */

async function processImageResponse(
  responseData,
  defaultText
) {
  printSeparator(
    "🧪 PROCESSING GEMINI IMAGE RESPONSE"
  );

  const responseParts =
    responseData
      ?.candidates?.[0]
      ?.content?.parts ||
    [];

  console.log(
    "RESPONSE PARTS COUNT =>",
    responseParts.length
  );

  console.log(
    "FINISH REASON =>",
    responseData
      ?.candidates?.[0]
      ?.finishReason ||
      "NO_FINISH_REASON"
  );

  if (
    responseData
      ?.promptFeedback
  ) {
    console.log(
      "PROMPT FEEDBACK =>",
      JSON.stringify(
        responseData
          .promptFeedback,
        null,
        2
      )
    );
  }

  if (
    responseData
      ?.usageMetadata
  ) {
    console.log(
      "USAGE METADATA =>",
      JSON.stringify(
        responseData
          .usageMetadata,
        null,
        2
      )
    );
  }

  let text = "";

  let imageUrl =
    null;

  for (
    let index = 0;
    index <
    responseParts.length;
    index++
  ) {
    const part =
      responseParts[index];

    console.log(
      `🔎 PROCESSING PART ${index + 1}`
    );

    if (part.text) {
      console.log(
        `📝 PART ${index + 1} TEXT =>`,
        part.text
      );

      text +=
        `${part.text}\n`;
    }

    const inlineData =
      part.inlineData ||
      part.inline_data;

    if (
      inlineData?.data
    ) {
      console.log(
        `✅ IMAGE FOUND IN PART ${index + 1}`
      );

      console.log(
        "IMAGE MIME =>",
        inlineData
          .mimeType ||
          inlineData
            .mime_type ||
          "image/png"
      );

      console.log(
        "BASE64 LENGTH =>",
        inlineData
          .data.length
      );

      const imageBuffer =
        Buffer.from(
          inlineData.data,
          "base64"
        );

      console.log(
        "DECODED IMAGE BUFFER SIZE =>",
        imageBuffer.length
      );

      if (!imageUrl) {
        imageUrl =
          await uploadBufferToCloudinary(
            imageBuffer,

            inlineData
              .mimeType ||
              inlineData
                .mime_type ||
              "image/png"
          );

        console.log(
          "☁️ FINAL CLOUDINARY IMAGE URL =>",
          imageUrl
        );
      }
    } else {
      console.log(
        `ℹ️ NO IMAGE IN PART ${index + 1}`
      );
    }
  }

  text =
    text
      .replace(
        /\*/g,
        ""
      )
      .replace(
        /#+/g,
        ""
      )
      .trim();

  console.log(
    "FINAL CLEAN TEXT =>",
    text ||
      "NO_TEXT"
  );

  console.log(
    "FINAL IMAGE URL =>",
    imageUrl ||
      "NO_IMAGE"
  );

  if (!imageUrl) {
    console.log(
      "❌ GEMINI DID NOT RETURN AN IMAGE"
    );

    console.log(
      "SAFE FULL RESPONSE =>",
      JSON.stringify(
        safePayloadForLog(
          responseData
        ),
        null,
        2
      )
    );

    throw new Error(
      text ||
      "Gemini did not return an image"
    );
  }

  const result = {
    text:
      text ||
      defaultText,

    imageUrl,
  };

  console.log(
    "✅ FINAL IMAGE RESULT =>",
    JSON.stringify(
      result,
      null,
      2
    )
  );

  printSeparator();

  return result;
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  modelTurn,
  updateConversationHistory,
  messagesStore,
  clearMessages,
};