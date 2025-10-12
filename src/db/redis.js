import { createClient } from 'redis';
import dotenv from 'dotenv';
dotenv.config();
const client = createClient({
    username: 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT || 15613
    }
});

client.on('error', err => console.log('Redis Client Error', err));

await client.connect();

await client.set('foo', 'bar');
const result = await client.get('foo');
console.log("redis is connected: ","//*"+result+"*//"); 
export const redisClient = client;
