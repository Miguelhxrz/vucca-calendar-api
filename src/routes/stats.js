// src/routes/stats.js
import { Router } from "express";
import prisma from "../lib/prisma.js";
import { adminRequired } from "../middleware/auth.js";

const router = Router();

/**
 * GET /stats/season/:seasonId?league=LVBP
 * -> { seasonId, league, items: [...] }
 */
router.get("/season/:seasonId", adminRequired, async (req, res) => {
  try {
    const seasonIdParam = req.params.seasonId;
    const leagueRaw = req.query.league;

    if (!seasonIdParam) {
      return res
        .status(400)
        .json({ error: "Falta el parámetro seasonId en la URL" });
    }

    const seasonId = Number(seasonIdParam);
    if (!Number.isFinite(seasonId)) {
      return res
        .status(400)
        .json({ error: "seasonId debe ser un número válido" });
    }

    if (!leagueRaw) {
      return res
        .status(400)
        .json({ error: "Falta el parámetro league en la query" });
    }

    const league = String(leagueRaw).trim();

    const assignments = await prisma.assignment.findMany({
      where: {
        seasonId,
        league,
        gameStatus: "game",
      },
      select: {
        id: true,
        seasonId: true,
        league: true,
        dateStr: true,
        stadiumName: true,
        stadiumCity: true,
        localTeam: true,
        visitorsTeam: true,
        gameStatus: true,
        umpires: true,
      },
      orderBy: [{ dateStr: "asc" }, { stadiumName: "asc" }, { id: "asc" }],
    });

    return res.json({ seasonId, league, items: assignments });
  } catch (err) {
    console.error("Error en GET /stats/season/:seasonId", err);
    return res
      .status(500)
      .json({ error: "Error obteniendo estadísticas de la temporada" });
  }
});

/**
 * GET /stats/home-by-stadium?seasonId=1&umpireId=10&league=LVBP (league opcional)
 * -> { items: [{ estadio, ciudad, home }] }
 */
router.get("/home-by-stadium", adminRequired, async (req, res) => {
  try {
    const { seasonId, umpireId, league } = req.query;

    if (!seasonId)
      return res.status(400).json({ error: "seasonId es requerido" });
    if (!umpireId)
      return res.status(400).json({ error: "umpireId es requerido" });

    const seasonIdNum = Number(seasonId);
    const umpireIdNum = Number(umpireId);

    if (!Number.isFinite(seasonIdNum))
      return res.status(400).json({ error: "seasonId debe ser numérico" });
    if (!Number.isFinite(umpireIdNum))
      return res.status(400).json({ error: "umpireId debe ser numérico" });

    const rows = await prisma.assignment.findMany({
      where: {
        seasonId: seasonIdNum,
        gameStatus: "game",
        ...(league ? { league: String(league).trim() } : {}),
      },
      select: {
        stadiumName: true,
        stadiumCity: true,
        umpires: true,
      },
    });

    const map = new Map(); // key: "ciudad||estadio"

    for (const a of rows) {
      const homeSlot = (a.umpires || {})?.H;
      const slotId = Number(homeSlot?.umpireId);
      if (!Number.isFinite(slotId) || slotId !== umpireIdNum) continue;

      const estadio = (a.stadiumName || "").toString().trim();
      const ciudad = (a.stadiumCity || "").toString().trim();
      const key = `${ciudad}||${estadio}`;

      const prev = map.get(key) || { estadio, ciudad, home: 0 };
      prev.home += 1;
      map.set(key, prev);
    }

    const items = Array.from(map.values()).sort(
      (a, b) => (b.home || 0) - (a.home || 0)
    );

    return res.json({
      seasonId: seasonIdNum,
      umpireId: umpireIdNum,
      league: league ? String(league).trim() : null,
      items,
    });
  } catch (err) {
    console.error("GET /stats/home-by-stadium error:", err);
    return res.status(500).json({ error: "Error calculando home por estadio" });
  }
});

/**
 * GET /stats/bases-by-stadium?seasonId=1&umpireId=10&league=LVBP (league opcional)
 * -> { items: [{ estadio, ciudad, bases: { primeraBase, segundaBase, terceraBase, LF, LR } }] }
 */
