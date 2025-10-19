import crypto from "crypto";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { pool } from "../db/db.js";

const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = process.env;
const refreshTokens = new Map();

function generateAccessToken(user) {
	return jwt.sign({ id: user.id }, ACCESS_TOKEN_SECRET, { expiresIn: "60d" });
}

function generateRefreshToken(user) {
	const token = crypto.randomBytes(64).toString("hex");
	refreshTokens.set(user.id, token);
	return token;
}

const getUserDtlsWithToken = async (client, token) => {
	try {
		const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
		const userId = decoded.id;
		const userQuery =
			"select pk as id, username, email, phoneNo, additional_dtls, profile_image from users where pk=$1";
		const userResult = await client.query(userQuery, [userId]);
		if (userResult.rows.length === 0) {
			return null;
		}
		return userResult.rows[0];
	} catch (err) {
		console.error("Error fetching user details:", err);
		return null;
	}
};

export { generateAccessToken, generateRefreshToken, getUserDtlsWithToken };
