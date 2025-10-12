const checkProductExists = async (client, barcode) => {
	const result = await client.query("SELECT COUNT(*) FROM products WHERE barcode = $1", [barcode]);
	return parseInt(result.rows[0].count) > 0;
};
const addProduct = async (
	client,
	barcode,
	name,
	price,
	description = "",
	userId = 1,
	productImage = "",
	category = "",
	brand = "",
) => {
	const query = `
        INSERT INTO products (barcode, name, description, price, created_dt, user_id, product_image, category, brand) 
        VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8) 
        RETURNING *
    `;
	const result = await client.query(query, [
		barcode,
		name,
		description,
		price,
		userId,
		productImage,
		category,
		brand,
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

export const addStockOfNonQuantizedItem = async (client, barcode, quantity) => {
	const getProductIdQuery = "SELECT pk FROM products WHERE barcode = $1";
	const productResult = await client.query(getProductIdQuery, [barcode]);
	if (productResult.rows.length === 0) {
		throw new Error("Product not found");
	}
	const obj={
		weigth:0,
		pricePerWeigth:0,
	}
	const productId = productResult.rows[0].pk;
	const query=`insert into stocks (product_id, add_dtls, created_dt) values ($1,$2,NOW()) returning *`
	const result = await client.query(query, [productId, obj]);
	return result.rows[0];
}

export const updateStockOfNonQuantizedItem = async (client, barcode, add_dtls) => {
	const getProductIdQuery = "SELECT pk FROM products WHERE barcode = $1";
	const productResult = await client.query(getProductIdQuery, [barcode]);
	if (productResult.rows.length === 0) {
		throw new Error("Product not found");
	}
	const productId = productResult.rows[0].pk;
	const query = `update stocks set add_dtls ->> 'weight' = $1, add_dtls ->> 'pricePerWeight' = $2 where product_id = $3 returning *`;
	const result = await client.query(query, [add_dtls.weight, add_dtls.pricePerWeight, productId]);
	return result.rows[0];
}

const updateStock = async (client, barcode, quantity) => {
	const getProductIdQuery = "SELECT pk FROM products WHERE barcode = $1";
	const productResult = await client.query(getProductIdQuery, [barcode]);
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

export { checkProductExists, addStock, updateStock, addProduct };
