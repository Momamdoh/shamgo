const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
    // Retrieve token from the custom token header
    const token = req.headers.token;

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            req.user = decoded;
            next();
        } catch (error) {
            res.status(401).json({ message: "Invalid Token" });
        }
    } else {
        res.status(401).json({ message: "No Token Provided" });
    }
}

function verifyTokenUser(req, res, next) {
    verifyToken(req, res, () => {
        // Allow access for the admin or if the user is authenticated
        if (req.user.isAdmin || req.user.id) {
            next(); // Proceed with the request
        } else {
            res.status(403).json({ message: "Update Not Allowed" });
        }
    });
}


function verifyTokenAdmin(req, res, next) {
    verifyToken(req, res, () => {
        console.log("Checking admin status:", req.user.isAdmin); // Log admin status
        if (req.user.isAdmin) {
            next(); // Proceed with the request
        } else {
            res.status(403).json({ message: "Not Allowed - Admin Only" });
        }
    });
}

module.exports = {
    verifyToken,
    verifyTokenUser,
    verifyTokenAdmin
};
