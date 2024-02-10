const Express = require('express');
const MySQL2 = require('mysql2');
const MySQL = require('mysql');
const MySQLEvents = require('@rodrigogs/mysql-events');
const IORedis = require("ioredis");
const Sharp = require('sharp');

//Adjustable variables

let port = 1000; //Integer range [1000, infinity). Server port

const sqlHost = 'localhost'; //String. Address of the webpage.
const sqlUser = 'root'; //String. MySQL user.
const sqlPassword = 'root'; //String. MySQL password.
const sqlDatabase = 'redisresearch'; //String. MySQL password.
const mainTable = 'images'; 
const primaryKeyAtt = 'id';
const imageAtts = ['image'];

const enableTTL = false; //true for false. Whether to use TTL or not. (true = cache expires, false = cache never expires)
let TTLbase = 3600; //Integer range [1, infinity). Base time-to-live in seconds of a Redis cache
let TTLmax = 21600; //Integer range [1, infinity). Maximum time-to-live in seconds of a Redis cache

const enableCompression = true; //true or false. Whether to use compression or not.
let compressStiffness = 0.25; //Float range (0,infinity). The higher the number, the less the image file size affects compression amount, thus less compression.
let compressQualityMin = 0.1; //Float range (0, 1]. The floor of compressed image quality.
let compressQualityMax = 0.8; //Float range (0, 1]. The ceiling of compressed image quality.
let compressCorrection = 0.95; //Float range (0, 1]. Not recommended to change. The amount to correct Sharp's bigger output size when no compression is applied (quality = 80).
const forceCompressQuality = 0; //Float range (0, 1]. Set to negative or zero to disable. Used for testing.

const enableConsolePrint = true; //true or false. Whether to print in console or not. Used for debugging purposes.

const enableSmartCacheReplace = true; //true or false. Whether to enable metadata logging and smart cache replace features. If disabled will clear all metadata.

//Invalid system variables prevention

port = Math.round(Math.max(port, 1000));
TTLbase = Math.round(Math.max(TTLbase, 1));
TTLmax = Math.round(Math.max(TTLbase, 1));
compressStiffness = Math.max(compressStiffness, 0.01);
compressQualityMin = Math.min(Math.max(compressQualityMin, 0.01), 1);
compressQualityMax = Math.min(Math.max(compressQualityMax, 0.01), 1);
if (compressQualityMin > compressQualityMax) {
   [compressQualityMin, compressQualityMax] = [compressQualityMax, compressQualityMin];
}
compressCorrection = Math.min(Math.max(compressCorrection, 0), 1);

//Console print function

function Print(string) {
   if(enableConsolePrint) {
      console.log(string);
   }
}

//Initialize Express

const app = Express();
app.use(Express.static('src'));
app.listen(port, () => {
   console.log(`---------------`);
   console.log(`✔ Server is running on port ${port}`);
});

//Initialize Redis

const redis = new IORedis();

//Initialize database

const sqlConn = MySQL2.createConnection({
   host: sqlHost,
   user: sqlUser,
   password: sqlPassword,
   database: sqlDatabase
}).promise();

async function QueryDatabase(query) {
   return sqlConn.query(query);
}

if (!enableSmartCacheReplace) {
   QueryDatabase(`DELETE FROM metadata_query`);
}

//Initialize database listener

const sqlEventConn = MySQL.createConnection({
   host: sqlHost,
   user: sqlUser,
   password: sqlPassword
});

const instance = new MySQLEvents(sqlEventConn, {startAtEnd: true});
if (enableSmartCacheReplace) {
   instance.start()
      .then(() => {
         Print(`✔ Listening to change in table '${mainTable}'`);
      })
      .catch(err => console.error(err));
}

//Time measurements

let startTime = 0;
let endTime = 0;
let responseTime = 0;
let loadTime = 0;

function RecordResponseTime() {
   endTime = new Date().getTime();
   responseTime = endTime - startTime;
   Print(`  ▷ Response time: ${responseTime} ms`);
}

app.get('/loadtime/:loadtime', async (req, res) => {
   loadTime = req.params.loadtime;
   if (responseTime != 0) {
      Print(`  ▷ Page render time: ${loadTime-responseTime} ms`);
      Print(`  ▷ Total load time: ${loadTime} ms`);
   }
})

//Express API endpoints

app.get('/all', async (req, res) => {
   Fetch(res, 'SELECT id, image FROM images', 'all', ['id'], ['image']);
})

app.get('/album/:album', async (req, res) => {
   const album = req.params.album;
   Fetch(res, 'SELECT id, image FROM images WHERE album='+album, 'album:'+album, ['id'], ['image']);
})

