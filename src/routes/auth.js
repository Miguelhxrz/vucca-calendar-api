// src/routes/auth.js
import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();

router.post("/login", (req, res) => {
  const { key } = req.body;
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid key" });
  }

  const token = jwt.sign({ role: "ADMIN" }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });

  const secure = (process.env.COOKIE_SECURE ?? "true") !== "false";
  res.cookie("vucca_admin", token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({ success: true });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("vucca_admin");
  res.json({ success: true });
});

router.get("/me", (req, res) => {
  try {
    const token = req.cookies?.vucca_admin;
    if (!token) return res.json({ loggedIn: false });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ loggedIn: true, role: payload.role });
  } catch {
    res.json({ loggedIn: false });
  }
});

export default router;
