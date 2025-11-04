import { pool } from "../db/db.js";
import { addStock, checkProductExists, updateStock, addStockOfNonQuantizedItem, updateStockOfNonQuantizedItem } from "../utils/product.utils.js";
import { addProduct } from "../utils/product.utils.js";
import { redisClient } from "../db/redis.js";
import { ResponseBody } from '../utils/responseBody.js';
import { UserDtlsObj } from "../utils/userDtlsObj.js";
import { updateProductIfExists } from "../utils/product.utils.js";
import { checkoutInventory } from "../utils/product.utils.js";
import { adjustedInventory } from "../utils/product.utils.js";

const addProductController = async (req, res) => {
	const responseBody = new ResponseBody();
	const { barcode, name, price, quantity, productImage, category, brand, discount, unit } = req.body;
	
	let barcodeTrimmed = barcode ? barcode.trim() : "n/a";
	if (quantity <= 0 || price <= 0) return res.status(400).json({ error: "Price and quantity must be greater than zero" });
	const isQuantizedItem = req.body.isQuantizedItem || false;
    if(barcodeTrimmed === "n/a" || barcodeTrimmed.trim() === "") barcodeTrimmed = isQuantizedItem===false ? 'N/A-' + Date.now() : 'Q-' + Date.now();
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const authHeader = req.headers["authorization"];
		const token = authHeader.split(" ")[1];
		const userId=(await new UserDtlsObj(client, token).getUser()).id;

		const productVo={
			barcode: barcodeTrimmed,
			name: name,
			price: price,
			quantity: quantity,
			productImage: productImage,
			category: category,
			brand: brand,
			add_dtls: {},
			userId: userId,
			discount: discount || 0,
			unit: unit || "pcs",
			description: req.body.desc || (name+" | "+category+" | "+brand),
			mfgDate: req.body.mfgDate,
			expDate: req.body.expDate
		}
		if(isQuantizedItem===false && barcodeTrimmed.includes("N/A-")){
			const result = await addWithOutBarcode(client, productVo)
			await client.query("COMMIT");
			responseBody.setData(result, "Product added successfully", 201);
			return res
		.status(responseBody.getResponse().statusCode)
		.json(responseBody.getResponse().body);

		}else{
		if (await checkProductExists(client, barcodeTrimmed, userId)) {
			const updatedProduct=await updateProductIfExists(client, productVo);
			await client.query("COMMIT");
			return res.status(200).json({ message: "Product updated successfully" });
		}
		const productResult = await addProduct( client, productVo );
		if (!productResult) throw new Error("Failed to add product");
		productVo.productId=productResult.pk
		const stock = await addStock(client, productVo);
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
	}finally {
		if(client) client.release()
	}
};

const addWithOutBarcode = async ( client, productVo ) => {
	if (productVo.quantity <= 0 || productVo.price <= 0) throw new Error("Price and quantity must be greater than zero");
	try {
		await client.query("BEGIN");

		let checkIsExists = await checkProductExists(
			client,
			productVo.barcode,
			productVo.userId
		);

		if (checkIsExists) {
			const result = await updateProductIfExists(client, productVo);
			await client.query("COMMIT");
			return result;
		}
		const productResult = await addProduct( client, productVo );
		let productId=productResult.pk;
		productVo.productId=productId;

		productVo.add_dtls.unit = productVo.unit || "kg"
		productVo.add_dtls.pricePerWeight=productVo.price
		productVo.add_dtls.last_weight=productVo.add_dtls.weight
		productVo.add_dtls.discount=productVo.discount

		if (!productResult) throw new Error("Failed to add product");
		console.log("New product added with barcode:", productResult.barcode);
		const stock = await addStockOfNonQuantizedItem(client, productVo);

		await client.query("COMMIT");
		return { message: "New product added", product: productResult, stock };
	} 
	catch (error) {
		await client.query("ROLLBACK");
		console.error("Error in addWithOutBarcode:", error);
		throw error;
	}
}

const deleteProductController = async (req, res) => {
	const { barcode } = req.body;
	if (!barcode) {
		return res.status(400).json({ error: "Barcode is required" });
	}
	const client = await pool.connect();
	try {
		const deleteProductQuery = "update products set active_flag=false where barcode=$1 and user_id=$2 returning *";
		const client= await pool.connect();
		const authHeader = req.headers["authorization"];
		const token = authHeader.split(" ")[1];
		const userId=(await new UserDtlsObj(client, token).getUser()).id;

		const result=await client.query(deleteProductQuery, [barcode, userId]);
		if (result.rows.length === 0) {
			return res.status(404).json({ error: "Product not found" });
		}
		const deletedProduct = result.rows[0];
		return res.status(200).json({ message: "Product deleted successfully", product: deletedProduct });
	} catch (error) {
		console.error("Error deleting product:", error);
		return res.status(500).json({ error: "Internal server error" });
	} finally {
		if(client)
		client.release();
	}
};

