import express from "express";
import { authenticateAccessToken as protectedRoute } from "../middleware/middleware.js";
import {
	addProductController,
	checkoutProductController,
	removeItemController,
	proceedCartController,
	finalizeSaleController,
	showProductController,
	stockAlertController,
	salesReportController,
	deleteProductController
} from "../controllers/product.controller.js";

const productRouter = express.Router();

productRouter.post("/add-product", protectedRoute, addProductController);

// productRouter.post("/checkout", protectedRoute, checkoutProductController);

// productRouter.post("/remove-item", protectedRoute, removeItemController);

productRouter.post("/proceed-cart", protectedRoute, proceedCartController);

productRouter.post("/finalize-sale", protectedRoute, finalizeSaleController);

productRouter.get("/show-product/:searchKey", protectedRoute, showProductController);

productRouter.get("/stock-alert", protectedRoute, stockAlertController);

productRouter.post("/sales-report", protectedRoute, salesReportController);

productRouter.post("/sales-report", protectedRoute, salesReportController);

productRouter.post("/delete-product", protectedRoute, deleteProductController);

export { productRouter };

