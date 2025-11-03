// src/middleware/auth.js
import jwt from "jsonwebtoken";

export const adminRequired = (req, res, next) => {
  const t = req.cookies?.vucca_admin;
  if (!t) return res.status(401).json({ error: "Unauthorized" });
  try {
    const p = jwt.verify(t, process.env.JWT_SECRET);
    if (p.role !== "ADMIN") throw new Error();
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
};
