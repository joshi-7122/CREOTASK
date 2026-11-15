/* =========================================================
   CREOTASK — Global error handler & async wrapper
   Error response contract: { error: string, code?: string, fields?: {} }
   ========================================================= */
"use strict";

/** Wrap async route handlers to forward errors to Express */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Global Express error handler — mount LAST in server/index.js */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode;

  // Malformed JSON body from express.json()
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body is not valid JSON.", code: "BAD_JSON" });
  }

  // Deliberate HTTP errors (httpError) — including 503 "feature disabled" — are shown as-is.
  if (status && status !== 500) {
    const body = { error: err.message };
    if (err.code && typeof err.code === "string" && !err.code.startsWith("SQLITE")) body.code = err.code;
    if (err.fields) body.fields = err.fields;
    if (err.extra) Object.assign(body, err.extra);
    return res.status(status).json(body);
  }

  // SQLite constraint violations
  if (err.message && err.message.includes("UNIQUE constraint failed")) {
    return res.status(409).json({ error: "A record with this value already exists.", code: "CONFLICT" });
  }
  if (err.message && err.message.includes("FOREIGN KEY constraint failed")) {
    return res.status(400).json({ error: "Referenced record does not exist.", code: "BAD_REFERENCE" });
  }
  if (err.message && err.message.includes("CHECK constraint failed")) {
    return res.status(400).json({ error: "One of the values is not allowed.", code: "VALIDATION_FAILED" });
  }

  if (process.env.NODE_ENV !== "test") {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.stack || err.message);
  }
  res.status(500).json({
    error: process.env.NODE_ENV === "production"
      ? "An unexpected error occurred. Please try again."
      : err.message,
    code: "INTERNAL",
  });
}

/** Create a typed HTTP error. `code` is a stable machine-readable identifier. */
function httpError(status, message, code, extra) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (extra) err.extra = extra;
  return err;
}

module.exports = { asyncHandler, errorHandler, httpError };
