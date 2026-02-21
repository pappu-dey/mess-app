const fs = require('fs');
// Try reading as utf-16le first, then utf-8
let c;
try {
    const buf = fs.readFileSync('app/mess/dashboard.tsx');
    if (buf[0] === 0xFF && buf[1] === 0xFE) {
        c = buf.slice(2).toString('utf16le');
    } else if (buf[0] === 0xFE && buf[1] === 0xFF) {
        c = buf.slice(2).toString('utf16le');
    } else {
        c = buf.toString('utf8');
    }
} catch (e) {
    console.error('Error reading file:', e.message);
    process.exit(1);
}
const lines = c.split(/\r?\n/);
console.log('Total lines:', lines.length);
const m = {};
for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s+(\w+)\s*:\s*[\{]/);
    if (match) {
        const n = match[1];
        if (m[n]) {
            console.log('DUPLICATE:', n, 'at lines', m[n], 'and', i + 1);
        } else {
            m[n] = i + 1;
        }
    }
}
console.log('Done');
