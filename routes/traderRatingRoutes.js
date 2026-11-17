const express = require("express");
const { verifyUser } = require("../middlewares/auth");
const {
  getTraderRating,
  getMyTraderRating,
  rateTrader,
} = require("../controllers/traderRatingController");

const router = express.Router();

router.get("/:traderId/mine", verifyUser, getMyTraderRating);
router.get("/:traderId", getTraderRating);
router.post("/:traderId", verifyUser, rateTrader);

module.exports = router;
