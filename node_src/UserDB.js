const Database = require('better-sqlite3');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.UNO_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'users.db');

const XP_BASE = 100;
const XP_GROWTH = 1.035;
const XP_CAP_LEVEL = 120;

const GOLD_WIN = 35;
const GOLD_DAILY_MIN = 50;
const GOLD_DAILY_MAX = 100;
const GOLD_WEEKLY_MIN = 200;
const GOLD_WEEKLY_MAX = 500;

function xpForLevel(level) {
    const l = Math.min(level, XP_CAP_LEVEL);
    return Math.floor(XP_BASE * Math.pow(XP_GROWTH, l - 1));
}

function computeXpInfo(totalXp) {
    totalXp = Math.max(0, totalXp || 0);
    let level = 1, remaining = totalXp;
    while (remaining >= xpForLevel(level)) {
        remaining -= xpForLevel(level);
        level++;
    }
    return { level, xpInLevel: remaining, xpToNext: xpForLevel(level) };
}

function hashPassword(password, salt) {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
}

function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

class UserDB {
    constructor(db) {
        if (db) {
            this.db = db;
        } else {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            this.db = new Database(DB_PATH);
        }
        this.sessionExpiryDays = 30;
        this._init();
    }

    _init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                email TEXT,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);
        const cols = [
            'xp INTEGER DEFAULT 0',
            'level INTEGER DEFAULT 1',
            'matches_won INTEGER DEFAULT 0',
            'matches_lost INTEGER DEFAULT 0',
            'matches_deserted INTEGER DEFAULT 0',
            'matches_disconnected INTEGER DEFAULT 0',
            'played_time_seconds INTEGER DEFAULT 0',
            'longest_match_seconds INTEGER DEFAULT 0',
            'cards_normal INTEGER DEFAULT 0',
            'cards_plus2 INTEGER DEFAULT 0',
            'cards_plus4 INTEGER DEFAULT 0',
            'cards_reverse INTEGER DEFAULT 0',
            'cards_wildcolor INTEGER DEFAULT 0',
            'cards_missed INTEGER DEFAULT 0',
            "hash_algo TEXT DEFAULT 'sha256'",
        ];
        cols.forEach(col => {
            try { this.db.exec('ALTER TABLE users ADD COLUMN ' + col); } catch(e){}
        });
        const achCols = [
            'uno_calls_success INTEGER DEFAULT 0',
            'uno_missed_penalty INTEGER DEFAULT 0',
            'rounds_played INTEGER DEFAULT 0',
            'color_changes INTEGER DEFAULT 0',
            'action_cards_played INTEGER DEFAULT 0',
            'ap_total INTEGER DEFAULT 0',
            'daily_challenges_completed INTEGER DEFAULT 0',
            'weekly_challenges_completed INTEGER DEFAULT 0',
            'games_hosted INTEGER DEFAULT 0',
            'games_joined INTEGER DEFAULT 0',
            'rounds_won INTEGER DEFAULT 0',
        ];
        achCols.forEach(col => {
            try { this.db.exec('ALTER TABLE users ADD COLUMN ' + col); } catch(e){}
        });
        try { this.db.exec('ALTER TABLE sessions ADD COLUMN expires_at INTEGER'); } catch(e){}
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_achievements (
                user_id INTEGER NOT NULL,
                ach_id TEXT NOT NULL,
                unlocked_at INTEGER NOT NULL,
                PRIMARY KEY (user_id, ach_id)
            );
            CREATE TABLE IF NOT EXISTS user_achievement_progress (
                user_id INTEGER NOT NULL,
                ach_id TEXT NOT NULL,
                progress INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (user_id, ach_id)
            );
            CREATE TABLE IF NOT EXISTS daily_challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                challenge_type TEXT NOT NULL,
                date_key TEXT NOT NULL,
                challenges_json TEXT NOT NULL,
                generated_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS user_challenge_progress (
                user_id INTEGER NOT NULL,
                date_key TEXT NOT NULL,
                challenge_type TEXT NOT NULL,
                challenge_idx INTEGER NOT NULL,
                progress INTEGER NOT NULL DEFAULT 0,
                completed INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (user_id, date_key, challenge_type, challenge_idx)
            );
        `);
        try { this.db.exec('ALTER TABLE users ADD COLUMN gold INTEGER DEFAULT 0'); } catch(e){}
        try { this.db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''"); } catch(e){}
        try { this.db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0'); } catch(e){}

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS friends (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                requester_id INTEGER NOT NULL,
                addressee_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(requester_id, addressee_id),
                FOREIGN KEY (requester_id) REFERENCES users(id),
                FOREIGN KEY (addressee_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS dm_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL,
                receiver_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                sent_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS global_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL,
                sender_name TEXT NOT NULL,
                text TEXT NOT NULL,
                sent_at INTEGER NOT NULL
            );
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS gold_settings (
                key TEXT PRIMARY KEY,
                value INTEGER NOT NULL,
                label TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS gold_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                multiplier REAL NOT NULL DEFAULT 2.0,
                start_at INTEGER NOT NULL,
                end_at INTEGER NOT NULL,
                active INTEGER DEFAULT 1,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            );
            CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                published INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s','now')),
                updated_at INTEGER DEFAULT (strftime('%s','now'))
            );
        `);

        const GOLD_DEFAULTS = [
            { key: 'gold_win',         value: GOLD_WIN,         label: 'Gold per game win' },
            { key: 'gold_daily_min',   value: GOLD_DAILY_MIN,   label: 'Daily challenge min' },
            { key: 'gold_daily_max',   value: GOLD_DAILY_MAX,   label: 'Daily challenge max' },
            { key: 'gold_weekly_min',  value: GOLD_WEEKLY_MIN,  label: 'Weekly challenge min' },
            { key: 'gold_weekly_max',  value: GOLD_WEEKLY_MAX,  label: 'Weekly challenge max' },
        ];
        const ins = this.db.prepare('INSERT OR IGNORE INTO gold_settings (key, value, label) VALUES (?,?,?)');
        GOLD_DEFAULTS.forEach(d => ins.run(d.key, d.value, d.label));

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS store_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                file_path TEXT,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                price INTEGER NOT NULL DEFAULT 100,
                active INTEGER DEFAULT 1,
                sort_order INTEGER DEFAULT 0,
                meta TEXT DEFAULT '{}',
                created_at INTEGER DEFAULT (strftime('%s','now'))
            );
            CREATE TABLE IF NOT EXISTS user_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                purchased_at INTEGER DEFAULT (strftime('%s','now')),
                UNIQUE(user_id, item_id)
            );
            CREATE TABLE IF NOT EXISTS user_equipped (
                user_id INTEGER NOT NULL,
                slot TEXT NOT NULL,
                item_id INTEGER,
                PRIMARY KEY(user_id, slot)
            );
        `);
        this._seedStoreItems();
    }

    _seedStoreItems() {
        const count = this.db.prepare('SELECT COUNT(*) c FROM store_items').get().c;
        if (count > 0) return;
        const seedPath = path.join(__dirname, 'store_seed.json');
        let items;
        try { items = JSON.parse(fs.readFileSync(seedPath, 'utf8')); } catch (e) { return; }
        const ins = this.db.prepare(
            'INSERT INTO store_items (type, file_path, name, description, price, active, sort_order, meta) VALUES (?,?,?,?,?,?,?,?)'
        );
        const insertAll = this.db.transaction((rows) => {
            rows.forEach(r => ins.run(r.type, r.file_path, r.name, r.description, r.price, r.active, r.sort_order, r.meta));
        });
        insertAll(items);
    }

    register(username, password, email) {
        if (!username || username.length < 2 || username.length > 16) {
            return { error: 'Username must be 2–16 characters' };
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return { error: 'Username: letters, numbers, underscore only' };
        }
        if (!password || password.length < 3) {
            return { error: 'Password must be at least 3 characters' };
        }

        const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return { error: 'Username already taken' };
        }

        const hash = bcrypt.hashSync(password, 10);
        const now = Date.now();

        try {
            const result = this.db.prepare(
                'INSERT INTO users (username, email, password_hash, salt, hash_algo, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(username, email || null, hash, '', 'bcrypt', now);

            const token = generateToken();
            const expiresAt = now + this.sessionExpiryDays * 86400000;
            this.db.prepare(
                'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
            ).run(token, result.lastInsertRowid, now, expiresAt);

            return { token, username, id: result.lastInsertRowid };
        } catch (e) {
            return { error: 'Registration failed' };
        }
    }

    login(username, password) {
        if (!username || !password) {
            return { error: 'Fill in all fields' };
        }
        const user = this.db.prepare(
            'SELECT * FROM users WHERE username = ? COLLATE NOCASE'
        ).get(username);
        if (!user) {
            return { error: 'Invalid username or password' };
        }

        let valid = false;
        if (user.hash_algo === 'bcrypt') {
            valid = bcrypt.compareSync(password, user.password_hash);
        } else {
            const legacyHash = crypto.createHash('sha256').update(password + user.salt).digest('hex');
            valid = legacyHash === user.password_hash;
            if (valid) {
                const newHash = bcrypt.hashSync(password, 10);
                this.db.prepare('UPDATE users SET password_hash = ?, salt = ?, hash_algo = ? WHERE id = ?').run(newHash, '', 'bcrypt', user.id);
            }
        }
        if (!valid) {
            return { error: 'Invalid username or password' };
        }

        const token = generateToken();
        const now = Date.now();
        const expiresAt = now + this.sessionExpiryDays * 86400000;
        this.db.prepare(
            'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
        ).run(token, user.id, now, expiresAt);

        return { token, username: user.username, id: user.id };
    }

    getUserByToken(token) {
        if (!token) return null;
        const now = Date.now();
        return this.db.prepare(
            'SELECT u.id, u.username, u.is_admin FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > ?)'
        ).get(token, now) || null;
    }

    logout(token) {
        if (token) this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return { ok: true };
    }

    awardXP(userId, xpGain) {
        if (!userId || !xpGain || xpGain <= 0) return null;
        const user = this.db.prepare('SELECT xp, level FROM users WHERE id = ?').get(userId);
        if (!user) return null;
        const prevXp = user.xp || 0;
        const newXp = prevXp + xpGain;
        const prevInfo = computeXpInfo(prevXp);
        const newInfo = computeXpInfo(newXp);
        this.db.prepare('UPDATE users SET xp = ?, level = ? WHERE id = ?').run(newXp, newInfo.level, userId);
        return { xp: newXp, level: newInfo.level, leveledUp: newInfo.level > prevInfo.level, gain: xpGain, xpInLevel: newInfo.xpInLevel, xpToNext: newInfo.xpToNext };
    }

    awardGold(userId, amount) {
        if (!userId || !amount || amount <= 0) return null;
        this.db.prepare('UPDATE users SET gold = gold + ? WHERE id = ?').run(amount, userId);
        const row = this.db.prepare('SELECT gold FROM users WHERE id = ?').get(userId);
        return row ? { gold: row.gold } : null;
    }

    getGold(userId) {
        const row = this.db.prepare('SELECT gold FROM users WHERE id = ?').get(userId);
        return row ? (row.gold || 0) : 0;
    }

    friendSendRequest(requesterId, addresseeId) {
        if (requesterId === addresseeId) return { error: 'Cannot add yourself' };
        const count = this.db.prepare('SELECT COUNT(*) as c FROM friends WHERE requester_id=? AND status=?').get(requesterId, 'accepted');
        if (count && count.c >= 200) return { error: 'Friend limit reached' };
        const existing = this.db.prepare(
            'SELECT * FROM friends WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)'
        ).get(requesterId, addresseeId, addresseeId, requesterId);
        if (existing) {
            if (existing.status === 'accepted') return { error: 'Already friends' };
            return { error: 'Request already pending' };
        }
        const now = Date.now();
        try {
            this.db.prepare('INSERT INTO friends (requester_id, addressee_id, status, created_at, updated_at) VALUES (?,?,?,?,?)')
                .run(requesterId, addresseeId, 'pending', now, now);
            return { ok: true };
        } catch(e) { return { error: 'Request failed' }; }
    }

    friendAccept(userId, requesterId) {
        const row = this.db.prepare(
            'SELECT * FROM friends WHERE requester_id=? AND addressee_id=? AND status=?'
        ).get(requesterId, userId, 'pending');
        if (!row) return { error: 'Request not found' };
        this.db.prepare('UPDATE friends SET status=?, updated_at=? WHERE id=?').run('accepted', Date.now(), row.id);
        return { ok: true };
    }

    friendDecline(userId, requesterId) {
        this.db.prepare(
            'DELETE FROM friends WHERE ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) AND status=?'
        ).run(requesterId, userId, userId, requesterId, 'pending');
        return { ok: true };
    }

    friendRemove(userId, otherId) {
        this.db.prepare(
            'DELETE FROM friends WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)'
        ).run(userId, otherId, otherId, userId);
        return { ok: true };
    }

    friendsGet(userId) {
        return this.db.prepare(`
            SELECT u.id, u.username,
                CASE WHEN f.requester_id=? THEN 'sent' ELSE 'received' END as direction,
                f.status
            FROM friends f
            JOIN users u ON u.id = CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END
            WHERE (f.requester_id=? OR f.addressee_id=?) AND f.status='accepted'
        `).all(userId, userId, userId, userId);
    }

    friendsPendingIncoming(userId) {
        return this.db.prepare(`
            SELECT u.id, u.username FROM friends f
            JOIN users u ON u.id = f.requester_id
            WHERE f.addressee_id=? AND f.status='pending'
        `).all(userId);
    }

    friendsPendingOutgoing(userId) {
        return this.db.prepare(`
            SELECT u.id, u.username FROM friends f
            JOIN users u ON u.id = f.addressee_id
            WHERE f.requester_id=? AND f.status='pending'
        `).all(userId);
    }

    friendshipStatus(userId, otherId) {
        const row = this.db.prepare(
            'SELECT * FROM friends WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)'
        ).get(userId, otherId, otherId, userId);
        if (!row) return 'none';
        if (row.status === 'accepted') return 'friends';
        if (row.requester_id === userId) return 'pending_sent';
        return 'pending_received';
    }

    areFriends(userId, otherId) {
        const row = this.db.prepare(
            'SELECT id FROM friends WHERE ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) AND status=?'
        ).get(userId, otherId, otherId, userId, 'accepted');
        return !!row;
    }

    dmSend(senderId, receiverId, text) {
        const sentAt = Date.now();
        const result = this.db.prepare(
            'INSERT INTO dm_messages (sender_id, receiver_id, text, sent_at) VALUES (?,?,?,?)'
        ).run(senderId, receiverId, text, sentAt);
        const lo = Math.min(senderId, receiverId), hi = Math.max(senderId, receiverId);
        this.db.prepare(`
            DELETE FROM dm_messages WHERE id NOT IN (
                SELECT id FROM dm_messages
                WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
                ORDER BY sent_at DESC LIMIT 50
            ) AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?))
        `).run(lo, hi, hi, lo, lo, hi, hi, lo);
        return { id: result.lastInsertRowid, sentAt };
    }

    dmGetHistory(userId, otherId) {
        return this.db.prepare(`
            SELECT id, sender_id as senderId, text, sent_at as sentAt
            FROM dm_messages
            WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
            ORDER BY sent_at ASC LIMIT 50
        `).all(userId, otherId, otherId, userId);
    }

    globalMessageSave(senderId, senderName, text) {
        this.db.prepare(
            'INSERT INTO global_messages (sender_id, sender_name, text, sent_at) VALUES (?,?,?,?)'
        ).run(senderId, senderName, text, Date.now());
        this.db.prepare(`
            DELETE FROM global_messages WHERE id NOT IN (
                SELECT id FROM global_messages ORDER BY sent_at DESC LIMIT 100
            )
        `).run();
    }

    globalMessagesClear() {
        this.db.prepare('DELETE FROM global_messages').run();
    }

    globalMessagesGetRecent(limit) {
        limit = Math.min(limit || 100, 100);
        return this.db.prepare(
            'SELECT id, sender_id as senderId, sender_name as senderName, text, sent_at as sentAt FROM global_messages ORDER BY sent_at DESC LIMIT ?'
        ).all(limit).reverse();
    }

    computeXpInfo(xp) { return computeXpInfo(xp); }

    changePassword(userId, oldPassword, newPassword) {
        if (!newPassword || newPassword.length < 3) return { error: 'Password too short' };
        const user = this.db.prepare('SELECT password_hash, salt, hash_algo FROM users WHERE id = ?').get(userId);
        if (!user) return { error: 'User not found' };
        const valid = user.hash_algo === 'bcrypt'
            ? bcrypt.compareSync(oldPassword || '', user.password_hash)
            : hashPassword(oldPassword || '', user.salt) === user.password_hash;
        if (!valid) return { error: 'Wrong current password' };
        const newHash = bcrypt.hashSync(newPassword, 10);
        this.db.prepare('UPDATE users SET password_hash = ?, salt = ?, hash_algo = ? WHERE id = ?').run(newHash, '', 'bcrypt', userId);
        return { ok: true };
    }

    usernameExists(username) {
        return !!this.db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
    }

    getUserByUsername(username) {
        return this.db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
    }

    changeUsername(userId, newUsername) {
        if (!newUsername || newUsername.length < 2 || newUsername.length > 16) return { error: 'Username must be 2–16 characters' };
        if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) return { error: 'Username: letters, numbers, underscore only' };
        if (this.db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').get(newUsername, userId)) return { error: 'Username already taken' };
        try {
            this.db.prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername, userId);
            return { ok: true, username: newUsername };
        } catch(e) { return { error: 'Rename failed' }; }
    }

    adminSetStats(userId, stats) {
        const ALLOWED = ['xp', 'matches_won', 'matches_lost', 'matches_deserted', 'matches_disconnected', 'played_time_seconds', 'longest_match_seconds'];
        const parts = [], vals = [];
        ALLOWED.forEach(col => {
            if (stats && stats[col] !== undefined && stats[col] !== '') {
                const v = parseInt(stats[col]);
                if (!isNaN(v) && v >= 0) { parts.push(col + ' = ?'); vals.push(v); }
            }
        });
        if (!parts.length) return { error: 'Nothing to update' };
        vals.push(userId);
        this.db.prepare('UPDATE users SET ' + parts.join(', ') + ' WHERE id = ?').run(...vals);
        const user = this.db.prepare('SELECT xp FROM users WHERE id = ?').get(userId);
        if (user) {
            const info = computeXpInfo(user.xp || 0);
            this.db.prepare('UPDATE users SET level = ? WHERE id = ?').run(info.level, userId);
        }
        return { ok: true };
    }

    getProfile(userId) {
        return this.db.prepare(
            'SELECT id, username, xp, level, created_at FROM users WHERE id = ?'
        ).get(userId) || null;
    }

    getUsers() {
        return this.db.prepare(
            'SELECT id, username, email, xp, level, created_at, is_admin, matches_won, matches_lost, matches_deserted, matches_disconnected, played_time_seconds, longest_match_seconds FROM users ORDER BY id ASC'
        ).all();
    }

    setUserRole(userId, role) {
        this.db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(role, userId);
    }

    deleteUser(userId) {
        this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
        this.db.prepare('DELETE FROM friends WHERE requester_id = ? OR addressee_id = ?').run(userId, userId);
        const r = this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        return { ok: r.changes > 0 };
    }

    renameUser(userId, newUsername) {
        if (!newUsername || newUsername.length < 2 || newUsername.length > 16) return { error: 'Invalid username' };
        if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) return { error: 'Invalid characters' };
        const existing = this.db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(newUsername, userId);
        if (existing) return { error: 'Username taken' };
        try {
            this.db.prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername, userId);
            return { ok: true };
        } catch(e) { return { error: 'Rename failed' }; }
    }

    adminResetPassword(userId, newPassword) {
        if (!newPassword || newPassword.length < 3) return { error: 'Password too short' };
        const hash = bcrypt.hashSync(newPassword, 10);
        this.db.prepare('UPDATE users SET password_hash = ?, salt = ?, hash_algo = ? WHERE id = ?').run(hash, '', 'bcrypt', userId);
        this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
        return { ok: true };
    }

    getLeaderboard(limit) {
        limit = Math.min(Math.max(parseInt(limit) || 10, 1), 50);
        return this.db.prepare(
            'SELECT id, username, xp, level FROM users ORDER BY xp DESC LIMIT ?'
        ).all(limit);
    }

    getLeaderboardAll(limit) {
        limit = Math.min(Math.max(parseInt(limit) || 5, 1), 20);
        const q = (order, cols) => this.db.prepare(
            'SELECT id, username, ' + cols + ' FROM users WHERE ' + order.split(' ')[0] + ' > 0 ORDER BY ' + order + ' LIMIT ?'
        ).all(limit);
        const totalCards = '(cards_normal + cards_plus2 + cards_plus4 + cards_reverse + cards_wildcolor + cards_missed)';
        const totalWild  = '(cards_plus4 + cards_wildcolor)';
        return {
            level:   this.db.prepare('SELECT id, username, level, xp FROM users WHERE level > 1 OR xp > 0 ORDER BY level DESC, xp DESC LIMIT ?').all(limit),
            wins:    q('matches_won DESC',            'matches_won'),
            losses:  q('matches_lost DESC',           'matches_lost'),
            cards:   this.db.prepare('SELECT id, username, ' + totalCards + ' AS total_cards FROM users WHERE ' + totalCards + ' > 0 ORDER BY total_cards DESC LIMIT ?').all(limit),
            time:    q('played_time_seconds DESC',    'played_time_seconds'),
            longest: q('longest_match_seconds DESC',  'longest_match_seconds'),
            wild:    this.db.prepare('SELECT id, username, ' + totalWild + ' AS total_wild FROM users WHERE ' + totalWild + ' > 0 ORDER BY total_wild DESC LIMIT ?').all(limit),
        };
    }

    getProfile(userId) {
        return this.db.prepare(
            'SELECT id, username, xp, level, created_at, bio, ' +
            'matches_won, matches_lost, matches_deserted, matches_disconnected, ' +
            'played_time_seconds, longest_match_seconds, ' +
            'cards_normal, cards_plus2, cards_plus4, cards_reverse, cards_wildcolor, cards_missed ' +
            'FROM users WHERE id = ?'
        ).get(userId) || null;
    }

    setBio(userId, bio) {
        this.db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, userId);
    }

    getPublicProfileByUsername(username) {
        if (!username) return null;
        const user = this.db.prepare(
            'SELECT id, username, level, xp, matches_won, matches_lost, played_time_seconds, ap_total, bio FROM users WHERE username = ? COLLATE NOCASE'
        ).get(username);
        if (!user) return null;
        const avatarFile = path.join(DATA_DIR, 'avatars', user.id + '.png');
        const unlocked_ids = this.db.prepare('SELECT ach_id FROM user_achievements WHERE user_id = ?')
            .all(user.id).map(r => r.ach_id);
        return {
            id: user.id,
            username: user.username,
            level: user.level || 1,
            xp: user.xp || 0,
            matches_won: user.matches_won || 0,
            matches_lost: user.matches_lost || 0,
            played_time_seconds: user.played_time_seconds || 0,
            ap_total: user.ap_total || 0,
            bio: user.bio || '',
            achievements_count: unlocked_ids.length,
            unlocked_ids,
            avatar: fs.existsSync(avatarFile) ? '/api/profile/avatar/' + user.id : null,
        };
    }

    bumpStat(userId, col, n) {
        const ALLOWED = new Set([
            'matches_won','matches_lost','matches_deserted','matches_disconnected',
            'played_time_seconds','longest_match_seconds',
            'cards_normal','cards_plus2','cards_plus4','cards_reverse','cards_wildcolor','cards_missed',
            'uno_calls_success','uno_missed_penalty','rounds_played','color_changes',
            'action_cards_played','ap_total','daily_challenges_completed',
            'weekly_challenges_completed','games_hosted','games_joined','rounds_won',
        ]);
        if (!userId || !ALLOWED.has(col)) return;
        n = Math.floor(n) || 1;
        this.db.prepare('UPDATE users SET ' + col + ' = ' + col + ' + ? WHERE id = ?').run(n, userId);
    }

    flushCardStats(userId, stats) {
        if (!userId || !stats) return;
        const CARD_COLS = ['cards_normal','cards_plus2','cards_plus4','cards_reverse','cards_wildcolor','cards_missed'];
        const parts = [], vals = [];
        CARD_COLS.forEach(c => {
            if (stats[c] > 0) { parts.push(c + ' = ' + c + ' + ?'); vals.push(stats[c]); }
        });
        if (!parts.length) return;
        vals.push(userId);
        this.db.prepare('UPDATE users SET ' + parts.join(', ') + ' WHERE id = ?').run(...vals);
    }

    setLongestMatch(userId, seconds) {
        if (!userId || !seconds) return;
        const user = this.db.prepare('SELECT longest_match_seconds FROM users WHERE id = ?').get(userId);
        if (user && seconds > (user.longest_match_seconds || 0)) {
            this.db.prepare('UPDATE users SET longest_match_seconds = ? WHERE id = ?').run(seconds, userId);
        }
    }

    getUnlockedIds(userId) {
        return this.db.prepare('SELECT ach_id FROM user_achievements WHERE user_id = ?').all(userId).map(r => r.ach_id);
    }

    insertAchievement(userId, achId) {
        const res = this.db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, ach_id, unlocked_at) VALUES (?, ?, ?)').run(userId, achId, Date.now());
        return res.changes > 0;
    }

    bumpApTotal(userId, ap) {
        this.db.prepare('UPDATE users SET ap_total = ap_total + ? WHERE id = ?').run(ap, userId);
    }

    getAchievementProgress(userId, achId) {
        const row = this.db.prepare('SELECT progress FROM user_achievement_progress WHERE user_id = ? AND ach_id = ?').get(userId, achId);
        return row ? row.progress : 0;
    }

    incrementAchievementProgress(userId, achId, by) {
        by = by || 1;
        this.db.prepare('INSERT INTO user_achievement_progress (user_id, ach_id, progress) VALUES (?, ?, ?) ON CONFLICT(user_id, ach_id) DO UPDATE SET progress = progress + ?').run(userId, achId, by, by);
        return this.getAchievementProgress(userId, achId);
    }

    getChallenges(type) {
        return this.db.prepare('SELECT * FROM daily_challenges WHERE challenge_type = ? ORDER BY id DESC LIMIT 1').get(type) || null;
    }

    setChallenges(type, dateKey, challengesJson, generatedAt, expiresAt) {
        this.db.prepare('DELETE FROM daily_challenges WHERE challenge_type = ?').run(type);
        this.db.prepare('INSERT INTO daily_challenges (challenge_type, date_key, challenges_json, generated_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(type, dateKey, challengesJson, generatedAt, expiresAt);
    }

    getUserChallengeProgress(userId, type, dateKey) {
        return this.db.prepare('SELECT challenge_idx, progress, completed FROM user_challenge_progress WHERE user_id = ? AND challenge_type = ? AND date_key = ?').all(userId, type, dateKey);
    }

    incrementChallengeProgress(userId, type, dateKey, idx, by) {
        by = by || 1;
        this.db.prepare('INSERT INTO user_challenge_progress (user_id, date_key, challenge_type, challenge_idx, progress) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, date_key, challenge_type, challenge_idx) DO UPDATE SET progress = progress + ? WHERE completed = 0').run(userId, dateKey, type, idx, by, by);
        const row = this.db.prepare('SELECT progress FROM user_challenge_progress WHERE user_id = ? AND challenge_type = ? AND date_key = ? AND challenge_idx = ?').get(userId, type, dateKey, idx);
        return row ? row.progress : 0;
    }

    markChallengeCompleted(userId, type, dateKey, idx) {
        this.db.prepare('UPDATE user_challenge_progress SET completed = 1 WHERE user_id = ? AND challenge_type = ? AND date_key = ? AND challenge_idx = ?').run(userId, type, dateKey, idx);
        this.bumpStat(userId, type === 'daily' ? 'daily_challenges_completed' : 'weekly_challenges_completed', 1);
    }

    getApTotal(userId) {
        const row = this.db.prepare('SELECT ap_total FROM users WHERE id = ?').get(userId);
        return row ? (row.ap_total || 0) : 0;
    }

    searchUsers(q, limit) {
        limit = Math.min(Math.max(parseInt(limit) || 10, 1), 20);
        const rows = this.db.prepare(
            'SELECT id, username, level, bio FROM users WHERE username LIKE ? COLLATE NOCASE ORDER BY level DESC LIMIT ?'
        ).all('%' + q + '%', limit);
        return rows.map(u => {
            const avatarFile = path.join(DATA_DIR, 'avatars', u.id + '.png');
            const eq = this.storeGetEquipped(u.id);
            return {
                id: u.id,
                username: u.username,
                level: u.level || 1,
                bio: u.bio || '',
                avatar: fs.existsSync(avatarFile) ? '/api/profile/avatar/' + u.id : null,
                reticle: eq.reticle ? '/store/asset/' + eq.reticle.file_path : null,
            };
        });
    }

    storeGetItems(userId) {
        const items = this.db.prepare('SELECT * FROM store_items WHERE active=1 ORDER BY type, sort_order, id').all();
        if (!userId) return items.map(i => ({ ...i, owned: false, equipped: false }));
        const owned = new Set(this.db.prepare('SELECT item_id FROM user_items WHERE user_id=?').all(userId).map(r => r.item_id));
        const equippedSet = new Set(this.db.prepare('SELECT item_id FROM user_equipped WHERE user_id=?').all(userId).map(r => r.item_id));
        return items.map(i => ({ ...i, owned: owned.has(i.id), equipped: equippedSet.has(i.id) }));
    }

    storeBuyItem(userId, itemId) {
        const item = this.db.prepare('SELECT * FROM store_items WHERE id=? AND active=1').get(itemId);
        if (!item) return { error: 'Item not found' };
        const already = this.db.prepare('SELECT id FROM user_items WHERE user_id=? AND item_id=?').get(userId, itemId);
        if (already) return { error: 'Already owned' };
        const user = this.db.prepare('SELECT gold FROM users WHERE id=?').get(userId);
        if (!user || (user.gold || 0) < item.price) return { error: 'Not enough gold' };
        const tx = this.db.transaction(() => {
            this.db.prepare('UPDATE users SET gold = gold - ? WHERE id=?').run(item.price, userId);
            this.db.prepare('INSERT INTO user_items (user_id, item_id) VALUES (?,?)').run(userId, itemId);
        });
        tx();
        const newGold = this.db.prepare('SELECT gold FROM users WHERE id=?').get(userId).gold;
        return { ok: true, gold: newGold };
    }

    storeEquip(userId, slot, itemId) {
        if (itemId === null || itemId === undefined) {
            this.db.prepare('DELETE FROM user_equipped WHERE user_id=? AND slot=?').run(userId, slot);
            return { ok: true };
        }
        const owned = this.db.prepare('SELECT id FROM user_items WHERE user_id=? AND item_id=?').get(userId, itemId);
        if (!owned) return { error: 'Not owned' };
        this.db.prepare('INSERT OR REPLACE INTO user_equipped (user_id, slot, item_id) VALUES (?,?,?)').run(userId, slot, itemId);
        return { ok: true };
    }

    storeGetEquipped(userId) {
        const rows = this.db.prepare(
            'SELECT ue.slot, si.id, si.name, si.file_path, si.meta FROM user_equipped ue JOIN store_items si ON si.id=ue.item_id WHERE ue.user_id=? AND si.active=1'
        ).all(userId);
        const result = { reticle: null, background: null, bg_profile: null, title: null, name_effect: null };
        rows.forEach(r => { result[r.slot] = { id: r.id, name: r.name, file_path: r.file_path, meta: r.meta }; });
        return result;
    }

    storeGetOwned(userId) {
        const equippedRows = this.db.prepare('SELECT slot, item_id FROM user_equipped WHERE user_id=?').all(userId);
        const equippedMap = {};
        equippedRows.forEach(r => { equippedMap[r.item_id] = r.slot; });
        return this.db.prepare(
            'SELECT si.* FROM user_items ui JOIN store_items si ON si.id=ui.item_id WHERE ui.user_id=? ORDER BY si.type, si.sort_order'
        ).all(userId).map(i => ({ ...i, equipped: equippedMap[i.id] || null }));
    }

    storeAdminGetAll() {
        return this.db.prepare('SELECT * FROM store_items ORDER BY type, sort_order, id').all();
    }

    storeAdminCreate(type, filePath, name, description, price, meta) {
        const r = this.db.prepare(
            'INSERT INTO store_items (type, file_path, name, description, price, meta) VALUES (?,?,?,?,?,?)'
        ).run(type, filePath || null, name, description || '', price || 100, meta || '{}');
        return { id: r.lastInsertRowid };
    }

    storeAdminUpdate(id, fields) {
        const allowed = ['name', 'description', 'price', 'active', 'sort_order', 'meta'];
        const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
        if (!updates.length) return { ok: true };
        const sql = 'UPDATE store_items SET ' + updates.map(([k]) => k + '=?').join(',') + ' WHERE id=?';
        this.db.prepare(sql).run(...updates.map(([, v]) => v), id);
        return { ok: true };
    }

    storeAdminDelete(id) {
        this.db.prepare('DELETE FROM user_equipped WHERE item_id=?').run(id);
        this.db.prepare('DELETE FROM user_items WHERE item_id=?').run(id);
        this.db.prepare('DELETE FROM store_items WHERE id=?').run(id);
        return { ok: true };
    }

    storeAdminSetActive(id, active) {
        this.db.prepare('UPDATE store_items SET active=? WHERE id=?').run(active ? 1 : 0, id);
        return { ok: true };
    }

    goldGetSettings() {
        return this.db.prepare('SELECT key, value, label FROM gold_settings ORDER BY key').all();
    }

    goldSetSetting(key, value) {
        this.db.prepare('UPDATE gold_settings SET value=? WHERE key=?').run(value, key);
        return { ok: true };
    }

    goldGetActiveMultiplier() {
        const now = Math.floor(Date.now() / 1000);
        const row = this.db.prepare(
            'SELECT MAX(multiplier) as m FROM gold_events WHERE active=1 AND start_at<=? AND end_at>=?'
        ).get(now, now);
        return (row && row.m) ? row.m : 1.0;
    }

    goldGetEffective(key) {
        const row = this.db.prepare('SELECT value FROM gold_settings WHERE key=?').get(key);
        const base = row ? row.value : 0;
        const mult = this.goldGetActiveMultiplier();
        return Math.round(base * mult);
    }

    goldGetEvents() {
        return this.db.prepare('SELECT * FROM gold_events ORDER BY start_at DESC').all();
    }

    goldCreateEvent(name, description, multiplier, start_at, end_at) {
        const r = this.db.prepare(
            'INSERT INTO gold_events (name, description, multiplier, start_at, end_at) VALUES (?,?,?,?,?)'
        ).run(name, description || '', multiplier || 2.0, start_at, end_at);
        return { id: r.lastInsertRowid };
    }

    goldUpdateEvent(id, fields) {
        const allowed = ['name', 'description', 'multiplier', 'start_at', 'end_at', 'active'];
        const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
        if (!updates.length) return { ok: true };
        this.db.prepare('UPDATE gold_events SET ' + updates.map(([k]) => k + '=?').join(',') + ' WHERE id=?')
            .run(...updates.map(([, v]) => v), id);
        return { ok: true };
    }

    goldDeleteEvent(id) {
        this.db.prepare('DELETE FROM gold_events WHERE id=?').run(id);
        return { ok: true };
    }

    newsGetPublished() {
        return this.db.prepare('SELECT * FROM news WHERE published=1 ORDER BY created_at DESC').all();
    }

    newsGetAll() {
        return this.db.prepare('SELECT * FROM news ORDER BY created_at DESC').all();
    }

    newsCreate(title, content) {
        const r = this.db.prepare(
            'INSERT INTO news (title, content) VALUES (?,?)'
        ).run(title, content || '');
        return { id: r.lastInsertRowid };
    }

    newsUpdate(id, fields) {
        const allowed = ['title', 'content', 'published'];
        const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
        if (!updates.length) return { ok: true };
        const now = Math.floor(Date.now() / 1000);
        this.db.prepare('UPDATE news SET ' + updates.map(([k]) => k + '=?').join(',') + ', updated_at=? WHERE id=?')
            .run(...updates.map(([, v]) => v), now, id);
        return { ok: true };
    }

    newsDelete(id) {
        this.db.prepare('DELETE FROM news WHERE id=?').run(id);
        return { ok: true };
    }

    storeAdminSync() {
        const STORE_DIR = path.join(__dirname, '..', 'src', 'store');
        const typeMap = { 'anim-avatar': 'reticle', 'anim-background': 'background' };
        let created = 0, skipped = 0;
        Object.entries(typeMap).forEach(([folder, type]) => {
            const dir = path.join(STORE_DIR, folder);
            if (!fs.existsSync(dir)) return;
            const defaultPrice = type === 'background' ? 200 : 100;
            fs.readdirSync(dir).forEach(file => {
                if (file.startsWith('.')) return;
                const filePath = folder + '/' + file;
                const exists = this.db.prepare('SELECT id FROM store_items WHERE file_path=?').get(filePath);
                if (exists) { skipped++; return; }
                const base = file.replace(/\.[^.]+$/, '');
                const name = base.length > 16 ? base.substring(0, 13) + '...' : base;
                this.db.prepare('INSERT INTO store_items (type, file_path, name, price) VALUES (?,?,?,?)').run(type, filePath, name, defaultPrice);
                created++;
            });
        });
        return { created, skipped };
    }
}

const _instance = new UserDB();
_instance.GOLD_WIN = GOLD_WIN;
_instance.GOLD_DAILY_MIN = GOLD_DAILY_MIN;
_instance.GOLD_DAILY_MAX = GOLD_DAILY_MAX;
_instance.GOLD_WEEKLY_MIN = GOLD_WEEKLY_MIN;
_instance.GOLD_WEEKLY_MAX = GOLD_WEEKLY_MAX;
module.exports = _instance;
module.exports.UserDB = UserDB;
