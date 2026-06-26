const http=require('http'); const port=Number(process.env.PORT||process.argv.at(-1)||3000); const server=http.createServer((req,res)=>{ if(req.url==='/api/status'){res.setHeader('content-type','application/json'); res.end(JSON.stringify({ok:true})); return;} res.end('<h1>Node Express Sample</h1>'); }); server.listen(port,()=>console.log('listening http://localhost:'+port));

SYNTAX_ERROR_BENCHMARK(
