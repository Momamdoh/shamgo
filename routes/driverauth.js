const express = require("express");
const router = express.Router();

const {
  driverSignup,
  driverVerify,
  driverLogin,
  updateFcmToken,
} = require("../controllers/driverauthcontroller");

const {
  uploadTraderAdImage,
  processTraderAdImage,
} = require("../middlewares/uploadTraderAdImage");

router.post(
  "/driversignup",
  uploadTraderAdImage,
  processTraderAdImage,
  driverSignup
);

router.post("/driververify", driverVerify);
router.post("/driverlogin", driverLogin);
router.post("/drivertoken", updateFcmToken);

module.exports = router;