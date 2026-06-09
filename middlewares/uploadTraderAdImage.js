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
    fileSize: 10 * 1024 * 1024,
    files: 3,
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "video", maxCount: 1 },
  { name: "licenseImage", maxCount: 1 },
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
const uploadImageToCloudinary = (buffer, folder = "ads/images") => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        },
      )
      .end(buffer);
  });
};

const uploadVideoToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          resource_type: "video",
          folder: "ads/videos",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        },
      )
      .end(buffer);
  });
};

const compressImage = async (file) => {
  let quality = 80;
  let width = 1280;
  let buffer = null;

  for (let i = 0; i < 6; i++) {
    buffer = await sharp(file.buffer)
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

  return buffer;
};

// 🔹 Processing
const processTraderAdImage = async (req, res, next) => {
  try {
    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];
    const licenseImageFile = req.files?.licenseImage?.[0];

    // ❌ صورة الإعلان مطلوبة فقط في إنشاء الإعلان
    if (!imageFile && req.method === "POST" && req.originalUrl.includes("/trader-ad")) {
      return res.status(200).json({
        status: "fail",
        message: {
          image: "صورة الإعلان مطلوبة",
        },
      });
    }

    // ❌ صورة السائق مطلوبة في تسجيل السائق
    if (!imageFile && req.method === "POST" && req.originalUrl.includes("/driverauthent")) {
      return res.status(200).json({
        status: "fail",
        message: {
          image: "صورة السائق مطلوبة",
        },
      });
    }

    // ❌ صورة الرخصة مطلوبة في تسجيل السائق
    if (!licenseImageFile && req.method === "POST" && req.originalUrl.includes("/driverauthent")) {
      return res.status(200).json({
        status: "fail",
        message: {
          licenseImage: "صورة الرخصة مطلوبة",
        },
      });
    }

    // ❌ صورة التاجر مطلوبة في تسجيل التاجر
    if (!imageFile && req.method === "POST" && req.originalUrl.includes("/api/trader")) {
      return res.status(200).json({
        status: "fail",
        message: {
          image: "صورة التاجر مطلوبة",
        },
      });
    }

    if (imageFile) {
      const buffer = await compressImage(imageFile);

      if (!buffer || buffer.length > 1024 * 1024) {
        return res.status(200).json({
          status: "fail",
          message: {
            image: "يجب أن تكون الصورة أقل من 1MB",
          },
        });
      }

      const imageUrl = await uploadImageToCloudinary(buffer, "uploads/images");

      req.savedImage = {
        imagePath: imageUrl,
        size: buffer.length,
        mimetype: "image/webp",
      };
    }

    if (licenseImageFile) {
      const licenseBuffer = await compressImage(licenseImageFile);

      if (!licenseBuffer || licenseBuffer.length > 1024 * 1024) {
        return res.status(200).json({
          status: "fail",
          message: {
            licenseImage: "يجب أن تكون صورة الرخصة أقل من 1MB",
          },
        });
      }

      const licenseImageUrl = await uploadImageToCloudinary(
        licenseBuffer,
        "drivers/licenses",
      );

      req.savedLicenseImage = {
        imagePath: licenseImageUrl,
        size: licenseBuffer.length,
        mimetype: "image/webp",
      };
    }

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