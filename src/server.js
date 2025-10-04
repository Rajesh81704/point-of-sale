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

app.use(bodyParser.json());
app.use(express.json());
app.use(cors());

app.use(express.json());
// routes for authentication

app.use("/auth", authRouter);

// routes for products

app.use("/product", productRouter);

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
