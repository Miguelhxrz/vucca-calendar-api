// src/controllers/users.controller.js
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

const findRoleId = async (roleName) => {
  const r = await prisma.roles.findUnique({
    where: { name: roleName },
    select: { id: true },
  });
  return r?.id || null;
};

export const createUserController = async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    if (!username || !password || !role) {
      return res
        .status(400)
        .json({ error: "username, password y role son requeridos" });
    }

    const roleId = await findRoleId(String(role).toLowerCase());
    if (!roleId) return res.status(400).json({ error: "Rol inválido" });

    const password_hash = await bcrypt.hash(String(password), 10);

    const user = await prisma.users.create({
      data: {
        role_id: roleId,
        username: String(username),
        password_hash,
      },
      select: { id: true },
    });

    return res.status(201).json({ user_id: Number(user.id) });
  } catch (err) {
    console.error("[createUserController] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
};

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export const createPersonalProfileController = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "userId inválido" });

    const payload = req.body || {};

    const created = await prisma.personal_profiles.create({
      data: {
        user_id: userId,
        photo: payload.photo ?? null,
        first_name: payload.first_name ?? "",
        last_name: payload.last_name ?? "",
        gender: payload.gender ?? "",
        id_letter: payload.id_letter ?? "",
        id_number: payload.id_number ?? "",
        birthdate: parseDate(payload.birthdate),
        marital_status: payload.marital_status ?? "",
        couple_names: payload.couple_names ?? null,
        couple_surnames: payload.couple_surnames ?? null,
        couple_phone: payload.couple_phone ?? null,
        has_driver_license: !!payload.has_driver_license,
        driver_license_expiration: parseDate(payload.driver_license_expiration),
        first_line_descendants: payload.first_line_descendants ?? null,
        address: payload.address ?? "",
        current_state: payload.current_state ?? "",
        birth_city: payload.birth_city ?? "",
        birth_state: payload.birth_state ?? "",
        phone: payload.phone ?? "",
        contact_email: payload.contact_email ?? "",
        has_passport: !!payload.has_passport,
        passport_number: payload.passport_number ?? null,
        passport_exp_date: parseDate(payload.passport_exp_date),
        has_visa: !!payload.has_visa,
        visa_type: payload.visa_type ?? null,
        visa_exp_date: parseDate(payload.visa_exp_date),
        nearest_airport: payload.nearest_airport ?? "",
        education_level: payload.education_level ?? "",
        specialism: payload.specialism ?? null,
        lang_english: !!payload.lang_english,
        lang_italian: !!payload.lang_italian,
        lang_portuguese: !!payload.lang_portuguese,
        bank_name: payload.bank_name ?? "",
        bank_account_number: payload.bank_account_number ?? "",
      },
      select: { id: true },
    });

    return res.status(201).json({ personal_profile_id: Number(created.id) });
  } catch (err) {
    console.error("[createPersonalProfileController] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
};
