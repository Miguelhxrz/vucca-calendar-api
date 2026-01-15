// src/routes/assignments.js
import { Router } from "express";
import prisma from "../lib/prisma.js";
import { adminRequired } from "../middleware/auth.js";

const router = Router();

/* ===========================================================
 *  HELPERS
 * ===========================================================
 */

const normalizeUmpiresPayload = (raw) => {
  if (!raw) return {};

  let u = raw;

  // si viene como string JSON
  if (typeof u === "string") {
    try {
      u = JSON.parse(u);
    } catch {
      return {};
    }
  }

  if (typeof u !== "object" || Array.isArray(u)) return {};

  const POSITIONS = ["H", "R", "1B", "2B", "3B", "LF", "LR", "OR"];

  const getSlotId = (slot) => {
    if (!slot) return null;

    // si viene como número
    if (typeof slot === "number") {
      return Number.isFinite(slot) && slot > 0 ? slot : null;
    }

    // si viene como string numérico
    if (typeof slot === "string") {
      const n = Number(slot);
      return Number.isFinite(n) && n > 0 ? n : null;
    }

    // si viene como objeto
    const rawId = slot.umpireId ?? slot.umpire_id ?? slot.id ?? slot.ID ?? null;

    const n = Number(rawId);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const normalizeSlot = (slot) => {
    // siempre devolvemos un objeto consistente
    const id = getSlotId(slot);

    // preservamos name/double si existen, pero jamás confiamos en "0"
    const base =
      slot && typeof slot === "object" && !Array.isArray(slot) ? slot : {};

    return {
      ...base,
      umpireId: id, // <- CLAVE: null si no hay id válido
      name: base.name ?? "",
      double: base.double ?? "",
    };
  };

  const out = {};
  for (const p of POSITIONS) out[p] = normalizeSlot(u[p]);

  return out;
};

/* ===========================================================
 *  LISTAR ASIGNACIONES
 *  GET /assignments?seasonId=1&week=1&status=...&city=...&q=...
 * ===========================================================
 */

router.get("/", async (req, res) => {
  try {
    const seasonId = Number(req.query.seasonId || req.query.id);
    const week = req.query.week ? Number(req.query.week) : null;
    const status = req.query.status || null;
    const city = req.query.city || null;
    const q = (req.query.q || "").trim().toLowerCase();

    if (!Number.isFinite(seasonId)) {
      return res.status(400).json({ error: "seasonId requerido" });
    }

    const where = { seasonId };
    if (Number.isFinite(week) && week > 0) where.weekNumber = week;
    if (status) where.gameStatus = status;
    if (city) where.stadiumCity = city;
    if (q) {
      where.OR = [
        { localTeam: { contains: q, mode: "insensitive" } },
        { visitorsTeam: { contains: q, mode: "insensitive" } },
        { stadiumName: { contains: q, mode: "insensitive" } },
        { stadiumCity: { contains: q, mode: "insensitive" } },
        { dayName: { contains: q, mode: "insensitive" } },
      ];
    }

    const items = await prisma.assignment.findMany({
      where,
      orderBy: [
        { weekNumber: "asc" },
        { rowIndex: "asc" },
        { colIndex: "asc" },
      ],
    });

    res.json({ items });
  } catch (err) {
    console.error("GET /assignments", err);
    res.status(500).json({ error: "Server error on /assignments" });
  }
});

/* ===========================================================
 *  UPSERT + ACTUALIZAR totalWeeks
 *  POST /assignments/upsert
 * ===========================================================
 */

router.post("/upsert", adminRequired, async (req, res) => {
  try {
    const {
      seasonId,
      weekNumber,
      cellIndex,
      league,
      rowIndex,
      colIndex,
      dayName,
      dateStr,
      stadiumCity,
      stadiumName,
      localTeam,
      visitorsTeam,
      gameNumber,
      gameNumber2,
      gameTime,
      gameTime2,
      gameStatus,
      isDoubleGame,
      isFinalGame,
      umpires,
    } = req.body || {};

    if (
      !Number.isFinite(seasonId) ||
      !Number.isFinite(weekNumber) ||
      !Number.isFinite(cellIndex)
    ) {
      return res
        .status(400)
        .json({ error: "seasonId, weekNumber y cellIndex son requeridos" });
    }

    // ✅ NORMALIZAMOS SIEMPRE lo que venga
    const normalizedUmpires = normalizeUmpiresPayload(umpires);

    // 🔎 LOG opcional (déjalo mientras depuramos LR)
    // Si LR viene sin umpireId, lo vas a ver clarito acá:
    const lrId = Number(normalizedUmpires?.LR?.umpireId || 0);
    if (!lrId) {
      console.log(
        `[ASSIGNMENTS upsert] LR vacío -> season=${seasonId} week=${weekNumber} cell=${cellIndex}`,
        "rawLR=",
        normalizedUmpires?.LR
      );
    }

    const data = {
      seasonId,
      weekNumber,
      cellIndex,
      league: league || null,
      rowIndex: rowIndex ?? 0,
      colIndex: colIndex ?? 0,
      dayName: dayName || "",
      dateStr: dateStr || "",
      stadiumCity: stadiumCity || "",
      stadiumName: stadiumName || "",
      localTeam: localTeam || "",
      visitorsTeam: visitorsTeam || "",
      gameNumber: gameNumber || null,
      gameNumber2: gameNumber2 || null,
      gameTime: gameTime || null,
      gameTime2: gameTime2 || null,
      gameStatus: gameStatus || "game",
      isDoubleGame: !!isDoubleGame,
      isFinalGame: !!isFinalGame,

      // ✅ aquí está el fix real para que LR se guarde si viene
      umpires: normalizedUmpires,
    };

    const saved = await prisma.assignment.upsert({
      where: {
        seasonId_weekNumber_cellIndex: { seasonId, weekNumber, cellIndex },
      },
      update: data,
      create: data,
    });

    // Actualizar totalWeeks en Season (según la semana más alta usada)
    try {
      const season = await prisma.season.findUnique({
        where: { id: seasonId },
        select: { totalWeeks: true },
      });

      const currentTotal = season?.totalWeeks ?? 1;
      const nextTotal = weekNumber > currentTotal ? weekNumber : currentTotal;

      if (nextTotal !== currentTotal) {
        await prisma.season.update({
          where: { id: seasonId },
          data: { totalWeeks: nextTotal },
        });
      }
    } catch (e) {
      console.error("Error actualizando totalWeeks en Season:", e);
    }

    res.json({ ok: true, assignment: saved });
  } catch (err) {
    console.error("POST /assignments/upsert", err);
    res.status(500).json({ error: "Server error on /assignments/upsert" });
  }
});

/* ===========================================================
 *  FINALIZAR TEMPORADA
 *  POST /assignments/finish
 * ===========================================================
 */

router.post("/finish", adminRequired, async (req, res) => {
  try {
    const { seasonId, totalWeeks } = req.body;
    if (!Number.isFinite(seasonId)) {
      return res.status(400).json({ error: "seasonId requerido" });
    }

    await prisma.season.update({
      where: { id: seasonId },
      data: {
        status: "FINISHED",
        ...(Number.isFinite(totalWeeks) && totalWeeks > 0
          ? { totalWeeks }
          : {}),
      },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("POST /assignments/finish", e);
    res.status(500).json({ error: "Error al finalizar la temporada" });
  }
});

router.delete("/:id", adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await prisma.assignment.delete({
      where: { id },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Error borrando asignación:", err);
    return res.status(500).json({ error: "No se pudo eliminar la asignación" });
  }
});

export default router;
