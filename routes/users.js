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
} = require("../controllers/UserController");

router.put("/:id", verifyUser, AdminEditUserDetails);
router.get("/admin", verifyTokenAdmin, AdmingetUserById);
router.get("/:id/admin", verifyUser, AdmingetUserById);
router.delete("/:id/deleteadmin", verifyUser, AdmindeleteUser);

module.exports = router;