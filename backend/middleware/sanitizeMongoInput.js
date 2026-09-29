const mongoSanitize = require("express-mongo-sanitize");

const sanitize = mongoSanitize.sanitize;

function sanitizeMongoInput(req, res, next) {
  try {
    if (req.body && typeof req.body === "object") {
      req.body = sanitize(req.body);
    }

    if (req.query && typeof req.query === "object") {
      Object.defineProperty(req, "query", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: sanitize(req.query),
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { sanitizeMongoInput };