// const checkoutProductController = async (req, res) => {
// 		const { barcode } = req.body;
// 		if (!barcode) return res.status(400).json({ error: "Barcode is required" })
// 		const client = await pool.connect();
// 		client.query("BEGIN");
// 		const user = await getUserDtlsWithToken(req.headers["authorization"]?.split(" ")[1]);
// 		if (!user) {
// 			await client.query("ROLLBACK");
// 			return res.status(401).json({ error: "Unauthorized" });
// 		}
// 		const userId = user.id;
// 		const checkProductId =
// 			"select p.pk from products p inner join users u on u.pk=p.user_id where user_id=$1 and p.barcode=$2";
			
// 		const productIdResult = await client.query(checkProductId, [userId, barcode]);
// 		if (productIdResult.rows.length === 0)
// 			return res.status(404).json({ error: "Product not found" });

// 		const productId = productIdResult.rows[0].pk;
// 		console.log("productId", productId);
// 		const checkStock = "select stock from stocks where product_id=$1";
// 		const stockResult = await client.query(checkStock, [productId]);
// 		if (stockResult.rows.length === 0 || stockResult.rows[0].stock <= 0)
// 			return res.status(404).json({ error: "Product not found or out of stock" });

// 		const updateStockQuery = "update stocks set stock=stock-1 where product_id=$1 returning *";
// 		if(barcode.startsWith("N/A-")){
// 			const updateStockQuery = `update stocks set stock=stock-1, add_dtls=jsonb_set(add_dtls, '{weight}', 
// 			to_jsonb((add_dtls->>'weight')::numeric - $2::numeric)) where product_id=$1 returning *`;

// 			const result = await client.query(updateStockQuery, [productId, req.body.weight]);
// 			client.query("COMMIT");
// 			if (result.rows.length === 0)
// 				return res.status(400).json({ error: "Failed to add item to cart" });
// 			client.release();
// 			return res.status(200).json({ message: "Item added to cart", stock: result.rows[0] });
// 		}

// 		const result = await client.query(updateStockQuery, [productId]);
// 		client.query("COMMIT");
// 		if (result.rows.length === 0) 
// 			return res.status(400).json({ error: "Failed to add item to cart" });
// 		client.release();
// 		return res.status(200).json({ message: "Item added to cart", stock: result.rows[0] });
// };

// const removeItemController = async (req, res) => {
// 		const { barcode } = req.body;
// 		if (!barcode) {
// 			return res.status(400).json({ error: "Barcode is required" });
// 		}
// 		const client = await pool.connect();
// 		const checkProductId = "select pk from products where barcode=$1";
// 		const productIdResult = await client.query(checkProductId, [barcode]);
// 		if (productIdResult.rows.length === 0) {
// 			return res.status(404).json({ error: "Product not found" });
// 		}
// 		const productId = productIdResult.rows[0].pk;
// 		const checkStock = "select stock from stocks where product_id=$1";
// 		const stockResult = await pool.query(checkStock, [productId]);
// 		if (stockResult.rows.length === 0 || stockResult.rows[0].stock <= 0) 
// 			return res.status(404).json({ error: "Product not found or out of stock" });
		
// 		if(barcode.startsWith("N/A-")){
// 			const query="update stocks set stock=stock+$1, add_dtls=jsonb_set(add_dtls, '{weight}', to_jsonb((add_dtls->>'weight')::numeric + $1::numeric)) where product_id=$2 returning *"
// 			const result = await client.query(query, [req.body.weight, productId]);
// 			if (result.rows.length === 0)
// 				return res.status(400).json({ error: "Failed to remove item from cart" });
// 			return res.status(200).json({ message: "Item removed from cart", stock: result.rows[0] });
// 		}

// 		const removeStockQuery = "update stocks set stock=stock+1 where product_id=$1 returning *";
// 		const result = await client.query(removeStockQuery, [productId]);
// 		if (result.rows.length === 0) 
// 			return res.status(400).json({ error: "Failed to remove item from cart" });
		
// 		return res.status(200).json({ message: "Item removed from cart" });
// }

