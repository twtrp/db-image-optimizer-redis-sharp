## Notice:
- These steps are for Windows only. Might not apply to other operating systems.

## Redis installation
1. Type in command prompt (Admin): `wsl --install` to install WSL
2. Install with UNIX username "user" and password "passwd"
3. Open a WSL terminal inside VS Code and type in: `sudo apt-get update` to update package information
4. Install Redis. Type in WSL terminal: `sudo apt-get install redis`
5. Stop Redis-server in case it has already automatically started: `sudo systemctl stop redis`
6. Disable Redis-server automatic startup: `sudo systemctl disable redis`

## MAMP installation, configuration, and sample database insertion
1. Open a browser and go to https://www.mamp.info/en/downloads/ and download MAMP
2. Install using the exe
3. Go to MAMP installation directory, default is C:\MAMP\conf\mysql, and open my.ini. Carefully do the following:
   - Add `log-bin=mysql-bin` below collation-server=utf8_general_ci
   - Change binlog_format to `row`
   - Change max_allowed_packet below mysqld, not mysqldump, to `100M`
   - Change net_buffer_length below mysqld, not mysqldump, to `100M`
   - Save the changes
4. Launch MAMP to start MySQL server
5. In browser go to http://localhost/phpMyAdmin/?lang=en to access phpMyAdmin interface
6. Go to import tab
7. Import these in order: database.sql -> images1.sql -> images2.sql. The files are in sql folder in this project directory.

## Features
- Redis caching
- Redis additive time-to-live (TTL)
- Redis snapshot backup
- Redis snapshot restoration
- Sharp image compression
- Image compression level calculation algorithm
- Smart database cache updater algorithm

## Starting the app
1. Launch MAMP to start MySQL server.
2. Start an WSL terminal inside this project directory and type `redis-server` to start redis server.
3. Make sure that app version has node_modules installed in the directory. If not, type `npm install`
4. From a generic terminal, type `cd main_Redis+Sharp` to move into folder.
5. From the generic terminal, type `node app` to start the process in localhost with port number specified in the terminal.
6. Open a browser and type in url "localhost:{portnumber}". The default is "localhost:1000"

## Using the app
- You can manually send commands to Redis by starting a new WSL terminal and type in `redis-cli`, then you can start sending commands. For example: to check all key-values, type in `keys *`
- Change the data fetch type in file "public/index.js". There are 3 types: `fetch('/all')`, `fetch('/album/{album}')`, `fetch('/id/{id}')`. Just remember to save the file before reloading the page.
- To edit the app.js, you can't just save the file when the process is running. To see the changes: save the file, press ctrl+c in the generic terminal to stop the process, then start it again with `node app`.
- Do not shutdown computer while the process terminal is running, as the key-values will not be saved. To exit properly, press Ctrl+C inside the running terminal. This will trigger the backend protocol, and will restore the snapshot when redis-server is started again.
- To manually flush all the key-values, type `flushall` in redis-cli.
