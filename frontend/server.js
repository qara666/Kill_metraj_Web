const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 10000;
const distPath = path.resolve(__dirname, 'dist');

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

const server = http.createServer((req, res) => {
  // Parse URL and remove query string
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // Handle root path
  if (pathname === '/') {
    const indexPath = path.join(distPath, 'index.html');
    fs.readFile(indexPath, (error, content) => {
      if (error) {
        res.writeHead(500);
        res.end('Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content, 'utf-8');
      }
    });
    return;
  }

  // Try to serve static file
  let filePath = path.join(distPath, pathname);
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      // File not found - serve index.html for SPA routing
      const indexPath = path.join(distPath, 'index.html');
      fs.readFile(indexPath, (spaError, spaContent) => {
        if (spaError) {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>404 Not Found</h1>');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(spaContent, 'utf-8');
        }
      });
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Frontend server listening on http://0.0.0.0:${port}`);
});


