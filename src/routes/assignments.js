// src/routes/assignments.js
import { Router } from "express";
import prisma from "../lib/prisma.js";
import { adminRequired } from "../middleware/auth.js";

const router = Router();

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toBool = (v) => {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "")
    .toLowerCase()
    .trim();
  return s === "1" || s === "true" || s === "yes";
};

const normStr = (v) => (v == null ? "" : String(v));

const numFromGame = (s) => {
  // gameNumber viene como String? (ej: "12")
  const n = Number(String(s ?? "").trim());
  return Number.isFinite(n) ? n : null;
};

async function getSeasonMaxGameNumber(seasonId) {
  const rows = await prisma.assignment.findMany({
    where: { seasonId },
    select: { gameNumber: true, gameNumber2: true },
  });

  let max = 0;

  for (const r of rows) {
    const n1 = numFromGame(r.gameNumber);
    const n2 = numFromGame(r.gameNumber2);
    if (n1 != null && n1 > max) max = n1;
    if (n2 != null && n2 > max) max = n2;
  }

  return max;
}

async function gameNumberExists(seasonId, gameStr) {
  if (!gameStr) return false;

  const found = await prisma.assignment.findFirst({
    where: {
      seasonId,
      OR: [{ gameNumber: gameStr }, { gameNumber2: gameStr }],
    },
    select: { id: true },
  });

  return !!found;
}

async function getNextNumbers(seasonId, isDoubleGame) {
  const max = await getSeasonMaxGameNumber(seasonId);
  const next1 = String(max + 1);
  const next2 = isDoubleGame ? String(max + 2) : null;
  return { next1, next2 };
}

/**
 * GET /assignments?seasonId=1&week=1
 * (tu front usa esto)
 */
router.get("/", adminRequired, async (req, res) => {
  try {
    const seasonId = toInt(req.query.seasonId);
    const week = toInt(req.query.week);

    const where = {};
    if (seasonId != null) where.seasonId = seasonId;
    if (week != null) where.weekNumber = week;

    const items = await prisma.assignment.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: [{ weekNumber: "asc" }, { cellIndex: "asc" }],
    });

    return res.json({ items });
  } catch (err) {
    console.error("GET /assignments error:", err);
    return res.status(500).json({ error: "Error obteniendo asignaciones." });
  }
});

/**
 * Preview: GET /calendar/next-number?seasonId=1&isDoubleGame=0|1
 * (tu front lo llama así, y está bien)
 */
router.get("/next-number", adminRequired, async (req, res) => {
  try {
    const seasonId = toInt(req.query.seasonId);
    if (!seasonId) {
      return res.status(400).json({ error: "seasonId es requerido" });
    }

    const isDoubleGame = toBool(req.query.isDoubleGame);

    const { next1, next2 } = await getNextNumbers(seasonId, isDoubleGame);

    return res.json({
      nextGameNumber: next1,
      nextGameNumber2: next2 ?? "",
      isDoubleGame,
    });
  } catch (err) {
    console.error("GET /calendar/next-number error:", err);
    return res.status(500).json({ error: "Error calculando next-number." });
  }
});

/**
 * POST /assignments/upsert
 * IMPORTANTÍSIMO:
 * - Si es NUEVO -> backend asigna gameNumber/gameNumber2 y los guarda.
 * - Si es UPDATE -> conserva gameNumber, y solo asigna gameNumber2 si se activó doble y está vacío.
 * - IGNORA lo que mande el front en gameNumber (el front lo usa solo de preview).
 */
