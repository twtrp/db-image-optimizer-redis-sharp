const Express = require('express');
const MySQL2 = require('mysql2');
const MySQL = require('mysql');
const MySQLEvents = require('@rodrigogs/mysql-events');
const IORedis = require("ioredis");
const Sharp = require('sharp');

//Adjustable variables

let port = 1000; //Integer range [1000, infinity). Server port

const sqlHost = 'localhost'; //String. Default: localhost. Address of the webpage.
const sqlUser = 'root'; //String. Default: root. MySQL user.
const sqlPassword = 'root'; //String. Default: root. MySQL password.
const sqlDatabase = 'redisresearch'; //String. Default: redisresearch. MySQL password.

const enableTTL = false; //true for false. Whether to use TTL or not. (true = cache expires, false = cache never expires)
let ttlBase = 3600; //Integer range [1, infinity). Default: 3600. Base time-to-live in seconds of a Redis cache
let ttlMax = 21600; //Integer range [1, infinity). Default: 21600. Maximum time-to-live in seconds of a Redis cache

const enableCompression = true; //true or false. Default: true. Whether to use compression or not.
let compressStiffness = 0.25; //Float range (0,infinity). Default: 0.25. The higher the number, the less the image file size affects compression amount, thus less compression.
let compressQualityMin = 0.1; //Float range (0, 1]. Default: 0.1. The floor of compressed image quality.
let compressQualityMax = 0.8; //Float range (0, 1]. Default: 0.8. The ceiling of compressed image quality.
let compressCorrection = 0.95; //Float range (0, 1]. Default: 0.95. Not recommended to change. The amount to correct Sharp's bigger output size when no compression is applied (quality = 80).
const forceCompressQuality = 0; //Float range (0, 1]. Default: 0. Set to negative or zero to disable. Used for testing.

const enableSmartCacheReplace = true; //true or false. Default: true. Whether to enable metadata logging and smart cache replace features. If disabled will clear all metadata.

const enableConsolePrint = true; //true or false. Default: true. Whether to print in console or not. Used for debugging purposes.
const enableClearCacheOnStartup = true; //true or false. Default: false. Whether to clear . Used for debugging purposes.

//Invalid system variables prevention

port = Math.round(Math.max(port, 1000));
ttlBase = Math.round(Math.max(ttlBase, 1));
ttlMax = Math.round(Math.max(ttlBase, 1));
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

var tableList = [];
var imageAttList = [];
var genericAttList = [];
var primaryAttSet = {};

