const express = require('express');
const mysql2 = require('mysql2');
const mysql = require('mysql');
const MySQLEvents = require('@rodrigogs/mysql-events');
const ioredis = require("ioredis");
const sharp = require('sharp');
const queue = require('better-queue');

//Adjustable variables

let port = 1000; //Integer range [1000, infinity). Server port

const sqlHost = 'localhost'; //String. Address of the webpage.
const sqlUser = 'root'; //String. MySQL user.
const sqlPassword = 'root'; //String. MySQL password.
const sqlDatabase = 'redisresearch'; //String. MySQL password.
const mainTable = 'images'; 
const primaryKeyAtt = 'id';
const imageAtt = 'image';

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

const app = express();
app.use(express.static('src'));
app.listen(port, () => {
   console.log(`---------------`);
   console.log(`✔ Server is running on port ${port}`);
});

//Initialize Redis

const redis = new ioredis();

//Initialize database

const sqlConn = mysql2.createConnection({
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

const sqlEventConn = mysql.createConnection({
   host: sqlHost,
   user: sqlUser,
   password: sqlPassword
});

const instance = new MySQLEvents(sqlEventConn, {startAtEnd: true});
if (enableSmartCacheReplace) {
   instance.start()
      .then(() => {
         Print(`✔ Listening to change in DB`);
      })
      .catch(err => console.error('⚠︎ MySQLEvent failed to start.', err));
}

//Initialize queue

var q = new queue(function (input, cb) {
})

//Initialize time measurements

let startTime = 0;
let endTime = 0;
let responseTime = 0;
let loadTime = 0;

function RecordResponseTime() {
   endTime = new Date().getTime();
   responseTime = endTime - startTime;
   Print(`○ Response time: ${responseTime} ms`);
}

app.get('/loadtime/:loadtime', async (req, res) => {
   loadTime = req.params.loadtime;
   if (responseTime != 0) {
      Print(`○ Page render time: ${loadTime-responseTime} ms`);
      Print(`○ Total load time: ${loadTime} ms`);
   }
})

//Express API endpoints

app.get('/all', async (req, res) => {
   FetchQuery(res, 'SELECT id, image FROM images', 'all', ['id'], ['image']);
})

app.get('/album/:album', async (req, res) => {
   const album = req.params.album;
   FetchQuery(res, 'SELECT id, image FROM images WHERE album='+album, 'album:'+album, ['id'], ['image']);
})

app.get('/id/:id', async (req, res) => {
   const id = req.params.id;
   FetchQuery(res, 'SELECT id, image FROM images WHERE id='+id, 'id:'+id, ['id'], ['image']);
})

app.get('/info', async (req, res) => {
   FetchQuery(res, 'SELECT id, album, value FROM images', 'info', ['id', 'album', 'value'], []);
})

app.get('/infotest', async (req, res) => {
   FetchQuery(res, 'SELECT id, album, value FROM images WHERE id=1 OR album=2', 'infotest', ['id', 'album', 'value'], []);
})

//Fetch function

async function FetchQuery(res, query, redisKey, genericAtt, imgAtt) {
   Print(`● API called`);
   startTime = new Date().getTime();
   const rJson = await redis.get(redisKey);
   Print(`○ Key: ${redisKey}`);
   if (rJson != null) {
      Print(`○ Cache: Hit`);
      res.send(rJson);
      RecordResponseTime();
      AddTTL(redisKey);
   }
   else {
      Print(`○ Cache: Miss`);
      const [dbData] = await QueryDatabase(query);
      res.send(dbData);
      RecordResponseTime();
      let dbJson;
      if (enableCompression) {
         dbJson = await CompressImage(dbData, genericAtt, imgAtt);
      }
      else {
         dbJson = JSON.stringify(dbData);
      }
      if (enableTTL) {
         redis.setex(redisKey, TTLbase, dbJson);
         Print(`▷ Set key ${redisKey} with TTL ${TTLbase} s`);
      }
      else {
         redis.set(redisKey, dbJson);
         Print(`▷ Set key ${redisKey} with no TTL`);
      }
      Print(`▷ Approximate size in Redis: ${Math.round(dbJson.length / 1.81)} bytes`);
      if (enableSmartCacheReplace) {
         LogMetadata(redisKey, query);
      }
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
      Print(`○ Changed TTL of key ${redisKey} from ${currentTTL} to ${newTTL} s`);
   }
}

//Image compression

async function CompressImage(dbData, genericAtt, imgAtt) {
   Print(`▶ Compression process begins`);
   if (imgAtt.length == 0) {
      Print(`▷ No images to be compressed`);
      return JSON.stringify(dbData);
   }
   else {
      let compressedArray = [];
      let i = 1;
      for (const item of dbData) {
         let obj = {}
         if (genericAtt == 0) {
            Print(`▷ No generic attributes`);
         }
         else {
            for (j = 0; j < genericAtt.length; j++) {
               obj[genericAtt[j]] = item[genericAtt[j]]
            }
         }
         let width;
         let height;
         let size;
         let compressQualityMapped;
         for (j = 0; j < imgAtt.length; j++) {
            const image = item[imgAtt[j]];
            await sharp(image)
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
                  Print(`▷ Img ${i} quality: ${compressQualityMapped*1.25}%`);
               });
            const compressedImage = await sharp(image)
               .webp({
                  quality: compressQualityMapped,
                  minSize: true,
                  effort: 0
               })
               .toBuffer();
               obj[imgAtt[j]] = compressedImage;
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

async function DeleteMetaData(redisKey) {
   QueryDatabase(`DELETE FROM metadata_query WHERE redisKey='${redisKey}'`);
}

async function LogMetadata(redisKey, query) {
   Print(`◼ Logging begins`);
   const logExists = await CheckLogEntry(redisKey);
   if (logExists) {
      DeleteMetaData(redisKey);
   }
   QueryDatabase(`INSERT INTO metadata_query (redisKey, query) VALUES ('${redisKey}', '${query}')`);
   const [rows] = await QueryDatabase(`SELECT `+primaryKeyAtt+` FROM`+query.split('FROM')[1]);
   for (const item of rows) {
      QueryDatabase(`INSERT INTO metadata_row (redisKey, row) VALUES ('${redisKey}', ${item.id})`);
   }
   var rowOrder = '';
   var count = rows.length;
   for (const item of rows) {
      rowOrder += item.id;
      if (count > 1) {
         rowOrder += ',';
      }
      count--;
   }
   QueryDatabase(`INSERT INTO metadata_roworder (redisKey, rowOrder) VALUES ('${redisKey}', '${rowOrder}')`);
   const columns = query.match(/SELECT\s+(.+?)\s+FROM/i)[1].split(',').map(name => name.trim());
   for (const item of columns) {
      QueryDatabase(`INSERT INTO metadata_column (redisKey, columnName) VALUES ('${redisKey}', '${item}')`);
   }
   var [columnNames] = await QueryDatabase(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '`+mainTable+`'`);
   columnNames = columnNames.map(columnNames => columnNames.COLUMN_NAME);
   conditions = query.split('FROM ')[1];
   for (const item of columnNames) {
      const regex = new RegExp(`\\b${item}\\b`, 'i');
      if (regex.test(conditions)) {
         QueryDatabase(`INSERT INTO metadata_columncondition (redisKey, columnName) VALUES ('${redisKey}', '${item}')`);
      }
   }
   Print(`◻ Logged metadata done`);
}

//Smart cache replace

if (enableSmartCacheReplace) {
   instance.addTrigger({
      name: 'DetectChange',
      expression: 'redisresearch.images',
      statement: MySQLEvents.STATEMENTS.ALL,
      onEvent: async (event) => {
         Print(`◆ A change in DB detected`);
         try {
            const changedRow = event.affectedRows[0].before['id'];
            const changedColumns = event.affectedColumns.filter(item => item !== imageAtt);
            const valBefore = event.affectedRows[0].before[changedColumns[0]];
            const valAfter = event.affectedRows[0].after[changedColumns[0]];
            Print(`◇ Row: ${changedRow}`);
            Print(`◇ Column: ${changedColumns}`);
            Print(`◇ Value before: ${valBefore}`);
            Print(`◇ Value after: ${valAfter}`);
            var potentialKeysRow = new Set();
            var [keyRow] = await QueryDatabase(`SELECT redisKey FROM metadata_row WHERE row = ${changedRow}`);
            if (keyRow.length != 0) {  
               for (const item of keyRow) {
                  potentialKeysRow.add(item.redisKey);
               }
            }
            var potentialKeysColumn = new Set();
            for (const item of changedColumns) {
               var [keyColumn] = await QueryDatabase(`SELECT redisKey FROM metadata_column WHERE columnName = '${item}'`);
               if (keyColumn.length != 0) { 
                  for (const item of keyColumn) {
                     potentialKeysColumn.add(item.redisKey);
                  }
               }
            }
            var potentialKeysCondition = new Set();
            for (const item of changedColumns) {
               var [keyCondition] = await QueryDatabase(`SELECT redisKey FROM metadata_columncondition WHERE columnName = '${item}'`);
               for (const item of keyCondition) {
                  potentialKeysCondition.add(item.redisKey);
               }
            }
            if (potentialKeysRow.size != 0) {
               Print(`◇ potentialKeysRow: ${Array.from(potentialKeysRow).join(', ')}`);
            }
            else {
               Print(`◇ potentialKeysRow: (empty)`);
            }
            if (potentialKeysColumn.size != 0) {
               Print(`◇ potentialKeysColumn: ${Array.from(potentialKeysColumn).join(', ')}`);
            }
            else {
               Print(`◇ potentialKeysColumn: (empty)`);
            }
            if (potentialKeysCondition.size != 0) {
               Print(`◇ potentialKeysCondition: ${Array.from(potentialKeysCondition).join(', ')}`);
            }
            else {
               Print(`◇ potentialKeysCondition: (empty)`);
            }
         }
         catch (error) {
            console.error(error);
         }
      }
   })
   instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
   instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
}

//Exit procedure

process.on('SIGINT', async () => {
   Print(`⌫  Exiting...`);
   await redis.bgsave();
   Print(`⌫  Saved snapshot to dump.rdb`);
   console.log(`---------------`);
   sqlConn.end();
   redis.quit();
   process.exit();
})
