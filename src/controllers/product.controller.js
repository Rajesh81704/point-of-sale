import { pool } from "../db/db.js";
import { addStock, checkProductExists, updateStock, addStockOfNonQuantizedItem, updateStockOfNonQuantizedItem } from "../utils/product.utils.js";
import { getUserDtlsWithToken } from "../utils/util.js";
import { addProduct } from "../utils/product.utils.js";
import { redisClient } from "../db/redis.js";

const addProductController = async (req, res) => {
	const { barcode, name, price, quantity, productImage, category, brand, add_dtls } = req.body;
	let barcodeTrimmed = barcode ? barcode.trim() : "n/a";
	if (quantity <= 0 || price <= 0) return res.status(400).json({ error: "Price and quantity must be greater than zero" });
	const isQuantizedItem = req.body.isQuantizedItem || false;
    if(barcodeTrimmed==="n/a"||barcodeTrimmed.isEmpty()) barcodeTrimmed = isQuantizedItem===false ? 'N/A-' + Date.now() : 'Q-' + Date.now();
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const user = await getUserDtlsWithToken(req.headers["authorization"]?.split(" ")[1]);
		const userId = user.id;
		if(isQuantizedItem===false && barcodeTrimmed.includes("N/A-")){
			console.log(barcodeTrimmed, name, price, quantity, productImage, category, brand, add_dtls, userId)
			const result = await addWithOutBarcode(client, barcodeTrimmed, name, price, quantity, productImage, category, brand, add_dtls, userId)
			return res.status(201).json(result);
		}else{
		if (await checkProductExists(client, barcodeTrimmed, userId)) {
			const stock = await updateStock(client, barcodeTrimmed, quantity, userId);
			console.log("stock", stock);
			await client.query("COMMIT");
			if (!stock) throw new Error("Failed to update stock");
			return res.status(200).json({ message: "Stock updated", stock });
		}
		const productResult = await addProduct( client, barcodeTrimmed, name, price, name, userId, productImage, category, brand );
		if (!productResult) throw new Error("Failed to add product");
		const stock = await addStock(client, productResult.pk, quantity);
		await client.query("COMMIT");
		return res.status(201).json({
			message: "New product added",
			product: productResult,
			stock,
		});
	}
	} catch (error) {
		await client.query("ROLLBACK");
		console.error("Error adding product:", error);
		res.status(500).json({ error: "Internal server error" });
	} 
};

const addWithOutBarcode = async ( client, barcode, name, price, quantity, productImage, category, brand, add_dtls, userId ) => {
	if (quantity <= 0 || price <= 0) throw new Error("Price and quantity must be greater than zero");
	try {
		await client.query("BEGIN");
		const checkIsExistsQuery = `SELECT COUNT(*) FROM products p WHERE p.name=$1 AND p.user_id=$2`
		const isExistsResult = await client.query(checkIsExistsQuery, [name, userId]);

		if (parseInt(isExistsResult.rows[0].count) > 0) {
		const getBarcodeQuery = `SELECT p.barcode FROM products p WHERE p.name=$1 AND p.user_id=$2`
		const barcodeResult = await client.query(getBarcodeQuery, [name, userId]);
		const barcode = barcodeResult.rows[0].barcode;
		if (!barcode) throw new Error("Barcode not found for existing product");

		const getProductIdQuery = "SELECT pk FROM products WHERE barcode = $1 AND user_id=$2";
		const productResult = await client.query(getProductIdQuery, [barcode, userId]);
		if (productResult.rows.length === 0) throw new Error("Product not found");
		const productId = productResult.rows[0].pk;

		const stock = await updateStockOfNonQuantizedItem( client, productId, add_dtls );
		if (!stock) throw new Error("Failed to update stock for non-quantized item");
		await client.query("COMMIT");
		return { message: "Stock updated for non-quantized item", stock };
    	}
		const productResult = await addProduct( client, barcode, name, price, name, userId, productImage, category, brand );
		if (!productResult) throw new Error("Failed to add product");
		console.log("New product added with barcode:", productResult.barcode);
		const stock = await addStockOfNonQuantizedItem(client, add_dtls, productResult.pk);

		await client.query("COMMIT");
		return { message: "New product added", product: productResult, stock };

	} 
	catch (error) {
		await client.query("ROLLBACK");
		console.error("Error in addWithOutBarcode:", error);
		throw error;
	} finally {
		client.release();
	}
}

