const fs=require('fs'); if(!fs.existsSync("app/page.tsx")){ console.error('missing main file'); process.exit(1); } console.log('test ok');
