// src/controllers/users.controller.js
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";

// ---------- Helpers ----------
const toDateOrNull = (v) => {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !isNaN(v)) return v;

  const s = String(v).trim();
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d) ? null : d;
  }
  // dd/mm/yyyy (o dd-mm-yyyy o dd.mm.yyyy)
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(
      2,
      "0"
    )}T00:00:00`;
    const d = new Date(iso);
    return isNaN(d) ? null : d;
  }
  const p = Date.parse(s);
  return isNaN(p) ? null : new Date(p);
};

const mustDate = (label, v) => {
  const d = toDateOrNull(v);
  if (!d) {
    const err = new Error(
      `Campo de fecha inválido: ${label}. Use YYYY-MM-DD o DD/MM/YYYY`
    );
    err.status = 400;
    throw err;
  }
  return d;
};

// Convierte BigInt ➜ string (solo lo que respondemos)
const bi = (v) => (typeof v === "bigint" ? v.toString() : v);

// ---------- Controllers (arrow functions) ----------

// POST /users/register
export const createUserController = async (req, res) => {
  try {
    const { username, password, role } = req.body || {};

    if (!username || !password || !role) {
      return res.status(400).json({
        error: "username, password y role son requeridos",
      });
    }

    const roleRow = await prisma.roles.findUnique({
      where: { name: role.toLowerCase() },
      select: { id: true },
    });

    if (!roleRow) {
      return res.status(400).json({ error: "Rol inválido" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const created = await prisma.users.create({
      data: {
        username,
        password_hash,
        role_id: roleRow.id,
      },
      select: { id: true, username: true, role_id: true, created_at: true },
    });

    return res.status(201).json({
      user_id: bi(created.id),
      username: created.username,
      role_id: created.role_id, // tu roles.id es tinyint, no BigInt
      created_at: created.created_at,
    });
  } catch (err) {
    console.error("[createUserController] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
};

export const createPersonalProfileController = async (req, res) => {
  const bool = (v) => v === true || v === "true" || v === 1 || v === "1";
  const str = (s) => (s ?? "").toString();
  const nullIfEmpty = (s) => {
    const v = s == null ? "" : String(s).trim();
    return v === "" ? null : v;
  };
  const dateOrNull = (v) => {
    if (!v && v !== 0) return null;
    if (v instanceof Date && !isNaN(v)) return v;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return new Date(
        `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`
      );
    }
    const p = Date.parse(s);
    return isNaN(p) ? null : new Date(p);
  };

  try {
    const user_id = Number(req.params.userId);
    if (!user_id) return res.status(400).json({ error: "invalid userId" });

    const b = req.body || {};

    // Normaliza hijos aceptando distintos formatos del front
    const rawChildren =
      (Array.isArray(b.children) && b.children) ||
      (Array.isArray(b.first_line_descendants) && b.first_line_descendants) ||
      (Array.isArray(b.First_offspring) && b.First_offspring) ||
      [];

    const children = rawChildren
      .map((c) => {
        const name =
          c?.child_name ??
          c?.name ??
          c?.fullname ??
          (typeof c === "string" ? c : "");
        const bd = c?.birthdate ?? c?.dob ?? c?.date ?? null;
        return {
          user_id,
          child_name: str(name).trim(),
          birthdate: dateOrNull(bd),
        };
      })
      .filter((c) => c.child_name.length > 0);

    // Datos del perfil (SIN first_line_descendant_id aún)
    const data = {
      user_id,
      first_name: str(b.first_name),
      last_name: str(b.last_name),
      gender: nullIfEmpty(b.gender),
      id_letter: str(b.id_letter),
      id_number: str(b.id_number),
      birthdate: dateOrNull(b.birthdate),
      marital_status: nullIfEmpty(b.marital_status),
      couple_names: nullIfEmpty(b.couple_names),
      couple_surnames: nullIfEmpty(b.couple_surnames),
      couple_phone: nullIfEmpty(b.couple_phone),
      has_driver_license: bool(b.has_driver_license),
      driver_license_expiration: dateOrNull(b.driver_license_expiration),
      address: str(b.address),
      current_state: str(b.current_state),
      birth_city: str(b.birth_city),
      birth_state: str(b.birth_state),
      nearest_airport: str(b.nearest_airport),
      phone: str(b.phone),
      contact_email: str(b.contact_email),
      has_passport: bool(b.has_passport),
      passport_number: nullIfEmpty(b.passport_number),
      passport_exp_date: dateOrNull(b.passport_exp_date),
      has_visa: bool(b.has_visa),
      visa_type: nullIfEmpty(b.visa_type),
      visa_exp_date: dateOrNull(b.visa_exp_date),
      education_level: str(b.education_level),
      specialism: nullIfEmpty(b.specialism),
      lang_english: bool(b.lang_english),
      lang_italian: bool(b.lang_italian),
      lang_portuguese: bool(b.lang_portuguese),
      bank_name: str(b.bank_name),
      bank_account_number: str(b.bank_account_number),
      // NO mandes first_line_descendants aquí; ahora es FK y lo ponemos abajo
    };

    // Upsert del perfil
    const personal = await prisma.personal_profiles.upsert({
      where: { user_id },
      update: data,
      create: data,
      select: { id: true, user_id: true },
    });

    // Reemplaza hijos si se enviaron
    if (children.length) {
      await prisma.user_children.deleteMany({ where: { user_id } });
      await prisma.user_children.createMany({
        data: children,
        skipDuplicates: true,
      });

      // Obtén el primer hijo recien guardado (por id más bajo) y enlázalo
      const firstChild = await prisma.user_children.findFirst({
        where: { user_id },
        orderBy: { id: "asc" },
        select: { id: true },
      });

      if (firstChild) {
        await prisma.personal_profiles.update({
          where: { user_id },
          data: { first_line_descendant_id: firstChild.id },
        });
      }
    }

    return res.json({ personal_id: personal.id });
  } catch (err) {
    console.error("[createPersonalProfileController] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
};

// POST /users/register/:userId/medical-profile
export const createMedicalProfileController = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "userId inválido" });

    const u = await prisma.users.findUnique({ where: { id: userId } });
    if (!u) return res.status(404).json({ error: "Usuario no existe" });

    const b = req.body || {};

    const created = await prisma.medical_profiles.create({
      data: {
        user_id: userId,
        blood_type: b.blood_type ?? null,
        allergies: b.allergies ?? null,
        chronic_diseases: b.chronic_diseases ?? null,
        medications: b.medications ?? null,
        emergency_contact_name: b.emergency_contact_name ?? null,
        emergency_contact_phone: b.emergency_contact_phone ?? null,
      },
      select: { id: true, user_id: true, created_at: true },
    });

    return res.status(201).json({
      medical_profile_id: bi(created.id),
      user_id: bi(created.user_id),
      created_at: created.created_at,
    });
  } catch (err) {
    console.error("[createMedicalProfileController] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
};
