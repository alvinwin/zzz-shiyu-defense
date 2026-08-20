import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = normalize(process.argv[2] || 'dist');
const port = Number(process.env.PORT || 4173);
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };

createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = normalize(join(root, relative));
  if (!file.startsWith(`${root}/`) && file !== join(root, 'index.html')) {
    response.writeHead(403).end();
    return;
  }
  const stream = createReadStream(file);
  stream.on('open', () => response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }));
  stream.on('error', () => response.writeHead(404).end('not found'));
  stream.pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} at http://127.0.0.1:${port}`));
