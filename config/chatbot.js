const axios = require("axios");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

// =====================================
// Cloudinary
// =====================================
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

// =====================================
// Gemini Image Model
// =====================================
const IMAGE_MODEL = "gemini-2.5-flash-image";

// =====================================
// Messages
// =====================================
const messagesStore = [];

// =====================================
// Cache
// =====================================
const imageResultCache = new Map();
const inFlightImageRequests = new Map();

const IMAGE_CACHE_TTL =
  24 * 60 * 60 * 1000;

// =====================================
// Helpers
// =====================================
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

function normalizePrompt(text = "") {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

function getGeminiUrl(
  model,
  apiKey
) {
  return (
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `${model}:generateContent?key=${apiKey}`
  );
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

// =====================================
// Message Store
// =====================================
function updateConversationHistory(
  userMessage,
  botResponse
) {
  messagesStore.push({
    id:
      messagesStore.length + 1,

    user:
      userMessage,

    bot:
      botResponse,
  });
}

function clearMessages() {
  messagesStore.length = 0;
}

// =====================================
// Cloudinary Upload
// =====================================
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
        "BUFFER SIZE =>",
        buffer.length
      );

      console.log(
        "MIME TYPE =>",
        mimeType
      );

      const uploadStream =
        cloudinary.uploader.upload_stream(
          {
            folder:
              "chatbot/virtual-try-on",

            resource_type:
              "image",
          },

          (
            error,
            result
          ) => {
            if (error) {
              console.log(
                "❌ CLOUDINARY ERROR =>",
                error
              );

              reject(error);

              return;
            }

            console.log(
              "✅ CLOUDINARY SUCCESS"
            );

            console.log(
              "IMAGE URL =>",
              result.secure_url
            );

            resolve(
              result.secure_url
            );
          }
        );

      uploadStream.on(
        "error",
        (error) => {
          reject(error);
        }
      );

      uploadStream.end(
        buffer
      );
    }
  );
}

// =====================================
// Cache Key
// =====================================
function createVirtualTryOnCacheKey({
  userImageBuffer,
  productImageBuffer,
  category,
  productTitle,
  userMessage,
}) {
  const userHash =
    crypto
      .createHash(
        "sha256"
      )
      .update(
        userImageBuffer
      )
      .digest(
        "hex"
      );

  const productHash =
    crypto
      .createHash(
        "sha256"
      )
      .update(
        productImageBuffer
      )
      .digest(
        "hex"
      );

  return [
    "tryon",
    category || "",
    userHash,
    productHash,
    normalizePrompt(
      productTitle || ""
    ),
    normalizePrompt(
      userMessage || ""
    ),
  ].join(":");
}

function getCachedImageResult(
  key
) {
  const cached =
    imageResultCache.get(
      key
    );

  if (!cached) {
    return null;
  }

  const expired =
    Date.now() -
      cached.createdAt >
    IMAGE_CACHE_TTL;

  if (expired) {
    imageResultCache.delete(
      key
    );

    return null;
  }

  if (
    !cached.result?.imageUrl
  ) {
    imageResultCache.delete(
      key
    );

    return null;
  }

  console.log(
    "💰 TRY-ON CACHE HIT"
  );

  return cached.result;
}

function saveImageResultToCache(
  key,
  result
) {
  if (!result?.imageUrl) {
    return;
  }

  imageResultCache.set(
    key,
    {
      createdAt:
        Date.now(),

      result,
    }
  );
}

// =====================================
// Download Product Image
// =====================================
async function downloadProductImage(
  productImageUrl
) {
  if (
    !productImageUrl ||
    !String(
      productImageUrl
    ).trim()
  ) {
    throw new Error(
      "Product image URL is missing"
    );
  }

  printSeparator(
    "🛍 DOWNLOAD PRODUCT IMAGE"
  );

  console.log(
    "PRODUCT URL =>",
    productImageUrl
  );

  try {
    const response =
      await axios.get(
        productImageUrl,
        {
          responseType:
            "arraybuffer",

          timeout:
            30000,
        }
      );

    const buffer =
      Buffer.from(
        response.data
      );

    if (
      !buffer ||
      buffer.length === 0
    ) {
      throw new Error(
        "Product image is empty"
      );
    }

    const mimeType =
      response.headers[
        "content-type"
      ] ||
      "image/jpeg";

    console.log(
      "✅ PRODUCT IMAGE DOWNLOADED"
    );

    console.log(
      "PRODUCT IMAGE SIZE =>",
      buffer.length
    );

    console.log(
      "PRODUCT MIME =>",
      mimeType
    );

    return {
      buffer,
      mimeType,
    };
  } catch (error) {
    logAxiosError(
      "PRODUCT IMAGE DOWNLOAD FAILED",
      error
    );

    throw new Error(
      "Failed to download product image"
    );
  }
}

