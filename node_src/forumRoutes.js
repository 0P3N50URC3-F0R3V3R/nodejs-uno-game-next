'use strict';
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const ATTACH_DIR = path.join(__dirname, '..', 'data', 'forum-attachments');
fs.mkdirSync(ATTACH_DIR, { recursive: true });

const ALLOWED_MIME = /^(image\/(jpeg|png|gif|webp)|application\/(zip|x-zip-compressed|x-rar-compressed|x-7z-compressed|octet-stream)|text\/plain)$/i;

const forumUpload = multer({
    storage: multer.diskStorage({
        destination: ATTACH_DIR,
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase().slice(0, 8);
            cb(null, Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext);
        }
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = ALLOWED_MIME.test(file.mimetype) || /\.(zip|rar|7z|tar|gz)$/i.test(file.originalname);
        cb(ok ? null : new Error('File type not allowed'), ok);
    }
});

function getUser(req, userDB) {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    return token ? userDB.getUserByToken(token) : null;
}

module.exports = function(app, userDB, forumDB, adminAuth) {
    const AVATAR_DIR = path.join(__dirname, '..', 'data', 'avatars');

    // ── Serve forum page ──────────────────────────────────────────────────────
    app.get('/forum', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'forum', 'index.html')));

    // ── Boards ────────────────────────────────────────────────────────────────
    app.get('/api/forum/boards', (req, res) => res.json(forumDB.getBoards()));
    app.get('/api/forum/boards/:id', (req, res) => {
        const board = forumDB.getBoard(parseInt(req.params.id));
        if (!board) return res.status(404).json({ error: 'Board not found' });
        res.json(board);
    });

    // ── Thread list ───────────────────────────────────────────────────────────
    app.get('/api/forum/boards/:id/threads', (req, res) => {
        const board = forumDB.getBoard(parseInt(req.params.id));
        if (!board) return res.status(404).json({ error: 'Board not found' });
        const page = Math.max(1, parseInt(req.query.page) || 1);
        res.json({ board, ...forumDB.getThreads(board.id, page, 25) });
    });

    app.post('/api/forum/boards/:id/threads', (req, res) => {
        const user = getUser(req, userDB);
        if (!user) return res.status(401).json({ error: 'Login required' });
        const board = forumDB.getBoard(parseInt(req.params.id));
        if (!board) return res.status(404).json({ error: 'Board not found' });
        const title = (req.body.title || '').trim().slice(0, 200);
        const content = (req.body.content || '').trim().slice(0, 20000);
        if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
        const id = forumDB.createThread(board.id, user.id, title, content);
        res.json({ ok: true, id });
    });

    // ── Thread detail ─────────────────────────────────────────────────────────
    app.get('/api/forum/threads/:id', (req, res) => {
        const thread = forumDB.getThread(parseInt(req.params.id));
        if (!thread) return res.status(404).json({ error: 'Thread not found' });
        forumDB.incrementViews(thread.id);
        const user = getUser(req, userDB);
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const data = forumDB.getPosts(thread.id, page, 20, user ? user.id : null, AVATAR_DIR);
        res.json({ thread, ...data, currentUserId: user ? user.id : null, currentUserRole: user ? (user.is_admin || 0) : null });
    });

    app.put('/api/forum/threads/:id/lock', (req, res) => {
        const user = getUser(req, userDB);
        if (!user || (user.is_admin || 0) < 1) return res.status(403).json({ error: 'Moderator required' });
        const thread = forumDB.getThread(parseInt(req.params.id));
        if (!thread) return res.status(404).json({ error: 'Not found' });
        forumDB.setLocked(thread.id, !thread.locked);
        res.json({ ok: true, locked: !thread.locked });
    });

    app.put('/api/forum/threads/:id/pin', (req, res) => {
        const user = getUser(req, userDB);
        if (!user || (user.is_admin || 0) < 2) return res.status(403).json({ error: 'Admin required' });
        const thread = forumDB.getThread(parseInt(req.params.id));
        if (!thread) return res.status(404).json({ error: 'Not found' });
        forumDB.setPinned(thread.id, !thread.pinned);
        res.json({ ok: true, pinned: !thread.pinned });
    });

    app.delete('/api/forum/threads/:id', (req, res) => {
        const user = getUser(req, userDB);
        if (!user || (user.is_admin || 0) < 1) return res.status(403).json({ error: 'Moderator required' });
        const thread = forumDB.getThread(parseInt(req.params.id));
        if (!thread) return res.status(404).json({ error: 'Not found' });
        forumDB.deleteThread(thread.id);
        res.json({ ok: true });
    });

    // ── Posts ─────────────────────────────────────────────────────────────────
    app.post('/api/forum/threads/:id/posts', (req, res) => {
        const user = getUser(req, userDB);
        if (!user) return res.status(401).json({ error: 'Login required' });
        const thread = forumDB.getThread(parseInt(req.params.id));
        if (!thread) return res.status(404).json({ error: 'Thread not found' });
        if (thread.locked && (user.is_admin || 0) < 1) return res.status(403).json({ error: 'Thread is locked' });
        const content = (req.body.content || '').trim().slice(0, 20000);
        if (!content) return res.status(400).json({ error: 'Content required' });
        const id = forumDB.createPost(thread.id, user.id, content);
        // Link any pending attachments
        const attIds = Array.isArray(req.body.attachments) ? req.body.attachments : [];
        attIds.forEach(aid => forumDB.linkAttachment(parseInt(aid), id));
        res.json({ ok: true, id });
    });

    app.put('/api/forum/posts/:id', (req, res) => {
        const user = getUser(req, userDB);
        if (!user) return res.status(401).json({ error: 'Login required' });
        const post = forumDB.getPost(parseInt(req.params.id));
        if (!post) return res.status(404).json({ error: 'Not found' });
        if (post.user_id !== user.id && (user.is_admin || 0) < 1) return res.status(403).json({ error: 'Forbidden' });
        const content = (req.body.content || '').trim().slice(0, 20000);
        if (!content) return res.status(400).json({ error: 'Content required' });
        forumDB.editPost(post.id, content);
        res.json({ ok: true });
    });

    app.delete('/api/forum/posts/:id', (req, res) => {
        const user = getUser(req, userDB);
        if (!user) return res.status(401).json({ error: 'Login required' });
        const post = forumDB.getPost(parseInt(req.params.id));
        if (!post) return res.status(404).json({ error: 'Not found' });
        if (post.user_id !== user.id && (user.is_admin || 0) < 1) return res.status(403).json({ error: 'Forbidden' });
        forumDB.deletePost(post.id);
        res.json({ ok: true });
    });

    app.post('/api/forum/posts/:id/like', (req, res) => {
        const user = getUser(req, userDB);
        if (!user) return res.status(401).json({ error: 'Login required' });
        const post = forumDB.getPost(parseInt(req.params.id));
        if (!post) return res.status(404).json({ error: 'Not found' });
        const liked = forumDB.toggleLike(post.id, user.id);
        res.json({ ok: true, liked, count: forumDB.getLikes(post.id) });
    });

    // ── Attachments ───────────────────────────────────────────────────────────
    app.post('/api/forum/attachments/upload', forumUpload.single('file'), (req, res) => {
        const user = getUser(req, userDB);
        if (!user) return res.status(401).json({ error: 'Login required' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const id = forumDB.addAttachment(null, user.id, req.file.filename, req.file.originalname, req.file.size, req.file.mimetype);
        res.json({ ok: true, id, name: req.file.originalname, size: req.file.size, mime: req.file.mimetype });
    });

    app.get('/api/forum/attachment/:id', (req, res) => {
        const att = forumDB.getAttachment(parseInt(req.params.id));
        if (!att) return res.status(404).end();
        const filePath = path.join(ATTACH_DIR, att.filename);
        if (!fs.existsSync(filePath)) return res.status(404).end();
        res.setHeader('Content-Disposition', 'inline; filename="' + att.original_name.replace(/"/g, '') + '"');
        res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
        res.sendFile(filePath);
    });

    // ── Admin: board management (uses adminAuth from server.js) ───────────────
    app.get('/api/admin/forum/boards', adminAuth, (req, res) => res.json(forumDB.getBoards()));

    app.post('/api/admin/forum/boards', adminAuth, (req, res) => {
        const name = (req.body.name || '').trim().slice(0, 100);
        if (!name) return res.status(400).json({ error: 'Name required' });
        const id = forumDB.createBoard(name, (req.body.description || '').trim().slice(0, 300), parseInt(req.body.sort_order) || 0);
        res.json({ ok: true, id });
    });

    app.put('/api/admin/forum/boards/:id', adminAuth, (req, res) => {
        const board = forumDB.getBoard(parseInt(req.params.id));
        if (!board) return res.status(404).json({ error: 'Not found' });
        forumDB.updateBoard(board.id, (req.body.name || '').trim().slice(0, 100), (req.body.description || '').trim().slice(0, 300), parseInt(req.body.sort_order) || 0);
        res.json({ ok: true });
    });

    app.delete('/api/admin/forum/boards/:id', adminAuth, (req, res) => {
        const board = forumDB.getBoard(parseInt(req.params.id));
        if (!board) return res.status(404).json({ error: 'Not found' });
        forumDB.deleteBoard(board.id);
        res.json({ ok: true });
    });

    // ── Admin: user role ──────────────────────────────────────────────────────
    app.put('/api/admin/users/:id/role', adminAuth, (req, res) => {
        const role = parseInt(req.body.role);
        if (![0, 1, 2].includes(role)) return res.status(400).json({ error: 'Invalid role: 0=User 1=Mod 2=Admin' });
        userDB.setUserRole(parseInt(req.params.id), role);
        res.json({ ok: true });
    });
};
