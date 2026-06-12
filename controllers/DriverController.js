const asyncHandler = require("express-async-handler");
const { Driver, validateinputdriver, validateupdatedriver } = require("../models/Driver");
const { Trip } = require("../models/trip");
const admin = require("../config/firebase");

/**
 * @desc Get all drivers
 * @route GET /api/drivers
 * @access Public
 */
const getAllDrivers = asyncHandler(async (req, res) => {
const driverList = await Driver.find({
  isDriver: true,
  isOnline: true,
});
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


const updateDriverLocation = async (req, res) => {
  try {
    const { driverId, latitude, longitude, bearing } = req.body;

    if (!driverId || latitude == null || longitude == null) {
      return res.status(400).json({
        status: "fail",
        message: "driverId, latitude and longitude are required",
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const driverBearing = Number(bearing || 0);

    const driver = await Driver.findByIdAndUpdate(
      driverId,
      {
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
        bearing: driverBearing,
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({
        status: "fail",
        message: "Driver not found",
      });
    }

    const activeTrip = await Trip.findOne({
  driver: driverId,
  isAccepted: true,
  status: { $in: ["accepted", "started"] },
}).sort({ createdAt: -1 });

    if (activeTrip) {
      await admin
        .database()
        .ref(`tripsLive/${activeTrip._id.toString()}`)
        .update({
          driverId: driverId.toString(),
          lat,
          lng,
          bearing: driverBearing,
          updatedAt: Date.now(),
        });
    }

    return res.status(200).json({
      status: "success",
      message: "Driver location updated",
    });
  } catch (err) {
    console.error("updateDriverLocation error:", err);
    return res.status(500).json({
      status: "fail",
      message: "Server error",
    });
  }
};

module.exports = {
  getAllDrivers,
  getDriverById,
  editDriver,
  deleteDriver,
  updateDriverLocation
};