const checkoutProductController = async (req, res) => {
		const { barcode } = req.body;
		if (!barcode) return res.status(400).json({ error: "Barcode is required" })
		const client = await pool.connect();
		client.query("BEGIN");
		const user = await getUserDtlsWithToken(req.headers["authorization"]?.split(" ")[1]);
		if (!user) {
			await client.query("ROLLBACK");
			return res.status(401).json({ error: "Unauthorized" });
		}
		const userId = user.id;
		const checkProductId =
			"select p.pk from products p inner join users u on u.pk=p.user_id where user_id=$1 and p.barcode=$2";
		const productIdResult = await client.query(checkProductId, [userId, barcode]);
		if (productIdResult.rows.length === 0) 
			return res.status(404).json({ error: "Product not found" })

		const productId = productIdResult.rows[0].pk;
		console.log("productId", productId);
		const checkStock = "select stock from stocks where product_id=$1";
		const stockResult = await client.query(checkStock, [productId]);
		if (stockResult.rows.length === 0 || stockResult.rows[0].stock <= 0)
			return res.status(404).json({ error: "Product not found or out of stock" });

		const updateStockQuery = "update stocks set stock=stock-1 where product_id=$1 returning *";
		if(barcode.startsWith("N/A-")){
			const updateStockQuery = "update stocks set stock=stock-1, add_dtls=jsonb_set(add_dtls, '{weight}', to_jsonb((add_dtls->>'weight')::numeric - $2::numeric)) where product_id=$1 returning *";
			const result = await client.query(updateStockQuery, [productId, req.body.weight]);
			client.query("COMMIT");
			if (result.rows.length === 0)
				return res.status(400).json({ error: "Failed to add item to cart" });
			client.release();
			return res.status(200).json({ message: "Item added to cart", stock: result.rows[0] });
		}

		const result = await client.query(updateStockQuery, [productId]);
		client.query("COMMIT");
		if (result.rows.length === 0) 
			return res.status(400).json({ error: "Failed to add item to cart" });
		client.release();
		return res.status(200).json({ message: "Item added to cart", stock: result.rows[0] });
};
 
const removeItemController = async (req, res) => {
		const { barcode } = req.body;
		if (!barcode) {
			return res.status(400).json({ error: "Barcode is required" });
		}
		const client = await pool.connect();
		const checkProductId = "select pk from products where barcode=$1";
		const productIdResult = await client.query(checkProductId, [barcode]);
		if (productIdResult.rows.length === 0) {
			return res.status(404).json({ error: "Product not found" });
		}
		const productId = productIdResult.rows[0].pk;
		const checkStock = "select stock from stocks where product_id=$1";
		const stockResult = await pool.query(checkStock, [productId]);
		if (stockResult.rows.length === 0 || stockResult.rows[0].stock <= 0) 
			return res.status(404).json({ error: "Product not found or out of stock" });
		
		if(barcode.startsWith("N/A-")){
			const query="update stocks set stock=stock+$1, add_dtls=jsonb_set(add_dtls, '{weight}', to_jsonb((add_dtls->>'weight')::numeric + $1::numeric)) where product_id=$2 returning *"
			const result = await client.query(query, [req.body.weight, productId]);
			if (result.rows.length === 0)
				return res.status(400).json({ error: "Failed to remove item from cart" });
			return res.status(200).json({ message: "Item removed from cart", stock: result.rows[0] });
		}

		const removeStockQuery = "update stocks set stock=stock+1 where product_id=$1 returning *";
		const result = await client.query(removeStockQuery, [productId]);
		if (result.rows.length === 0) 
			return res.status(400).json({ error: "Failed to remove item from cart" });
		
		return res.status(200).json({ message: "Item removed from cart" });
}