router.post("/upsert", adminRequired, async (req, res) => {
  try {
    const body = req.body || {};

    const seasonId = toInt(body.seasonId);
    const weekNumber = toInt(body.weekNumber);
    const cellIndex = toInt(body.cellIndex);

    if (!seasonId || !weekNumber || cellIndex == null) {
      return res.status(400).json({
        error: "Faltan campos requeridos: seasonId, weekNumber, cellIndex",
      });
    }

    // Validaciones básicas
    const rowIndex = toInt(body.rowIndex) ?? 0;
    const colIndex = toInt(body.colIndex) ?? 0;

    const league = normStr(body.league).trim();
    const dayName = normStr(body.dayName).trim();
    const dateStr = normStr(body.dateStr).trim();
    const stadiumCity = normStr(body.stadiumCity).trim();
    const stadiumName = normStr(body.stadiumName).trim();
    const localTeam = normStr(body.localTeam).trim();
    const visitorsTeam = normStr(body.visitorsTeam).trim();

    const gameTime =
      body.gameTime != null ? normStr(body.gameTime).trim() : null;
    const gameTime2 =
      body.gameTime2 != null ? normStr(body.gameTime2).trim() : null;

    const gameStatus = normStr(
      body.gameStatus || body.game_status || "game",
    ).trim();

    const isDoubleGame = !!body.isDoubleGame;
    const isFinalGame = !!body.isFinalGame;

    const umpires = body.umpires ?? {};

    // si viene id, intentamos update por id
    const id = toInt(body.id);

    // Detectar si existe por unique compuesto (por si no trae id)
    const existingByKey = await prisma.assignment.findUnique({
      where: {
        seasonId_weekNumber_cellIndex: {
          seasonId,
          weekNumber,
          cellIndex,
        },
      },
    });

    const isNew = !id && !existingByKey;

    let gameNumberToSave = existingByKey?.gameNumber ?? null;
    let gameNumber2ToSave = existingByKey?.gameNumber2 ?? null;

    if (isNew) {
      // NUEVO: asigna siempre (ignora lo del front)
      const { next1, next2 } = await getNextNumbers(seasonId, isDoubleGame);
      gameNumberToSave = next1;
      gameNumber2ToSave = isDoubleGame ? next2 : null;
    } else {
      // UPDATE:
      // - conserva gameNumber
      // - si ahora es doble y no hay gameNumber2: intenta usar gameNumber+1 si está libre, si no, usa next
      if (isDoubleGame) {
        if (!gameNumber2ToSave) {
          const n1 = numFromGame(gameNumberToSave);
          if (n1 != null) {
            const candidate = String(n1 + 1);
            const exists = await gameNumberExists(seasonId, candidate);
            if (!exists) {
              gameNumber2ToSave = candidate;
            } else {
              const { next2 } = await getNextNumbers(seasonId, true);
              gameNumber2ToSave = next2;
            }
          } else {
            const { next2 } = await getNextNumbers(seasonId, true);
            gameNumber2ToSave = next2;
          }
        }
      } else {
        // si ya no es doble, limpiamos el 2
        gameNumber2ToSave = null;
      }
    }

    const data = {
      seasonId,
      league,
      weekNumber,
      cellIndex,
      rowIndex,
      colIndex,
      dayName,
      dateStr,
      stadiumCity,
      stadiumName,
      localTeam,
      visitorsTeam,

      gameNumber: gameNumberToSave,
      gameNumber2: gameNumber2ToSave,

      gameTime,
      gameTime2: isDoubleGame ? gameTime2 : null,

      gameStatus,
      isDoubleGame,
      isFinalGame,

      umpires,
    };

    let saved;

    if (id) {
      // UPDATE por id
      saved = await prisma.assignment.update({
        where: { id },
        data,
      });
    } else {
      // UPSERT por llave única compuesta
      saved = await prisma.assignment.upsert({
        where: {
          seasonId_weekNumber_cellIndex: {
            seasonId,
            weekNumber,
            cellIndex,
          },
        },
        create: data,
        update: data,
      });
    }

    return res.json({ assignment: saved });
  } catch (err) {
    console.error("POST /assignments/upsert error:", err);

    // Unique constraint friendly message
    const msg = String(err?.message || "");
    if (
      msg.includes("Unique constraint") ||
      msg.includes("seasonId_weekNumber_cellIndex")
    ) {
      return res
        .status(409)
        .json({ error: "Ya existe una asignación para esa celda." });
    }

    return res.status(500).json({ error: "Error guardando asignación." });
  }
});

/**
 * DELETE /assignments/:id
 * (tu front lo usa con api.del)
 */
router.delete("/:id", adminRequired, async (req, res) => {
  try {
    const idNum = toInt(req.params.id);
    if (!idNum) {
      return res.status(400).json({ error: "Id inválido" });
    }

    await prisma.assignment.delete({ where: { id: idNum } });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /assignments/:id error:", err);
    return res.status(500).json({ error: "Error eliminando asignación." });
  }
});

export default router;
