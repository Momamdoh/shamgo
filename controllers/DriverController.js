const asyncHandler = require("express-async-handler");
const { Driver, validateinputdriver, validateupdatedriver } = require("../models/Driver");

/**
 * @desc Get all drivers
 * @route GET /api/drivers
 * @access Public
 */
const getAllDrivers = asyncHandler(async (req, res) => {
  const driverList = await Driver.find();

  res.status(200).json(driverList);
});

/**
 * @desc Get driver by ID
 * @route GET /api/drivers/:id
 * @access Public
 */
const getDriverById = asyncHandler(async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (driver) {
      res.status(200).json(driver);
    } else {
      res.status(404).json({ message: "Driver not found" });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

/**
 * @desc Update driver
 * @route PUT /api/drivers/:id
 * @access Public
 */
const editDriver = asyncHandler(async (req, res) => {
  const { error } = validateupdatedriver(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  const driver = await Driver.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        firstname: req.body.firstname,
        lastname: req.body.lastname,
        image: req.body.image,
        carType: req.body.carType,
        carNumber: req.body.carNumber,
        location: req.body.latitude && req.body.longitude
          ? {
              type: "Point",
              coordinates: [req.body.longitude, req.body.latitude],
            }
          : undefined,
      },
    },
    { new: true }
  );

  if (driver) {
    res.status(200).json({ message: "Driver has been updated", driver });
  } else {
    res.status(404).json({ message: "Driver not found" });
  }
});

/**
 * @desc Delete driver
 * @route DELETE /api/drivers/:id
 * @access Public
 */
const deleteDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (driver) {
    await Driver.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Driver has been deleted" });
  } else {
    res.status(404).json({ message: "Driver not found" });
  }
});

module.exports = {
  getAllDrivers,
  getDriverById,
  editDriver,
  deleteDriver,
};