const proceedCartController = async (req, res) => {
	const { barcodes } = req.body;
	if (!barcodes || barcodes.length === 0) {
		return res.status(400).json({ error: "Cart is empty" });
	}

	const authHeader = req.headers["authorization"];
	if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

	const token = authHeader.split(" ")[1];
	const client = await pool.connect();

	try {
		await client.query("BEGIN");
		const userId = (await new UserDtlsObj(client, token).getUser()).id;
		let cartItemList = [];
		let totalAmount = 0;

		for (let i = 0; i < barcodes.length; i++) {
			const rawBarcode = barcodes[i];
			let barcode = rawBarcode.trim();
			const [barcodeOnly, unitStr] = barcode.split("|").map(x => x.trim());

			barcode = barcodeOnly;
			let productQuery = `
				SELECT p.pk, p.name, p.barcode, p.description as desc, (s.add_dtls->>'discount')::int4 as discnt, p.price
				FROM products p left join stocks s ON p.pk = s.product_id
				WHERE p.barcode = $1 AND p.user_id = $2 AND p.active_flag = true
			`;
			let productParams = [barcodeOnly, userId];
			let quantity;
			quantity = parseFloat(unitStr) || 1;

			if (barcode.startsWith("N/A-")) {
				productQuery = `
 				SELECT p.pk, p.name, p.barcode, p.description AS desc,
				(s.add_dtls->>'pricePerWeight')::numeric AS price,
				(s.add_dtls->>'discount')::int4 as discnt
				FROM products p
				left JOIN stocks s ON p.pk = s.product_id
				WHERE p.barcode = $1 AND p.user_id = $2 AND p.active_flag = true
				`;
			}
			
			let productResult = await client.query(productQuery, productParams);
			if (productResult.rows.length === 0) {
				return res.status(404).json({ error: `Product with barcode ${barcode} not found` });
			}
			const product = productResult.rows[0];
			const productVo = {
				userId,
				barcode,
				productId: product.pk,
				quantity,
				price: product.price,
				discount: product.discnt || 0,
				priceAfterDiscount: parseFloat(product.price - (product.price * (product.discnt || 0) / 100))
			};
			console.log("Processing product:", productVo);
			let inventoryResult = await checkoutInventory(client, productVo)
			if(inventoryResult.length===0){
				await client.query("ROLLBACK");
				let inventoryResult = await adjustedInventory(client, productVo);
				if (inventoryResult.length===0) {
					await client.query("ROLLBACK");
					return res.status(400).json({ error: inventoryResult.body.error || "Failed to adjust inventory" });
				}
			}
			totalAmount += productVo.priceAfterDiscount * quantity;
			cartItemList.push({
				productId: product.pk,
				barcode: product.barcode,
				name: product.name,
				description: product.desc,
				price: parseFloat(product.price),
				quantity,
				discount: parseFloat(product.discnt) || 0,
			});
		}
		const cartId = "cart_" + Date.now();
		const insertCartQuery = `
			INSERT INTO carts (cart_id, item_details, total_amount, created_dt, payment_mode) 
			VALUES ($1, $2, $3, NOW(), 'pending') RETURNING cart_id
		`;
		const insertResult = await client.query(insertCartQuery, [
			cartId,
			JSON.stringify(cartItemList),
			totalAmount
		]);

		if (insertResult.rows.length === 0) {
			await client.query("ROLLBACK");
			for(let i=0;i<cartItemList.length;i++){
				const productDetails=cartItemList[i];
				const revertVo={
					productId: productDetails.productId,
					quantity: productDetails.quantity
				};
				await adjustedInventory(client, revertVo);
			}
			return res.status(500).json({ error: "Failed to proceed cart" });
		}

		await client.query("COMMIT");
		return res.status(200).json({
			message: "Cart proceeded",
			cartId,
			totalAmount,
			items: cartItemList
		});
	} catch (err) {
		console.error("Error in proceedCartController:", err);
		await client.query("ROLLBACK");
		return res.status(500).json({ error: "Database operation failed" });
	} finally {
		client.release();
	}
};


