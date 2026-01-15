// src/middleware/auth.js
import jwt from "jsonwebtoken";

export const adminRequired = (req, res, next) => {
  const token = req.cookies?.vucca_admin;

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.user = { role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
};
