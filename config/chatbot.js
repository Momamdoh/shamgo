const axios = require("axios");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

const messagesStore = [];

function updateConversationHistory(userMessage, botResponse) {
  messagesStore.push({
    id: messagesStore.length + 1,
    user: userMessage,
    bot: botResponse,
  });
}

function clearMessages() {
  messagesStore.length = 0;
}

function uploadBufferToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "chatbot/makeup",
          resource_type: "image",
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      )
      .end(buffer);
  });
}

function isMakeupImageRequest(userMessage) {
  const message = (userMessage || "").toLowerCase();

  return (
    message.includes("مكياج") ||
    message.includes("makeup")
  );
}


function isHairImageRequest(userMessage) {
  const message = (userMessage || "").toLowerCase();

  return (
    message.includes("قصة شعر") ||
    message.includes("تسريحة") ||
    message.includes("شعر") ||
    message.includes("haircut") ||
    message.includes("hairstyle") ||
    message.includes("hair")
  );
}


async function listAvailableModels(GOOGLE_API_KEY) {
  try {
    const url =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GOOGLE_API_KEY}`;

    const response = await axios.get(url);

    console.log("===== AVAILABLE GEMINI MODELS =====");

    response.data.models.forEach((model) => {
      console.log("MODEL NAME =>", model.name);
      console.log("SUPPORTED METHODS =>", model.supportedGenerationMethods);
      console.log("-----------------------------------");
    });

    console.log("===================================");
  } catch (error) {
    console.log(
      "❌ LIST MODELS ERROR =>",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );
  }
}

async function modelTurn(userMessage, imageFile = null) {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY_BOT;

  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is missing");
  }

  await listAvailableModels(GOOGLE_API_KEY);

  if (imageFile && isMakeupImageRequest(userMessage)) {
  return await generateMakeupImage(userMessage, imageFile, GOOGLE_API_KEY);
}

if (imageFile && isHairImageRequest(userMessage)) {
  return await generateHairImage(userMessage, imageFile, GOOGLE_API_KEY);
}

  return await generateTextReply(userMessage, imageFile, GOOGLE_API_KEY);
}

async function generateTextReply(userMessage, imageFile, GOOGLE_API_KEY) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GOOGLE_API_KEY}`;

  const parts = [];

  if (imageFile) {
    console.log("🖼 IMAGE MIME =>", imageFile.mimetype);
    console.log("🖼 IMAGE SIZE =>", imageFile.buffer.length);

    parts.push({
      inline_data: {
        mime_type: imageFile.mimetype || "image/jpeg",
        data: imageFile.buffer.toString("base64"),
      },
    });
  }

  parts.push({
    text: imageFile
      ? `
Analyze this face image and suggest suitable makeup.
Reply in the same language as the user.

User message:
${userMessage || "Suggest suitable makeup"}
`
      : userMessage,
  });

  const payload = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
  };

  try {
    console.log("🚀 GEMINI TEXT REQUEST");

    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const responseParts =
      response.data?.candidates?.[0]?.content?.parts || [];

    const text = responseParts
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n");

    return {
      text: text || "No response from Gemini",
      imageUrl: null,
    };
  } catch (error) {
    console.log(
      "❌ GEMINI TEXT ERROR =>",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );

    throw new Error("Gemini error");
  }
}

async function generateMakeupImage(userMessage, imageFile, GOOGLE_API_KEY) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GOOGLE_API_KEY}`;

  console.log("🚀 GEMINI IMAGE EDIT REQUEST");
  console.log("🖼 IMAGE MIME =>", imageFile.mimetype);
  console.log("🖼 IMAGE SIZE =>", imageFile.buffer.length);

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: imageFile.mimetype || "image/jpeg",
              data: imageFile.buffer.toString("base64"),
            },
          },
          {
            text: `
Edit the uploaded portrait photo directly.
Apply realistic suitable makeup to the same person.
Keep the same face, identity, pose, hair, clothes, and background.
Do not create a new person.
Do not describe only.
Return the edited image.

User request:
${userMessage || "Apply suitable makeup to this image"}
`,
          },
        ],
      },
    ],
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const responseParts =
      response.data?.candidates?.[0]?.content?.parts || [];

    let text = "";
    let imageUrl = null;

    for (const part of responseParts) {
      if (part.text) {
        text += part.text;
      }

      const inlineData = part.inlineData || part.inline_data;

      if (inlineData && inlineData.data) {
        const buffer = Buffer.from(inlineData.data, "base64");
        imageUrl = await uploadBufferToCloudinary(buffer);
      }
    }

    if (!imageUrl) {
      console.log(
        "⚠️ NO IMAGE RETURNED =>",
        JSON.stringify(response.data, null, 2)
      );

      return {
        text: text || "Gemini did not return an edited image",
        imageUrl: null,
      };
    }

    return {
      text: text || "تم تعديل الصورة وإضافة المكياج",
      imageUrl,
    };
  } catch (error) {
    console.log(
      "❌ GEMINI IMAGE ERROR =>",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );

    throw new Error("Gemini image error");
  }


  
}


async function generateHairImage(userMessage, imageFile, GOOGLE_API_KEY) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GOOGLE_API_KEY}`;

  console.log("🚀 GEMINI HAIR EDIT REQUEST");
  console.log("🖼 IMAGE MIME =>", imageFile.mimetype);
  console.log("🖼 IMAGE SIZE =>", imageFile.buffer.length);

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: imageFile.mimetype || "image/jpeg",
              data: imageFile.buffer.toString("base64"),
            },
          },
          {
           text: `
Edit the uploaded portrait photo directly.

Change the hair visually to a realistic suitable new haircut or hairstyle.
The edited result must show the new hairstyle in the image.

Keep:
same person
same face
same identity
same pose
same clothes
same background

Do not only suggest a hairstyle.
Do not return text only.
Return the edited image.

After returning the edited image, write one short Arabic line naming the hairstyle.

User request:
${userMessage || "Apply a suitable hairstyle to this image"}
`,
          },
        ],
      },
    ],
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const responseParts =
      response.data?.candidates?.[0]?.content?.parts || [];

    let text = "";
    let imageUrl = null;

    for (const part of responseParts) {
      if (part.text) {
        text += part.text;
      }

      const inlineData = part.inlineData || part.inline_data;

      if (inlineData && inlineData.data) {
        const buffer = Buffer.from(inlineData.data, "base64");
        imageUrl = await uploadBufferToCloudinary(buffer);
      }
    }

    text = text
      .replace(/\*/g, "")
      .replace(/#+/g, "")
      .trim();

    return {
      text: text || "تم تعديل قصة الشعر",
      imageUrl,
    };
  } catch (error) {
    console.log(
      "❌ GEMINI HAIR ERROR =>",
      JSON.stringify(error.response?.data || error.message, null, 2)
    );

    throw new Error("Gemini hair error");
  }
}
module.exports = {
  modelTurn,
  updateConversationHistory,
  messagesStore,
  clearMessages,
};