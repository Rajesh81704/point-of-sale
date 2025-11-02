const checkProductExists = async (client, barcode, userId) => {
	const result = await client.query("SELECT COUNT(*) FROM products WHERE barcode = $1 AND user_id = $2 and active_flag=true", [barcode, userId]);
	return parseInt(result.rows[0].count) > 0;
};
const addProduct = async (client, productVo) => {
	const query = `
        INSERT INTO products (barcode, name, description, price, created_dt, user_id, product_image, category, brand) 
        VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8) 
        RETURNING *
    `;
	const result = await client.query(query, [
		productVo.barcode,
		productVo.name,
		productVo.description,
		productVo.price,
		productVo.userId,
		productVo.productImage,
		productVo.category,
		productVo.brand,
	]);
	return result.rows[0];
};

const addStock = async (client, productVo) => {

	const productId = productVo.productId;
	const quantity = productVo.quantity;
	const mfgDate = productVo.mfgDate;
	const expDate = productVo.expDate;
	const discount = productVo.discount || 0;

	const query = `
        INSERT INTO stocks (product_id, stock, last_stock, created_dt, add_dtls) 
        VALUES ($1, $2, $3, NOW(), $4::jsonb) 
        RETURNING *
    `;
	const result = await client.query(query, [productId, quantity, quantity, JSON.stringify({ mfgDate, expDate, unit: productVo.unit, pricePerUnit: productVo.pricePerUnit, discount })]);
	return result.rows[0];
};

const addStockOfNonQuantizedItem = async (client, productVo) => {
	const productId = productVo.productId;
	const quantity = productVo.quantity;
	const mfgDate = productVo.mfgDate;
	const expDate = productVo.expDate;

	const query = `
    INSERT INTO stocks (product_id, add_dtls, stock, last_stock, created_dt)
    VALUES ($1, $2::jsonb, $3, $4, NOW())
    RETURNING *;
  `;
  const obj={
	weight: quantity,
	pricePerWeight: productVo.add_dtls.pricePerWeight,
	last_weight: quantity,
	unit: productVo.add_dtls.unit,
	mfgDate: mfgDate,
	expDate: expDate
  }
  console.log("obj", obj);
  
  const result = await client.query(query, [productId, JSON.stringify(obj), quantity, quantity]);
  return result.rows[0];
}



const updateProductIfExists = async (client, productVo) => {
	try {
		const getProductDtlsQuery = `
			SELECT * FROM products WHERE barcode = $1 AND user_id = $2 and active_flag=true
		`;
		const productResult = await client.query(getProductDtlsQuery, [
			productVo.barcode,
			productVo.userId,
		]);

		if (productResult.rows.length === 0) {
			throw new Error("Product not found");
		}
		const existingProduct = productResult.rows[0];
		const productId = existingProduct.pk;
		productVo.productId = productId;

		productVo.add_dtls = productVo.add_dtls || {};
		productVo.add_dtls.unit = productVo.unit || existingProduct.unit || "kg";
		productVo.add_dtls.pricePerWeight = productVo.price ?? existingProduct.price;
		productVo.add_dtls.last_weight =
			productVo.add_dtls.weight ?? existingProduct.weight ?? 0;
		productVo.add_dtls.discount =
			productVo.discount ?? existingProduct.discount ?? 0;

		const mfgDate = productVo.mfgDate
			? new Date(productVo.mfgDate)
			: existingProduct.mfg_date;
		const expDate = productVo.expDate
			? new Date(productVo.expDate)
			: existingProduct.exp_date;
		const description = productVo.description || existingProduct.description;

		const updateFields = [];
		const updateValues = [];
		let idx = 1;

		const updatableColumns = {
			price: productVo.price,
			description: description,
			category: productVo.category,
			brand: productVo.brand,
			product_image: productVo.productImage,
			mfg_date: mfgDate,
			exp_date: expDate,
		};

		for (const [col, val] of Object.entries(updatableColumns)) {
			if (val !== undefined && val !== null) {
				updateFields.push(`${col}=$${idx++}`);
				updateValues.push(val);
			}
		}

		updateFields.push(`updated_dt=$${idx++}`);
		updateValues.push(new Date());
		updateValues.push(productId);

		const updateProductQuery = `
			UPDATE products
			SET ${updateFields.join(", ")}
			WHERE pk=$${idx}
			RETURNING *;
		`;

		console.log(productVo)

		const updateProductResult = await client.query(updateProductQuery, updateValues);
		if (updateProductResult.rows.length === 0)
			throw new Error("Failed to update product details");

		if(productVo.isQuantized || !productVo.barcode.startsWith('N/A')){
			const stock = await updateStock(client, productVo)
			if (!stock) throw new Error("Failed to update stock for quantized item");
			return { message: "Stock updated for quantized item", stock };
		}
		const stock = await updateStockOfNonQuantizedItem(client, productVo);
		if (!stock) throw new Error("Failed to update stock for non-quantized item");

		return { message: "Stock updated for non-quantized item", stock };

	} catch (error) {
		console.error("Error in updateProductIfExists:", error);
		throw error;
	}
};