// =====================================
// Main
// =====================================
async function modelTurn(
  userMessage,
  imageFile = null,
  options = {}
) {
  printSeparator(
    "📩 VIRTUAL TRY-ON REQUEST"
  );

  const GOOGLE_API_KEY =
    process.env
      .GOOGLE_API_KEY_BOT;

  if (!GOOGLE_API_KEY) {
    throw new Error(
      "GOOGLE_API_KEY_BOT is missing"
    );
  }

  const {
    productImageUrl = null,
    tryOnCategory = null,
    productTitle = null,
  } = options;

  // =====================================
  // User Image Validation
  // =====================================
  if (
    !imageFile ||
    !imageFile.buffer ||
    imageFile.buffer.length === 0
  ) {
    throw new Error(
      "User image is required"
    );
  }

  // =====================================
  // Product Image Validation
  // =====================================
  if (
    !productImageUrl ||
    !String(
      productImageUrl
    ).trim()
  ) {
    throw new Error(
      "Product image is required"
    );
  }

  // =====================================
  // Category
  // =====================================
  const category =
    String(
      tryOnCategory || ""
    )
      .trim()
      .toLowerCase();

  const allowedCategories = [
    "clothes",
    "dress_rental",
    "makeup",
  ];

  if (
    !allowedCategories.includes(
      category
    )
  ) {
    throw new Error(
      `Unsupported category: ${category}`
    );
  }

  const message =
    String(
      userMessage || ""
    ).trim();

  console.log(
    "USER MESSAGE =>",
    message
  );

  console.log(
    "CATEGORY =>",
    category
  );

  console.log(
    "PRODUCT TITLE =>",
    productTitle ||
      "NO_TITLE"
  );

  console.log(
    "PRODUCT IMAGE URL =>",
    productImageUrl
  );

  console.log(
    "USER IMAGE NAME =>",
    imageFile.originalname
  );

  console.log(
    "USER IMAGE MIME =>",
    imageFile.mimetype
  );

  console.log(
    "USER IMAGE SIZE =>",
    imageFile.buffer.length
  );

  return await generateProductTryOnImage(
    {
      userMessage:
        message,

      imageFile,

      productImageUrl,

      tryOnCategory:
        category,

      productTitle,

      GOOGLE_API_KEY,
    }
  );
}

// =====================================
// Generate Try-On
// =====================================
async function generateProductTryOnImage({
  userMessage,
  imageFile,
  productImageUrl,
  tryOnCategory,
  productTitle,
  GOOGLE_API_KEY,
}) {
  const productImage =
    await downloadProductImage(
      productImageUrl
    );

  const cacheKey =
    createVirtualTryOnCacheKey({
      userImageBuffer:
        imageFile.buffer,

      productImageBuffer:
        productImage.buffer,

      category:
        tryOnCategory,

      productTitle,

      userMessage,
    });

  const cachedResult =
    getCachedImageResult(
      cacheKey
    );

  if (cachedResult) {
    return cachedResult;
  }

  if (
    inFlightImageRequests.has(
      cacheKey
    )
  ) {
    console.log(
      "⏳ SAME REQUEST ALREADY RUNNING"
    );

    return await inFlightImageRequests.get(
      cacheKey
    );
  }

  const requestPromise =
    generateTryOnWithGemini({
      userMessage,

      imageFile,

      productImage,

      tryOnCategory,

      productTitle,

      GOOGLE_API_KEY,
    });

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
    inFlightImageRequests.delete(
      cacheKey
    );
  }
}

