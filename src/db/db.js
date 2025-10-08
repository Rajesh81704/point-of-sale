import pg from "pg";
import { Pool } from "pg";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL is not defined in environment variables");
}

const pool = new Pool({
    user: process.env.DB_USER || "avnadmin",
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: true,
        ca: `-----BEGIN CERTIFICATE-----
MIIEUDCCArigAwIBAgIUMKMrl9fU+UlkqSYZizmSxiU2+wwwDQYJKoZIhvcNAQEM
BQAwQDE+MDwGA1UEAww1MGQ0ZGE5ODctM2FlNi00MGUxLWE3YmEtMWNkMzk1YzEz
MGEyIEdFTiAxIFByb2plY3QgQ0EwHhcNMjUxMDA4MTgyODM2WhcNMzUxMDA2MTgy
ODM2WjBAMT4wPAYDVQQDDDUwZDRkYTk4Ny0zYWU2LTQwZTEtYTdiYS0xY2QzOTVj
MTMwYTIgR0VOIDEgUHJvamVjdCBDQTCCAaIwDQYJKoZIhvcNAQEBBQADggGPADCC
AYoCggGBAN6bxJVyofIeN+SUW6uUj3yg2ldGA1Aw03kQ3zCWDD7UhaHaMRmX68s6
LoTQhCGRWZxvW820eQ/CRz6ukOUkER1FVtn2qADKfqZuoL763Ka5eiolr5JhrGy9
9pZpJQ4F33bHAZiNdYqnhJP0ORhQI2UMTEWWTSVQPhVLh5OkT7fDE3oYD8jV9hPj
hrOPvPoPCt5vMhW+hQugQyFzXTREhSMtqh+Lg6RsAR+kHWAZgZYtd8+RJ4tidGIj
+daDgBqbCGWfHwtDjT7OnetXBEZlkX/7RWqfuS7UITGc4xawIpBhcP6od+avTWrI
IeWXvZuY0GwXv2Az9rpCcqxmTtEX7rc2EP76vwpaFRg56n7St9eT8RlWgXWqU6kU
3/zK3v66a7/hrxOocpVMqRPZkToJjQCNVhArttrkg7xpOdID2b+qOUbuQIPqIbDo
oBmPFjPdfZOThRH8wDukrda3J2ygHfKF7VEaXQFYsoaMelgw6xp/eGzLzmf7HSXF
yWewk4hP8wIDAQABo0IwQDAdBgNVHQ4EFgQUrQlKvD+xScTv6TEiPqRgbT3/thww
EgYDVR0TAQH/BAgwBgEB/wIBADALBgNVHQ8EBAMCAQYwDQYJKoZIhvcNAQEMBQAD
ggGBAENx70bQLabtXOeSWQZ1njDILz+qxSSdhee9wO4QjXvGUY6hWBXSBSWCOXpY
jTztSs0+tDvDhTCk45u8Dxwc5p6CTlDJgggvxDSCTLKQxHNTfWkwfTtHqKIfeBLD
RBK7lvgwHt66Zco1Csza2QSMRCMTcmMqAapn/ie7aVXt/2y4Rwu3m3H7pswj6OX2
PobOr6Ti/jI6XVNFNvfRZDvfanpDmiUjbEQPDEA/RJ9AOh7VqhsnmSfesCD9SDcY
EfhiNMc7G5kMbgNHtQ/novo7H2TZy2OH4B1WQJUHx1a+KSm8EDBpe6Q79scbhdW1
wFMVp0Bd/d4oTffCUEyDB/XJl13BN1LBNU2HCyp5Jy0vrjP4kDm4xhw7WG+xLPYi
cmHEtZeULL8OyVm921C5126WnOD7QylUOfVRj4z+aucvwiC3V1ysU/gOlPIPaRus
9F1ZqBJUkFBRnVhnA4LC8xM9g7aXatnXU+qHB7X+56rD/bnnQr8gJCtzCNF+RhFK
M5KSYw==
-----END CERTIFICATE-----`,
    },
});

pool.connect((err, client, release) => {
	if (err) {
		console.error("Error connecting to the database:", err.stack);
	} else {
		console.log("Connected to the database");
		release();
	}
});
export { pool };
