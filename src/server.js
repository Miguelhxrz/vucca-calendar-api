require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

function must(name, condition) {
  if (!condition) throw new Error(`[ENV] Falta o inválida: ${name}`);
}

const isProd = process.env.NODE_ENV === "production";

const normalizeOrigin = (s = "") =>
  String(s)
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/$/, "");

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

// Validaciones mínimas
must(
  "JWT_SECRET",
  process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32,
);
must("ADMIN_KEY", process.env.ADMIN_KEY && process.env.ADMIN_KEY.length >= 8);
must(
  "DATABASE_URL",
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("mysql://"),
);

const app = express();

// Railway/Render/Vercel proxies
app.set("trust proxy", 1);

app.use(helmet());
app.disable("x-powered-by");

if (!isProd) app.use(morgan("dev"));

app.use(express.json({ limit: process.env.JSON_LIMIT || "100kb" }));
app.use(cookieParser());

// Rate limit global (suave)
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Rate limit más fuerte SOLO para auth
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const o = normalizeOrigin(origin);
      if (allowedOrigins.includes(o)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Bloqueo extra para métodos “peligrosos”
const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.use((req, res, next) => {
  if (!unsafe.has(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  if (allowedOrigins.includes(origin)) return next();
  return res.status(403).json({ error: "Forbidden" });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// ✅ Importa rutas soportando CommonJS o ESM (default)
const reqd = (p) => {
  const m = require(p);
  return m.default ?? m;
};

const authRoutes = reqd("./routes/auth");
const umpiresRoutes = reqd("./routes/umpires");
const calendarRoutes = reqd("./routes/assignments");
const seasonsRoutes = reqd("./routes/seasons");
const statsRoutes = reqd("./routes/stats");

// ✅ Monta rutas
app.use("/auth", authLimiter, authRoutes);
app.use("/umpires", umpiresRoutes);
app.use("/calendar", calendarRoutes);
app.use("/seasons", seasonsRoutes);
app.use("/stats", statsRoutes);

// BigInt safe
app.set("json replacer", (_k, v) => (typeof v === "bigint" ? v.toString() : v));

// Error handler
app.use((err, _req, res, _next) => {
  if (!isProd) console.error(err);

  if (String(err.message || "").includes("Not allowed by CORS")) {
    return res.status(403).json({ error: "CORS blocked" });
  }

  return res.status(500).json({ error: "Internal Server Error" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`));
