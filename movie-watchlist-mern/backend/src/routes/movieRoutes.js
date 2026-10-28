import { Router } from "express";
import Movie from "../models/Movie.js";
import Sequence from "../models/Sequence.js";
import { httpError } from "../middleware/errors.js";

const router = Router();
const GENRES = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Romance", "Thriller"];
const PLATFORMS = ["Netflix", "Prime Video", "Hotstar", "Theatre", "Other"];
const STATUSES = ["To Watch", "Watching", "Watched"];
const currentYear = () => new Date().getFullYear();
const ok = (res, message, data, status = 200) => res.status(status).json({ success: true, message, data });
const cleanTitle = (s) => String(s || "").trim();
function validateMovieInput(body, partial = false) {
  // Only title, genre, and release year are required. Runtime, platform, and priority are optional.
  const fields = ["title", "genre"];
  if (!partial) fields.push("releaseYear");
  for (const field of fields) if (body[field] === undefined || body[field] === null || body[field] === "") throw httpError(400, `${field} is required`);
  if (body.title !== undefined && !cleanTitle(body.title)) throw httpError(400, "Title is required");
  if (body.genre !== undefined && !GENRES.includes(body.genre)) throw httpError(400, "Invalid genre");
  if (body.platform !== undefined && !PLATFORMS.includes(body.platform)) throw httpError(400, "Invalid platform");
  if (body.releaseYear !== undefined && (!Number.isInteger(Number(body.releaseYear)) || Number(body.releaseYear) < 1950 || Number(body.releaseYear) > currentYear())) throw httpError(400, `Release year must be between 1950 and ${currentYear()}`);
  if (body.runtime !== undefined && (!Number.isInteger(Number(body.runtime)) || Number(body.runtime) < 30 || Number(body.runtime) > 300)) throw httpError(400, "Runtime must be a whole number between 30 and 300 minutes");
  if (body.priority !== undefined && (!Number.isInteger(Number(body.priority)) || Number(body.priority) < 1 || Number(body.priority) > 5)) throw httpError(400, "Priority must be an integer from 1 to 5");
}
const allowedTransitions = {
  "To Watch": ["Watching", "Watched"],
  "Watching": ["Watched", "To Watch"],
  "Watched": []
};

// Watch Next must be declared before /movies/:id.
router.get("/movies/next", async (_req, res, next) => {
  try {
    const movie = await Movie.findOne({ status: "To Watch" }).sort({ priority: -1, runtime: 1, createdAt: 1 });
    if (!movie) throw httpError(404, "There are no movies in To Watch status.");
    return ok(res, "Your next movie recommendation", movie);
  } catch (e) { next(e); }
});

router.get("/movies", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
    const limit = 6;
    const filter = {};
    if (req.query.status && STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.genre && GENRES.includes(req.query.genre)) filter.genre = req.query.genre;
    if (req.query.search) filter.title = { $regex: String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const total = await Movie.countDocuments(filter);
    const movies = await Movie.find(filter)
      .sort({ status: 1, priority: -1, runtime: 1, createdAt: -1 })
      .skip((page - 1) * limit).limit(limit);
    // Put To Watch first and priority high-to-low; preserve stable order for the rest.
    movies.sort((a, b) => {
      if (a.status === "To Watch" && b.status !== "To Watch") return -1;
      if (b.status === "To Watch" && a.status !== "To Watch") return 1;
      if (a.status === "To Watch" && b.status === "To Watch") return b.priority - a.priority || a.runtime - b.runtime;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return ok(res, "Movies fetched", { movies, pagination: { page, limit, totalMovies: total, totalPages: Math.ceil(total / limit) } });
  } catch (e) { next(e); }
});


router.get("/stats", async (_req, res, next) => {
  try {
    const [statusCounts, watchedStats, genreCounts] = await Promise.all([
      Movie.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Movie.aggregate([{ $match: { status: "Watched" } }, { $group: { _id: null, runtime: { $sum: "$runtime" }, averageRating: { $avg: "$rating" } } }]),
      Movie.aggregate([{ $match: { status: "Watched" } }, { $group: { _id: "$genre", count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 1 }])
    ]);
    const counts = { "To Watch": 0, "Watching": 0, "Watched": 0 };
    statusCounts.forEach(x => { counts[x._id] = x.count; });
    const watched = watchedStats[0] || { runtime: 0, averageRating: null };
    return ok(res, "Statistics fetched", {
      statusCounts: counts,
      totalHoursWatched: Math.round((watched.runtime / 60) * 10) / 10,
      averageRating: watched.averageRating == null ? null : Math.round(watched.averageRating * 10) / 10,
      topWatchedGenre: genreCounts[0] ? { genre: genreCounts[0]._id, count: genreCounts[0].count } : null
    });
  } catch (e) { next(e); }
});

router.get("/movies/:id", async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) throw httpError(404, "Movie not found");
    return ok(res, "Movie fetched", movie);
  } catch (e) { next(e); }
});

