import mongoose from "mongoose";

const movieSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, immutable: true },
  title: { type: String, required: true, trim: true },
  genre: { type: String, required: true, enum: ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Romance", "Thriller"] },
  releaseYear: { type: Number, required: true, min: 1950, max: new Date().getFullYear(), immutable: true },
  runtime: { type: Number, min: 30, max: 300, default: null },
  platform: { type: String, enum: ["Netflix", "Prime Video", "Hotstar", "Theatre", "Other"], default: null },
  priority: { type: Number, min: 1, max: 5, validate: Number.isInteger, default: null },
  status: { type: String, enum: ["To Watch", "Watching", "Watched"], default: "To Watch", required: true },
  rating: { type: Number, min: 1, max: 10, default: null },
  watchedDate: { type: Date, default: null }
}, { timestamps: true });

movieSchema.index({ title: 1, releaseYear: 1 });
movieSchema.index({ releaseYear: 1, code: 1 });
export default mongoose.model("Movie", movieSchema);
