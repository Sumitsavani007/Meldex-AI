const fs=require('fs'); if(!fs.existsSync("server.js")){ console.error('missing main file'); process.exit(1); } console.log('test ok');
