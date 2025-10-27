// src/routes/users.routes.js
import { Router } from "express";
import {
  createUserController,
  createPersonalProfileController,
} from "../controllers/users.controller.js";

const router = Router();

router.post("/register", createUserController);
router.post("/:userId/personal-profile", createPersonalProfileController);

export default router;
