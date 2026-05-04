const express = require("express");
const router = express.Router();
const { verifyTokenAdmin ,  verifyTokenUser } = require("../middlewares/Vcode");
const { AdmingetUserById, AdminEditUserDetails, AdmindeleteUser } = require("../controllers/UserController");



router.put("/:id",  verifyTokenUser, AdminEditUserDetails);
router.get("/admin",  verifyTokenAdmin, AdmingetUserById);
router.get("/:id/admin",  verifyTokenUser, AdmingetUserById);
router.delete("/:id/deleteadmin",  verifyTokenUser, AdmindeleteUser);
module.exports = router;