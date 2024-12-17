const MySQL2 = require('mysql2');
const { sqlHost, sqlUser, sqlPassword, sqlDatabase } = require('./main_Redis+Sharp/app');
const IORedis = require("ioredis");

const sqlConn = MySQL2.createConnection({
   host: sqlHost,
   user: sqlUser,
   password: sqlPassword,
   database: sqlDatabase
}).promise();
const redis = new IORedis();

sqlConn.query(`DELETE FROM metadata_query`);
redis.flushall();