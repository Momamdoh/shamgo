const express = require("express");
const router = express.Router();

const {
  driverSignup,
  driverVerify,
  driverLogin,
  updateFcmToken,
  sendDriverResetCode,
  verifyDriverResetCode,
  resetDriverPassword,
  approveDriverByAdmin,
  rejectDriverByAdmin,
  getPendingDriversForAdmin,
} = require("../controllers/driverauthcontroller");

const {
  uploadTraderAdImage,
  processTraderAdImage,
} = require("../middlewares/uploadTraderAdImage");

router.post(
  "/driversignup",
  uploadTraderAdImage,
  processTraderAdImage,
  driverSignup,
);

router.post("/driververify", driverVerify);

router.post("/driverlogin", driverLogin);

router.post("/drivertoken", updateFcmToken);

router.post("/forgot-password", sendDriverResetCode);

router.post("/verify-reset-code", verifyDriverResetCode);

router.post("/reset-password", resetDriverPassword);

router.post("/approve-driver", approveDriverByAdmin);

router.post("/reject-driver", rejectDriverByAdmin);

router.get("/pending-drivers", getPendingDriversForAdmin);

module.exports = router;