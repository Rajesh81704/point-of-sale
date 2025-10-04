import express from "express";
import {
	authLoginController,
	authRegisterController,
	logoutAuthController,
	isLoggedController,
} from "../controllers/auth.controller.js";
const authRouter = express.Router();

authRouter.post("/logout", logoutAuthController);
authRouter.post("/register", authRegisterController);
authRouter.post("/login", authLoginController);
authRouter.get("/is-logged", isLoggedController);

export { authRouter };
