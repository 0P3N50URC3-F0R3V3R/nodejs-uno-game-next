'use strict';

const PEER_UPDATABLE_FIELDS = [
    'status', 'public_key', 'server_hash', 'denied_reason',
    'last_checked_at', 'last_error', 'connected_at', 'debug_last_response'
];

class FederationDB {
    constructor(db) {
        this.db = db;
        this._init();
    }

    _init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS federation_peers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                domain TEXT NOT NULL UNIQUE,
                public_key TEXT,
                status TEXT NOT NULL DEFAULT 'Pending',
                server_hash TEXT,
                denied_reason TEXT,
                added_at INTEGER NOT NULL,
                last_checked_at INTEGER,
                last_error TEXT,
                connected_at INTEGER,
                debug_last_response TEXT
            );
            CREATE TABLE IF NOT EXISTS federation_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                peer_id INTEGER NOT NULL REFERENCES federation_peers(id),
                direction TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                delivered INTEGER NOT NULL DEFAULT 0,
                read_at INTEGER
            );
        `);
    }

    addPeer(domain) {
        const info = this.db.prepare(
            'INSERT INTO federation_peers (domain, status, added_at) VALUES (?, ?, ?)'
        ).run(domain, 'Pending', Date.now());
        return this.getPeerById(info.lastInsertRowid);
    }

    getPeerById(id) {
        return this.db.prepare('SELECT * FROM federation_peers WHERE id = ?').get(id);
    }

    getPeerByDomain(domain) {
        return this.db.prepare('SELECT * FROM federation_peers WHERE domain = ?').get(domain);
    }

    listPeers() {
        return this.db.prepare('SELECT * FROM federation_peers ORDER BY added_at DESC, id DESC').all();
    }

    updatePeerStatus(id, fields) {
        const keys = Object.keys(fields || {}).filter(k => PEER_UPDATABLE_FIELDS.includes(k));
        if (keys.length === 0) return;
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => fields[k]);
        this.db.prepare(`UPDATE federation_peers SET ${setClause} WHERE id = ?`).run(...values, id);
    }

    deletePeer(id) {
        this.db.prepare('DELETE FROM federation_messages WHERE peer_id = ?').run(id);
        this.db.prepare('DELETE FROM federation_peers WHERE id = ?').run(id);
    }

    addMessage(peerId, direction, body) {
        const delivered = direction === 'incoming' ? 1 : 0;
        const info = this.db.prepare(
            'INSERT INTO federation_messages (peer_id, direction, body, created_at, delivered) VALUES (?, ?, ?, ?, ?)'
        ).run(peerId, direction, body, Date.now(), delivered);
        return this.db.prepare('SELECT * FROM federation_messages WHERE id = ?').get(info.lastInsertRowid);
    }

    listMessages(peerId) {
        return this.db.prepare('SELECT * FROM federation_messages WHERE peer_id = ? ORDER BY created_at ASC').all(peerId);
    }

    listUndelivered(peerId) {
        return this.db.prepare(
            "SELECT * FROM federation_messages WHERE peer_id = ? AND direction = 'outgoing' AND delivered = 0 ORDER BY created_at ASC"
        ).all(peerId);
    }

    markDelivered(messageId) {
        this.db.prepare('UPDATE federation_messages SET delivered = 1 WHERE id = ?').run(messageId);
    }

    deleteConversation(peerId) {
        this.db.prepare('DELETE FROM federation_messages WHERE peer_id = ?').run(peerId);
    }

    wipeAll() {
        this.db.exec('DELETE FROM federation_messages; DELETE FROM federation_peers;');
    }
}

module.exports = FederationDB;
