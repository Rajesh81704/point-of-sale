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

const getUserDtlsWithToken = async (token) => {
	const client = await pool.connect();
	try {
		client.query("BEGIN");
		const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
		const userId = decoded.id;
		const userQuery =
			"select pk as id, username, email, phoneNo, additional_dtls, profile_image from users where pk=$1";
		const userResult = await client.query(userQuery, [userId]);
		client.query("COMMIT");
		if (userResult.rows.length === 0) {
			client.query("ROLLBACK");
			return null;
		}
		return userResult.rows[0];
	} catch (err) {
		console.error("Error fetching user details:", err);
		client.query("ROLLBACK");
		return null;
	}finally {
		client.release();
	}
};

export { generateAccessToken, generateRefreshToken, getUserDtlsWithToken };
