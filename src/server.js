// src/server.js
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRouter from "./routes/auth.js"; // <-- ESM import
import umpiresRouter from "./routes/umpires.js";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "https://tu-frontend.vercel.app"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Rutas
app.use("/auth", authRouter);

app.use("/umpires", umpiresRouter);

// Healthcheck opcional
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API on :${PORT}`));
