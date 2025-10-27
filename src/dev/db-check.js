import "dotenv/config";
import { prisma } from "../lib/prisma.js";

try {
  const result = await prisma.$queryRaw`SELECT 1 AS ok`;
  console.log("[DB CHECK] OK:", result);
} catch (err) {
  console.error("[DB CHECK] ERROR:", err);
} finally {
  await prisma.$disconnect();
}
