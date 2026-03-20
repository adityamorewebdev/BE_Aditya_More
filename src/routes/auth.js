import { Router } from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import validate from "../middleware/validate.js";
import hmacAuth from "../middleware/hmacAuth.js";
import jwtAuth from "../middleware/jwtAuth.js";
import { registerSchema, loginSchema } from "../schemas/authSchema.js";
import {
  register,
  login,
  getProfile,
} from "../controllers/authController.js";

const router = Router();

router.post(
  "/register",
  hmacAuth,
  validate(registerSchema),
  asyncHandler(register)
);

router.post(
  "/login",
  hmacAuth,
  validate(loginSchema),
  asyncHandler(login)
);

router.get(
  "/profile",
  hmacAuth,
  jwtAuth,
  asyncHandler(getProfile)
);

export default router;