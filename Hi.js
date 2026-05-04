// Load environment variables
require("dotenv").config();

// Import necessary packages
const express = require("express");
const path = require("path");
const cors = require("cors");
// const corsHeaders = require("./middlewares/headers");

// Import custom middlewares and utilities
const logger = require("./middlewares/logger");
const { notfound, errors } = require("./middlewares/errors");
const { ConnectToDb } = require("./config/db");

// Create an instance of the Express application
const app = express();

// Set the view engine to EJS
app.set("view engine", "ejs");

// Set the views directory
app.set("views", path.join(__dirname, "views"));

// Connect to MongoDB
ConnectToDb();

// Middleware
app.use(cors());
// app.use(corsHeaders);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(logger);

// Static file serving
app.use(express.static(path.join(__dirname, 'public/images')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Routes
app.use("/driver", require("./routes/drivers"));
app.use("/userauth", require("./routes/userauth"));
app.use("/driverauthent", require("./routes/driverauth"));
app.use("/Img", require("./routes/upload"));
app.use("/user", require("./routes/users"));
app.use("/pass", require("./routes/password"));
app.use("/api/trips", require("./routes/trips"));
app.use("/love", require("./routes/likes"));

// Base route
app.use("/", (req, res) => {
  res.json("Welcome");
});

// Error handling
app.use(notfound);
app.use(errors);

// ❌ لا تكتب app.listen()
// ✅ استخدم export لتوافق Vercel
module.exports = app;