const proceedCartController = async (req, res) => {
		const { barcodes } = req.body;
		let cartItemList = [];
		let totalAmount = 0;
		let client = await pool.connect();

		if (!barcodes || barcodes.length === 0) {
			return res.status(400).json({ error: "Cart is empty" });
		}
		for (let i = 0; i < barcodes.length; i++) {
			let getProduct = `
				SELECT p.barcode, p.name, p.description AS desc, p.price 
				FROM products p 
				WHERE p.barcode = $1
			`;
			let barcodeTrimmed = barcodes[i].trim();
			if(barcodes[i].startsWith("N/A-")){
				const weight = barcodes[i].split("|")[1].trim();
				let barcodeOnly = barcodes[i].split("|")[0].trim();
				barcodeTrimmed = barcodeOnly;
				console.log("weight", weight);
				getProduct = `
				SELECT p.barcode, p.name, p.description AS desc, (s.add_dtls->>'pricePerWeight')::numeric AS price
				FROM products p
				JOIN stocks s ON p.pk = s.product_id
				WHERE p.barcode = $1
			`;	
			try {
				client.query("BEGIN");
				const productResult = await client.query(getProduct, [barcodeTrimmed]);
				if (productResult.rows.length === 0) {
					return res.status(404).json({
						error: `Product with barcode ${cartList[i]} not found in cart`,
					});
				}
				const product = productResult.rows[0];
				totalAmount += parseFloat(product.price) * parseFloat(weight);

				cartItemList.push({
					barcode: product.barcode,
					name: product.name,
					description: product.desc,
					price: parseFloat(product.price),
				});
			} catch (err) {
				console.error(err);
				await client.query("ROLLBACK");
				return res.status(500).json({ error: "Database query failed" });
			}
		}
		const cartId = "cart_" + Date.now();
		const addCartListQuery = `
		insert into carts (cart_id, item_details, total_amount, created_dt, payment_mode) values ($1,$2,$3,now(),'pending') returning *`;
		const insertCartListResult = await pool.query(addCartListQuery, [
			cartId,
			JSON.stringify(cartItemList),
			totalAmount,
		]);
		client.query("COMMIT");
		if (insertCartListResult.rows.length === 0) {
			return res.status(500).json({ error: "Failed to proceed cart" });
		}
		client.release();
		return res.status(200).json({
			message: "Cart proceeded",
			cartId: insertCartListResult.rows[0].cart_id,
			totalAmount: totalAmount,
			items: cartItemList,
		});
};

}


const finalizeSaleController = async (req, res) => {
	const { customerName, customerPhone, paymentMode, cartId } = req.body;
	if (!customerName || !customerPhone || !paymentMode || !cartId) {
		return res.status(400).json({ error: "All fields are required" });
	}
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		const userDtls= await getUserDtlsWithToken(req.headers["authorization"]?.split(" ")[1]);
		const upiId=userDtls.additional_dtls.upiId ||"rajeshkumaryadav98@oksbi"

		const getCartDetails = "select item_details, total_amount from carts where cart_id=$1";
		const cartDetailsResult = await client.query(getCartDetails, [cartId]);

		if (cartDetailsResult.rows.length === 0) {
			await client.query("ROLLBACK");
			return res.status(404).json({ error: "Cart not found" });
		}

		const cartItemList = cartDetailsResult.rows[0].item_details;
		if (cartItemList.length === 0) {
			await client.query("ROLLBACK");
			return res.status(400).json({ error: "Cart is empty" });
		}

		const total_amount = cartDetailsResult.rows[0].total_amount;
		const bill = {
			customerName: customerName,
			customerPhone: customerPhone,
			paymentMode: paymentMode,
			items: cartItemList,
			totalAmount: total_amount,
			date: new Date().toLocaleString(),
			paymentLink: "",
		};
		
		const upiQrContent=`upi://pay?pa=${upiId}&pn=Rajesh&am=${total_amount}&cu=INR&aid=uGICAgMDh6cTFFQ`;
		bill.paymentLink=upiQrContent;
		const addBillQuery =
			"update carts set custname=$1, custphone=$2, payment_mode=$3 where cart_id=$4 returning *";
		const insertBillResult = await client.query(addBillQuery, [
			customerName,
			customerPhone,
			paymentMode,
			cartId,
		]);

		if (insertBillResult.rows.length === 0) {
			await client.query("ROLLBACK");
			return res.status(500).json({ error: "Failed to finalize sale" });
		}
		const user = await getUserDtlsWithToken(req.headers["authorization"]?.split(" ")[1]);
		if (!user) {
			await client.query("ROLLBACK");
			return res.status(401).json({ error: "Unauthorized" });
		}
		const userId = user.id;

		const orderCheckedOut =
			"update carts set user_id= $1, order_status=$2 where cart_id=$3 returning *";
		const orderCheckedOutResult = await client.query(orderCheckedOut, [userId, "completed", cartId]);

		if (orderCheckedOutResult.rows.length === 0) {
			await client.query("ROLLBACK");
			return res.status(500).json({ error: "Failed to update order status" });
		}

		await client.query("COMMIT");
		return res.status(200).json({ message: "Sale finalized", bill: bill });
	} catch (error) {
		await client.query("ROLLBACK");
		console.error("Error finalizing sale:", error);
		return res.status(500).json({ error: "Internal server error" });
	} finally {
		client.release();
	}
};




