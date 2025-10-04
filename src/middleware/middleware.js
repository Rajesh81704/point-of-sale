import jwt from "jsonwebtoken";
import "dotenv/config";

const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = process.env;
const authenticateAccessToken = (req, res, next) => {
	const authHeader = req.headers.authorization;
	if (!authHeader) return res.status(401).json({ error: "Authorization header missing" });
	const token = authHeader.split(" ")[1];
	if (!token) return res.status(401).json({ error: "Token missing" });
	jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
		if (err) return res.status(403).json({ error: "Invalid access token" });
		req.user = user;
		next();
	});
};

const authenticateRefreshToken = (req, res, next) => {
	const token = req.body.refreshToken;
	if (!token) return res.status(401).json({ error: "Refresh token missing" });
	jwt.verify(token, REFRESH_TOKEN_SECRET, (err, user) => {
		if (err) return res.status(403).json({ error: "Invalid refresh token" });
		req.user = user;
		next();
	});
};

export { authenticateAccessToken, authenticateRefreshToken };
