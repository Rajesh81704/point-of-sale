import express from "express";
import { authRouter } from "./routes/auth.route.js";
const app = express();
const PORT = process.env.PORT;
if (!PORT) {
	throw new Error("PORT is not defined in environment variables");
}
import "dotenv/config";
import cors from "cors";
import bodyParser from "body-parser";
import { productRouter } from "./routes/product.route.js";
import cron from "node-cron";
if (!process.env.URL) {
	throw new Error("URL is not defined in environment variables");
}

app.use(bodyParser.json());
app.use(express.json());
app.use(cors());

app.use(express.json());
// routes for authentication

app.use("/auth", authRouter);

app.get("/", (req, res) => {
	res.send("Hello World!");
});

cron.schedule("13 0 * * *", async () => {
	console.log("Running a task every day at midnight");
	try {
		const res = await fetch(process.env.URL, {
			method: "GET",
		});
		const data = await res.text();
		console.log("Response:", data);
	} catch (error) {
		console.error("Error during fetch:", error);
	}
});
// routes for products

app.use("/product", productRouter);

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
