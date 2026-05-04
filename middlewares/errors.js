// Custom error handler for Not Found routes
const notfound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error); // Move error to the next middleware (error handler)
};

// Global error handler
const errors = (err, req, res, next) => {
  const status = res.statusCode === 200 ? 500 : res.statusCode; // Set the correct status code
  res.status(status).json({
    message: err.message,
  });
};

module.exports = {
  errors,
  notfound,
};
