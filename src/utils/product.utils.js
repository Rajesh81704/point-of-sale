const checkProductExists = async (client, barcode, userId) => {
	const result = await client.query("SELECT COUNT(*) FROM products WHERE barcode = $1 AND user_id = $2", [barcode, userId]);
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

const addStock = async (client, productId, quantity) => {
	const query = `
        INSERT INTO stocks (product_id, stock, last_stock, created_dt) 
        VALUES ($1, $2, $3, NOW()) 
        RETURNING *
    `;
	const result = await client.query(query, [productId, quantity, quantity]);
	return result.rows[0];
};

const addStockOfNonQuantizedItem = async (client, productVo, productId) => {
  const query = `
    INSERT INTO stocks (product_id, add_dtls, stock, last_stock, created_dt)
    VALUES ($1, $2::jsonb, $3, $4, NOW())
    RETURNING *;
  `;
  const obj={
	weight: productVo.add_dtls.weight,
	pricePerWeight: productVo.add_dtls.pricePerWeight,
	last_weight: productVo.add_dtls.last_weight,
	unit: productVo.add_dtls.unit
  }
  
  const result = await client.query(query, [productId, JSON.stringify(obj), productVo.add_dtls.weight, productVo.add_dtls.weight]);
  return result.rows[0];
}


export const updateStockOfNonQuantizedItem = async (client, productVo) => {
	const query = `
		UPDATE stocks 
		SET add_dtls = jsonb_set(
			jsonb_set(add_dtls, '{last_weight}', to_jsonb($1::numeric)),
			'{pricePerWeight}', to_jsonb($2::numeric)
		) 
		WHERE product_id = $3 
		RETURNING *;
	`;
	const result = await client.query(query, [productVo.quantity, productVo.price, productVo.productId]);
	if (result.rows.length === 0) {
		throw new Error("Product not found");
	}
	return result.rows[0];
};


const updateStock = async (client, barcode, quantity, userId) => {
	const getProductIdQuery = "SELECT pk FROM products WHERE barcode = $1 AND user_id = $2";
	const productResult = await client.query(getProductIdQuery, [barcode, userId]);
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
	const result = await client.query(query, [quantity, productId]);
	return result.rows[0];
};

export { checkProductExists, addStock, updateStock, addProduct, addStockOfNonQuantizedItem };



