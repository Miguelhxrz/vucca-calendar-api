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

// ✅ construye un Map(id -> {gameNumber, gameNumber2}) calculado de forma estable
function buildGameNumberMap(allSeasonItems = []) {
  const sorted = [...allSeasonItems].sort((a, b) => {
    const wnA = Number(a.weekNumber ?? 0);
    const wnB = Number(b.weekNumber ?? 0);
    if (wnA !== wnB) return wnA - wnB;

    const rA = Number(a.rowIndex ?? 0);
    const rB = Number(b.rowIndex ?? 0);
    if (rA !== rB) return rA - rB;

    const cA = Number(a.colIndex ?? 0);
    const cB = Number(b.colIndex ?? 0);
    if (cA !== cB) return cA - cB;

    const cellA = Number(a.cellIndex ?? 0);
    const cellB = Number(b.cellIndex ?? 0);
    return cellA - cellB;
  });

  const map = new Map();
  let counter = 1;

  for (const it of sorted) {
    const id = it?.id;
    if (!id) continue;

    const hasTeams = !!(it.localTeam && it.visitorsTeam);

    const status = (it.gameStatus || "").toString().trim().toLowerCase();
    const isNoGame =
      status === "no game" || status === "nogame" || status === "no_game";

    if (!hasTeams || isNoGame) {
      map.set(id, { gameNumber: null, gameNumber2: null });
      continue;
    }

    const g1 = String(counter);
    counter += 1;

    let g2 = null;
    if (it.isDoubleGame) {
      g2 = String(counter);
      counter += 1;
    }

    map.set(id, { gameNumber: g1, gameNumber2: g2 });
  }

  return map;
}

// ✅ Recalcula y GUARDA gameNumber/gameNumber2 en BD para toda la temporada.
async function recomputeAndPersistGameNumbers(tx, seasonId) {
  // 🔒 Lock de Season para evitar colisiones si se guardan 2 celdas al mismo tiempo.
  try {
    await tx.$queryRaw`SELECT id FROM Season WHERE id = ${seasonId} FOR UPDATE`;
  } catch {
    // si falla el lock, seguimos (mejor que romper guardado)
  }

  const allSeasonItems = await tx.assignment.findMany({
    where: { seasonId },
    orderBy: [
      { weekNumber: "asc" },
      { rowIndex: "asc" },
      { colIndex: "asc" },
      { cellIndex: "asc" },
    ],
    select: {
      id: true,
      weekNumber: true,
      rowIndex: true,
      colIndex: true,
      cellIndex: true,
      localTeam: true,
      visitorsTeam: true,
      gameStatus: true,
      isDoubleGame: true,
    },
  });

  const gameMap = buildGameNumberMap(allSeasonItems);

  const updates = [];
  for (const it of allSeasonItems) {
    const calc = gameMap.get(it.id) || { gameNumber: null, gameNumber2: null };

    updates.push(
      tx.assignment.update({
        where: { id: it.id },
        data: {
          gameNumber: calc.gameNumber,
          gameNumber2: calc.gameNumber2,
        },
      }),
    );
  }

  await Promise.all(updates);
  return gameMap;
}

