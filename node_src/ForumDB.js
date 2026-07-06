'use strict';
const path = require('path');
const fs = require('fs');

class ForumDB {
    constructor(db, dataDir) {
        this.db = db;
        this.attachDir = path.join(dataDir, 'forum-attachments');
        fs.mkdirSync(this.attachDir, { recursive: true });
        this._init();
    }

    _init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS forum_boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS forum_threads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                board_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                pinned INTEGER DEFAULT 0,
                locked INTEGER DEFAULT 0,
                views INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_post_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS forum_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                edited_at INTEGER DEFAULT NULL
            );
            CREATE TABLE IF NOT EXISTS forum_reactions (
                post_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL DEFAULT 'like',
                created_at INTEGER NOT NULL,
                PRIMARY KEY (post_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS forum_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
        `);
    }

    // ── Boards ────────────────────────────────────────────────────────────────

    getBoards() {
        const boards = this.db.prepare('SELECT * FROM forum_boards ORDER BY sort_order, id').all();
        return boards.map(b => {
            const r = this.db.prepare(`
                SELECT COUNT(DISTINCT t.id) AS thread_count,
                       COUNT(p.id) AS post_count,
                       MAX(t.last_post_at) AS last_activity
                FROM forum_threads t
                LEFT JOIN forum_posts p ON p.thread_id = t.id
                WHERE t.board_id = ?
            `).get(b.id);
            return { ...b, thread_count: r.thread_count || 0, post_count: r.post_count || 0, last_activity: r.last_activity || null };
        });
    }

    getBoard(id) { return this.db.prepare('SELECT * FROM forum_boards WHERE id = ?').get(id) || null; }

    createBoard(name, description, sort_order) {
        return this.db.prepare(
            'INSERT INTO forum_boards (name, description, sort_order, created_at) VALUES (?, ?, ?, ?)'
        ).run(name, description || '', sort_order || 0, Date.now()).lastInsertRowid;
    }

    updateBoard(id, name, description, sort_order) {
        this.db.prepare('UPDATE forum_boards SET name = ?, description = ?, sort_order = ? WHERE id = ?')
            .run(name, description || '', sort_order || 0, id);
    }

    deleteBoard(id) {
        const threads = this.db.prepare('SELECT id FROM forum_threads WHERE board_id = ?').all(id);
        threads.forEach(t => this.deleteThread(t.id));
        this.db.prepare('DELETE FROM forum_boards WHERE id = ?').run(id);
    }

    // ── Threads ───────────────────────────────────────────────────────────────

    getThreads(boardId, page, perPage) {
        perPage = perPage || 25;
        page = Math.max(1, page || 1);
        const total = this.db.prepare('SELECT COUNT(*) AS n FROM forum_threads WHERE board_id = ?').get(boardId).n;
        const threads = this.db.prepare(`
            SELECT t.*, u.username, u.is_admin,
                (SELECT COUNT(*) FROM forum_posts WHERE thread_id = t.id) AS reply_count,
                (SELECT u2.username FROM forum_posts lp JOIN users u2 ON u2.id = lp.user_id
                 WHERE lp.thread_id = t.id ORDER BY lp.created_at DESC LIMIT 1) AS last_poster
            FROM forum_threads t
            JOIN users u ON u.id = t.user_id
            WHERE t.board_id = ?
            ORDER BY t.pinned DESC, t.last_post_at DESC
            LIMIT ? OFFSET ?
        `).all(boardId, perPage, (page - 1) * perPage);
        return { threads, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
    }

    getThread(id) {
        return this.db.prepare(
            'SELECT t.*, u.username, u.is_admin, b.name AS board_name FROM forum_threads t JOIN users u ON u.id = t.user_id JOIN forum_boards b ON b.id = t.board_id WHERE t.id = ?'
        ).get(id) || null;
    }

    createThread(boardId, userId, title, content) {
        const now = Date.now();
        return this.db.transaction(() => {
            const id = this.db.prepare(
                'INSERT INTO forum_threads (board_id, user_id, title, created_at, last_post_at) VALUES (?, ?, ?, ?, ?)'
            ).run(boardId, userId, title, now, now).lastInsertRowid;
            this.db.prepare('INSERT INTO forum_posts (thread_id, user_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, userId, content, now);
            return id;
        })();
    }

    deleteThread(id) {
        this.db.prepare('DELETE FROM forum_reactions WHERE post_id IN (SELECT id FROM forum_posts WHERE thread_id = ?)').run(id);
        this.db.prepare('DELETE FROM forum_attachments WHERE post_id IN (SELECT id FROM forum_posts WHERE thread_id = ?)').run(id);
        this.db.prepare('DELETE FROM forum_posts WHERE thread_id = ?').run(id);
        this.db.prepare('DELETE FROM forum_threads WHERE id = ?').run(id);
    }

    setPinned(id, val) { this.db.prepare('UPDATE forum_threads SET pinned = ? WHERE id = ?').run(val ? 1 : 0, id); }
    setLocked(id, val) { this.db.prepare('UPDATE forum_threads SET locked = ? WHERE id = ?').run(val ? 1 : 0, id); }
    incrementViews(id) { this.db.prepare('UPDATE forum_threads SET views = views + 1 WHERE id = ?').run(id); }

    // ── Posts ─────────────────────────────────────────────────────────────────

    getPosts(threadId, page, perPage, currentUserId, avatarDir) {
        perPage = perPage || 20;
        page = Math.max(1, page || 1);
        const total = this.db.prepare('SELECT COUNT(*) AS n FROM forum_posts WHERE thread_id = ?').get(threadId).n;
        const posts = this.db.prepare(`
            SELECT p.*, u.username, u.is_admin,
                (SELECT COUNT(*) FROM forum_posts p2 WHERE p2.user_id = p.user_id) AS user_post_count
            FROM forum_posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.thread_id = ?
            ORDER BY p.created_at ASC
            LIMIT ? OFFSET ?
        `).all(threadId, perPage, (page - 1) * perPage);
        posts.forEach(p => {
            const likes = this.db.prepare('SELECT COUNT(*) AS n FROM forum_reactions WHERE post_id = ? AND type = ?').get(p.id, 'like');
            p.likes = likes.n;
            p.liked = currentUserId ? !!this.db.prepare('SELECT 1 FROM forum_reactions WHERE post_id = ? AND user_id = ?').get(p.id, currentUserId) : false;
            p.attachments = this.db.prepare('SELECT id, original_name, size, mime_type FROM forum_attachments WHERE post_id = ?').all(p.id);
            p.has_avatar = avatarDir ? require('fs').existsSync(require('path').join(avatarDir, p.user_id + '.png')) : false;
        });
        return { posts, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
    }

    getPost(id) { return this.db.prepare('SELECT * FROM forum_posts WHERE id = ?').get(id) || null; }

    createPost(threadId, userId, content) {
        const now = Date.now();
        const id = this.db.prepare(
            'INSERT INTO forum_posts (thread_id, user_id, content, created_at) VALUES (?, ?, ?, ?)'
        ).run(threadId, userId, content, now).lastInsertRowid;
        this.db.prepare('UPDATE forum_threads SET last_post_at = ? WHERE id = ?').run(now, threadId);
        return id;
    }

    editPost(id, content) {
        this.db.prepare('UPDATE forum_posts SET content = ?, edited_at = ? WHERE id = ?').run(content, Date.now(), id);
    }

    deletePost(id) {
        this.db.prepare('DELETE FROM forum_reactions WHERE post_id = ?').run(id);
        this.db.prepare('DELETE FROM forum_attachments WHERE post_id = ?').run(id);
        this.db.prepare('DELETE FROM forum_posts WHERE id = ?').run(id);
    }

    // ── Reactions ─────────────────────────────────────────────────────────────

    toggleLike(postId, userId) {
        const ex = this.db.prepare('SELECT 1 FROM forum_reactions WHERE post_id = ? AND user_id = ?').get(postId, userId);
        if (ex) {
            this.db.prepare('DELETE FROM forum_reactions WHERE post_id = ? AND user_id = ?').run(postId, userId);
            return false;
        }
        this.db.prepare('INSERT INTO forum_reactions (post_id, user_id, type, created_at) VALUES (?, ?, ?, ?)').run(postId, userId, 'like', Date.now());
        return true;
    }

    getLikes(postId) {
        return this.db.prepare('SELECT COUNT(*) AS n FROM forum_reactions WHERE post_id = ? AND type = ?').get(postId, 'like').n;
    }

    // ── Attachments ───────────────────────────────────────────────────────────

    addAttachment(postId, userId, filename, originalName, size, mimeType) {
        return this.db.prepare(
            'INSERT INTO forum_attachments (post_id, user_id, filename, original_name, size, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(postId, userId, filename, originalName, size, mimeType, Date.now()).lastInsertRowid;
    }

    linkAttachment(id, postId) {
        this.db.prepare('UPDATE forum_attachments SET post_id = ? WHERE id = ? AND post_id IS NULL').run(postId, id);
    }

    getAttachment(id) { return this.db.prepare('SELECT * FROM forum_attachments WHERE id = ?').get(id) || null; }
}

module.exports = ForumDB;