const updateStock = async (client, productVo) => {
	const getProductIdQuery = "select pk FROM products WHERE barcode = $1 AND user_id = $2 and active_flag=true";
	const productResult = await client.query(getProductIdQuery, [productVo.barcode, productVo.userId]);
	console.log("productResult", productResult.rows[0].pk);
	if (productResult.rows.length === 0) {
		throw new Error("Product not found");
	}
	const productId = productResult.rows[0].pk;
	const query = `
        UPDATE stocks 
        SET stock = stock + $1, last_stock = last_stock + $1 
        WHERE product_id = $2 
        RETURNING *
    `;
	const result = await client.query(query, [productVo.quantity, productId]);
	return result.rows[0];
};


export const updateStockOfNonQuantizedItem = async (client, productVo) => {
	const query = `
		UPDATE stocks 
		SET add_dtls = jsonb_set(
				jsonb_set(
					jsonb_set(add_dtls, '{last_weight}', to_jsonb($1::numeric)),
					'{pricePerWeight}', to_jsonb($2::numeric)
				),
				'{discount}', to_jsonb($3::numeric)
			),
			stock = $1,
			last_stock = $1, last_updated_dt=$5
		WHERE product_id = $4 
		RETURNING *;
	`;
	const result = await client.query(query, [productVo.quantity, productVo.price, productVo.discount, productVo.productId, new Date()]);
	if (result.rows.length === 0) {
		throw new Error("Product not found");
	}
	return result.rows[0];
};

const checkoutInventory = async (client, productVo) => {
		const stockResult = await client.query("SELECT stock FROM stocks WHERE product_id = $1", [productVo.productId]);
		if (stockResult.rows.length === 0 || stockResult.rows[0].stock <= 0) {
			await client.query("ROLLBACK");
			return { status: 404, body: { error: "Product not found or out of stock" } };
		}
		let weight = productVo.quantity || 1;
		const productId = productVo.productId;
		let updateStockQuery, queryParams;
		if (productVo.barcode.startsWith("N/A-")) {
			updateStockQuery = `
				UPDATE stocks 
				SET stock = stock - 1, 
					add_dtls = jsonb_set(
						add_dtls, '{weight}', 
						to_jsonb((add_dtls->>'weight')::numeric - $2::numeric)
					) 
				WHERE product_id = $1 
				RETURNING *;
			`;
			queryParams = [productId, weight];
		} else {
			updateStockQuery = `
				UPDATE stocks 
				SET stock = stock - 1 
				WHERE product_id = $1 
				RETURNING *;
			`;
			queryParams = [productId];
		}
		const result = await client.query(updateStockQuery, queryParams);
		return result.rows[0];
}

const adjustedInventory = async (client, productVo) => {
		let query='';
		if(productVo.barcode.startsWith("N/A-")){
			query=`update stocks set stock=stock+$1, add_dtls=jsonb_set(add_dtls, '{weight}', 
			to_jsonb((add_dtls->>'weight')::numeric + $1::numeric)) where product_id=$2 returning *`;

			const result = await client.query(query, [productVo.quantity, productVo.productId]);
			if (result.rows.length === 0)
				return { status: 400, body: { error: "Failed to remove item from cart" } };
			return { status: 200, body: { message: "Item removed from cart", stock: result.rows[0] } };
		}
		query = "update stocks set stock=stock+1 where product_id=$1 returning *";
		const result = await client.query(query, [productVo.productId]);
		if (result.rows.length === 0)
			return { status: 400, body: { error: "Failed to remove item from cart" } };
		return { status: 200, body: { message: "Item removed from cart", stock: result.rows[0] } };
}

export { 
	checkProductExists, 
	addStock, 
	updateStock, 
	addProduct, 
	addStockOfNonQuantizedItem, 
	updateProductIfExists,
	checkoutInventory,
	adjustedInventory
};