// =====================================
// Gemini
// =====================================
async function generateTryOnWithGemini({
  userMessage,
  imageFile,
  productImage,
  tryOnCategory,
  productTitle,
  GOOGLE_API_KEY,
}) {
  printSeparator(
    "🚀 GEMINI TRY-ON START"
  );

  const url =
    getGeminiUrl(
      IMAGE_MODEL,
      GOOGLE_API_KEY
    );

  let productInstructions;

  // =====================================
  // Dress
  // =====================================
  if (
    tryOnCategory ===
    "dress_rental"
  ) {
    productInstructions = `
The SECOND image is a reference for the exact dress to transfer.
Locate the dress itself, even if a product model is wearing it.
Replace ONLY the corresponding garment on the person in IMAGE 1.
Preserve the dress color, print, neckline, sleeves, length, cut,
and distinctive details from IMAGE 2.
Keep IMAGE 1 person's face, head, hair, hands, legs, body position,
framing and surroundings unchanged.
Fit the dress around the existing body naturally, with physically
plausible fabric folds, occlusion and lighting.
Never import the product model, its skin, head, body or background.
`;
  }

  // =====================================
  // Makeup Product
  // =====================================
  else if (
    tryOnCategory ===
    "makeup"
  ) {
    productInstructions = `
The SECOND image is a reference for the selected makeup product.
Apply ONLY its appropriate visible color and finish to the matching
facial area of the person in IMAGE 1.
Keep the original face, identity, expression, hair, camera angle,
lighting and background unchanged.
Do not copy a product model's facial features, skin, eyes or hair.
Do not replace or regenerate the whole face.
`;
  }

  // =====================================
  // Clothes
  // =====================================
  else {
    productInstructions = `
The SECOND image is the product reference, NOT the person to render.
Identify the actual wearable garment in IMAGE 2 by its shape,
color, fabric, fastenings, seams, logos and other visible details.
If IMAGE 2 shows someone wearing the garment, extract the GARMENT
conceptually; never use that model's face, torso, hands or legs.
If IMAGE 2 contains a bundle or several products, use ONLY the most
prominent wearable garment. Do not merge the reference model or
copy their pose, body, background or unrelated accessories.

Edit IMAGE 1 in place: replace ONLY the corresponding clothing area
on the original person with that selected garment.
Preserve original face, hair, neck, hands, skin, body proportions,
body pose, limbs, photo framing, camera viewpoint and background.
The garment should follow the original person's shoulders, arms,
waist and posture with believable folds, shadows and occlusion.
Do NOT paste the product photo or a flat sticker onto the person.
Do NOT generate an extra human or a second torso.
Do NOT change the garment's recognizable design or color.
`;
  }

  // =====================================
  // Prompt
  // =====================================
  const prompt = `
Perform an IMAGE EDIT / VIRTUAL TRY-ON of IMAGE 1, not a new portrait.

INPUT IMAGES (strict order):
IMAGE 1 = original photograph of the REAL USER. This is the BASE image.
IMAGE 2 = the PRODUCT reference. It is NOT the person to keep.

EDITING PRIORITY:
1. Start from IMAGE 1 and keep its pixels/composition wherever possible.
2. Change only the product's appropriate clothing/makeup region.
3. Keep the EXACT same user: face, hair, visible skin, arms, hands,
   posture, proportions and background from IMAGE 1.
4. Transfer the selected item from IMAGE 2 onto that same person.
5. Match the original lighting, perspective and garment drape.

Never blend the identity or anatomy of a product model with the user.
Never copy the person in IMAGE 2 into IMAGE 1.
Never replace the original photo with a newly invented person.
Never place an extra head, torso, arm, leg or another person.
Do not crop, zoom, relocate or restage the user unnecessarily.
Keep all non-product pixels as close as possible to IMAGE 1.

SELECTED PRODUCT:
Title: ${productTitle || "Product"}
Category: ${tryOnCategory}

${productInstructions}

IMAGE QUALITY:
- A single believable photograph of the original user.
- No cut-and-paste borders, floating garments or double exposure.
- Correct garment fit and realistic folds, seams and shadows.
- Natural original human anatomy and unchanged face.
- The output must clearly show the ORIGINAL person wearing/using
  the selected item, not a product model wearing it.

OUTPUT: return exactly ONE edited image, no text, collage,
comparison, captions or watermark.

User request:
${
  userMessage ||
  "Show this exact product on me realistically."
}
`;

  // =====================================
  // Payload
  // =====================================
  const payload = {
    contents: [
      {
        role:
          "user",

        parts: [
          // =====================================
          // User Image
          // =====================================
          {
            inline_data: {
              mime_type:
                imageFile.mimetype ||
                "image/jpeg",

              data:
                imageFile.buffer
                  .toString(
                    "base64"
                  ),
            },
          },

          // =====================================
          // Product Image
          // =====================================
          {
            inline_data: {
              mime_type:
                productImage.mimeType ||
                "image/jpeg",

              data:
                productImage.buffer
                  .toString(
                    "base64"
                  ),
            },
          },

          // =====================================
          // Instructions
          // =====================================
          {
            text:
              prompt,
          },
        ],
      },
    ],

    generationConfig: {
      responseModalities: [
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
    hideApiKey(
      url
    )
  );

  console.log(
    "CATEGORY =>",
    tryOnCategory
  );

  console.log(
    "PRODUCT TITLE =>",
    productTitle ||
      "NO_TITLE"
  );

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

  // =====================================
  // Gemini Request
  // =====================================
  try {
    const start =
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

    console.log(
      "✅ GEMINI RESPONSE"
    );

    console.log(
      "STATUS =>",
      response.status
    );

    console.log(
      "TIME MS =>",
      Date.now() -
        start
    );

    return await processImageResponse(
      response.data
    );
  } catch (error) {
    logAxiosError(
      "GEMINI TRY-ON FAILED",
      error
    );

    throw new Error(
      error.response?.data
        ?.error?.message ||
        error.message ||
        "Virtual try-on failed"
    );
  }
}

// =====================================
// Process Gemini Response
// =====================================
async function processImageResponse(
  responseData
) {
  printSeparator(
    "🧪 PROCESS RESPONSE"
  );

  const candidates =
    responseData?.candidates ||
    [];

  console.log(
    "CANDIDATES =>",
    candidates.length
  );

  console.log(
    "FINISH REASON =>",
    candidates[0]
      ?.finishReason ||
      "NONE"
  );

  const parts =
    candidates[0]
      ?.content?.parts ||
    [];

  console.log(
    "PARTS =>",
    parts.length
  );

  let imageUrl =
    null;

  let responseText =
    "";

  for (
    let i = 0;
    i < parts.length;
    i++
  ) {
    const part =
      parts[i];

    if (part.text) {
      responseText +=
        `${part.text}\n`;
    }

    const inlineData =
      part.inlineData ||
      part.inline_data;

    if (
      inlineData?.data &&
      !imageUrl
    ) {
      console.log(
        "✅ IMAGE FOUND AT PART =>",
        i
      );

      const imageBuffer =
        Buffer.from(
          inlineData.data,
          "base64"
        );

      console.log(
        "GENERATED BUFFER =>",
        imageBuffer.length
      );

      imageUrl =
        await uploadBufferToCloudinary(
          imageBuffer,

          inlineData.mimeType ||
            inlineData.mime_type ||
            "image/png"
        );
    }
  }

  if (!imageUrl) {
    console.log(
      "❌ NO GENERATED IMAGE"
    );

    console.log(
      "TEXT =>",
      responseText
    );

    console.log(
      "FULL RESPONSE =>",
      JSON.stringify(
        safePayloadForLog(
          responseData
        ),
        null,
        2
      )
    );

    throw new Error(
      responseText.trim() ||
        "Gemini did not return an image"
    );
  }

  const result = {
    text:
      "تم تركيب المنتج على صورتك بنجاح ✨",

    imageUrl,
  };

  console.log(
    "✅ FINAL RESULT =>",
    result
  );

  return result;
}

// =====================================
// Exports
// =====================================
module.exports = {
  modelTurn,
  updateConversationHistory,
  messagesStore,
  clearMessages,
};