const Express = require('express');
const MySQL2 = require('mysql2');
const MySQL = require('mysql');
const MySQLEvents = require('@rodrigogs/mysql-events');

// Adjustable variables

let port = 1000; // Integer range [1000, infinity). Server port

const sqlHost = 'localhost'; // String. Default: localhost. Address of the webpage.
const sqlUser = 'root'; // String. Default: root. MySQL user.
const sqlPassword = 'root'; // String. Default: root. MySQL password.
const sqlDatabase = 'redisresearch'; // String. Default: redisresearch. MySQL database.

const enableSmartCacheReplace = true; // true or false. Default: true. Whether to enable metadata logging and smart cache replace features. If disabled will clear all metadata.

const enableConsolePrint = false; // true or false. Default: true. Whether to print details in console or not. Used for debugging purposes.

// Invalid system variables prevention

port = Math.round(Math.max(port, 1000));

// Console print function

function Print(string) {
   if (enableConsolePrint) {
      console.log(string);
   }
}
console.log(`---------------`);

// Initialize Express

const app = Express();
app.use(Express.static('src'));
app.listen(port, () => {
   console.log(`✔ Server is running on port ${port}`);
});

// Initialize database

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
var allColList = [];
var imageColList = [];
var genericColList = [];
var primaryColSet = {};

(async () => {
   [tableList] = await QueryDatabase(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${sqlDatabase}' AND table_name NOT LIKE 'metadata_%';`);
   tableList = tableList.map(tableList => tableList.table_name);
   for (const tableName of tableList) {
      const [columns] = await QueryDatabase(`SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}';`);
      for (const item of columns) {
         const columnName = item.column_name;
         allColList.push({
            table: tableName,
            column: columnName
         });
         const [dataType] = await QueryDatabase(`SELECT data_type FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name = '${columnName}';`);
         if (/blob/.test(dataType[0].data_type)) {
            imageColList.push({
               table: tableName,
               column: columnName
            });
         } else {
            genericColList.push({
               table: tableName,
               column: columnName
            });
         }
      }
      const [primaryKeys] = await QueryDatabase(`SELECT column_name FROM information_schema.key_column_usage WHERE table_name = '${tableName}' AND constraint_name = 'PRIMARY';`);
      primaryColSet[tableName] = primaryKeys.map(pk => pk.column_name);
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
               } catch (error) {
                  console.error(error);
               }
            }
         });
      }
      instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
      instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
   }
   Print('tableList =', tableList);
   Print('allColList =', allColList);
   Print('imageColList =', imageColList);
   Print('genericColList =', genericColList);
   Print('primaryColSet =', primaryColSet);
})();

// Initialize database listener

const sqlEventConn = MySQL.createConnection({
   host: sqlHost,
   user: sqlUser,
   password: sqlPassword
});

const instance = new MySQLEvents(sqlEventConn, { startAtEnd: true });
if (enableSmartCacheReplace) {
   instance.start()
      .then(() => {
         console.log(`✔ Listening to change in database`);
      })
      .catch(err => console.error(err));
}

// Time measurements

let startTime = 0;
let endTime = 0;
let responseTime = 0;
let loadTime = 0;

function RecordResponseTime() {
   endTime = new Date().getTime();
   responseTime = endTime - startTime;
   console.log(`  ▷ Response time: ${responseTime} ms`);
}

app.get('/loadtime/:loadtime', async (req, res) => {
   loadTime = req.params.loadtime;
   if (responseTime !== 0) {
      console.log(`  ▷ Page render time: ${loadTime - responseTime} ms`);
      console.log(`  ▷ Total load time: ${loadTime} ms`);
   }
});

// Express API endpoints

app.get('/all', async (req, res) => {
   Fetch(res, 'SELECT id, image FROM images');
});

app.get('/album/:album', async (req, res) => {
   const album = req.params.album;
   Fetch(res, 'SELECT id, image FROM images WHERE album=' + album);
});

app.get('/id/:id', async (req, res) => {
   const id = req.params.id;
   Fetch(res, 'SELECT id, image FROM images WHERE id=' + id);
});

app.get('/test', async (req, res) => {
   Fetch(res, 'SELECT id, album, value FROM images WHERE id=1 OR album=2');
});

app.get('/test2', async (req, res) => {
   Fetch(res, 'SELECT images.id, images.image, testtable.info FROM images INNER JOIN testtable ON images.id = testtable.id');
});

app.get('/test3', async (req, res) => {
   Fetch(res, 'SELECT testtable.id, images.image, testtable.info FROM images INNER JOIN testtable ON images.id = testtable.id WHERE images.album = 1');
});

// Fetch function

async function Fetch(res, query) {
   console.log(`▶ API called`);
   startTime = new Date().getTime();
   try {
      const [dbData] = await QueryDatabase(query);
      res.send(dbData);
      RecordResponseTime();
   } catch (error) {
      console.error(`Error fetching data:`, error);
      res.status(500).send('Database error');
   }
}

// Exit procedure

process.on('SIGINT', async () => {
   console.log(`✕  Exiting...`);
   console.log(`---------------`);
   sqlConn.end();
   process.exit();
});
