const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const uploadDir = path.join(__dirname, "..", "public", "images");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();

const multerUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2,
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

const uploadTraderAdImage = (req, res, next) => {
  multerUpload(req, res, function (err) {
    if (err) {
      console.log("multer error =>", err);
      return res.status(400).json({
        status: "fail",
        message: err.message,
        code: err.code || null,
        field: err.field || null,
      });
    }
    next();
  });
};

const processTraderAdImage = async (req, res, next) => {
  try {
    console.log("req.body =>", req.body);
    console.log("req.files =>", req.files);

    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];

    if (!imageFile) {
      if (req.method === "POST") {
        return res.status(200).json({
          status: "fail",
          message: {
            image: "صورة الإعلان مطلوبة",
          },
        });
      }
    } else {
      const imageFileName = `ad-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)}.webp`;

      const imageOutputPath = path.join(uploadDir, imageFileName);

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

        if (buffer.length <= 1024 * 1024) {
          break;
        }

        quality -= 10;
        width -= 150;
      }

      if (!buffer || buffer.length > 1024 * 1024) {
        return res.status(200).json({
          status: "fail",
          message: {
            image: "يجب أن تكون الصورة أقل من 1MB بعد التحويل",
          },
        });
      }

      fs.writeFileSync(imageOutputPath, buffer);

      req.savedImage = {
        fileName: imageFileName,
        imagePath: `/images/${imageFileName}`,
        size: buffer.length,
        mimetype: "image/webp",
      };
    }

    if (videoFile) {
      const ext = path.extname(videoFile.originalname) || ".mp4";
      const videoFileName = `ad-video-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)}${ext}`;

      const videoOutputPath = path.join(uploadDir, videoFileName);

      fs.writeFileSync(videoOutputPath, videoFile.buffer);

      req.savedVideo = {
        fileName: videoFileName,
        videoPath: `/images/${videoFileName}`,
        size: videoFile.size,
        mimetype: videoFile.mimetype,
      };
    }

    next();
  } catch (error) {
    console.log("sharp error =>", error);

    return res.status(200).json({
      status: "fail",
      message: {
        image: "الملف المرفوع ليس صورة صالحة",
      },
    });
  }
};

module.exports = {
  uploadTraderAdImage,
  processTraderAdImage,
};