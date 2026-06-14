const express = require("express");
const router = express.Router();

const {
  verifyTokenAdmin,
  verifyUser,
} = require("../middlewares/Vcode");

const {
  AdmingetUserById,
  AdminEditUserDetails,
  AdmindeleteUser,
  updateUserLocation,
} = require("../controllers/UserController");

router.post("/update-location", verifyUser, updateUserLocation);

router.put("/:id", verifyUser, AdminEditUserDetails);
router.get("/admin", verifyTokenAdmin, AdmingetUserById);
router.get("/:id/admin", verifyUser, AdmingetUserById);
router.delete("/:id/deleteadmin", verifyUser, AdmindeleteUser);

module.exports = router;