const finalizeSaleController = async (req, res) => {
	const { customerName, customerPhone, paymentMode, cartId } = req.body;
	if (!customerName || !customerPhone || !paymentMode || !cartId) {
		return res.status(400).json({ error: "All fields are required" });
	}
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		const authHeader = req.headers["authorization"];
		const token = authHeader.split(" ")[1];
		const userId=(await new UserDtlsObj(client, token).getUser()).id;


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
		
		let upiQrContent=''
		if(paymentMode==='UPI'){
			const upiIdQuery="select additional_dtls->>'upi_id' from users where pk=$1"
			const upiIdResult = await client.query(upiIdQuery, [userId]);
			let upiId = upiIdResult.rows[0]?.upi_id || "rajeshsarkar0007@oksbi";

			upiQrContent=`upi://pay?pa=${upiId}&pn=Rajesh&am=${total_amount}&cu=INR&aid=uGICAgMDh6cTFFQ`;
			bill.paymentLink=upiQrContent;
		}
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
  const responseBody = new ResponseBody();
  const { searchKey } = req.query;
  const rowsPerPage = parseInt(req.query.rowsPerPage) || 10;
  const pageNo = parseInt(req.query.pageNo) || 1;

  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];

  const timeoutMs = 5000;
  const queryWithTimeout = (promise, ms) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Query timed out")), ms);
      promise.finally(() => clearTimeout(timer)).then(resolve).catch(reject);
    });

  let client;
  try {
    client = await pool.connect();
    const user = await new UserDtlsObj(client, token).getUser();
    if (!user) return res.status(401).json({ error: "Invalid user token" });

    if (!searchKey || searchKey.trim() === "")
      return res.status(400).json({ error: "Search key is required" });

    let query, params;

    if (searchKey === "*") {
      query = `
        SELECT p.barcode, p.name, p.price, p.description, p.product_image, s.stock
        FROM products p
        LEFT JOIN stocks s ON p.pk = s.product_id
        WHERE p.user_id = $1 AND p.active_flag = true
        ORDER BY p.created_dt DESC
        LIMIT $2::int OFFSET $3::int
      `;
      params = [user.id, rowsPerPage, (pageNo - 1) * rowsPerPage];
    } else {
      query = `
        SELECT p.barcode, p.name, p.price, p.description, p.product_image, s.stock
        FROM products p
        LEFT JOIN stocks s ON p.pk = s.product_id
        WHERE p.user_id = $1 AND (p.name ILIKE $2 OR p.barcode ILIKE $2)
          AND p.active_flag = true
        ORDER BY p.created_dt DESC
      `;
      params = [user.id, `%${searchKey}%`];
    }

    const result = await queryWithTimeout(client.query(query, params), timeoutMs);
    const returnObj = { products: result.rows };
    const message =
      result.rows.length > 0
        ? "Products retrieved successfully"
        : "No products found";

    responseBody.setData(returnObj, message, 200);

    return res
      .status(responseBody.getResponse().statusCode)
      .json(responseBody.getResponse().body);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
};


const stockAlertController = async (req, res) => {
	const authHeader = req.headers["authorization"];
  	if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
	const client = await pool.connect();
	const lowStockQuery = `
		SELECT p.barcode, p.name, s.stock
		FROM products p
		INNER JOIN stocks s ON p.pk = s.product_id
		INNER JOIN users u ON u.pk = p.user_id
		WHERE (s.stock < s.last_stock * 0.2 OR s.stock < 10) AND u.pk = $1 
		and p.active_flag=true
		ORDER BY s.stock ASC
	`;
	try {
		await client.query("BEGIN");
		const token = authHeader.split(" ")[1];
		const userId=(await new UserDtlsObj(client, token).getUser()).id;		
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
	const responseBody = new ResponseBody();
	const { days } = req.body;
	if (!days || isNaN(days) || days <= 0) {
		return res.status(400).json({ error: "Invalid number of days" });
	}
	const client = await pool.connect();
	try {
		client.query("BEGIN");
		const authHeader = req.headers["authorization"];
		const token = authHeader.split(" ")[1];
		const userId=(await new UserDtlsObj(client, token).getUser()).id;

		const cacheKey = `salesData:${token}:${days}`;
		const cached = await redisClient.get(cacheKey);
		
		const returnObj = {
			salesData: [],
			cached: false,
		};
		
		if(cached){
			const cachedResponse = JSON.parse(cached);
			returnObj.salesData = cachedResponse.body.data.salesData;
			returnObj.cached = true;
			responseBody.setData(returnObj, "Sales report retrieved from cache", 200);
			return res
			.status(responseBody.getResponse().statusCode)
			.json(responseBody.getResponse().body);
		}

		const salesData = await periodicSalesReport(client, days, userId);
		client.query("COMMIT");
		if (salesData.length === 0)
			return res.status(404).json({ error: "No sales data found for the specified period" });
		
		returnObj.salesData = salesData;
		returnObj.cached = false;
		responseBody.setData(returnObj, "Sales report generated successfully", 200);
		await redisClient.setEx(cacheKey, 60*60, JSON.stringify(responseBody.getResponse()));
		return res
		.status(responseBody.getResponse().statusCode)
		.json(responseBody.getResponse().body);

	} catch (err) {
		res.status(500).json({ error: "Internal server error" });
	}finally{
		if(client) client.release()
	}
};

const periodicSalesReport = async (client, days, userId) => {
	client = client || (await pool.connect());
	const reportData = {
		itemDetails: [],
		totalAmount: Number,
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
			reportData.itemDetails = result.rows;
			reportData.totalAmount = result.rows.reduce(
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
	// checkoutProductController,
	// removeItemController,
	proceedCartController,
	finalizeSaleController,
	showProductController,
	stockAlertController,
	salesReportController,
	periodicSalesReport,
	deleteProductController
};