router.post("/movies", async (req, res, next) => {
  try {
    validateMovieInput(req.body);
    const title = cleanTitle(req.body.title);
    const releaseYear = Number(req.body.releaseYear);
    const duplicate = await Movie.findOne({ releaseYear, title: { $regex: `^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
    if (duplicate) throw httpError(409, "A movie with this title and release year already exists.");
    const seqDoc = await Sequence.findOneAndUpdate({ year: releaseYear }, { $inc: { sequence: 1 }, $setOnInsert: { year: releaseYear } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    const code = `MV-${releaseYear}-${String(seqDoc.sequence).padStart(3, "0")}`;
    const movieData = {
      code, title, genre: req.body.genre, releaseYear,
      status: "To Watch", rating: null, watchedDate: null
    };
    // Add optional fields only when the client supplies a value.
    if (req.body.runtime !== undefined && req.body.runtime !== null && req.body.runtime !== "") movieData.runtime = Number(req.body.runtime);
    if (req.body.platform !== undefined && req.body.platform !== null && req.body.platform !== "") movieData.platform = req.body.platform;
    if (req.body.priority !== undefined && req.body.priority !== null && req.body.priority !== "") movieData.priority = Number(req.body.priority);
    const movie = await Movie.create(movieData);
    return ok(res, "Movie added successfully", movie, 201);
  } catch (e) { next(e); }
});

router.put("/movies/:id", async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) throw httpError(404, "Movie not found");
    if (movie.status === "Watched") {
      // Details can still be edited; status and rating rules remain protected.
    }
    const patch = {};
    for (const field of ["title", "genre", "runtime", "platform", "priority"]) if (req.body[field] !== undefined) patch[field] = req.body[field];
    if (!Object.keys(patch).length) throw httpError(400, "Provide at least one editable field");
    validateMovieInput({ title: patch.title ?? movie.title, genre: patch.genre ?? movie.genre, runtime: patch.runtime ?? movie.runtime, platform: patch.platform ?? movie.platform, priority: patch.priority ?? movie.priority }, true);
    if (patch.title !== undefined) {
      patch.title = cleanTitle(patch.title);
      const duplicate = await Movie.findOne({ _id: { $ne: movie._id }, releaseYear: movie.releaseYear, title: { $regex: `^${patch.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
      if (duplicate) throw httpError(409, "A movie with this title and release year already exists.");
    }
    if (patch.runtime !== undefined) patch.runtime = Number(patch.runtime);
    if (patch.priority !== undefined) patch.priority = Number(patch.priority);
    Object.assign(movie, patch);
    await movie.save();
    return ok(res, "Movie updated successfully", movie);
  } catch (e) { next(e); }
});

router.patch("/movies/:id/status", async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) throw httpError(404, "Movie not found");
    const { status, rating } = req.body;
    if (!STATUSES.includes(status)) throw httpError(400, "Invalid status");
    if (!allowedTransitions[movie.status].includes(status)) throw httpError(400, `Invalid status transition: ${movie.status} → ${status}.`);
    if (status === "Watched") {
      if (rating === undefined || rating === null || rating === "" || !Number.isFinite(Number(rating)) || Number(rating) < 1 || Number(rating) > 10) throw httpError(400, "A rating from 1 to 10 is required when marking a movie as Watched.");
      movie.rating = Number(rating);
      movie.watchedDate = new Date();
    } else {
      if (rating !== undefined && rating !== null && rating !== "") throw httpError(400, "Rating is allowed only for Watched movies.");
      movie.rating = null;
      movie.watchedDate = null;
    }
    movie.status = status;
    await movie.save();
    return ok(res, "Movie status updated", movie);
  } catch (e) { next(e); }
});

router.patch("/movies/:id/rating", async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) throw httpError(404, "Movie not found");
    if (movie.status !== "Watched") throw httpError(400, "Rating can only be set or edited for Watched movies.");
    const rating = Number(req.body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 10) throw httpError(400, "Rating must be between 1 and 10.");
    movie.rating = rating;
    await movie.save();
    return ok(res, "Rating updated", movie);
  } catch (e) { next(e); }
});

router.delete("/movies/:id", async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) throw httpError(404, "Movie not found");
    if (movie.status === "Watching") throw httpError(400, "Movies in Watching status cannot be deleted.");
    await movie.deleteOne();
    return ok(res, "Movie deleted", { id: movie._id });
  } catch (e) { next(e); }
});

export default router;
