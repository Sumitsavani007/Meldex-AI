const fs=require('fs'); if(!fs.existsSync("src/App.jsx")){ console.error('missing main file'); process.exit(1); } console.log('test ok');
