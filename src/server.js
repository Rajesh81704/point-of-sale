import express from "express";
import { authRouter } from "./routes/auth.route.js";
import { requestTimeout } from "./middleware/middleware.js";
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

import compression from "compression";
import helmet from "helmet";
import morgan from "morgan";

app.use(helmet());          
app.use(compression());    
app.use(express.json());
app.use(morgan("tiny"));   

app.use(bodyParser.json());
app.use(express.json());
app.use(cors());

app.use(express.json());
app.use(requestTimeout(10000));

// routes for authentication
app.use("/auth", authRouter);

// app.get("/", (req, res) => {
// 	res.send("Welcome to the ERP+POS system");
// });

// cron.schedule("*/13 * * * *", async () => {
// 	try {
// 		const response = await fetch(process.env.URL);
// 		console.log("Cron job executed. Response:", await response.text());
// 	} catch (error) {
// 		console.error("Error during cron job execution:", error);
// 	}
// });
// routes for products

app.use("/product", productRouter);

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
