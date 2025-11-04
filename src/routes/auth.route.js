import express from "express";
import {
	authLoginController,
	authRegisterController,
	logoutAuthController,
	isLoggedController,
	recoverPasswordController, 
	verifyAndChangePasswordController 

} from "../controllers/auth.controller.js";
const authRouter = express.Router();

authRouter.post("/logout", logoutAuthController);
authRouter.post("/register", authRegisterController);
authRouter.post("/login", authLoginController);
authRouter.get("/is-logged", isLoggedController);
authRouter.post("/recover-password", recoverPasswordController);
authRouter.post("/verify-and-change-password", verifyAndChangePasswordController);


export { authRouter };
