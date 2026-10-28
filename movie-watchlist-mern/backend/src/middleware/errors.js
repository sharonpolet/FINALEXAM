export function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}`, data: null });
}
export function errorHandler(err, _req, res, _next) {
  console.error(err);
  if (err.name === "ValidationError") {
    return res.status(400).json({ success: false, message: Object.values(err.errors).map(e => e.message).join(", "), data: null });
  }
  if (err.name === "CastError") return res.status(400).json({ success: false, message: "Invalid movie ID", data: null });
  if (err.code === 11000) return res.status(409).json({ success: false, message: "A movie with this title and release year already exists, or a generated code collided.", data: null });
  const status = err.status || 500;
  return res.status(status).json({ success: false, message: err.message || "Internal server error", data: null });
}
export function httpError(status, message) {
  const error = new Error(message); error.status = status; return error;
}
