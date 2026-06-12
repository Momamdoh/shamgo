const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const token = req.headers.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No Token Provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid Token" });
  }
}

function verifyUser(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== "user" && !req.user.isAdmin) {
      return res.status(403).json({ message: "Users Only" });
    }

    next();
  });
}

function verifyDriver(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Drivers Only" });
    }

    next();
  });
}

function verifyTrader(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== "trader") {
      return res.status(403).json({ message: "Traders Only" });
    }

    next();
  });
}

function verifyTokenAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.isAdmin) {
      next();
    } else {
      return res.status(403).json({ message: "Not Allowed - Admin Only" });
    }
  });
}

module.exports = {
  verifyToken,
  verifyUser,
  verifyDriver,
  verifyTrader,
  verifyTokenAdmin,
};