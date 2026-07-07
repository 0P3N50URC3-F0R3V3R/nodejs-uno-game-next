'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function listJsFilesSorted(dir, out) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    entries.forEach(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            listJsFilesSorted(full, out);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            out.push(full);
        }
    });
    return out;
}

function computeServerHash(rootDir) {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const files = listJsFilesSorted(path.join(rootDir, 'node_src'), []);
    files.push(path.join(rootDir, 'server.js'));

    const hash = crypto.createHash('sha256');
    hash.update(pkg.version);
    files.forEach(f => {
        hash.update(crypto.createHash('sha256').update(fs.readFileSync(f)).digest());
    });
    return hash.digest('hex');
}

module.exports = { computeServerHash, listJsFilesSorted };
