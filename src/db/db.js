import pg from "pg";
import { Pool } from "pg";
import "dotenv/config";

// if (!process.env.DATABASE_URL) {
// 	throw new Error("DATABASE_URL is not defined in environment variables");
// }

const pool = new Pool({
	user: process.env.DATABASE_USER,
	password: process.env.DATABASE_PASSWORD,
	host: process.env.DATABASE_HOST,
	port: process.env.DATABASE_PORT,
	database: process.env.DATABASE_NAME,
	ssl: {
		required:false
	},
});

// const pool = new Pool({
// 	connectionString: process.env.DATABASE_URL,
// 	ssl: {
// 		rejectUnauthorized: false
// 	}
// });

pool.connect((err, client, release) => {
	if (err) {
		console.error("Error connecting to the database:", err.stack);
	} else {
		console.log("Connected to the database");
		release();
	}
});
export { pool };
