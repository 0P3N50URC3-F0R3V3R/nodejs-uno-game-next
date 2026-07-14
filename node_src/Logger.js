'use strict';
const fs = require('fs');
const path = require('path');

const CATEGORIES = ['system', 'auth', 'game', 'admin'];

class Logger {
    constructor() {
        this.cfg = { enabled: false, maxFileSizeMB: 5, maxFilesPerCategory: 10, consoleOutput: true };
        this.baseDir = null;
        this.files = {};
        this._seq = 0;
    }

    init(loggingConfig, logsBaseDir) {
        this.cfg = Object.assign({ enabled: false, maxFileSizeMB: 5, maxFilesPerCategory: 10, consoleOutput: true }, loggingConfig || {});
        this.baseDir = logsBaseDir;
        this.files = {};
    }

    updateConfig(loggingConfig) {
        this.cfg = Object.assign({}, this.cfg, loggingConfig || {});
    }

    _categoryDir(category) {
        return path.join(this.baseDir, category);
    }

    _timestampForFilename() {
        this._seq = (this._seq + 1) % 1000000;
        return new Date().toISOString().replace(/[:.]/g, '-') + '-' + String(this._seq).padStart(6, '0');
    }

    _openNewFile(category) {
        const dir = this._categoryDir(category);
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, category + '_' + this._timestampForFilename() + '.log');
        this.files[category] = { path: filePath, bytes: 0 };
        return this.files[category];
    }

    _pruneOldFiles(category) {
        const dir = this._categoryDir(category);
        let entries;
        try { entries = fs.readdirSync(dir); } catch (e) { return; }
        const withStats = entries.map((name) => {
            const full = path.join(dir, name);
            let stat;
            try { stat = fs.statSync(full); } catch (e) { return null; }
            return { name, full, mtime: stat.mtimeMs };
        }).filter(Boolean).sort((a, b) => a.mtime - b.mtime || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        const excess = withStats.length - this.cfg.maxFilesPerCategory;
        for (let i = 0; i < excess; i++) {
            try { fs.unlinkSync(withStats[i].full); } catch (e) {}
        }
    }

    log(category, event, userId, data) {
        if (!this.cfg.enabled) return;
        if (CATEGORIES.indexOf(category) === -1) return;
        let rotated = false;
        if (!this.files[category]) { this._openNewFile(category); rotated = true; }

        const entry = {
            ts: new Date().toISOString(),
            event: event,
            userId: (userId === undefined ? null : userId),
            data: data || {}
        };
        const line = JSON.stringify(entry) + '\n';
        const lineBytes = Buffer.byteLength(line);
        const maxBytes = this.cfg.maxFileSizeMB * 1024 * 1024;

        if (this.files[category].bytes + lineBytes > maxBytes) {
            this._openNewFile(category);
            rotated = true;
        }

        fs.appendFileSync(this.files[category].path, line);
        this.files[category].bytes += lineBytes;
        if (rotated) this._pruneOldFiles(category);

        if (this.cfg.consoleOutput) {
            console.log('[log:' + category + '] ' + event + (entry.userId !== null ? ' user=' + entry.userId : '') + ' ' + JSON.stringify(entry.data));
        }
    }

    listFiles(category) {
        if (CATEGORIES.indexOf(category) === -1) return [];
        const dir = this._categoryDir(category);
        let entries;
        try { entries = fs.readdirSync(dir); } catch (e) { return []; }
        return entries.map((name) => {
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            return { name: name, sizeBytes: stat.size, mtime: stat.mtimeMs };
        }).sort((a, b) => b.mtime - a.mtime || (b.name < a.name ? -1 : b.name > a.name ? 1 : 0));
    }

    readFile(category, name) {
        if (CATEGORIES.indexOf(category) === -1) return null;
        const valid = this.listFiles(category).some((f) => f.name === name);
        if (!valid) return null;
        const full = path.join(this._categoryDir(category), name);
        const raw = fs.readFileSync(full, 'utf8');
        const rawLines = raw.split('\n').filter((l) => l.trim().length > 0);
        const lastLines = rawLines.slice(-2000);
        return lastLines.map((l) => {
            try { return JSON.parse(l); } catch (e) { return { parseError: true, raw: l }; }
        });
    }
}

Logger.prototype.CATEGORIES = CATEGORIES;

module.exports = new Logger();
module.exports.CATEGORIES = CATEGORIES;
