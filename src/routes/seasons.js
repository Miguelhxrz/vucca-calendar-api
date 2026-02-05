// src/routes/seasons.js
import { Router } from "express";
import prisma from "../lib/prisma.js";
import { adminRequired } from "../middleware/auth.js";

const router = Router();

const isValidISODate = (s) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Crear temporada
 * POST /seasons
 * body: { league: "LVBP" | "LMBP", startDate: "YYYY-MM-DD", totalWeeks?: number }
 */
router.post("/", adminRequired, async (req, res) => {
  try {
    const { league, startDate, totalWeeks } = req.body;

    // Liga
    if (league !== "LVBP" && league !== "LMBP") {
      return res.status(400).json({ error: "Liga inválida" });
    }

    // Fecha (YYYY-MM-DD)
    if (!isValidISODate(startDate)) {
      return res.status(400).json({ error: "startDate inválido (YYYY-MM-DD)" });
    }

    // totalWeeks
    const weeksNum = Number(totalWeeks ?? 16);
    if (!Number.isFinite(weeksNum) || weeksNum <= 0 || weeksNum > 60) {
      return res.status(400).json({ error: "totalWeeks inválido" });
    }

    // DateTime (guardamos al inicio del día)
    // Nota: usando Z para evitar NaN; si quieres timezone Venezuela, lo ajustamos luego.
    const start = new Date(`${startDate}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ error: "Fecha inválida" });
    }

    // Evitar duplicado exacto (misma liga + misma fecha)
    const existing = await prisma.season.findFirst({
      where: {
        league,
        startDate: start,
      },
    });

    if (existing) {
      return res.status(409).json({
        error: "Ya existe una temporada con esa liga y fecha de inicio.",
        season: existing,
      });
    }

    const created = await prisma.season.create({
      data: {
        league,
        startDate: start,
        totalWeeks: weeksNum,
        isFinished: false,
      },
    });

    return res.status(201).json({ season: created });
  } catch (err) {
    console.error("POST /seasons error:", err);
    return res
      .status(500)
      .json({ error: "Error creando temporada desde el servidor." });
  }
});

/**
 * Listar temporadas (opcionalmente filtrando por liga)
 * GET /seasons?league=LVBP
 */
router.get("/", adminRequired, async (req, res) => {
  try {
    const { league } = req.query;

    const seasons = await prisma.season.findMany({
      where: league ? { league: String(league) } : undefined,
      orderBy: { createdAt: "desc" },
    });

    return res.json({ items: seasons });
  } catch (err) {
    console.error("GET /seasons error:", err);
    return res
      .status(500)
      .json({ error: "Error obteniendo temporadas desde el servidor." });
  }
});

/**
 * Obtener una temporada por id
 * GET /seasons/:id
 */
router.get("/:id", adminRequired, async (req, res) => {
  try {
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return res.status(400).json({ error: "Id inválido" });
    }

    const season = await prisma.season.findUnique({
      where: { id: idNum },
    });

    if (!season) {
      return res.status(404).json({ error: "Temporada no encontrada" });
    }

    return res.json({ season });
  } catch (err) {
    console.error("GET /seasons/:id error:", err);
    return res
      .status(500)
      .json({ error: "Error obteniendo la temporada desde el servidor." });
  }
});

/**
 * ✅ Actualizar temporada (totalWeeks / isFinished)
 * PATCH /seasons/:id
 * body: { totalWeeks?: number, isFinished?: boolean }
 */
router.patch("/:id", adminRequired, async (req, res) => {
  try {
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return res.status(400).json({ error: "Id inválido" });
    }

    const { totalWeeks, isFinished } = req.body ?? {};
    const data = {};

    if (totalWeeks !== undefined) {
      const weeksNum = Number(totalWeeks);
      if (!Number.isFinite(weeksNum) || weeksNum <= 0 || weeksNum > 60) {
        return res.status(400).json({ error: "totalWeeks inválido" });
      }
      data.totalWeeks = weeksNum;
    }

    if (isFinished !== undefined) {
      if (typeof isFinished !== "boolean") {
        return res.status(400).json({ error: "isFinished inválido" });
      }
      data.isFinished = isFinished;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nada que actualizar" });
    }

    const updated = await prisma.season.update({
      where: { id: idNum },
      data,
    });

    return res.json({ season: updated });
  } catch (err) {
    console.error("PATCH /seasons/:id error:", err);

    // Prisma: record not found
    if (String(err?.code) === "P2025") {
      return res.status(404).json({ error: "Temporada no encontrada" });
    }

    return res
      .status(500)
      .json({ error: "Error actualizando temporada desde el servidor." });
  }
});

export default router;