app.get('/id/:id', async (req, res) => {
   const id = req.params.id;
   Fetch(res, 'SELECT id, image FROM images WHERE id='+id, 'id:'+id, ['id'], ['image']);
})

app.get('/test', async (req, res) => {
   Fetch(res, 'SELECT id, album, value FROM images WHERE id=1 OR album=2', 'test', ['id', 'album', 'value'], []);
})

//Fetch function

async function Fetch(res, query, redisKey, genericAtt, imageAtt) {
   Print(`▶ API called`);
   startTime = new Date().getTime();
   const rJson = await redis.get(redisKey);
   Print(`  ▷ Key: '${redisKey}'`);
   if (rJson != null) {
      Print(`  ▷ Cache hit`);
      res.send(rJson);
      RecordResponseTime();
      AddTTL(redisKey);
   }
   else {
      Print(`  ▷ Cache miss`);
      const [dbData] = await QueryDatabase(query);
      res.send(dbData);
      RecordResponseTime();
      PrimeCache(query, redisKey, genericAtt, imageAtt, dbData);
   }
}

//Prime cache function

async function PrimeCache (query, redisKey, genericAtt, imageAtt, dbData) {
   Print(`◼ Cache priming begins for key '${redisKey}'`);
   let dbJson;
   if (enableCompression) {
      dbJson = await CompressImage(redisKey, genericAtt, imageAtt, dbData);
   }
   else {
      dbJson = JSON.stringify(dbData);
   }
   if (enableTTL) {
      redis.setex(redisKey, TTLbase, dbJson);
      Print(`  ◻ Set key '${redisKey}' with TTL ${TTLbase} s`);
   }
   else {
      redis.set(redisKey, dbJson);
      Print(`  ◻ Set key '${redisKey}' with no TTL`);
   }
   Print(`  ◻ Approximate size in Redis: ${Math.round(dbJson.length / 1.81)} bytes`);
   if (enableSmartCacheReplace) {
      LogMetadata(redisKey, query, genericAtt, imageAtt);
   }
}

//TTL function

async function AddTTL(redisKey) {
   if (enableTTL) {
      const currentTTL = await redis.ttl(redisKey);
      let newTTL = currentTTL + TTLbase;
      if (newTTL > TTLmax) {
         newTTL = TTLmax;
      }
      redis.expire(redisKey, newTTL);
      Print(`   ▷ Changed TTL of key ${redisKey} from ${currentTTL} to ${newTTL} s`);
   }
}

//Image compression

async function CompressImage(redisKey, genericAtt, imageAtt, dbData) {
   Print(`  ◻ Compression process begins`);
   if (imageAtt.length == 0) {
      Print(`     ◻ No images to be compressed`);
      return JSON.stringify(dbData);
   }
   else {
      Print(`     ◻ Compressing images`);
      let compressedArray = [];
      let i = 1;
      for (const item of dbData) {
         let obj = {}
         if (genericAtt != 0) {
            for (j = 0; j < genericAtt.length; j++) {
               obj[genericAtt[j]] = item[genericAtt[j]]
            }
         }
         let width;
         let height;
         let size;
         let compressQualityMapped;
         for (j = 0; j < imageAtt.length; j++) {
            const image = item[imageAtt[j]];
            await Sharp(image)
               .metadata()
               .then(meta => {
                  width = meta.width;
                  height = meta.height;
                  size = meta.size;
                  if (forceCompressQuality <= 0) {
                     const compressQualityRaw = (1 - (size / (width * height * compressStiffness)));
                     compressQualityNormalized = Math.min(Math.max(compressQualityRaw, compressQualityMin), compressQualityMax);
                  }
                  else {
                     compressQualityNormalized = forceCompressQuality;
                  }
                  compressQualityMapped = Math.round(compressQualityNormalized * compressCorrection * 80);
                  Print(`     ◻ '${redisKey}' Image ${i} quality: ${compressQualityMapped*1.25}%`);
               });
            const compressedImage = await Sharp(image)
               .webp({
                  quality: compressQualityMapped,
                  minSize: true,
                  effort: 0
               })
               .toBuffer();
               obj[imageAtt[j]] = compressedImage;
         }
         compressedArray.push(obj);
         i++;
      }
      return JSON.stringify(compressedArray);
   };
}

//Metadata logging

async function CheckLogEntry(redisKey) {
   var [check] = await QueryDatabase(`SELECT 1 FROM metadata_query WHERE redisKey='`+redisKey+`'`);
   if (check.length != 0) {
      return true;
   }
   else {
      return false;
   }
}