const showProductController = async (req, res) => {
	const { searchKey } = req.params;
	const authHeader = req.headers["authorization"];

	if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

	const token = authHeader.split(" ")[1];
	const cacheKey = `products:${token}:${searchKey || "*"}`;

	let client;
	const timeoutMs = 8000; 
	const queryWithTimeout = (promise, ms) =>
		Promise.race([
			promise,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error("Query timeout")), ms)
			),
		]);

	try {
		const returnObj={
			products: [],
			cached: false
		}
		const cached = await redisClient.get(cacheKey);
		if (cached){
			returnObj.cached=true
			returnObj.products=JSON.parse(cached).products
			return res.status(200).json(returnObj);
		} 
		client = await pool.connect();
		const user = await getUserDtlsWithToken(token);
		if (!user) {
			client.release();
			return res.status(401).json({ error: "Unauthorized" });
		}
		const userId = user.id;
		if (!searchKey || searchKey.trim() === "") {
			client.release();
			return res.status(400).json({ error: "Search key is required" });
		}
		let query, params;
		if (searchKey === "*") {
			query = `
				SELECT p.barcode, p.name, p.price, p.description, s.stock
				FROM products p
				JOIN stocks s ON p.pk = s.product_id
				WHERE p.user_id = $1
				ORDER BY p.created_dt DESC
				limit 50
			`;
			params = [userId];
		} else {
			query = `
				SELECT p.barcode, p.name, p.price, p.description, s.stock
				FROM products p
				JOIN stocks s ON p.pk = s.product_id
				WHERE p.user_id = $1 AND (p.name ILIKE $2 OR p.barcode ILIKE $2)
				ORDER BY p.created_dt DESC
			`;
			params = [userId, `%${searchKey}%`];
		}
		const result = await queryWithTimeout(client.query(query, params), timeoutMs);
		await redisClient.setEx(cacheKey, 30, JSON.stringify({ products: result.rows }));
		if(!cached) {
			returnObj.cached=false
			returnObj.products=result.rows
		}
		return res.status(200).json(returnObj);
	} catch (err) {
	console.error("❌ Product API Error →", err.stack || err);
	if (client) {
		try {
		await client.query("ROLLBACK").catch(() => {});
		client.release();
		} catch (e) {
		console.error("Error releasing client:", e);
		}
	}
	return res.status(500).json({ error: err.message });
	} finally {
	if (client) {
		try {
		client.release();
		} catch (e) {
		console.error("Final release failed:", e);
		}
	}
	}
}

const stockAlertController = async (req, res) => {
	const client = await pool.connect();
	const lowStockQuery = `
		SELECT p.barcode, p.name, s.stock
		FROM products p
		INNER JOIN stocks s ON p.pk = s.product_id
		INNER JOIN users u ON u.pk = p.user_id
		WHERE (s.stock < s.last_stock * 0.2 OR s.stock < 10) AND u.pk = $1
		ORDER BY s.stock ASC
	`;
	try {
		await client.query("BEGIN");
		const user = await getUserDtlsWithToken(req.headers["authorization"]?.split(" ")[1]);
		if (!user) {
			await client.query("ROLLBACK");
			return res.status(401).json({ error: "Unauthorized" });
		}
		const userId = user.id;
		const result = await client.query(lowStockQuery, [userId]);
		await client.query("COMMIT");
		return res.status(200).json({ lowStockProducts: result.rows });
	} catch (err) {
		console.error("Error generating stock alert:", err);
		await client.query("ROLLBACK");
		return res.status(500).json({ error: "Internal server error" });
	} finally {
		client.release();
	}
};

const salesReportController = async (req, res) => {
	const { days } = req.body;
	if (!days || isNaN(days) || days <= 0) {
		return res.status(400).json({ error: "Invalid number of days" });
	}
	const client = await pool.connect();
	try {
		client.query("BEGIN");
		const user = await getUserDtlsWithToken(req.headers["authorization"]?.split(" ")[1]);
		if (!user) {
			return res.status(401).json({ error: "Unauthorized" });
		}
		const userId = user.id;
		const salesData = await periodicSalesReport(client, days, userId);
		client.query("COMMIT");
		if (salesData.length === 0) {
			return res.status(404).json({ error: "No sales data found for the specified period" });
			// Removed unreachable code
		}

		res.status(200).json(salesData);
		client.release();
	} catch (err) {
		res.status(500).json({ error: "Internal server error" });
	}
};