router.get("/bases-by-stadium", adminRequired, async (req, res) => {
  try {
    const { seasonId, umpireId, league } = req.query;

    if (!seasonId)
      return res.status(400).json({ error: "seasonId es requerido" });
    if (!umpireId)
      return res.status(400).json({ error: "umpireId es requerido" });

    const seasonIdNum = Number(seasonId);
    const umpireIdNum = Number(umpireId);

    if (!Number.isFinite(seasonIdNum))
      return res.status(400).json({ error: "seasonId debe ser numérico" });
    if (!Number.isFinite(umpireIdNum))
      return res.status(400).json({ error: "umpireId debe ser numérico" });

    // Comentario: traemos el umpire seleccionado para fallback por nombre
    const selectedUmp = await prisma.umpire.findUnique({
      where: { id: umpireIdNum },
      select: { firstName: true, lastName: true },
    });

    const selectedName = `${selectedUmp?.firstName ?? ""} ${
      selectedUmp?.lastName ?? ""
    }`.trim();

    // Comentario: normalizador para comparar strings (quita tildes y normaliza espacios)
    const norm = (v) =>
      (v ?? "")
        .toString()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .toLowerCase();

    const rows = await prisma.assignment.findMany({
      where: {
        seasonId: seasonIdNum,
        gameStatus: "game",
        ...(league ? { league: String(league).trim() } : {}),
      },
      select: {
        stadiumName: true,
        stadiumCity: true,
        umpires: true,
      },
    });

    const normalizeUmpires = (u) => {
      if (!u) return {};
      if (typeof u === "object") return u;
      if (typeof u === "string") {
        try {
          const parsed = JSON.parse(u);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          return {};
        }
      }
      return {};
    };

    const getSlotId = (slot) => {
      // Comentario: leemos variantes comunes por si algún registro viejo trae otro campo
      const raw =
        slot?.umpireId ?? slot?.umpire_id ?? slot?.id ?? slot?.ID ?? null;

      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    const slotMatchesSelected = (slot) => {
      // Comentario: primero intentamos por ID (mejor práctica)
      const id = getSlotId(slot);
      if (id != null) return id === umpireIdNum;

      // Comentario: fallback por nombre para registros viejos (como tu LR actual)
      const slotName = slot?.name ?? slot?.nombre ?? "";
      if (!selectedName) return false;
      return norm(slotName) === norm(selectedName);
    };

    const map = new Map(); // key: "ciudad||estadio"

    for (const a of rows) {
      const estadio = (a.stadiumName || "").toString().trim();
      const ciudad = (a.stadiumCity || "").toString().trim();
      const key = `${ciudad}||${estadio}`;

      const prev = map.get(key) || {
        estadio,
        ciudad,
        bases: { primeraBase: 0, segundaBase: 0, terceraBase: 0, LF: 0, LR: 0 },
      };

      const umps = normalizeUmpires(a.umpires);

      if (slotMatchesSelected(umps?.["1B"])) prev.bases.primeraBase += 1;
      if (slotMatchesSelected(umps?.["2B"])) prev.bases.segundaBase += 1;
      if (slotMatchesSelected(umps?.["3B"])) prev.bases.terceraBase += 1;
      if (slotMatchesSelected(umps?.["LF"])) prev.bases.LF += 1;
      if (slotMatchesSelected(umps?.["LR"])) prev.bases.LR += 1;

      map.set(key, prev);
    }

    const items = Array.from(map.values()).sort((a, b) => {
      const ta =
        (a.bases?.primeraBase || 0) +
        (a.bases?.segundaBase || 0) +
        (a.bases?.terceraBase || 0) +
        (a.bases?.LF || 0) +
        (a.bases?.LR || 0);

      const tb =
        (b.bases?.primeraBase || 0) +
        (b.bases?.segundaBase || 0) +
        (b.bases?.terceraBase || 0) +
        (b.bases?.LF || 0) +
        (b.bases?.LR || 0);

      return tb - ta;
    });

    return res.json({
      seasonId: seasonIdNum,
      umpireId: umpireIdNum,
      league: league ? String(league).trim() : null,
      items,
    });
  } catch (err) {
    console.error("GET /stats/bases-by-stadium error:", err);
    return res
      .status(500)
      .json({ error: "Error calculando bases por estadio" });
  }
});

/**
 * POST /stats/repair-umpire-slots
 * body: { seasonId: number, league?: string }
 * Repara umpires.{LF,LR} si no tienen umpireId pero sí name/nombre.
 */
router.post("/repair-umpire-slots", adminRequired, async (req, res) => {
  try {
    const { seasonId, league } = req.body;

    if (!seasonId)
      return res.status(400).json({ error: "seasonId es requerido" });

    const seasonIdNum = Number(seasonId);
    if (!Number.isFinite(seasonIdNum))
      return res.status(400).json({ error: "seasonId debe ser numérico" });

    const clean = (v) => (v ?? "").toString().trim();
    const norm = (v) =>
      clean(v)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .toLowerCase();

    const umpiresDb = await prisma.umpire.findMany({
      select: {
        id: true,
        nombre: true,
        firstName: true,
        lastName: true,
        name: true,
      },
    });

    const nameToId = new Map();
    for (const u of umpiresDb) {
      const full =
        clean(u.nombre) ||
        clean([u.firstName, u.lastName].filter(Boolean).join(" ")) ||
        clean(u.name);

      if (full) nameToId.set(norm(full), Number(u.id));
    }

    const normalizeUmpires = (u) => {
      if (!u) return {};
      if (typeof u === "object") return u;
      if (typeof u === "string") {
        try {
          const parsed = JSON.parse(u);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          return {};
        }
      }
      return {};
    };

    const getSlotId = (slot) => {
      if (!slot) return null;
      const rawId =
        slot.umpireId ?? slot.umpire_id ?? slot.id ?? slot.ID ?? null;
      const n = Number(rawId);
      if (Number.isFinite(n) && n > 0) return n;

      const rawName = slot.nombre ?? slot.name ?? slot.umpireName ?? "";
      const byName = nameToId.get(norm(rawName));
      return Number.isFinite(byName) ? byName : null;
    };

    const rows = await prisma.assignment.findMany({
      where: {
        seasonId: seasonIdNum,
        gameStatus: "game",
        ...(league ? { league: String(league).trim() } : {}),
      },
      select: { id: true, umpires: true },
    });

    let fixed = 0;

    for (const a of rows) {
      const umps = normalizeUmpires(a.umpires);
      if (!umps || typeof umps !== "object") continue;

      let changed = false;

      for (const key of ["LF", "LR"]) {
        const slot = umps[key];
        if (!slot || typeof slot !== "object") continue;

        const hasId =
          Number.isFinite(Number(slot.umpireId)) && Number(slot.umpireId) > 0;
        if (hasId) continue;

        const resolved = getSlotId(slot);
        if (Number.isFinite(resolved) && resolved > 0) {
          umps[key] = { ...slot, umpireId: resolved };
          changed = true;
        }
      }

      if (changed) {
        await prisma.assignment.update({
          where: { id: a.id },
          data: { umpires: umps },
        });
        fixed += 1;
      }
    }

    return res.json({
      ok: true,
      seasonId: seasonIdNum,
      league: league || null,
      fixed,
    });
  } catch (err) {
    console.error("POST /stats/repair-umpire-slots error:", err);
    return res.status(500).json({ error: "Error reparando slots LF/LR" });
  }
});

/**
 * GET /stats/replay-by-stadium?seasonId=1&umpireId=10&league=LVBP (league opcional)
 * -> { items: [{ estadio, ciudad, replay }] }
 */
router.get("/replay-by-stadium", adminRequired, async (req, res) => {
  try {
    const { seasonId, umpireId, league } = req.query;

    if (!seasonId)
      return res.status(400).json({ error: "seasonId es requerido" });
    if (!umpireId)
      return res.status(400).json({ error: "umpireId es requerido" });

    const seasonIdNum = Number(seasonId);
    const umpireIdNum = Number(umpireId);

    if (!Number.isFinite(seasonIdNum))
      return res.status(400).json({ error: "seasonId debe ser numérico" });
    if (!Number.isFinite(umpireIdNum))
      return res.status(400).json({ error: "umpireId debe ser numérico" });

    const rows = await prisma.assignment.findMany({
      where: {
        seasonId: seasonIdNum,
        gameStatus: "game",
        ...(league ? { league: String(league).trim() } : {}),
      },
      select: {
        stadiumName: true,
        stadiumCity: true,
        umpires: true,
      },
    });

    const map = new Map(); // key: "ciudad||estadio"

    for (const a of rows) {
      const replaySlot = (a.umpires || {})?.R;
      const slotId = Number(replaySlot?.umpireId);

      if (!Number.isFinite(slotId) || slotId !== umpireIdNum) continue;

      const estadio = (a.stadiumName || "").toString().trim();
      const ciudad = (a.stadiumCity || "").toString().trim();
      const key = `${ciudad}||${estadio}`;

      const prev = map.get(key) || { estadio, ciudad, replay: 0 };
      prev.replay += 1;
      map.set(key, prev);
    }

    const items = Array.from(map.values()).sort(
      (a, b) => (b.replay || 0) - (a.replay || 0)
    );

    return res.json({
      seasonId: seasonIdNum,
      umpireId: umpireIdNum,
      league: league ? String(league).trim() : null,
      items,
    });
  } catch (err) {
    console.error("GET /stats/replay-by-stadium error:", err);
    return res
      .status(500)
      .json({ error: "Error calculando replay por estadio" });
  }
});

/**
 * GET /stats/clock-by-stadium?seasonId=1&umpireId=10&league=LVBP (league opcional)
 * -> { items: [{ estadio, ciudad, reloj }] }
 *
 * NOTA: "Reloj" está en el JSON de umpires como "OR"
 */
router.get("/clock-by-stadium", adminRequired, async (req, res) => {
  try {
    const { seasonId, umpireId, league } = req.query;

    if (!seasonId)
      return res.status(400).json({ error: "seasonId es requerido" });
    if (!umpireId)
      return res.status(400).json({ error: "umpireId es requerido" });

    const seasonIdNum = Number(seasonId);
    const umpireIdNum = Number(umpireId);

    if (!Number.isFinite(seasonIdNum))
      return res.status(400).json({ error: "seasonId debe ser numérico" });
    if (!Number.isFinite(umpireIdNum))
      return res.status(400).json({ error: "umpireId debe ser numérico" });

    const rows = await prisma.assignment.findMany({
      where: {
        seasonId: seasonIdNum,
        gameStatus: "game",
        ...(league ? { league: String(league).trim() } : {}),
      },
      select: {
        stadiumName: true,
        stadiumCity: true,
        umpires: true,
      },
    });

    const map = new Map(); // key: "ciudad||estadio"

    for (const a of rows) {
      // ✅ OR = reloj
      const clockSlot = (a.umpires || {})?.OR;
      const slotId = Number(clockSlot?.umpireId);

      if (!Number.isFinite(slotId) || slotId !== umpireIdNum) continue;

      const estadio = (a.stadiumName || "").toString().trim();
      const ciudad = (a.stadiumCity || "").toString().trim();
      const key = `${ciudad}||${estadio}`;

      const prev = map.get(key) || { estadio, ciudad, reloj: 0 };
      prev.reloj += 1;
      map.set(key, prev);
    }

    const items = Array.from(map.values()).sort(
      (a, b) => (b.reloj || 0) - (a.reloj || 0)
    );

    return res.json({
      seasonId: seasonIdNum,
      umpireId: umpireIdNum,
      league: league ? String(league).trim() : null,
      items,
    });
  } catch (err) {
    console.error("GET /stats/clock-by-stadium error:", err);
    return res
      .status(500)
      .json({ error: "Error calculando reloj por estadio" });
  }
});

// src/routes/stats.js
router.get("/summary", adminRequired, async (req, res) => {
  try {
    const { seasonId, umpireId, league } = req.query;

    if (!seasonId)
      return res.status(400).json({ error: "seasonId es requerido" });
    if (!umpireId)
      return res.status(400).json({ error: "umpireId es requerido" });

    const sid = Number(seasonId);
    const uid = Number(umpireId);

    if (!Number.isFinite(sid))
      return res.status(400).json({ error: "seasonId debe ser numérico" });
    if (!Number.isFinite(uid))
      return res.status(400).json({ error: "umpireId debe ser numérico" });

    const rows = await prisma.assignment.findMany({
      where: {
        seasonId: sid,
        gameStatus: "game",
        ...(league ? { league: String(league).trim() } : {}),
      },
      select: {
        stadiumName: true,
        stadiumCity: true,
        umpires: true,
      },
    });

    const normalizeUmpires = (u) => {
      if (!u) return {};
      if (typeof u === "object") return u;
      if (typeof u === "string") {
        try {
          const parsed = JSON.parse(u);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          return {};
        }
      }
      return {};
    };

    const getSlotId = (slot) => {
      const raw = slot?.umpireId ?? slot?.umpire_id ?? slot?.id ?? null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    const POSITIONS_ANY = ["H", "1B", "2B", "3B", "R", "OR", "LF", "LR"];
    const BASES = ["1B", "2B", "3B", "LF", "LR"];

    let totalGames = 0;
    let totalHomes = 0;
    let totalBases = 0;
    let totalClock = 0;
    let totalReplays = 0;
    let totalVisits = 0;

    // visitas por estadio (por si después lo quieres mostrar también)
    const visitsMap = new Map();

    for (const a of rows) {
      const umps = normalizeUmpires(a.umpires);

      const appears = POSITIONS_ANY.some((p) => getSlotId(umps?.[p]) === uid);
      if (!appears) continue;

      totalGames += 1;
      totalVisits += 1;

      if (getSlotId(umps?.H) === uid) totalHomes += 1;
      if (getSlotId(umps?.R) === uid) totalClock += 1;
      if (getSlotId(umps?.OR) === uid) totalReplays += 1;

      for (const p of BASES) {
        if (getSlotId(umps?.[p]) === uid) totalBases += 1;
      }

      const estadio = (a.stadiumName || "").toString().trim();
      const ciudad = (a.stadiumCity || "").toString().trim();
      const key = `${ciudad}||${estadio}`;
      visitsMap.set(key, (visitsMap.get(key) || 0) + 1);
    }

    return res.json({
      seasonId: sid,
      umpireId: uid,
      league: league ? String(league).trim() : null,
      totals: {
        totalGames,
        totalHomes,
        totalBases,
        totalClock,
        totalReplays,
        totalVisits,
      },
    });
  } catch (err) {
    console.error("GET /stats/summary error:", err);
    return res.status(500).json({ error: "Error calculando resumen" });
  }
});

export default router;
