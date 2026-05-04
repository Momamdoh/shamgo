const asyncHandler = require("express-async-handler");
const { User, ValidateUserLogin, ValidateUserRegister } = require("../models/User");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(
  "505734929718-9hta8itmql8osatj6stgf55duncqt3oq.apps.googleusercontent.com"
);

const DEFAULT_MALE_IMAGE =
  "https://img.magnific.com/free-psd/3d-illustration-human-avatar-profile_23-2150671159.jpg?semt=ais_hybrid&w=740&q=80";

const DEFAULT_FEMALE_IMAGE =
  "https://img.magnific.com/free-psd/3d-illustration-human-avatar-profile_23-2150671136.jpg?semt=ais_hybrid&w=740&q=80";

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

/**
 * SIGNUP
 */
const Signup = asyncHandler(async (req, res) => {
  console.log("Signup request received");
  console.log("Request body:", req.body);

  const { fname, lname, password, email, gender } = req.body;
  const message = {};

  if (!fname || !lname || !password || !email || !gender) {
    console.log("Missing required fields");
    return res.status(200).json({ status: "fail", message: "All fields are required" });
  }

  if (fname.length < 3) message.fname = "First name must be at least 3 characters long";
  if (lname.length < 3) message.lname = "Last name must be at least 3 characters long";
  if (password.length < 6) message.password = "Password must be at least 6 characters long";
  if (!["male", "female"].includes(gender)) message.gender = "Gender must be male or female";

  console.log("Checking existing user...");

  if (await User.findOne({ email })) message.email = "Email already in use";

  if (Object.keys(message).length > 0) {
    console.log("Validation errors:", message);
    return res.status(200).json({ status: "fail", message });
  }

  console.log("Hashing password...");
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const verificationCode = generateVerificationCode();
  console.log("Generated verification code:", verificationCode);

  const user = new User({
    email,
    password: hashedPassword,
    fname,
    lname,
    verificationCode,
    gender,
    image: gender === "female" ? DEFAULT_FEMALE_IMAGE : DEFAULT_MALE_IMAGE,
  });

let result;
try {
  result = await user.save();
} catch (err) {
  console.log("SAVE ERROR:", err);
  return res.status(500).json({ error: err.message });
}  console.log("User created:", result._id);

  const token = user.generateToken();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD,
    },
  });

  console.log("Sending verification email to:", email);

  const mailOptions = {
    from: process.env.USER_EMAIL,
    to: email,
    subject: "Email Verification Code",
    text: `Your verification code is ${verificationCode}.`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log("Email sending failed:", error.message);
      return res.status(200).json({
        status: "fail",
        message: { email: "Failed to send verification email" },
      });
    } else {
      console.log("Email sent successfully:", info.response);

      const { password, ...userData } = result._doc;

      return res.status(200).json({
        status: "success",
        data: { ...userData, token },
      });
    }
  });
});

/**
 * VERIFY EMAIL
 */
const verifyEmail = asyncHandler(async (req, res) => {
  console.log("Verify email request received");
  console.log("Request body:", req.body);

  const { email, verificationCode } = req.body;

  if (!email || !verificationCode) {
    console.log("Missing email or code");
    return res.status(400).json({
      status: "fail",
      message: "Email and verification code are required",
    });
  }

  const user = await User.findOne({ email });

  console.log("User found:", !!user);

  if (!user) {
    return res.status(404).json({ status: "fail", message: "User not found" });
  }

  console.log("Stored code:", user.verificationCode);
  console.log("Received code:", verificationCode);

  if (user.verificationCode !== Number(verificationCode)) {
    return res.status(200).json({ status: "fail", message: "Invalid verification code" });
  }

  user.isVerified = true;
  user.verificationCode = null;

  await user.save();

  console.log("Email verified successfully");

  res.status(200).json({ status: "success", message: "Email successfully verified" });
});

/**
 * LOGIN
 */
const login = asyncHandler(async (req, res) => {
  console.log("Login request received");
  console.log("Request body:", req.body);

  const { email, password, auth_provider, google_token } = req.body;
  let foundUser = null;
  const message = {};

  if (auth_provider === "google") {
    console.log("Google login flow started");

    if (!google_token) {
      return res.status(400).json({ status: "fail", message: "Google token is required" });
    }

    try {
      console.log("Verifying Google token...");

      const ticket = await client.verifyIdToken({
        idToken: google_token,
        audience: "505734929718-9hta8itmql8osatj6stgf55duncqt3oq.apps.googleusercontent.com",
      });

      const payload = ticket.getPayload();
      const userEmail = payload.email;

      console.log("Google email:", userEmail);

      foundUser = await User.findOne({ email: userEmail });

      console.log("User exists:", !!foundUser);

      if (!foundUser) {
        console.log("Creating new Google user");

        const newUser = new User({
          fname: payload.given_name || "",
          lname: payload.family_name || "",
          email: userEmail,
          image: payload.picture || DEFAULT_MALE_IMAGE,
          isVerified: true,
          password: "GoogleAuth",
          gender: "male",
        });

        foundUser = await newUser.save();
        console.log("New Google user created:", foundUser._id);
      } else {
        console.log("Existing Google user logged in:", foundUser._id);
      }
    } catch (error) {
      console.log("Google login error:", error.message);
      return res.status(400).json({ status: "fail", message: "Invalid Google token" });
    }
  } else {
    console.log("Normal login flow");

    const { error } = ValidateUserLogin(req.body);
    if (error) {
      return res.status(400).json({
        status: "fail",
        message: error.details[0].message,
      });
    }

    if (!email) message.email = "Email is required";
    if (!password) message.password = "Password is required";

    foundUser = await User.findOne({ email });

    console.log("User found:", !!foundUser);

    if (foundUser) {
      const match = await bcrypt.compare(password, foundUser.password);
      console.log("Password match:", match);

      if (!match) message.password = "Invalid password";
    }

    if (Object.keys(message).length > 0) {
      console.log("Login validation errors:", message);
      return res.status(200).json({ status: "fail", message });
    }
  }

  if (!foundUser) {
    console.log("User not found");
    return res.status(500).json({ status: "fail", message: "User not found" });
  }

  const token = foundUser.generateToken();
  console.log("Login success, token generated");

  const { password: _, ...data } = foundUser._doc;

  res.status(200).json({
    status: "success",
    data,
    token,
  });
});

/**
 * FCM TOKEN
 */
const UserFcmToken = asyncHandler(async (req, res) => {
  console.log("FCM update request received");
  console.log("Body:", req.body);

  const { _id, fcmToken } = req.body;

  if (!_id || !fcmToken) {
    return res.status(400).json({ status: "fail", message: "Missing data" });
  }

  const user = await User.findById(_id);

  console.log("User found:", !!user);

  if (!user) {
    return res.status(404).json({ status: "fail", message: "User not found" });
  }

  user.fcmToken = fcmToken;
  await user.save();

  console.log("FCM token updated for user:", user._id);
  console.log("Saved token:", user.fcmToken);

  res.status(200).json({
    status: "success",
    message: "FCM updated",
    userId: user._id,
    email: user.email,
    fcmToken: user.fcmToken,
  });
});

module.exports = {
  Signup,
  verifyEmail,
  login,
  UserFcmToken,
};