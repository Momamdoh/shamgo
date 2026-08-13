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
The SECOND image contains the exact dress selected by the user.

Put that exact dress on the person from the FIRST image.

Preserve the visible:
- color
- pattern
- fabric appearance
- neckline
- sleeves
- length
- silhouette
- design details

Fit the dress naturally to the user's real body and pose.

If the product image contains another model/person,
IGNORE that person's face, body and identity.
Use ONLY the dress as product reference.
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
The SECOND image contains the selected makeup product or makeup reference.

Apply that exact visible product effect to the face in the FIRST image.

Preserve its visible:
- color
- shade
- finish
- tone
- style

Apply it naturally to the correct facial area.

Do NOT change the user's face shape.
Do NOT replace the user's identity.
`;
  }

  // =====================================
  // Clothes
  // =====================================
  else {
    productInstructions = `
The SECOND image contains the exact clothing item selected by the user.

Put that exact clothing item on the person in the FIRST image.

Preserve its visible:
- color
- design
- pattern
- fabric appearance
- neckline
- sleeves
- logos
- distinctive details

Fit the clothing naturally to the user's real body and pose.

If another person/model appears in the product image,
IGNORE that person's identity and body.
Use ONLY the clothing item as reference.
`;
  }

  // =====================================
  // Prompt
  // =====================================
  const prompt = `
Create ONE photorealistic virtual try-on result.

There are TWO input images.

IMAGE 1:
The real user.

IMAGE 2:
The exact product selected from the advertisement.

VERY IMPORTANT IMAGE ORDER:
- FIRST image is the USER.
- SECOND image is the PRODUCT.

USER IDENTITY RULES:

- Keep exactly the same person from IMAGE 1.
- Preserve the same face.
- Preserve the same recognizable identity.
- Preserve facial structure.
- Preserve skin appearance.
- Preserve hair.
- Preserve body proportions.
- Preserve pose as much as possible.
- Preserve background as much as possible.

Never replace the user with any person visible in IMAGE 2.

Never copy the face of a product model.

Never generate a completely different person.

PRODUCT:

Title:
${productTitle || "Product"}

Category:
${tryOnCategory}

${productInstructions}

REALISM RULES:

- The result must look like a real photograph.
- Keep the lighting consistent with IMAGE 1.
- Keep realistic shadows.
- Keep realistic perspective.
- Keep realistic product scale.
- Keep realistic body anatomy.
- Keep realistic fabric folds if clothing is used.
- Avoid floating products.
- Avoid duplicated limbs.
- Avoid extra fingers.
- Avoid distorted hands.
- Avoid distorted face.
- Avoid broken garment edges.
- Avoid changing the user's body unnecessarily.

FINAL RESULT:

The final image must clearly show the SAME user from IMAGE 1 wearing or using the exact selected product from IMAGE 2.

OUTPUT:

- Return exactly ONE edited image.
- Do not return a collage.
- Do not return before-and-after.
- Do not add text.
- Do not add captions.
- Do not add watermarks.
- Do not return only a description.

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