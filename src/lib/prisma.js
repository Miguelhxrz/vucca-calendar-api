// src/lib/prisma.js
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();

// opcional: cerrar conexión al terminar
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export default prisma;
