const express = require("express");
const router = express.Router();
const {
  getAllDrivers,
  getDriverById,
  editDriver,
  deleteDriver,
  updateDriverLocation
} = require("../controllers/DriverController");

router.get("/getDriver", getAllDrivers);
router.get("/:id", getDriverById);
router.put("/:id", editDriver);
router.delete("/:id", deleteDriver);
router.post("/update-location", updateDriverLocation);

module.exports = router;
