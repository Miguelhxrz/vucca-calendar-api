// src/utils/normalizeUmpiresPayload.js
export const normalizeUmpiresPayload = (raw) => {
  if (!raw) return {};

  let u = raw;

  if (typeof u === "string") {
    try {
      u = JSON.parse(u);
    } catch {
      return {};
    }
  }

  if (typeof u !== "object") return {};

  const POSITIONS = ["H", "R", "1B", "2B", "3B", "LF", "LR", "OR"];

  const normalizeSlot = (slot) => {
    if (!slot) return { umpireId: null, name: "", double: "" };

    if (typeof slot === "number") {
      return { umpireId: slot, name: "", double: "" };
    }

    if (typeof slot === "string") {
      const n = Number(slot);
      return { umpireId: Number.isFinite(n) ? n : null, name: "", double: "" };
    }

    const rawId = slot.umpireId ?? slot.umpire_id ?? slot.id ?? slot.ID ?? null;
    const n = Number(rawId);

    return {
      ...slot,
      umpireId: Number.isFinite(n) && n > 0 ? n : null,
      name: slot.name ?? "",
      double: slot.double ?? "",
    };
  };

  const out = {};
  for (const p of POSITIONS) out[p] = normalizeSlot(u[p]);
  return out;
};
