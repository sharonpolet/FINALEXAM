import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import movieRoutes from "./src/routes/movieRoutes.js";
import { errorHandler, notFound } from "./src/middleware/errors.js";

dotenv.config();
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ success: true, message: "API is running", data: { status: "ok" } }));
app.use("/api", movieRoutes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
if (!process.env.MONGO_URI || process.env.MONGO_URI.includes("USERNAME:PASSWORD")) {
  console.error("Set a valid MongoDB Atlas MONGO_URI in backend/.env before starting.");
  process.exit(1);
}
mongoose.connect(process.env.MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`)))
  .catch((err) => { console.error("MongoDB connection failed:", err.message); process.exit(1); });
