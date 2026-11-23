import fs from 'fs';

const buf = fs.readFileSync('data/canva-case-1-kodak.jpg');
const base64 = buf.toString('base64');
fs.writeFileSync('mcp/src/visual_jpg.mjs', `export const VISUAL_JPG_BASE64 = "${base64}";\n`);
console.log('Successfully updated mcp/src/visual_jpg.mjs with Kodak JPEG base64 (bytes: ' + buf.length + ')');