const periodicSalesReport = async (client, days, userId) => {
	client = client || (await pool.connect());
	const reportData = {
		item_details: [],
		total_amount: Number,
		top5Products: [],
		least5Products: [],
		sellChartData: [],
	};
	const reportQuery = `
		select
		CART_ID,
		CONCAT(c.custname, ' | ', c.custphone) as customer_details,
		JSONB_ARRAY_ELEMENTS(item_details)->>'barcode' as barcode,
		JSONB_ARRAY_ELEMENTS(item_details)->>'name' as product_name,
		total_amount as cart_amount,
		payment_mode,
		c.created_dt as sales_date
		from
			CARTS C
		inner join USERS U on
			U.PK = C.USER_ID
		where
			C.CREATED_DT >= NOW() - interval '${days} DAYS'
		order by
			C.CREATED_DT desc`;
	try {
		const result = await client.query(reportQuery);
		if (result.rows.length !== 0) {
			reportData.item_details = result.rows;
			reportData.total_amount = result.rows.reduce(
				(total, item) => total + parseFloat(item.cart_amount),
				0,
			);
			reportData.top5Products = await top5SellingProducts(client, days);
			reportData.least5Products = await leastSellingProducts(client, days);
			const allSells = await allSellsData(client, days);
			reportData.sellChartData = allSells.map((item) => ({
				name: item.name,
				sales: parseInt(item.sales_count),
			}));
		}
		return reportData;
	} catch (err) {
		console.error("Error generating sales report:", err);
		throw err;
	}
};

const top5SellingProducts = async (client, days = 30) => {
	client = client || (await pool.connect());
	const topProductsQuery = `
        SELECT p.barcode, p.name, COUNT(*) AS sales_count
        FROM carts c
        CROSS JOIN LATERAL jsonb_array_elements(c.item_details) AS item
        INNER JOIN products p ON item->>'barcode' = p.barcode
		inner join users u on u.pk = p.user_id
        WHERE c.created_dt >= NOW() - INTERVAL '${days} days'
        GROUP BY p.barcode, p.name
        ORDER BY sales_count DESC
        LIMIT 5
    `;
	try {
		const result = await client.query(topProductsQuery);
		return result.rows;
	} catch (err) {
		console.error("Error fetching top products:", err);
		throw err;
	}
};

const leastSellingProducts = async (client, days = 30) => {
	client = client || (await pool.connect());
	const leastProductsQuery = `
        SELECT p.barcode, p.name, COUNT(*) AS sales_count
        FROM carts c
        CROSS JOIN LATERAL jsonb_array_elements(c.item_details) AS item
        INNER JOIN products p ON item->>'barcode' = p.barcode
		inner join users u on u.pk = p.user_id
        WHERE c.created_dt >= NOW() - INTERVAL '${days} days'
        GROUP BY p.barcode, p.name
        ORDER BY sales_count ASC
        LIMIT 5
    `;
	try {
		const result = await client.query(leastProductsQuery);
		return result.rows;
	} catch (err) {
		console.error("Error fetching least products:", err);
		throw err;
	}
};

const allSellsData = async (client, days = 30) => {
	client = client || (await pool.connect());
	const allSellsQuery = `
        SELECT p.barcode, p.name, COUNT(*) AS sales_count
        FROM carts c
        CROSS JOIN LATERAL jsonb_array_elements(c.item_details) AS item
        INNER JOIN products p ON item->>'barcode' = p.barcode
		inner join users u on u.pk = p.user_id
        WHERE c.created_dt >= NOW() - INTERVAL '${days} days'
        GROUP BY p.barcode, p.name
        ORDER BY sales_count DESC
    `;
	try {
		const result = await client.query(allSellsQuery);
		return result.rows;
	} catch (err) {
		console.error("Error fetching all sells data:", err);
		throw err;
	}
};

export {
	addProductController,
	checkoutProductController,
	removeItemController,
	proceedCartController,
	finalizeSaleController,
	showProductController,
	stockAlertController,
	salesReportController,
	periodicSalesReport,
};



