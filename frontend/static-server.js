const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 10000;
const distPath = path.resolve(__dirname, 'dist');

const server = http.createServer((req, res) => {
  // Remove query string and hash
  const url = req.url.split('?')[0].split('#')[0];
  
  // Default to index.html for all routes
  let filePath = path.join(distPath, url === '/' ? 'index.html' : url);
  
  // Check if file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // File doesn't exist, serve index.html for SPA
      filePath = path.join(distPath, 'index.html');
    }
    
    // Read and serve file
    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(500);
        res.end('Server Error');
        return;
      }
      
      // Set content type
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };
      
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Static server listening on http://0.0.0.0:${port}`);
});
