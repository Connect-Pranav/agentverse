import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDefaultSvg } from '../mcp/src/signal.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const svg = getDefaultSvg();
const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 1200px;
      height: 627px;
      overflow: hidden;
      background: #070B19;
    }
    svg {
      width: 1200px;
      height: 627px;
      display: block;
    }
  </style>
</head>
<body>
${svg}
</body>
</html>`;

const htmlPath = path.join(rootDir, 'temp_visual.html');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Saved HTML to:', htmlPath);
