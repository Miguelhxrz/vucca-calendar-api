import express from "express";
import cors from "cors";
import usersRoutes from "./routes/users.routes.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.use("/users", usersRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));
