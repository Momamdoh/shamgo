const express = require("express");
const router = express.Router();
const { login, Signup , verifyEmail , UserFcmToken , sendUserResetCode , verifyUserResetCode , resetUserPassword} = require("../controllers/UserAuthController");

router.post("/signup", Signup);
router.post("/login", login);
router.post('/verify-email', verifyEmail);
router.post('/usertoken', UserFcmToken);
router.post("/forgot-password", sendUserResetCode);
router.post("/verify-reset-code", verifyUserResetCode);
router.post("/reset-password", resetUserPassword);


module.exports = router;
