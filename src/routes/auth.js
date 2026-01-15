// src/routes/auth.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import prisma from "../lib/prisma.js";

const router = Router();

const isProd = process.env.NODE_ENV === "production";

// Si frontend y API están en dominios distintos (cross-site cookies), pon esto en true.
// Ej: frontend vercel.app + api railway.app => CROSS_SITE_COOKIES=true
const crossSite = isProd && process.env.CROSS_SITE_COOKIES === "true";

const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // opcional: ".tudominio.com"

const cookieOptions = {
  httpOnly: true,
  secure: isProd, // en prod debe ser true con https
  sameSite: crossSite ? "none" : "lax",
  domain: cookieDomain,
  path: "/",
  maxAge: 8 * 60 * 60 * 1000,
};

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
});

function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

router.post("/login", loginLimiter, (req, res) => {
  const { key } = req.body;

  const adminKey = process.env.ADMIN_KEY || "";
  const ok = timingSafeEqualStr(key, adminKey);

  if (!ok) {
    return res.status(401).json({ error: "Invalid key" });
  }

  const token = jwt.sign({ role: "ADMIN" }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });

  res.cookie("vucca_admin", token, cookieOptions);
  return res.json({ success: true });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("vucca_admin", {
    ...cookieOptions,
    maxAge: 0,
  });
  return res.json({ success: true });
});

router.get("/me", (req, res) => {
  try {
    const token = req.cookies?.vucca_admin;
    if (!token) return res.json({ loggedIn: false });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ loggedIn: true, role: payload?.role || null });
  } catch {
    return res.json({ loggedIn: false });
  }
});

export default router;
