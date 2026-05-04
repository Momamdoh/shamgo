const multer = require("multer");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;

// 🔹 Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

// 🔹 Multer (Memory)
const storage = multer.memoryStorage();

const multerUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB عشان الفيديو
    files: 2,
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

// 🔹 Upload Middleware
const uploadTraderAdImage = (req, res, next) => {
  multerUpload(req, res, function (err) {
    if (err) {
      console.log("multer error =>", err);
      return res.status(400).json({
        status: "fail",
        message: err.message,
      });
    }
    next();
  });
};

// 🔹 Upload helpers
const uploadImageToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder: "ads/images" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        }
      )
      .end(buffer);
  });
};

const uploadVideoToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { resource_type: "video", folder: "ads/videos" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        }
      )
      .end(buffer);
  });
};

// 🔹 Processing
const processTraderAdImage = async (req, res, next) => {
  try {
    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];

    // ❌ لو مفيش صورة
    if (!imageFile && req.method === "POST") {
      return res.status(200).json({
        status: "fail",
        message: {
          image: "صورة الإعلان مطلوبة",
        },
      });
    }

    // 🔥 معالجة الصورة بـ sharp
    if (imageFile) {
      let quality = 80;
      let width = 1280;
      let buffer = null;

      for (let i = 0; i < 6; i++) {
        buffer = await sharp(imageFile.buffer)
          .rotate()
          .resize({
            width,
            withoutEnlargement: true,
            fit: "inside",
          })
          .webp({ quality })
          .toBuffer();

        if (buffer.length <= 1024 * 1024) break;

        quality -= 10;
        width -= 150;
      }

      if (!buffer || buffer.length > 1024 * 1024) {
        return res.status(200).json({
          status: "fail",
          message: {
            image: "يجب أن تكون الصورة أقل من 1MB",
          },
        });
      }

      // 🔥 رفع على Cloudinary
      const imageUrl = await uploadImageToCloudinary(buffer);

      req.savedImage = {
        imagePath: imageUrl,
        size: buffer.length,
        mimetype: "image/webp",
      };
    }

    // 🔥 رفع الفيديو
    if (videoFile) {
      const videoUrl = await uploadVideoToCloudinary(videoFile.buffer);

      req.savedVideo = {
        videoPath: videoUrl,
        size: videoFile.size,
        mimetype: videoFile.mimetype,
      };
    }

    next();
  } catch (error) {
    console.log("upload error =>", error);

    return res.status(500).json({
      status: "fail",
      message: {
        error: "خطأ أثناء رفع الملفات",
      },
    });
  }
};

module.exports = {
  uploadTraderAdImage,
  processTraderAdImage,
};