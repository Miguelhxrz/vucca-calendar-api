import { Router } from "express";
import prisma from "../lib/prisma.js";
import { adminRequired } from "../middleware/auth.js";

const router = Router();

// Crear (solo firstName y lastName)
router.post("/", adminRequired, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    if (!firstName?.trim() || !lastName?.trim()) {
      return res
        .status(400)
        .json({ error: "firstName y lastName son requeridos" });
    }

    const ump = await prisma.umpire.create({
      data: { firstName: firstName.trim(), lastName: lastName.trim() },
    });

    res.json(ump);
  } catch (e) {
    res.status(400).json({ error: e.message || "Error al crear umpire" });
  }
});

export default router;
