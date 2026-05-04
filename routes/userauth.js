const express = require("express");
const router = express.Router();
const { login, Signup , verifyEmail , UserFcmToken} = require("../controllers/UserAuthController");

router.post("/signup", Signup);
router.post("/login", login);
router.post('/verify-email', verifyEmail);
router.post('/usertoken', UserFcmToken);


module.exports = router;