(async () => {
   [tableList] = await QueryDatabase(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${sqlDatabase}' AND table_name NOT LIKE 'metadata_%';`);
   tableList = tableList.map(tableList => tableList.table_name);
   for (const tableName of tableList) {
      const [attributes] = await QueryDatabase(`SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}';`);
      for (const item of attributes) {
         const attributeName = item.column_name;
         var [dataType] = await QueryDatabase(`SELECT data_type FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name = '${attributeName}';`)
         dataType = dataType[0].data_type;
         const regex = /blob/;
         if (regex.test(dataType)) {
            imageAttList.push({
               table: tableName,
               attribute: attributeName
            })
         }
         else {
            genericAttList.push({
               table: tableName,
               attribute: attributeName
            })
         }
      }
      var [primaryKeys] = await QueryDatabase(`SELECT column_name FROM information_schema.key_column_usage WHERE table_name = '${tableName}' AND constraint_name = 'PRIMARY';`)
      primaryKeys = primaryKeys.map(primaryKeys => primaryKeys.column_name);
      primaryAttSet[tableName] = primaryKeys;
   }
   if (enableSmartCacheReplace) {
      for (const table of tableList) {
         instance.addTrigger({
            name: 'DetectChange',
            expression: `${sqlDatabase}.${table}`,
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
      }
      instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
      instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
   }
   console.log('tableList =', tableList);
   console.log('imageAttList =', imageAttList);
   console.log('genericAttList =', genericAttList);
   console.log('primaryAttSet =', primaryAttSet);
})()

//Clear cache and metadata on startup for testing
if (enableClearCacheOnStartup) {
   (async () => {
      await QueryDatabase(`DELETE FROM metadata_query`);
      console.log(`✔ Reset MySQL metadata`);
      await redis.flushall();
      console.log(`✔ Reset Redis cache`);
   })()
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
         Print(`✔ Listening to change in database`);
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
   Fetch(res, 'SELECT id, image FROM images', 'all');
})

app.get('/album/:album', async (req, res) => {
   const album = req.params.album;
   Fetch(res, 'SELECT id, image FROM images WHERE album='+album, 'album:'+album);
})

app.get('/id/:id', async (req, res) => {
   const id = req.params.id;
   Fetch(res, 'SELECT id, image FROM images WHERE id='+id, 'id:'+id);
})

app.get('/test', async (req, res) => {
   Fetch(res, 'SELECT id, album, value FROM images WHERE id=1 OR album=2', 'test');
})

app.get('/test2', async (req, res) => {
   Fetch(res, 'SELECT images.id, images.image, testtable.info FROM images INNER JOIN testtable ON images.id = testtable.id', 'test2');
})

//Fetch function

async function Fetch(res, query, redisKey) {
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
      PrimeCache(query, redisKey, dbData, ttlBase);
   }
}

//Prime cache function

async function PrimeCache(query, redisKey, dbData, ttl) {
   Print(`◼ Cache priming begins for key '${redisKey}'`);
   const regex = /SELECT\s+([\w.,\s]+)\s+FROM\s+(\w+)/i;
   const regexResults = query.match(regex);
   const selectedAttributes = regexResults[1];
   const tableName = regexResults[2];
   const selectedList = selectedAttributes.split(',').map(item => {
      const parts = item.trim().split('.');
      var table, attribute;
      if (parts.length > 1) {
         table = parts[0];
         attribute = parts[1];
      }
      else {
         table = tableName;
         attribute = parts[0];
      }
      return {
         table: table,
         attribute: attribute
      };
   });
   var selectedTableList = [];
   var selectedImageList = [];
   var selectedGenericList = [];
   for (const item of selectedList) {
      if (tableList.includes(item.table) && !selectedTableList.includes(item.table)) {
         selectedTableList.push(item.table);
      }
      if (genericAttList.some(att => att.table.toUpperCase() === item.table.toUpperCase() && att.attribute.toUpperCase() === item.attribute.toUpperCase())) {
         selectedGenericList.push(item);
      }
      else if (imageAttList.some(att => att.table.toUpperCase() === item.table.toUpperCase() && att.attribute.toUpperCase() === item.attribute.toUpperCase())) {
         selectedImageList.push(item);
      }
   }
   var dbJson;
   if (enableCompression) {
      dbJson = await CompressImage(redisKey, dbData, selectedImageList, selectedGenericList);
   }
   else {
      dbJson = JSON.stringify(dbData);
   }
   if (enableTTL) {
      redis.setex(redisKey, ttl, dbJson);
      Print(`  ◻ Set key '${redisKey}' with TTL ${ttl} s`);
   }
   else {
      redis.set(redisKey, dbJson);
      Print(`  ◻ Set key '${redisKey}' with no TTL`);
   }
   Print(`  ◻ Approximate size in Redis: ${Math.round(dbJson.length / 1.81)} bytes`);
   if (enableSmartCacheReplace) {
      LogMetadata(redisKey, dbData, query, selectedTableList, selectedImageList, selectedGenericList);
   }
   console.log('selectedList =', selectedList);
   console.log('selectedTableList =', selectedTableList);
   console.log('selectedImageList =', selectedImageList);
   console.log('selectedGenericList =', selectedGenericList);
}

//TTL function

async function AddTTL(redisKey) {
   if (enableTTL) {
      const ttlCurrent = await redis.ttl(redisKey);
      let newTTL = ttlCurrent + ttlBase;
      if (newTTL > ttlMax) {
         newTTL = ttlMax;
      }
      redis.expire(redisKey, newTTL);
      Print(`   ▷ Changed TTL of key ${redisKey} from ${currentTTL} to ${newTTL} s`);
   }
}

//Image compression

async function CompressImage(redisKey, dbData, selectedImageList, selectedGenericList) {
   Print(`  ◻ Compression process begins`);
   if (selectedImageList.length == 0) {
      Print(`     ◻ No images to be compressed`);
      return JSON.stringify(dbData);
   }
   else {
      Print(`     ◻ Compressing images`);
      let compressedArray = [];
      let i = 1;
      for (const item of dbData) {
         let obj = {}
         if (selectedGenericList != 0) {
            for (j = 0; j < selectedGenericList.length; j++) {
               obj[selectedGenericList[j].attribute] = item[selectedGenericList[j].attribute];
            }
         }
         let width;
         let height;
         let size;
         let compressQualityMapped;
         for (j = 0; j < selectedImageList.length; j++) {
            const image = item[selectedImageList[j].attribute];
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
                  Print(`     ◻ '${redisKey}' image ${i} quality: ${compressQualityMapped*1.25}%`);
               });
            const compressedImage = await Sharp(image)
               .webp({
                  quality: compressQualityMapped,
                  minSize: true,
                  effort: 0
               })
               .toBuffer();
               obj[selectedImageList[j].attribute] = compressedImage;
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

async function LogMetadata(redisKey, dbData, query, selectedTableList, selectedImageList, selectedGenericList) {
   const logExists = await CheckLogEntry(redisKey);
   if (logExists) {
      DeleteMetadata(redisKey);
   }
   await QueryDatabase(`INSERT INTO metadata_query (redisKey, query) VALUES ('${redisKey}', '${query}')`);
   for (const table of selectedTableList) {
      var primaryKeys = primaryAttSet[table];
      primaryKeys = primaryKeys.map(key => `${table}.${key}`);
      var [rows] = await QueryDatabase(`SELECT ${primaryKeys.join(',')} FROM ${query.split('FROM')[1]}`);
      rows = rows.map(obj => Object.values(obj).join(', '));
      console.log(rows);
      var i = 0;
      for (const row of rows) {
         await QueryDatabase("INSERT INTO `metadata_row` (`redisKey`, `table`, `rowOrder`, `primaryKey`) VALUES ('"+redisKey+"', '"+table+"', "+i+", '"+row+"')");
         i++;
      }
   }

   // var count = dbData.length;
   // var rowOrder = '';
//    for (const row of rows) {
//       rowOrder += row.id;
//       if (count > 1) {
//          rowOrder += ',';
//       }
//       count--;
//    }
//    QueryDatabase(`INSERT INTO metadata_roworder (redisKey, rowOrder) VALUES ('${redisKey}', '${rowOrder}')`);
//    const columns = query.match(/SELECT\s+(.+?)\s+FROM/i)[1].split(',').map(name => name.trim());
//    for (const columnName of columns) {
//       var columnType = '';
//       // if (genericAtt.includes(columnName)) {
//       //    columnType = 'generic';
//       // }
//       // else if (imageAtt.includes(columnName)) {
//       //    columnType = 'image';
//       // }
//       QueryDatabase(`INSERT INTO metadata_column (redisKey, columnName, columnType) VALUES ('${redisKey}', '${columnName}', '${columnType}')`);
//    }
//    //var [columnNames] = await QueryDatabase(`SELECT column_name FROM information_schema.columns WHERE table_name = '${mainTable}'`);
//    columnNames = columnNames.map(columnNames => columnNames.column_name);
//    conditions = query.split('FROM ')[1];
//    for (const columnName of columnNames) {
//       const regex = new RegExp(`\\b${columnName}\\b`, 'i');
//       if (regex.test(conditions)) {
//          QueryDatabase(`INSERT INTO metadata_columncondition (redisKey, columnName) VALUES ('${redisKey}', '${columnName}')`);
//       }
//    }
//    Print(`◆ Logged metadata of key '${redisKey}'`);
}

//Smart cache replace: batch processing

const eventQueue = [];
var isProcessingEvents = false;

async function processEventQueue() {
   if (eventQueue.length != 0 || !isProcessingEvents) {
      isProcessingEvents = true;
      try {
         const event = eventQueue[0];
         //var changedColumns = event.affectedColumns.filter(column => !imageAtts.includes(column));
         var batchChangedRows = [];
         while (eventQueue.length > 0) {
            const event = eventQueue.shift();
            batchChangedRows.push(event.affectedRows[0].before['id']);
         }
         await SmartCacheReplace(batchChangedRows, changedColumns);
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

async function SmartCacheReplace(batchChangedRows, changedColumns) {
   Print(`★ A change is detected in database at:`);
   Print(`  ☆ Row: ${batchChangedRows.join(', ')}`);
   Print(`  ☆ Column: ${changedColumns.join(', ')}`);
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
      //const [testResult] = await QueryDatabase(`SELECT ${primaryKeyAtt} FROM ${testConditions}`);
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
      Print(`  ☆ All affected keys: ${Array.from(affectedKeys).map(key => `'${key}'`).join(', ')}`);
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
         PrimeCache(query, redisKey, genericAtt, imageAtt, dbData, ttl);
      }
      else {
         Print(`  ☆ '${redisKey}' has expired.`);
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