async function DeleteMetadata(redisKey) {
   QueryDatabase(`DELETE FROM metadata_query WHERE redisKey='${redisKey}'`);
   Print(`◆ Deleted metadata of key '${redisKey}'`);
}

async function LogMetadata(redisKey, query, genericAtt, imageAtt) {
   const logExists = await CheckLogEntry(redisKey);
   if (logExists) {
      DeleteMetadata(redisKey);
   }
   QueryDatabase(`INSERT INTO metadata_query (redisKey, query) VALUES ('${redisKey}', '${query}')`);
   const [rows] = await QueryDatabase(`SELECT `+primaryKeyAtt+` FROM`+query.split('FROM')[1]);
   for (const row of rows) {
      QueryDatabase(`INSERT INTO metadata_row (redisKey, row) VALUES ('${redisKey}', ${row.id})`);
   }
   var rowOrder = '';
   var count = rows.length;
   for (const row of rows) {
      rowOrder += row.id;
      if (count > 1) {
         rowOrder += ',';
      }
      count--;
   }
   QueryDatabase(`INSERT INTO metadata_roworder (redisKey, rowOrder) VALUES ('${redisKey}', '${rowOrder}')`);
   const columns = query.match(/SELECT\s+(.+?)\s+FROM/i)[1].split(',').map(name => name.trim());
   for (const columnName of columns) {
      var columnType = '';
      if (genericAtt.includes(columnName)) {
         columnType = 'generic';
      }
      else if (imageAtt.includes(columnName)) {
         columnType = 'image';
      }
      QueryDatabase(`INSERT INTO metadata_column (redisKey, columnName, columnType) VALUES ('${redisKey}', '${columnName}', '${columnType}')`);
   }
   var [columnNames] = await QueryDatabase(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '`+mainTable+`'`);
   columnNames = columnNames.map(columnNames => columnNames.COLUMN_NAME);
   conditions = query.split('FROM ')[1];
   for (const columnName of columnNames) {
      const regex = new RegExp(`\\b${columnName}\\b`, 'i');
      if (regex.test(conditions)) {
         QueryDatabase(`INSERT INTO metadata_columncondition (redisKey, columnName) VALUES ('${redisKey}', '${columnName}')`);
      }
   }
   Print(`◆ Logged metadata of key '${redisKey}'`);
}

//Smart cache replace: trigger

if (enableSmartCacheReplace) {
   instance.addTrigger({
      name: 'DetectChange',
      expression: `${sqlDatabase}.${mainTable}`,
      statement: MySQLEvents.STATEMENTS.ALL,
      onEvent: async (event) => {
         try {
            eventQueue.push(event);
            setTimeout(processEventQueue, 100);
         }
         catch (error) {
            console.error(error);
         }
      }
   })
   instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
   instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
}

//Smart cache replace: batch processing

const eventQueue = [];
var isProcessingEvents = false;

async function processEventQueue() {
   if (eventQueue.length != 0 || !isProcessingEvents) {
      isProcessingEvents = true;
      try {
         const event = eventQueue[0];
         var changedColumns = event.affectedColumns.filter(column => !imageAtts.includes(column));
         var batchChangedRows = [];
         var batchValBefore = [];
         var batchValAfter = [];
         while (eventQueue.length > 0) {
            const event = eventQueue.shift();
            batchChangedRows.push(event.affectedRows[0].before['id']);
            batchValBefore.push(event.affectedRows[0].before[changedColumns[0]])
            batchValAfter.push(event.affectedRows[0].after[changedColumns[0]]);
         }
         await SmartCacheReplace(batchChangedRows, changedColumns, batchValBefore, batchValAfter);
      }
      catch (error) {
         console.error(error);
      }
      finally {
         isProcessingEvents = false;
      }
   }
}

//Smart cache replace: function

async function SmartCacheReplace(batchChangedRows, changedColumns, batchValBefore, batchValAfter) {
   Print(`★ A change is detected in database at:`);
   Print(`  ☆ Row: ${batchChangedRows.join(', ')}`);
   Print(`  ☆ Column: ${changedColumns.join(', ')}`);
   Print(`  ☆ Value before: ${batchValBefore.join(', ')}`);
   Print(`  ☆ Value after: ${batchValAfter.join(', ')}`);
   Print(`  ☆ Affected keys begins`);
   Print(`     ☆ Based on selected rows ∩ columns`);
   var potentialKeysRow = new Set();
   for (const row of batchChangedRows) {
      var [keyRow] = await QueryDatabase(`SELECT redisKey FROM metadata_row WHERE row = ${row}`);
      if (keyRow.length != 0) {  
         for (const key of keyRow) {
            potentialKeysRow.add(key.redisKey);
         }
      }
   }
   var potentialKeysColumn = new Set();
   for (const columnName of changedColumns) {
      var [keyColumn] = await QueryDatabase(`SELECT redisKey FROM metadata_column WHERE columnName = '${columnName}'`);
      if (keyColumn.length != 0) { 
         for (const key of keyColumn) {
            potentialKeysColumn.add(key.redisKey);
         }
      }
   }
   if (potentialKeysRow.size != 0) {
      Print(`        ☆ Potentially affected keys based on row: ${Array.from(potentialKeysRow).map(key => `'${key}'`).join(', ')}`);
   }
   else {
      Print(`        ☆ Potentially affected keys based on row: (none)`);
   }
   if (potentialKeysColumn.size != 0) {
      Print(`        ☆ Potentially affected keys based on column: ${Array.from(potentialKeysColumn).map(key => `'${key}'`).join(', ')}`);
   }
   else {
      Print(`        ☆ Potentially affected keys based on column: (none)`);
   }
   var affectedKeys = new Set([...potentialKeysRow].filter(x => potentialKeysColumn.has(x)));
   if (affectedKeys.size != 0) {
      Print(`        ☆ Affected keys based on rows ∩ columns: ${Array.from(affectedKeys).map(key => `'${key}'`).join(', ')}`);
   }
   else {
      Print(`        ☆ Affected keys based on rows ∩ columns: (none)`);
   }
   Print(`     ☆ Based on row order testing from query conditions`);
   var potentialKeysCondition = new Set();
   for (const columnName of changedColumns) {
      var [keyCondition] = await QueryDatabase(`SELECT redisKey FROM metadata_columncondition WHERE columnName = '${columnName}'`);
      for (const key of keyCondition) {
         potentialKeysCondition.add(key.redisKey);
      }
   }
   if (potentialKeysCondition.size != 0) {
      Print(`        ☆ Potentially affected keys based on query condition: ${Array.from(potentialKeysCondition).map(key => `'${key}'`).join(', ')}`);
   }
   else {
      Print(`        ☆ Potentially affected keys based on query condition: (none)`);
   }
   for (const redisKey of potentialKeysCondition) {
      const [testQuery] = await QueryDatabase(`SELECT query FROM metadata_query WHERE redisKey = '${redisKey}'`);
      const testConditions = testQuery[0].query.split('FROM ')[1];
      const [testResult] = await QueryDatabase(`SELECT ${primaryKeyAtt} FROM ${testConditions}`);
      var rowOrderTest = '';
      var count = testResult.length;
      for (const row of testResult) {
         rowOrderTest += row.id;
         if (count > 1) {
            rowOrderTest += ',';
         }
         count--;
      }
      const [rowOrderResult] = await QueryDatabase(`SELECT rowOrder FROM metadata_roworder WHERE redisKey = '${redisKey}'`);
      const rowOrderReal = rowOrderResult[0].rowOrder;
      if (rowOrderTest != rowOrderReal) {
         affectedKeys.add(redisKey);
         Print(`        ☆ '${redisKey}' is affected based from row order testing`);
      }
      else {
         Print(`        ☆ '${redisKey}' remains the same based from row order testing`);
      }
   }
   if (affectedKeys.size != 0) {
      Print(`  ☆ All affected keys: ${Array.from(affectedKeys).join(', ')}`);
   }
   else {
      Print(`  ☆ All affected keys: (none)`);
   }
   for (const redisKey of affectedKeys) {
      const ttl = await redis.ttl(redisKey);
      if (ttl >= -1) {
         redis.del(redisKey);
         var [query] = await QueryDatabase(`SELECT query FROM metadata_query WHERE redisKey = '${redisKey}'`);
         query = query[0].query;
         const [dbData] = await QueryDatabase(query);
         var [genericAtt] = await QueryDatabase(`SELECT columnName FROM metadata_column WHERE redisKey = '${redisKey}' AND columnType = 'generic'`);
         var [imageAtt] = await QueryDatabase(`SELECT columnName FROM metadata_column WHERE redisKey = '${redisKey}' AND columnType = 'image'`);
         genericAtt = genericAtt.map(name => name.columnName);
         imageAtt = imageAtt.map(name => name.columnName);
         PrimeCache(query, redisKey, genericAtt, imageAtt, dbData);
      }
      else {
         Print(`  ☆ '${redisKey}' has expired.`)
         DeleteMetadata(redisKey);
      }
   }
}

//Exit procedure

process.on('SIGINT', async () => {
   await redis.bgsave();
   Print(`⌫  Saved snapshot to dump.rdb`);
   Print(`⌫  Exiting...`);
   console.log(`---------------`);
   sqlConn.end();
   redis.quit();
   process.exit();
})
