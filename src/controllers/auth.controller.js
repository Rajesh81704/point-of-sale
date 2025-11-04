import { pool } from "../db/db.js";
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
import { generateAccessToken, generateRefreshToken } from "../utils/util.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import {redisClient} from "../db/redis.js";

import {SmtpService} from "../utils/smtp.service.js";

const refreshTokens = new Map();
const logoutAuthController = (req, res) => {
	const { refreshToken } = req.body;
	if (!refreshToken) return res.sendStatus(400);

	const userId = [...refreshTokens.entries()].find(([_, token]) => token === refreshToken)?.[0];

	if (userId) {
		refreshTokens.delete(userId);
	}

	res.sendStatus(204);
};

const authRegisterController = async (req, res) => {
	const client = await pool.connect();
	const { username, password, email, phoneNo, additional_dtls, profile_image, upiId } = req.body;
	if (!username || !password || !email || !phoneNo) {
		return res.status(400).json({ error: "All fields are required" });
	}
	const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
	try {
		await client.query("BEGIN");
		const checkUserNameQuery = `
            SELECT COUNT(*) 
            FROM users 
            WHERE username = $1 OR email = $2 OR phoneNo = $3`;
		const userResult = await client.query(checkUserNameQuery, [username, email, phoneNo]);
		if (parseInt(userResult.rows[0].count, 10) > 0) {
			await client.query("ROLLBACK");
			return res.status(409).json({ error: "Username, email, or phone number already exists" });
		}
		const insertUserQuery = `
            INSERT INTO users (username, password, email, phoneNo, created_dt, additional_dtls, profile_image) 
            VALUES ($1, $2, $3, $4, now(), $5, $6, $7::jsonb) 
            RETURNING *`;
			
		const insertUserResult = await client.query(insertUserQuery, [
			username,
			hashedPassword,
			email,
			phoneNo,
			JSON.stringify({ upi_id: upiId }),
			profile_image,
		]);

		if (insertUserResult.rows.length === 0) {
			await client.query("ROLLBACK");
			return res.status(500).json({ error: "Failed to register user" });
		}
		await client.query("COMMIT");
		return res
			.status(201)
			.json({ message: "User registered successfully", user: insertUserResult.rows[0] });
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("Error registering user:", err);
		return res.status(500).json({ error: "Internal server error" });
	} finally {
		client.release();
	}
};

const authLoginController = async (req, res) => {
	const { username, password } = req.body;
	if (!username || !password)
		return res.status(400).json({ error: "Username and password are required" });
	const client = await pool.connect();
	try {
		client.query("BEGIN");
		const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
		const userQuery = "select count(*) from users where username=$1 and password=$2";
		const userResult = await client.query(userQuery, [username, hashedPassword]);
		if (parseInt(userResult.rows[0].count) === 0) {
			return res.status(401).json({ error: "Invalid username or password" });
		}
		const userIdQuery = "select pk as id from users where username=$1";
		const userIdResult = await client.query(userIdQuery, [username]);
		const user = { id: userIdResult.rows[0].id };
		const accessToken = generateAccessToken(user);
		const refreshToken = generateRefreshToken(user);
		return res.status(200).json({ accessToken, refreshToken });
	} catch (err) {
		console.error("Error during login:", err);
		return res.status(500).json({ error: "Internal server error" });
	} finally {
		client.release();
	}
};

const isLoggedController = async (req, res) => {
	const user = await getUserDtlsWithToken(req.headers["authorization"]?.split(" ")[1]);
	if (!user) {
		return res.status(401).json({ message: "User is not logged in", isLogged: false });
	}
	return res.status(200).json({ message: "User is logged in", user, isLogged: true });
};



const recoverPasswordController = async (req, res) => {
	const { email, phoneNo } = req.body;
	if (!email && !phoneNo) {
		return res.status(400).json({ error: "Email or phone number is required" });
	}
	const client = await pool.connect();
	try {
		const getEmailQuery = `select pk, email from users where ${email ? "email=$1" : "phoneNo=$1"}`;
		const userResult = await client.query(getEmailQuery, [email || phoneNo]);
		if (userResult.rows.length === 0) {
			return res.status(404).json({ error: "User not found" });
		}
		const userEmail = userResult.rows[0].email;
		const userId = userResult.rows[0].pk;
		const otp = generateOTP(4);
		await redisClient.set(userId, otp, "EX", 300);
		const smtpService = new SmtpService();
		await smtpService.sendMail({
			to: userEmail,
			subject: "Password Recovery OTP",
			text: `Your OTP for password recovery is: ${otp}`,
			html: `<p>Your OTP for password recovery is: <strong>${otp}</strong></p>`,
		});

		return res.status(200).json({ message: "OTP sent successfully", otp });
	} catch (err) {
		console.error("Error recovering password:", err);
		return res.status(500).json({ error: "Internal server error" });
	} finally {
		client.release();
	}
};

const generateOTP = (noOfDigits) => {
	const otp = Math.random().toString().slice(-noOfDigits);
	return otp;
}

const verifyAndChangePasswordController = async (req, res) => {
	const { userId, otp, newPassword } = req.body;
	if (!userId || !otp || !newPassword) {
		return res.status(400).json({ error: "User ID, OTP, and new password are required" });
	}
	try {
		const savedOtp=await redisClient.get(userId);
		if (savedOtp !== otp) {
			return res.status(400).json({ error: "Invalid or expired OTP" });
		}
		const client = await pool.connect();
		const passwordChanged=await changePassword(client, userId, newPassword);
		if(!passwordChanged){
			return res.status(500).json({ error: "Failed to change password" });
		}
		await redisClient.del(userId);
		return res.status(200).json({ message: "Password changed successfully" });
	} catch (err) {
		console.error("Error changing password:", err);
		return res.status(500).json({ error: "Internal server error" });
	} finally {
		client.release();
	}
}

const changePassword = async (client, userId, newPassword) => {
	const hashedPassword=await bcrypt.hash(newPassword, 64);
	const updatePasswordQuery = "update users set password=$1 where pk=$2 returning pk";
	const result = await client.query(updatePasswordQuery, [hashedPassword, userId]);
	return result.rowCount > 0;
};

export { 
	logoutAuthController, 
	authRegisterController, 
	authLoginController, 
	isLoggedController, 
	recoverPasswordController, 
	verifyAndChangePasswordController 
};
