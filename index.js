// Load environment variables
require("dotenv").config();

// Import necessary packages
const express = require("express");
const path = require("path");
const cors = require("cors");
// const corsHeaders = require("./middlewares/headers"); // Import the CORS headers middleware

// Import custom middlewares and utilities
const logger = require("./middlewares/logger");
const { notfound, errors } = require("./middlewares/errors");
const { ConnectToDb } = require("./config/db");
const traderAuthRoute = require("./routes/traderAuthRoute");
const traderAdRoute = require("./routes/traderAdRoute");
const chatRoutes = require("./routes/chatRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

// Create an instance of the Express application
const app = express();

// Set the view engine to EJS
app.set("view engine", "ejs");

// Set the views directory if it's not in the default location
app.set("views", path.join(__dirname, "views")); // Adjust the path as needed

// Connect to MongoDB
ConnectToDb();

// Middleware
app.use(cors()); // Add your CORS middleware here
// app.use(corsHeaders);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(logger); // Custom logger middleware

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
app.use("/api/trader", traderAuthRoute);
app.use("/api/trader-ad", traderAdRoute);
app.use("/api/chatbot", chatRoutes);
app.use("/api/payments", paymentRoutes);

// Base route
app.use("/", (req, res) => {
  res.json("Welcome!!");
});

// Error handling for routes not found
app.use(notfound);

// Global error handler
app.use(errors);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

//https://nodeproject-ten.vercel.app/pass/forgot-password