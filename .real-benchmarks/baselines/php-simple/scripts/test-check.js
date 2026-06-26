const fs=require('fs'); if(!fs.existsSync("index.php")){ console.error('missing main file'); process.exit(1); } console.log('test ok');