/* ===========================================================
 *  LISTAR ASIGNACIONES
 *  GET /calendar?seasonId=1&week=1&status=...&city=...&q=...
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

    // Traemos TODO lo de la temporada para numerar globalmente
    const allSeasonItems = await prisma.assignment.findMany({
      where: { seasonId },
      orderBy: [
        { weekNumber: "asc" },
        { rowIndex: "asc" },
        { colIndex: "asc" },
        { cellIndex: "asc" },
      ],
    });

    const gameMap = buildGameNumberMap(allSeasonItems);

    // Aplicamos filtros para la respuesta (sin romper numeración)
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
        { cellIndex: "asc" },
      ],
    });

    // Inyectamos gameNumber/gameNumber2 calculados (coincide con lo persistido)
    const withNumbers = items.map((a) => {
      const calc = gameMap.get(a.id) || null;
      return {
        ...a,
        gameNumber: calc?.gameNumber ?? null,
        gameNumber2: calc?.gameNumber2 ?? null,
      };
    });

    res.json({ items: withNumbers });
  } catch (err) {
    console.error("GET /assignments", err);
    res.status(500).json({ error: "Server error on /assignments" });
  }
});

/* ===========================================================
 *  UPSERT + ACTUALIZAR totalWeeks
 *  POST /calendar/upsert
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
      // gameNumber/gameNumber2 se ignoran: ahora los calcula y GUARDA el backend
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

    const normalizedUmpires = normalizeUmpiresPayload(umpires);

    const lrId = Number(normalizedUmpires?.LR?.umpireId || 0);
    if (!lrId) {
      console.log(
        `[ASSIGNMENTS upsert] LR vacío -> season=${seasonId} week=${weekNumber} cell=${cellIndex}`,
        "rawLR=",
        normalizedUmpires?.LR,
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

      // ✅ lo calcula y lo guarda el backend
      gameNumber: null,
      gameNumber2: null,

      gameTime: gameTime || null,
      gameTime2: gameTime2 || null,
      gameStatus: gameStatus || "game",
      isDoubleGame: !!isDoubleGame,
      isFinalGame: !!isFinalGame,

      umpires: normalizedUmpires,
    };

    const result = await prisma.$transaction(async (tx) => {
      const saved = await tx.assignment.upsert({
        where: {
          seasonId_weekNumber_cellIndex: { seasonId, weekNumber, cellIndex },
        },
        update: data,
        create: data,
      });

      // actualizar totalWeeks
      try {
        const season = await tx.season.findUnique({
          where: { id: seasonId },
          select: { totalWeeks: true },
        });

        const currentTotal = season?.totalWeeks ?? 1;
        const nextTotal = weekNumber > currentTotal ? weekNumber : currentTotal;

        if (nextTotal !== currentTotal) {
          await tx.season.update({
            where: { id: seasonId },
            data: { totalWeeks: nextTotal },
          });
        }
      } catch (e) {
        console.error("Error actualizando totalWeeks en Season:", e);
      }

      // ✅ recalcular y PERSISTIR números para TODA la temporada
      const gameMap = await recomputeAndPersistGameNumbers(tx, seasonId);
      const calc = gameMap.get(saved.id) || {
        gameNumber: null,
        gameNumber2: null,
      };

      return {
        saved: {
          ...saved,
          gameNumber: calc.gameNumber,
          gameNumber2: calc.gameNumber2,
        },
      };
    });

    res.json({ ok: true, assignment: result.saved });
  } catch (err) {
    console.error("POST /assignments/upsert", err);
    res.status(500).json({ error: "Server error on /assignments/upsert" });
  }
});

/* ===========================================================
 *  RECALCULAR Y PERSISTIR NÚMEROS DE JUEGO (ONE-SHOT)
 *  POST /calendar/recompute-numbers
 * ===========================================================
 */

router.post("/recompute-numbers", adminRequired, async (req, res) => {
  try {
    const seasonId = Number(req.body?.seasonId || req.body?.id);
    if (!Number.isFinite(seasonId)) {
      return res.status(400).json({ error: "seasonId requerido" });
    }

    await prisma.$transaction(async (tx) => {
      await recomputeAndPersistGameNumbers(tx, seasonId);
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /assignments/recompute-numbers", err);
    return res.status(500).json({ error: "No se pudo recalcular" });
  }
});

/* ===========================================================
 *  FINALIZAR TEMPORADA
 *  POST /calendar/finish
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

    // ✅ borrado + renumeración en transacción
    await prisma.$transaction(async (tx) => {
      const current = await tx.assignment.findUnique({
        where: { id },
        select: { seasonId: true },
      });

      await tx.assignment.delete({ where: { id } });

      if (current?.seasonId) {
        await recomputeAndPersistGameNumbers(tx, current.seasonId);
      }
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Error borrando asignación:", err);
    return res.status(500).json({ error: "No se pudo eliminar la asignación" });
  }
});

export default router;
