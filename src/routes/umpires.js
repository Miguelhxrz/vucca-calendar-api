// src/routes/umpires.js
import { Router } from "express";
import prisma from "../lib/prisma.js";
import { adminRequired } from "../middleware/auth.js";

const router = Router();

/**
 * Crear umpire
 * POST /umpires
 * body: { firstName, lastName }
 */
router.post("/", adminRequired, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;

    if (!firstName?.trim() || !lastName?.trim()) {
      return res
        .status(400)
        .json({ error: "firstName y lastName son requeridos" });
    }

    const umpire = await prisma.umpire.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    return res.json(umpire);
  } catch (err) {
    console.error("POST /umpires error:", err);
    return res.status(500).json({ error: "Error al crear umpire" });
  }
});

/**
 * Listar TODOS los umpires (admin)
 * GET /umpires
 */
router.get("/", adminRequired, async (req, res) => {
  try {
    const items = await prisma.umpire.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    // siempre { items }
    return res.json({ items });
  } catch (err) {
    console.error("GET /umpires error:", err);
    return res.status(500).json({ error: "Error obteniendo umpires" });
  }
});

// ✅ For select SIMPLE (solo id, firstName, lastName)
router.get("/for-select", adminRequired, async (req, res) => {
  try {
    const rows = await prisma.umpire.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    });

    return res.json({ items: rows });
  } catch (err) {
    console.error("GET /umpires/for-select error:", err);
    return res.status(500).json({ error: "Error obteniendo lista de umpires" });
  }
});

export default router;
