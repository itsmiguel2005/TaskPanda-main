const { validationResult } = require("express-validator");

function validateRequest(req, res, next) {
  const validation = validationResult(req);
  if (!validation.isEmpty()) {
    return res.status(400).json({ message: validation.array({ onlyFirstError: true })[0].msg });
  }
  return next();
}

module.exports = { validateRequest };