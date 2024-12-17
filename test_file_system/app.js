const Express = require('express');
const MySQL2 = require('mysql2');
const fs = require('fs');
const path = require('path');

// Adjustable variables
let port = 1000; // Server port
const sqlHost = 'localhost'; // MySQL host
const sqlUser = 'root'; // MySQL user
const sqlPassword = 'root'; // MySQL password
const sqlDatabase = 'redisresearch_file_system'; // MySQL database
const imageDirectory = path.join(__dirname, 'assets'); // Directory where images are stored

// Console print function
function Print(string) {
   console.log(string);
}

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
   database: sqlDatabase,
}).promise();

async function QueryDatabase(query) {
   return sqlConn.query(query);
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

// Fetch function to get data from the database and file system
async function Fetch(res, query) {
   console.log(`▶ API called`);
   startTime = new Date().getTime();
   try {
      const [dbData] = await QueryDatabase(query);
      const result = dbData.map((item) => {
         const imagePath = path.join(imageDirectory, `${item.image}`);
         let imageBuffer;
         try {
            imageBuffer = fs.readFileSync(imagePath);
         } catch (err) {
            console.error(`Error reading image file ${item.image}:`, err);
            imageBuffer = null;
         }
         return {
            id: item.id,
            image: imageBuffer ? imageBuffer.toString('base64') : null,
         };
      });
      res.json(result);
      RecordResponseTime();
   } catch (error) {
      console.error(`Error fetching data:`, error);
      res.status(500).send('Database error');
   }
}

// Express API endpoints
app.get('/all', async (req, res) => {
   Fetch(res, 'SELECT id, image FROM images');
});

app.get('/id/:id', async (req, res) => {
   const id = req.params.id;
   Fetch(res, `SELECT id, image FROM images WHERE id=${id}`);
});

// Exit procedure
process.on('SIGINT', async () => {
   console.log(`✕  Exiting...`);
   console.log(`---------------`);
   sqlConn.end();
   process.exit();
});
