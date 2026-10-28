import { useCallback, useEffect, useMemo, useState } from "react";
import { Film, Plus, Search, Clapperboard, Clock3, Star, Trash2, Pencil, ChevronLeft, ChevronRight, Sparkles, RefreshCw, X, Check, CalendarDays } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const GENRES = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Romance", "Thriller"];
const PLATFORMS = ["Netflix", "Prime Video", "Hotstar", "Theatre", "Other"];
const STATUSES = ["To Watch", "Watching", "Watched"];
const blank = { title: "", genre: "Drama", releaseYear: String(new Date().getFullYear()), runtime: "120", platform: "Netflix", priority: "3" };

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) { const error = new Error(body.message || "Request failed"); error.status = response.status; throw error; }
  return body;
}
function Select({ value, onChange, children, ...props }) { return <select value={value} onChange={onChange} {...props}>{children}</select>; }
function StatusBadge({ status }) { return <span className={`status status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span>; }
function StatCard({ icon: Icon, label, value, detail }) { return <div className="stat-card"><div className="stat-icon"><Icon size={19}/></div><div><p>{label}</p><strong>{value}</strong>{detail && <small>{detail}</small>}</div></div>; }

export default function App() {
  const [movies, setMovies] = useState([]);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [watchNext, setWatchNext] = useState(null);
  const [ratingInput, setRatingInput] = useState("8");
  const year = new Date().getFullYear();

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (statusFilter) p.set("status", statusFilter);
    if (genreFilter) p.set("genre", genreFilter);
    if (search.trim()) p.set("search", search.trim());
    return p.toString();
  }, [page, statusFilter, genreFilter, search]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [movieResponse, statsResponse] = await Promise.all([request(`/movies?${query}`), request("/stats")]);
      setMovies(movieResponse.data.movies);
      setPages(Math.max(1, movieResponse.data.pagination.totalPages));
      setTotal(movieResponse.data.pagination.totalMovies);
      setStats(statsResponse.data);
    } catch (e) { setNotice({ type: "error", text: `${e.message}. Check that the backend is running and MongoDB Atlas is configured.` }); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setPage(1); }, [statusFilter, genreFilter, search]);

  const flash = (type, text) => { setNotice({ type, text }); window.setTimeout(() => setNotice(null), 5000); };
  const openAdd = () => { setForm(blank); setModal({ type: "add" }); };
  const openEdit = (movie) => { setForm({ title: movie.title, genre: movie.genre, runtime: String(movie.runtime), platform: movie.platform, priority: String(movie.priority) }); setModal({ type: "edit", movie }); };
  const validate = () => {
    if (!form.title.trim()) return "Title is required.";
    const releaseYear = Number(form.releaseYear);
    if (modal.type === "add" && (!Number.isInteger(releaseYear) || releaseYear < 1950 || releaseYear > year)) return `Release year must be between 1950 and ${year}.`;
    const runtime = Number(form.runtime);
    if (!Number.isInteger(runtime) || runtime < 30 || runtime > 300) return "Runtime must be a whole number from 30 to 300 minutes.";
    const priority = Number(form.priority);
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) return "Priority must be from 1 to 5.";
    return "";
  };
  const saveMovie = async (event) => {
    event.preventDefault();
    const error = validate(); if (error) return flash("error", error);
    setSaving(true);
    try {
      if (modal.type === "add") {
        await request("/movies", { method: "POST", body: JSON.stringify({ ...form, releaseYear: Number(form.releaseYear), runtime: Number(form.runtime), priority: Number(form.priority) }) });
        flash("success", "Movie added to your watchlist.");
      } else {
        await request(`/movies/${modal.movie._id}`, { method: "PUT", body: JSON.stringify({ title: form.title, genre: form.genre, runtime: Number(form.runtime), platform: form.platform, priority: Number(form.priority) }) });
        flash("success", "Movie details updated.");
      }
      setModal(null); await refresh();
    } catch (e) { flash("error", e.message); }
    finally { setSaving(false); }
  };
  const changeStatus = async (movie, status) => {
    let body = { status };
    if (status === "Watched") {
      const rating = window.prompt(`Rate "${movie.title}" from 1 to 10:`, "8");
      if (rating === null) return;
      if (!Number.isFinite(Number(rating)) || Number(rating) < 1 || Number(rating) > 10) return flash("error", "Rating must be between 1 and 10.");
      body.rating = Number(rating);
    }
    try { await request(`/movies/${movie._id}/status`, { method: "PATCH", body: JSON.stringify(body) }); flash("success", `Status changed to ${status}.`); await refresh(); }
    catch (e) { flash("error", e.message); }
  };
  const editRating = async (movie) => {
    const rating = window.prompt(`New rating for "${movie.title}" (1–10):`, String(movie.rating || 8));
    if (rating === null) return;
    if (!Number.isFinite(Number(rating)) || Number(rating) < 1 || Number(rating) > 10) return flash("error", "Rating must be between 1 and 10.");
    try { await request(`/movies/${movie._id}/rating`, { method: "PATCH", body: JSON.stringify({ rating: Number(rating) }) }); flash("success", "Rating updated."); await refresh(); }
    catch (e) { flash("error", e.message); }
  };
  const deleteMovie = async (movie) => {
    if (movie.status === "Watching") return;
    if (!window.confirm(`Delete "${movie.title}"? This cannot be undone.`)) return;
    try { await request(`/movies/${movie._id}`, { method: "DELETE" }); flash("success", "Movie deleted."); await refresh(); }
    catch (e) { flash("error", e.message); }
  };
  const getNext = async () => {
    try { const r = await request("/movies/next"); setWatchNext(r.data); }
    catch (e) { setWatchNext(null); flash("error", e.message); }
  };
  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark"><Film size={22}/></span><span>Cine<span className="brand-accent">Track</span><small>YOUR PERSONAL MOVIE MANAGER</small></span></a><div className="topbar-right"><span className="live-dot"></span> YOUR WATCHLIST <span className="top-count">{total}</span></div></header>
    <main className="main">
      <section className="hero"><div><div className="eyebrow"><Sparkles size={14}/> YOUR NEXT GREAT STORY STARTS HERE</div><h1>Make movie night<br/><span>unforgettable.</span></h1><p>Keep track of the films you love, the ones you’re watching, and what’s next on your list.</p><div className="hero-actions"><button className="primary-btn" onClick={openAdd}><Plus size={17}/> Add a movie</button><button className="secondary-btn" onClick={getNext}><Clapperboard size={17}/> What should I watch next?</button></div></div><div className="hero-art"><div className="poster poster-back"><span>01</span><div className="poster-lines"></div></div><div className="poster poster-front"><div className="poster-orb"></div><span className="poster-caption">THE<br/>NEXT<br/><b>CHAPTER</b></span><div className="poster-footer">A FILM BY YOU</div></div><div className="art-spark spark-one">✳</div><div className="art-spark spark-two">✦</div></div></section>

      {notice && <div className={`notice ${notice.type}`}><span>{notice.type === "success" ? <Check size={17}/> : <X size={17}/>}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={15}/></button></div>}

      {watchNext && <section className="next-panel"><div className="next-icon"><Clapperboard size={23}/></div><div className="next-copy"><span className="eyebrow">YOUR WATCH NEXT PICK</span><h3>{watchNext.title}</h3><p>{watchNext.genre} · {watchNext.runtime} min · Priority {watchNext.priority}/5</p></div><div className="next-code">{watchNext.code}</div><button className="icon-btn" onClick={() => setWatchNext(null)} aria-label="Close recommendation"><X size={17}/></button></section>}

      <section className="stats-grid">
        <StatCard icon={Clapperboard} label="To watch" value={stats?.statusCounts?.["To Watch"] ?? "—"} detail="Waiting in your queue"/>
        <StatCard icon={Film} label="In progress" value={stats?.statusCounts?.Watching ?? "—"} detail="Currently watching"/>
        <StatCard icon={Check} label="Watched" value={stats?.statusCounts?.Watched ?? "—"} detail={`${stats?.totalHoursWatched ?? 0} hours watched`}/>
        <StatCard icon={Star} label="Average rating" value={stats?.averageRating == null ? "—" : `${stats.averageRating}/10`} detail={stats?.topWatchedGenre ? `Top genre: ${stats.topWatchedGenre.genre}` : "Rate films you finish"}/>
      </section>

      <section className="library-section">
        <div className="section-heading"><div><div className="eyebrow">THE COLLECTION</div><h2>Your movie library <span className="muted-count">{total}</span></h2></div><button className="refresh-btn" onClick={refresh}><RefreshCw size={15}/> Refresh</button></div>
        <div className="toolbar"><div className="search-wrap"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by movie title..." aria-label="Search by title"/></div><Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</Select><Select value={genreFilter} onChange={e => setGenreFilter(e.target.value)} aria-label="Filter by genre"><option value="">All genres</option>{GENRES.map(g => <option key={g}>{g}</option>)}</Select></div>

        {loading ? <div className="loading-state"><div className="loader"></div><p>Loading your collection…</p></div> : movies.length === 0 ? <div className="empty-state"><div className="empty-icon"><Film size={27}/></div><h3>Your next favorite is waiting.</h3><p>No movies match these filters. Add a movie or try a different search.</p><button className="primary-btn" onClick={openAdd}><Plus size={16}/> Add your first movie</button></div> : <div className="movie-grid">{movies.map(movie => <article className="movie-card" key={movie._id}><div className={`movie-art art-${GENRES.indexOf(movie.genre) % 7}`}><div className="art-no">{movie.code}</div><div className="art-big">{movie.title.slice(0, 1).toUpperCase()}</div><div className="art-genre">{movie.genre.toUpperCase()}</div><div className="art-film"><Film size={20}/></div></div><div className="movie-body"><div className="movie-title-row"><h3 title={movie.title}>{movie.title}</h3><StatusBadge status={movie.status}/></div><div className="movie-meta"><span>{movie.releaseYear}</span><i>·</i><span>{movie.runtime} min</span><i>·</i><span>{movie.platform}</span></div><div className="movie-details"><span className="priority"><span className="priority-stars">{"★".repeat(movie.priority)}<span>{"★".repeat(5 - movie.priority)}</span></span><small>PRIORITY</small></span>{movie.rating != null ? <button className="rating-chip" onClick={() => editRating(movie)} title="Edit rating"><Star size={14} fill="currentColor"/>{movie.rating}/10</button> : <span className="no-rating">Not rated</span>}</div>{movie.watchedDate && <div className="watched-date"><CalendarDays size={13}/> Watched {new Date(movie.watchedDate).toLocaleDateString()}</div>}<div className="card-actions"><label className="status-select-label">STATUS <Select value={movie.status} disabled={movie.status === "Watched"} onChange={e => changeStatus(movie, e.target.value)} aria-label={`Change status for ${movie.title}`}>{[movie.status, ...(movie.status === "To Watch" ? ["Watching", "Watched"] : movie.status === "Watching" ? ["To Watch", "Watched"] : [])].filter((s, i, a) => a.indexOf(s) === i).map(s => <option key={s}>{s}</option>)}</Select></label><div className="action-buttons"><button className="icon-btn" onClick={() => openEdit(movie)} aria-label={`Edit ${movie.title}`} title="Edit"><Pencil size={15}/></button><button className="icon-btn danger-icon" disabled={movie.status === "Watching"} onClick={() => deleteMovie(movie)} aria-label={`Delete ${movie.title}`} title={movie.status === "Watching" ? "Cannot delete while Watching" : "Delete"}><Trash2 size={15}/></button></div></div></div></article>)}</div>}

        <div className="pagination"><span>Showing {movies.length ? (page - 1) * 6 + 1 : 0}–{Math.min(page * 6, total)} of {total} movies</span><div className="page-controls"><button className="icon-btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Previous page"><ChevronLeft size={17}/></button><span>Page <b>{page}</b> of <b>{pages}</b></span><button className="icon-btn" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))} aria-label="Next page"><ChevronRight size={17}/></button></div></div>
      </section>
      <footer><span>© {year} CineTrack</span><span>Made for movie lovers <span className="footer-heart">♥</span></span></footer>
    </main>

    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal"><div className="modal-heading"><div><div className="eyebrow">{modal.type === "add" ? "GROW YOUR COLLECTION" : "UPDATE YOUR COLLECTION"}</div><h2>{modal.type === "add" ? "Add a movie" : "Edit movie"}</h2></div><button className="icon-btn" onClick={() => setModal(null)} aria-label="Close"><X size={18}/></button></div><form onSubmit={saveMovie}><label>Movie title<input autoFocus value={form.title} onChange={e => setField("title", e.target.value)} placeholder="e.g. Interstellar" maxLength={120} required/></label><div className="form-row"><label>Genre<Select value={form.genre} onChange={e => setField("genre", e.target.value)}>{GENRES.map(g => <option key={g}>{g}</option>)}</Select></label><label>Release year<input value={modal.type === "edit" ? modal.movie.releaseYear : form.releaseYear} disabled={modal.type === "edit"} type="number" min="1950" max={year} onChange={e => setField("releaseYear", e.target.value)} required/></label></div><div className="form-row"><label>Runtime (minutes)<input type="number" min="30" max="300" step="1" value={form.runtime} onChange={e => setField("runtime", e.target.value)} required/></label><label>Platform<Select value={form.platform} onChange={e => setField("platform", e.target.value)}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</Select></label></div><label>Priority <span className="field-hint">5 = highest</span><div className="priority-picker">{[1,2,3,4,5].map(n => <button type="button" key={n} className={Number(form.priority) === n ? "priority-choice active" : "priority-choice"} onClick={() => setField("priority", String(n))}>{n}<span>★</span></button>)}</div></label><div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setModal(null)}>Cancel</button><button className="primary-btn" disabled={saving}>{saving ? "Saving…" : <>{modal.type === "add" ? <Plus size={16}/> : <Check size={16}/>} {modal.type === "add" ? "Add movie" : "Save changes"}</>}</button></div></form></section></div>}
  </div>;
}
