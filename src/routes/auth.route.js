import express from "express";
import {
  authLoginController,
  authRegisterController,
  logoutAuthController,
} from "../controllers/auth.controller.js";
const authRouter = express.Router();

authRouter.post("/logout", logoutAuthController);
authRouter.post("/register", authRegisterController);
authRouter.post("/login", authLoginController);

export { authRouter };
