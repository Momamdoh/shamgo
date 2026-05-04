const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Set up multer for file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, "../images"));
    },
    filename: function (req, file, cb) {
        cb(null, new Date().toISOString().replace(/:/g, "-") + path.extname(file.originalname));
    }
});

// Create multer instance with file filter
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
        }
    }
});

// POST method for uploading image
router.post("/", upload.single("file"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(200).json({ message: "No file uploaded" });
        }

        // Log file details (for debugging purposes)
        console.log(`Uploaded file: ${req.file.filename}, Size: ${req.file.size} bytes`);

        // Respond with success message
        res.status(200).json({
            message: "Image uploaded successfully",
            file: {
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (error) {
        console.error(`Error during file upload: ${error.message}`);
        res.status(500).json({ message: "Internal server error during file upload" });
    }
});

// DELETE method for deleting file
router.delete("/:filename", (req, res) => {
    const filePath = path.join(__dirname, "../images", req.params.filename);

    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(`Error deleting file: ${err.message}`);
            return res.status(500).json({ message: "Error deleting file" });
        }
        res.status(200).json({ message: "File deleted successfully" });
    });
});

module.exports = router;
