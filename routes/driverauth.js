const express = require("express");
const router = express.Router();
const { driverSignup, driverVerify, driverLogin , updateFcmToken} = require("../controllers/driverauthcontroller");

router.post("/driversignup", driverSignup);
router.post("/driververify", driverVerify);
router.post("/driverlogin", driverLogin);
router.post("/drivertoken", updateFcmToken);


module.exports = router;
