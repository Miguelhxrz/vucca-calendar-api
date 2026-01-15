require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const umpiresRoutes = require("./routes/umpires");
const calendarRoutes = require("./routes/assignments");
const seasonsRoutes = require("./routes/seasons");
const statsRoutes = require("./routes/stats");

function must(name, condition) {
  if (!condition) {
    throw new Error(`[ENV] Falta o inválida: ${name}`);
  }
}

const isProd = process.env.NODE_ENV === "production";

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Validaciones mínimas “anti-suicidio”
must(
  "JWT_SECRET",
  process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
);
must("ADMIN_KEY", process.env.ADMIN_KEY && process.env.ADMIN_KEY.length >= 8);
must(
  "DATABASE_URL",
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("mysql://")
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
    windowMs: 60 * 1000, // 1 min
    limit: 120, // 120 req/min por IP
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Rate limit más fuerte SOLO para auth
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  limit: 25, // 25 intentos / 10 min
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // server-to-server o curl
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Bloqueo extra para métodos “peligrosos” (evita CSRF básico por CORS mal config)
const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.use((req, res, next) => {
  if (!unsafe.has(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  if (allowedOrigins.includes(origin)) return next();
  return res.status(403).json({ error: "Forbidden" });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authLimiter, authRoutes);
app.use("/umpires", umpiresRoutes);
app.use("/calendar", require("./routes/assignments"));
app.use("/seasons", seasonsRoutes);
app.use("/stats", statsRoutes);

// BigInt safe
app.set("json replacer", (_k, v) => (typeof v === "bigint" ? v.toString() : v));

// Error handler (mejor para errores CORS/validaciones)
app.use((err, _req, res, _next) => {
  if (!isProd) console.error(err);

  if (String(err.message || "").includes("Not allowed by CORS")) {
    return res.status(403).json({ error: "CORS blocked" });
  }

  res.status(500).json({ error: "Internal Server Error" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`));
