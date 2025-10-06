import { createClient } from 'redis';

const client = createClient({
    username: 'default',
    password: 'HSNm1cgEAnTZ7FAfUsPR3k4PgDz6eW1J',
    socket: {
        host: 'redis-15613.crce217.ap-south-1-1.ec2.redns.redis-cloud.com',
        port: process.env.REDIS_PORT || 15613
    }
});

client.on('error', err => console.log('Redis Client Error', err));

await client.connect();

await client.set('foo', 'bar');
const result = await client.get('foo');
console.log("redis is connected",result); 
export const redisClient = client;
