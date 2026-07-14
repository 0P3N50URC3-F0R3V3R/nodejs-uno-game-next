
let express = require('express');
let application = express();
let server = require('http').Server(application);
let GameServiceFactory = require('./node_src/GameServiceFactory.js');
let GameServiceRepository = require('./node_src/GameServiceRepository.js');
let UnitTest = require('./node_src/UnitTest.js');
let userDB = require('./node_src/UserDB.js');
const ForumDB = require('./node_src/ForumDB.js');
const AchievementsService = require('./node_src/AchievementsService.js');
const FederationDB = require('./node_src/FederationDB.js');
const FederationIdentity = require('./node_src/FederationIdentity.js');
const FederationService = require('./node_src/FederationService.js');
const { computeServerHash } = require('./node_src/FederationHash.js');
let fs = require('fs');
let path = require('path');
let multer = require('multer');
let sharp = require('sharp');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const svgCaptcha = require('svg-captcha');

let config = {};
const configPath = process.env.UNO_CONFIG_PATH || path.join(__dirname, 'config.json');
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) {}

const inviteTokens = new Map();
setInterval(() => { const now = Date.now(); inviteTokens.forEach((v, k) => { if (v.expires < now) inviteTokens.delete(k); }); }, 300000);

const AVATAR_DIR = path.join(__dirname, 'data', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const DATA_DIR = process.env.UNO_DATA_DIR || path.join(__dirname, 'data');
const forumDB = new ForumDB(userDB.db, DATA_DIR);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const captchaStore = new Map();
const adminSessions = new Map();
setInterval(function() {
    const now = Date.now();
    captchaStore.forEach(function(v, k) { if (v.expires < now) captchaStore.delete(k); });
    adminSessions.forEach(function(v, k) { if (v < now) adminSessions.delete(k); });
}, 60000);

function adminAuth(req, res, next){
    const adminToken = req.headers['x-admin-token'];
    if (adminToken) {
        const exp = adminSessions.get(adminToken);
        if (exp && exp > Date.now()) { next(); return; }
    }
    const pass = req.headers['x-admin-password'] || (req.body && req.body._adminPassword);
    if (pass && pass === config.adminPassword) { next(); return; }
    res.status(401).json({error: 'Unauthorized'});
}

application.use(express.json());

const registerLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
if (config.sessionExpiryDays) userDB.sessionExpiryDays = config.sessionExpiryDays;

//Perform unit tests on some required logic
let unitTest = new UnitTest();

application.get('/', function(request, response){
    response.sendFile(__dirname + '/client/index.html');
});
application.get('/favicon.ico', function(request, response){
    response.sendFile(__dirname + '/public/img/favicon.png');
});
application.use('/client', express.static(__dirname + '/client'));
application.use('/snd', express.static(__dirname + '/public/snd'));
application.get('/api/ping', function(req, res){ res.json({ ok: true }); });
application.use('/img', express.static(__dirname + '/public/img'));
application.use('/forum/assets', express.static(path.join(__dirname, 'public', 'forum', 'assets')));
application.use('/client/img/achievements', express.static(__dirname + '/client/img/achievements'));
application.use('/store/asset', express.static(path.join(__dirname, 'src', 'store')));

//server.listen(3000);
userDB.globalMessagesClear();
const PORT = config.port || 80;
server.listen(PORT);

const pkgVersion = require('./package.json').version;
const networkInterfaces = require('os').networkInterfaces();
const endpoints = ['http://localhost:' + PORT];
Object.keys(networkInterfaces).forEach(function(name){
    networkInterfaces[name].forEach(function(iface){
        if(iface.family === 'IPv4' && !iface.internal){
            endpoints.push('http://' + iface.address + ':' + PORT);
        }
    });
});

console.log('__   __  __    _  _______    _     _  _______  _______ ');
console.log('|  | |  ||  |  | ||       |  | | _ | ||       ||  _    |');
console.log('|  | |  ||   |_| ||   _   |  | || || ||    ___|| |_|   |');
console.log('|  |_|  ||       ||  | |  |  |       ||   |___ |       |');
console.log('|       ||  _    ||  |_|  |  |       ||    ___||  _   | ');
console.log('|       || | |   ||       |  |   _   ||   |___ | |_|   |');
console.log('|_______||_|  |__||_______|  |__| |__||_______||_______|');
console.log('========================================================');
console.log('Server Started. v' + pkgVersion);
console.log('Port: ' + PORT);
endpoints.forEach(function(url){ console.log('Available at: ' + url); });
console.log('========================================================');

let io = require('socket.io')(server, {});
const achievSvc = new AchievementsService(userDB, io);
const FriendsService = require('./node_src/FriendsService.js');
const friendsSvc = new FriendsService(userDB, io);
require('./node_src/forumRoutes')(application, userDB, forumDB, adminAuth);
const federationDB = new FederationDB(userDB.db);
const federationIdentity = new FederationIdentity(DATA_DIR);
const cachedServerHash = computeServerHash(__dirname);
let gameServiceRepository = new GameServiceRepository();
let gameServiceFactory = new GameServiceFactory();
const federationService = new FederationService({
    db: federationDB,
    identity: federationIdentity,
    getServerHash: () => cachedServerHash,
    userDB: userDB,
    ourDomain: config.federationDomain || ('localhost:' + PORT),
    pollMs: config.federationPollMs || 60000,
    scheme: config.federationScheme || 'https',
    getLocalLobbies: () => gameServiceRepository.findAll()
        .filter(gs => !gs.getGameRulesModel().isSeriesStarted() && !gs.password)
        .map(gs => ({
            room_id: gs.getId(), room_name: gs.getId(),
            players: gs.getClientRepository().count(), max_players: 5
        }))
});
require('./node_src/FederationRoutes.js')(application, federationDB, federationService, federationIdentity, adminAuth, config, userDB, gameServiceRepository);
federationService.start();
achievSvc.ensureFreshChallenges();

application.post('/api/auth/register', registerLimiter, async function(req, res){
    let b = req.body || {};
    if (typeof b.username === 'string' && b.username.trim()) {
        const available = await federationService.checkNameAvailable(b.username.trim());
        if (!available) { res.status(400).json({ error: 'Username already taken' }); return; }
    }
    let result = userDB.register(b.username, b.password, b.email);
    res.status(result.error ? 400 : 200).json(result);
});

application.post('/api/auth/login', function(req, res){
    let b = req.body || {};
    let username = typeof b.username === 'string' ? b.username.trim().substring(0, 32) : '';
    let password = typeof b.password === 'string' ? b.password.substring(0, 128) : '';
    if (!username || !password) { res.status(400).json({ error: 'Invalid input' }); return; }
    let result = userDB.login(username, password);
    res.status(result.error ? 400 : 200).json(result);
});

application.get('/api/auth/me', function(req, res){
    let token = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : null;
    if(!token){ res.status(401).json({error: 'No token'}); return; }
    let user = userDB.getUserByToken(token);
    if(!user){ res.status(401).json({error: 'Invalid token'}); return; }
    let full = userDB.getProfile(user.id);
    if(full) {
        let info = userDB.computeXpInfo(full.xp || 0);
        full.xpInLevel = info.xpInLevel;
        full.xpToNext = info.xpToNext;
        full.level = info.level;
        full.gold = userDB.getGold(user.id);
    }
    res.json(full || {error: 'Not found'});
});

application.put('/api/profile/bio', function(req, res){
    let token = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : null;
    if(!token){ res.status(401).json({error: 'No token'}); return; }
    let user = userDB.getUserByToken(token);
    if(!user){ res.status(401).json({error: 'Invalid token'}); return; }
    const bio = (req.body.bio || '').trim().slice(0, 300);
    userDB.setBio(user.id, bio);
    res.json({ ok: true });
});

application.post('/api/profile/change-password', function(req, res){
    let token = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : null;
    if(!token){ res.status(401).json({error: 'No token'}); return; }
    let user = userDB.getUserByToken(token);
    if(!user){ res.status(401).json({error: 'Invalid token'}); return; }
    let b = req.body || {};
    res.json(userDB.changePassword(user.id, b.oldPassword, b.newPassword));
});

application.post('/api/profile/change-username', async function(req, res){
    let token = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : null;
    if(!token){ res.status(401).json({error: 'No token'}); return; }
    let user = userDB.getUserByToken(token);
    if(!user){ res.status(401).json({error: 'Invalid token'}); return; }
    let b = req.body || {};
    if (typeof b.username === 'string' && b.username.trim()) {
        const available = await federationService.checkNameAvailable(b.username.trim());
        if (!available) { res.status(400).json({ error: 'Username already taken' }); return; }
    }
    const usernameResult = userDB.changeUsername(user.id, b.username);
    if (!usernameResult.error) achievSvc.trigger(user.id, null, 'name_changed', {});
    res.json(usernameResult);
});

application.post('/api/auth/logout', function(req, res){
    let b = req.body || {};
    res.json(userDB.logout(b.token));
});

application.get('/admin', function(req, res){
    res.sendFile(__dirname + '/public/admin.html');
});
application.get('/api/admin/users', adminAuth, function(req, res){
    res.json(userDB.getUsers());
});
application.delete('/api/admin/users/:id', adminAuth, function(req, res){
    res.json(userDB.deleteUser(parseInt(req.params.id)));
});
application.put('/api/admin/users/:id/username', adminAuth, function(req, res){
    res.json(userDB.renameUser(parseInt(req.params.id), req.body && req.body.username));
});
application.post('/api/admin/users/:id/password', adminAuth, function(req, res){
    res.json(userDB.adminResetPassword(parseInt(req.params.id), req.body && req.body.password));
});

application.put('/api/admin/users/:id/stats', adminAuth, function(req, res){
    res.json(userDB.adminSetStats(parseInt(req.params.id), req.body));
});

application.delete('/api/admin/users/:id/avatar', adminAuth, function(req, res){
    let uid = parseInt(req.params.id);
    let file = path.join(AVATAR_DIR, uid + '.png');
    try { if(fs.existsSync(file)) fs.unlinkSync(file); } catch(e){}
    res.json({ ok: true });
});

application.post('/api/admin/users/:id/avatar', adminAuth, upload.single('avatar'), function(req, res){
    let uid = parseInt(req.params.id);
    if(!uid || uid < 1){ res.status(400).json({error: 'Invalid id'}); return; }
    if(!req.file){ res.status(400).json({error: 'No file'}); return; }
    sharp(req.file.buffer)
        .resize(250, 250, { fit: 'cover', position: 'centre' })
        .png()
        .toFile(path.join(AVATAR_DIR, uid + '.png'), function(err){
            if(err){ res.status(500).json({error: 'Processing failed'}); return; }
            res.json({ ok: true, url: '/api/profile/avatar/' + uid + '?v=' + Date.now() });
        });
});

application.get('/api/music-tracks', function(req, res){
    let musicDir = path.join(__dirname, 'public', 'snd', 'music');
    try {
        let files = fs.readdirSync(musicDir).filter(function(f){ return f.toLowerCase().endsWith('.mp3'); }).sort();
        res.json({ tracks: files });
    } catch(e) {
        res.json({ tracks: [] });
    }
});

application.get('/api/player-stats/:username', function(req, res){
    let profile = userDB.getPublicProfileByUsername(req.params.username);
    if(!profile){ res.status(404).json({error: 'Not found'}); return; }
    const eq = userDB.storeGetEquipped(profile.id);
    profile.reticle = eq.reticle ? '/store/asset/' + eq.reticle.file_path : null;
    profile.title = eq.title || null;
    profile.nameEffect = eq.name_effect || null;
    profile.bgProfile = eq.bg_profile ? '/store/asset/' + eq.bg_profile.file_path : null;
    res.json(profile);
});

application.get('/api/search-players', function(req, res) {
    const token = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : null;
    if (!token || !userDB.getUserByToken(token)) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const q = (req.query.q || '').trim();
    if (q.length < 2) { res.status(400).json({ error: 'Query too short' }); return; }
    res.json(userDB.searchUsers(q, 10));
});

function requireAuth(req, res) {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'No token' }); return null; }
    const user = userDB.getUserByToken(token);
    if (!user) { res.status(401).json({ error: 'Invalid token' }); return null; }
    return user;
}

application.get('/api/friends', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    res.json(friendsSvc.getList(user.id));
});

application.post('/api/friends/request/:targetId', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    const targetId = parseInt(req.params.targetId);
    if (!targetId || targetId === user.id) { res.status(400).json({ error: 'Invalid target' }); return; }
    const existingFriendCount = userDB.friendsGet(user.id).length;
    if (existingFriendCount >= 200) { res.status(400).json({ error: 'Friend limit reached' }); return; }
    res.json(friendsSvc.sendRequest(user.id, targetId));
});

application.post('/api/friends/accept/:requesterId', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    const requesterId = parseInt(req.params.requesterId);
    if (!requesterId) { res.status(400).json({ error: 'Invalid requester' }); return; }
    res.json(friendsSvc.acceptRequest(user.id, requesterId));
});

application.post('/api/friends/decline/:requesterId', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    const requesterId = parseInt(req.params.requesterId);
    res.json(friendsSvc.declineRequest(user.id, requesterId));
});

application.delete('/api/friends/:otherId', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    const otherId = parseInt(req.params.otherId);
    res.json(friendsSvc.removeFriend(user.id, otherId));
});

application.get('/api/friends/dm/:otherId', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    const otherId = parseInt(req.params.otherId);
    if (!otherId || otherId === user.id) { res.status(400).json({ error: 'Invalid target' }); return; }
    res.json(friendsSvc.getDMHistory(user.id, otherId));
});

application.post('/api/friends/invite/:targetId', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    const targetId = parseInt(req.params.targetId);
    if (!targetId) { res.status(400).json({ error: 'targetId required' }); return; }
    const hostSocket = friendsSvc._socketsForUser(user.id).find(function(s) { return s.currentGameService; });
    const gameId = hostSocket ? hostSocket.currentGameService.getId() : '';
    if (!gameId) { res.status(400).json({ error: 'Not in a game' }); return; }
    const token = crypto.randomBytes(16).toString('hex');
    inviteTokens.set(token, { gameId, targetUserId: targetId, expires: Date.now() + 60000 });
    res.json(friendsSvc.inviteToGame(user.id, targetId, gameId, token));
});

application.get('/api/store/items', function(req, res) {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    const user = token ? userDB.getUserByToken(token) : null;
    res.json(userDB.storeGetItems(user ? user.id : null));
});

application.post('/api/store/buy/:itemId', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    res.json(userDB.storeBuyItem(user.id, parseInt(req.params.itemId)));
});

application.post('/api/store/equip', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    const { slot, itemId } = req.body || {};
    const validSlots = ['reticle', 'background', 'bg_profile', 'title', 'name_effect'];
    if (!validSlots.includes(slot)) { res.status(400).json({ error: 'Invalid slot' }); return; }
    const result = userDB.storeEquip(user.id, slot, itemId != null ? itemId : null);
    if (!result.error) {
        const sids = Object.keys(io.sockets.sockets);
        for (const sid of sids) {
            const sock = io.sockets.sockets[sid];
            if (sock.userId === user.id && sock.currentGameService) {
                broadcastGameState(sock.currentGameService);
                break;
            }
        }
    }
    res.json(result);
});

application.get('/api/store/equipped', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    res.json(userDB.storeGetEquipped(user.id));
});

application.get('/api/store/owned', function(req, res) {
    const user = requireAuth(req, res); if (!user) return;
    res.json(userDB.storeGetOwned(user.id));
});

application.get('/api/admin/store/items', adminAuth, function(req, res) {
    res.json(userDB.storeAdminGetAll());
});

application.post('/api/admin/store/items', adminAuth, function(req, res) {
    const b = req.body || {};
    if (!b.type || !b.name) { res.status(400).json({ error: 'type and name required' }); return; }
    res.json(userDB.storeAdminCreate(b.type, b.file_path, b.name, b.description, parseInt(b.price) || 100, b.meta));
});

application.put('/api/admin/store/items/:id', adminAuth, function(req, res) {
    res.json(userDB.storeAdminUpdate(parseInt(req.params.id), req.body || {}));
});

application.delete('/api/admin/store/items/:id', adminAuth, function(req, res) {
    res.json(userDB.storeAdminDelete(parseInt(req.params.id)));
});

application.put('/api/admin/store/items/:id/active', adminAuth, function(req, res) {
    const active = (req.body || {}).active;
    res.json(userDB.storeAdminSetActive(parseInt(req.params.id), active));
});

application.post('/api/admin/store/sync', adminAuth, function(req, res) {
    res.json(userDB.storeAdminSync());
});

application.get('/api/admin/gold/settings', adminAuth, function(req, res) {
    res.json(userDB.goldGetSettings());
});

application.put('/api/admin/gold/settings/:key', adminAuth, function(req, res) {
    const value = parseInt((req.body || {}).value);
    if (isNaN(value) || value < 0) { res.status(400).json({ error: 'Invalid value' }); return; }
    res.json(userDB.goldSetSetting(req.params.key, value));
});

application.get('/api/admin/gold/events', adminAuth, function(req, res) {
    res.json(userDB.goldGetEvents());
});

application.post('/api/admin/gold/events', adminAuth, function(req, res) {
    const b = req.body || {};
    if (!b.name || !b.start_at || !b.end_at) { res.status(400).json({ error: 'name, start_at, end_at required' }); return; }
    res.json(userDB.goldCreateEvent(b.name, b.description, parseFloat(b.multiplier) || 2.0, parseInt(b.start_at), parseInt(b.end_at)));
});

application.put('/api/admin/gold/events/:id', adminAuth, function(req, res) {
    res.json(userDB.goldUpdateEvent(parseInt(req.params.id), req.body || {}));
});

application.delete('/api/admin/gold/events/:id', adminAuth, function(req, res) {
    res.json(userDB.goldDeleteEvent(parseInt(req.params.id)));
});

application.get('/api/news', function(req, res) {
    res.json(userDB.newsGetPublished());
});

application.get('/api/admin/news', adminAuth, function(req, res) {
    res.json(userDB.newsGetAll());
});

application.post('/api/admin/news', adminAuth, function(req, res) {
    const b = req.body || {};
    if (!b.title) { res.status(400).json({ error: 'title required' }); return; }
    const post = userDB.newsCreate(b.title, b.content);
    io.emit('newNews', post);
    res.json(post);
});

application.put('/api/admin/news/:id', adminAuth, function(req, res) {
    res.json(userDB.newsUpdate(parseInt(req.params.id), req.body || {}));
});

application.delete('/api/admin/news/:id', adminAuth, function(req, res) {
    res.json(userDB.newsDelete(parseInt(req.params.id)));
});

application.get('/api/admin/captcha', function(req, res) {
    const captcha = svgCaptcha.create({ noise: 2, color: false, background: '#0d1108', size: 5, width: 220, height: 70, fontSize: 58 });
    const token = crypto.randomBytes(16).toString('hex');
    captchaStore.set(token, { text: captcha.text.toLowerCase(), expires: Date.now() + 5 * 60 * 1000 });
    res.json({ svg: captcha.data, token });
});

application.post('/api/admin/login', function(req, res) {
    let b = req.body || {};
    const captchaEntry = captchaStore.get(b.captchaToken);
    if (!captchaEntry || captchaEntry.expires < Date.now() || captchaEntry.text !== (b.captchaAnswer || '').toLowerCase().trim()) {
        captchaStore.delete(b.captchaToken);
        res.status(401).json({ error: 'Invalid or expired captcha' }); return;
    }
    captchaStore.delete(b.captchaToken);
    if (!b.password || b.password !== config.adminPassword) {
        res.status(401).json({ error: 'Wrong password' }); return;
    }
    const adminToken = crypto.randomBytes(32).toString('hex');
    adminSessions.set(adminToken, Date.now() + 4 * 60 * 60 * 1000);
    res.json({ adminToken });
});

application.get('/api/admin/settings', adminAuth, function(req, res) {
    res.json({ sessionExpiryDays: userDB.sessionExpiryDays || 30 });
});

application.put('/api/admin/settings', adminAuth, function(req, res) {
    const days = parseInt((req.body || {}).sessionExpiryDays);
    if (!days || days < 1 || days > 365) { res.status(400).json({ error: 'Value must be 1–365' }); return; }
    userDB.sessionExpiryDays = days;
    config.sessionExpiryDays = days;
    try { fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2)); } catch(e) {}
    res.json({ ok: true });
});

application.post('/api/admin/challenges/reroll/:type', adminAuth, function(req, res) {
    const type = req.params.type;
    if (type !== 'daily' && type !== 'weekly') { res.status(400).json({ error: 'type must be daily or weekly' }); return; }
    const result = achievSvc.forceReroll(type);
    res.json({ ok: true, count: result.challenges.length, dateKey: result.dateKey, expiresAt: result.expiresAt });
});

application.get('/api/leaderboard', function(req, res){
    res.json(userDB.getLeaderboard(10));
});

application.get('/api/leaderboard/all', function(req, res){
    res.json(userDB.getLeaderboardAll(5));
});

application.post('/api/profile/avatar', upload.single('avatar'), function(req, res){
    let token = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : null;
    if(!token){ res.status(401).json({error: 'No token'}); return; }
    let user = userDB.getUserByToken(token);
    if(!user){ res.status(401).json({error: 'Invalid token'}); return; }
    if(!req.file){ res.status(400).json({error: 'No file'}); return; }
    sharp(req.file.buffer)
        .resize(250, 250, { fit: 'cover', position: 'centre' })
        .png()
        .toFile(path.join(AVATAR_DIR, user.id + '.png'), function(err){
            if(err){ res.status(500).json({error: 'Processing failed'}); return; }
            res.json({ ok: true, url: '/api/profile/avatar/' + user.id + '?v=' + Date.now() });
            achievSvc.trigger(user.id, null, 'avatar_changed', {});
        });
});

application.get('/api/profile/avatar/:userId', function(req, res){
    let uid = parseInt(req.params.userId);
    if(!uid || uid < 1){ res.status(400).end(); return; }
    let file = path.join(AVATAR_DIR, uid + '.png');
    if(!fs.existsSync(file)){ res.status(404).end(); return; }
    res.sendFile(file);
});

application.delete('/api/profile/avatar', function(req, res){
    let token = req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : null;
    if(!token){ res.status(401).json({error: 'No token'}); return; }
    let user = userDB.getUserByToken(token);
    if(!user){ res.status(401).json({error: 'Invalid token'}); return; }
    let file = path.join(AVATAR_DIR, user.id + '.png');
    try { if(fs.existsSync(file)) fs.unlinkSync(file); } catch(e){}
    res.json({ ok: true });
});

application.get('/api/lobbies', function(req, res){
    const anyPeersConfigured = federationDB.listPeers().length > 0;
    let lobbies = gameServiceRepository.findAll()
        .filter(gs => !gs.getGameRulesModel().isSeriesStarted())
        .map(gs => ({
            id: gs.getId(),
            players: gs.getClientRepository().count(),
            max: 5,
            locked: !!gs.password,
            domain: anyPeersConfigured ? federationService.ourDomain : null
        }));
    if (anyPeersConfigured) {
        const remote = federationDB.listCachedLobbies().map(row => ({
            id: row.room_id,
            players: row.players,
            max: row.max_players,
            locked: false,
            domain: row.domain
        }));
        lobbies = lobbies.concat(remote);
    }
    res.json({ ownDomain: anyPeersConfigured ? federationService.ourDomain : null, lobbies: lobbies });
});

function buildAvatarMap(gs){
    let map = {};
    let cr = gs.getClientRepository();
    Object.keys(io.sockets.sockets).forEach(function(sid){
        let sock = io.sockets.sockets[sid];
        if(sock.currentGameService !== gs || !sock.userId) return;
        let client = cr.findBySocketId(sid);
        if(!client || client.isAI) return;
        let file = path.join(AVATAR_DIR, sock.userId + '.png');
        if(fs.existsSync(file)) map[client.getName()] = '/api/profile/avatar/' + sock.userId;
    });
    return map;
}

function buildEquippedMap(gs){
    let map = {};
    let cr = gs.getClientRepository();
    Object.keys(io.sockets.sockets).forEach(function(sid){
        let sock = io.sockets.sockets[sid];
        if(sock.currentGameService !== gs || !sock.userId) return;
        let client = cr.findBySocketId(sid);
        if(!client || client.isAI) return;
        let eq = userDB.storeGetEquipped(sock.userId);
        map[client.getName()] = {
            reticle: eq.reticle ? '/store/asset/' + eq.reticle.file_path : null,
            title: eq.title ? { id: eq.title.id, name: eq.title.name, meta: eq.title.meta } : null,
            nameEffect: eq.name_effect ? { id: eq.name_effect.id, name: eq.name_effect.name, meta: eq.name_effect.meta } : null
        };
    });
    return map;
}

function broadcastGameState(gs){
    let avatarMap = buildAvatarMap(gs);
    let equippedMap = buildEquippedMap(gs);
    Object.keys(io.sockets.sockets).forEach(function(id){
        let state = gs.getClientResponseData(id);
        if(state){
            state.client.isHost = !!(gs.hostName && state.client.name === gs.hostName);
            let selfEq = equippedMap[state.client.name] || {};
            state.client.avatar = avatarMap[state.client.name] || null;
            state.client.reticle = selfEq.reticle || null;
            state.client.title = selfEq.title || null;
            state.client.nameEffect = selfEq.nameEffect || null;
            state.clients.forEach(function(c){
                let eq = equippedMap[c.name] || {};
                c.avatar = avatarMap[c.name] || null;
                c.reticle = eq.reticle || null;
                c.title = eq.title || null;
                c.nameEffect = eq.nameEffect || null;
            });
            state.afkTimeout = gs.afkTimeout || 0;
            io.to(id).emit('state', state);
        }
    });
    const pendingUno = gs.getGameRulesModel ? gs.getGameRulesModel().pendingUnoEvent : null;
    if (pendingUno) {
        let cr = gs.getClientRepository();
        Object.keys(io.sockets.sockets).forEach(function(sid) {
            let sock = io.sockets.sockets[sid];
            if (sock.currentGameService !== gs || !sock.userId) return;
            let client = cr.findBySocketId(sid);
            if (!client || client.isAI) return;
            if (pendingUno.type === 'u' && pendingUno.target === client.getName()) {
                sock._unoGameCalls = (sock._unoGameCalls || 0) + 1;
                achievSvc.trigger(sock.userId, sid, 'uno_called', { success: true, gameCallCount: sock._unoGameCalls });
            }
            if (pendingUno.type === 'uf' && pendingUno.target === client.getName()) {
                achievSvc.trigger(sock.userId, sid, 'uno_missed_penalty', {});
            }
            if (pendingUno.type === 'uf' && pendingUno.target !== client.getName()) {
                achievSvc.trigger(sock.userId, sid, 'uno_missed_seen', {});
            }
        });
    }
    if(gs.clearPendingEvent) gs.clearPendingEvent();
    awardRoundXP(gs);
    if (gs.afkTimeout > 0) {
        var cr2 = gs.getClientRepository();
        var cur = cr2.findByTurn(true);
        var curName = cur ? cur.getName() : null;
        var stateKey = curName ? curName + (cur.getTakeOrLeave() ? ':tol' : '') : null;
        if (stateKey !== gs._afkStateKey) {
            gs._afkStateKey = stateKey;
            clearAfkTimer(gs);
            if (cur && !cur.isAI && stateKey) {
                startAfkTimer(gs, curName);
            }
        }
    }
}

function clearAfkTimer(gs) {
    if (gs._afkTimer) {
        clearTimeout(gs._afkTimer);
        gs._afkTimer = null;
        io.to(gs.getId()).emit('turnTimerClear');
    }
}

function startAfkTimer(gs, clientName) {
    clearAfkTimer(gs);
    io.to(gs.getId()).emit('turnTimer', { playerName: clientName, duration: gs.afkTimeout });
    gs._afkTimer = setTimeout(function() {
        gs._afkTimer = null;
        var cr = gs.getClientRepository();
        var client = cr.findByTurn(true);
        if (!client || client.isAI || client.getName() !== clientName) return;

        gs.execAfkMove(client);
        client.afkStreak++;
        io.to(gs.getId()).emit('afkSkip', { name: clientName, streak: client.afkStreak });

        if (client.afkStreak >= 2) {
            var kickedSocketId = null;
            Object.keys(io.sockets.sockets).forEach(function(sid) {
                var sock = io.sockets.sockets[sid];
                if (sock.currentGameService !== gs) return;
                var c = cr.findBySocketId(sid);
                if (c && c.getName() === clientName) kickedSocketId = sid;
            });
            if (!gs._bannedNames) gs._bannedNames = new Set();
            gs._bannedNames.add(clientName);
            if (kickedSocketId) {
                var kickedSock = io.sockets.sockets[kickedSocketId];
                kickedSock.emit('afkKicked', { name: clientName });
                gs.removePlayer(kickedSocketId);
                kickedSock.leave(gs.getId());
                kickedSock.currentGameService = null;
            }
            if (!destroyGameIfEmpty(gs)) { broadcastGameState(gs); gs.scheduleAITurn(); }
        } else {
            broadcastGameState(gs);
            gs.scheduleAITurn();
        }
    }, gs.afkTimeout * 1000);
}

function cardXpValue(card){
    let n = card.getNumber();
    if(n === 'g' || n === 'c') return 50;
    if(n === 'p' || n === 'n' || n === 'r') return 20;
    return parseInt(n) || 0;
}

function awardRoundXP(gs){
    if(!gs._xpAwardedRound) gs._xpAwardedRound = 0;
    let round = gs.getGameRulesModel().getRoundsPlayed();
    if (round < gs._xpAwardedRound) gs._xpAwardedRound = 0;
    if(round <= gs._xpAwardedRound) return;
    gs._xpAwardedRound = round;

    let roundDuration = gs._roundStartTime ? Math.floor((Date.now() - gs._roundStartTime) / 1000) : 0;
    gs._roundStartTime = Date.now();

    const WINNER_BONUS = 25;
    let cr = gs.getClientRepository();
    let grm = gs.getGameRulesModel();
    let winner = cr.findByHasWon(true);
    let isBR = grm && grm.battleRoyale;

    let opponentSum = 0;
    if(!isBR){
        cr.findAll().forEach(function(c){
            if(!winner || c.getName() !== winner.getName()){
                c.getCards().forEach(function(card){ opponentSum += cardXpValue(card); });
            }
        });
    }

    Object.keys(io.sockets.sockets).forEach(function(sid){
        let sock = io.sockets.sockets[sid];
        if(sock.currentGameService !== gs || !sock.userId) return;
        let client = cr.findBySocketId(sid);
        if(!client || client.isAI) return;

        let isWinner, xpGain;
        if(isBR){
            isWinner = client.brRank === 1;
            xpGain = client.brScore + (isWinner ? WINNER_BONUS : 0);
        } else {
            isWinner = !!(winner && client.getName() === winner.getName());
            if (!sock._seriesOpponentPoints) sock._seriesOpponentPoints = 0;
            if (isWinner) sock._seriesOpponentPoints += opponentSum;
            if(isWinner){
                xpGain = opponentSum + WINNER_BONUS;
            } else {
                xpGain = 0;
                client.getCards().forEach(function(card){ xpGain += cardXpValue(card); });
            }
        }

        // Track match outcome
        userDB.bumpStat(sock.userId, isWinner ? 'matches_won' : 'matches_lost', 1);

        // Track time
        if(roundDuration > 0){
            userDB.bumpStat(sock.userId, 'played_time_seconds', roundDuration);
            userDB.setLongestMatch(sock.userId, roundDuration);
        }

        // Flush card stats for this round
        const cardsThisRound = sock._pendingCards ? Object.values(sock._pendingCards).reduce(function(s, v){ return s + v; }, 0) : 0;
        if(sock._pendingCards){
            userDB.flushCardStats(sock.userId, sock._pendingCards);
            sock._pendingCards = {};
        }

        let seriesWinner = grm.getSeriesWinner ? grm.getSeriesWinner() : null;
        let allClients = gs.getClientRepository().findAll();
        // BR never calls _checkSeriesEnd; derive series winner directly from brRank
        if(isBR && seriesWinner === null && allClients.length >= 3){
            let brWinner = allClients.find(function(c){ return c.brRank === 1; });
            if(brWinner) seriesWinner = brWinner.getName();
        }
        let humanClients = allClients.filter(function(c){ return !c.isAI; });
        let aiClients = allClients.filter(function(c){ return c.isAI; });
        let roundCtx = {
            isRoundWinner: isWinner,
            isSeriesWinner: !!(seriesWinner && client.getName() === seriesWinner),
            roundDuration: roundDuration,
            humanCount: humanClients.length,
            aiCount: aiClients.length,
            aiDifficulties: aiClients.map(function(c){ return c.aiDifficulty || 'easy'; }),
            aiOnly: humanClients.length === 1,
            ruleset: grm.ruleset || 'original',
            hardcoreMode: !!grm.hardcoreMode,
            roundNoPunishmentPlayed: !!(sock._roundFlags && sock._roundFlags.noPunishmentPlayed),
            roundNoColorChange: !!(sock._roundFlags && sock._roundFlags.noColorChange),
            seriesPoints: isWinner ? sock._seriesOpponentPoints : 0,
            seriesEnded: seriesWinner !== null,
            seriesRounds: grm.getRoundsPlayed ? grm.getRoundsPlayed() : 0,
            matchDuration: sock._matchStartTime ? Math.floor((Date.now() - sock._matchStartTime) / 1000) : 0,
            cardsPlayedThisRound: cardsThisRound,
            unoGameCalls: sock._unoGameCalls || 0,
        };

        achievSvc.trigger(sock.userId, sid, 'round_end', roundCtx);

        if (seriesWinner !== null) {
            achievSvc.trigger(sock.userId, sid, 'series_end', roundCtx);
            sock._matchStartTime = null;
            sock._seriesOpponentPoints = 0;
            sock._unoGameCalls = 0;
        }

        sock._roundFlags = { noPunishmentPlayed: true, noColorChange: true };

        console.log('[XP] ' + client.getName() + ' gain=' + xpGain + (isWinner ? ' [WINNER]' : ''));
        if(xpGain <= 0) return;

        let result = userDB.awardXP(sock.userId, xpGain);
        if(result){
            io.to(sid).emit('xpAwarded', {
                gain: result.gain,
                xp: result.xp,
                level: result.level,
                leveledUp: result.leveledUp,
                isWinner: isWinner
            });
        }
        if (isWinner) {
            if (!io._goldCooldowns) io._goldCooldowns = new Map();
            const cooldownKey = 'gold_' + sock.userId;
            const lastAward = io._goldCooldowns.get(cooldownKey) || 0;
            const cooldownOk = (Date.now() - lastAward) >= 3 * 60 * 1000;
            const matchDuration = sock._matchStartTime
                ? Math.floor((Date.now() - sock._matchStartTime) / 1000)
                : 0;
            const roundsPlayed = gs.getGameRulesModel().getRoundsPlayed
                ? gs.getGameRulesModel().getRoundsPlayed()
                : 1;
            if (matchDuration >= 120 && roundsPlayed >= 3 && cooldownOk) {
                const _goldWin = userDB.goldGetEffective('gold_win');
                const goldResult = userDB.awardGold(sock.userId, _goldWin);
                if (goldResult) {
                    io._goldCooldowns.set(cooldownKey, Date.now());
                    io.to(sid).emit('goldAwarded', {
                        amount: _goldWin,
                        newTotal: goldResult.gold,
                        reason: 'win'
                    });
                }
            }
        }
    });

    let winnerForReport = cr.findByHasWon ? cr.findByHasWon(true) : winner;
    Object.keys(io.sockets.sockets).forEach(function(sid){
        let sock = io.sockets.sockets[sid];
        if(sock.currentGameService !== gs || !sock.federatedGuest) return;
        let client = cr.findBySocketId(sid);
        if(!client || client.isAI) return;
        let isGuestWinner = isBR ? client.brRank === 1 : !!(winnerForReport && client.getName() === winnerForReport.getName());
        if(!isGuestWinner) return;

        if (!io._goldCooldowns) io._goldCooldowns = new Map();
        const guestCooldownKey = 'gold_guest_' + sock.federatedGuest.homeDomain + ':' + sock.federatedGuest.playerName;
        const guestLastAward = io._goldCooldowns.get(guestCooldownKey) || 0;
        const guestCooldownOk = (Date.now() - guestLastAward) >= 3 * 60 * 1000;
        const guestMatchDuration = sock._matchStartTime
            ? Math.floor((Date.now() - sock._matchStartTime) / 1000)
            : 0;
        const guestRoundsPlayed = gs.getGameRulesModel().getRoundsPlayed
            ? gs.getGameRulesModel().getRoundsPlayed()
            : 1;
        if (!(guestMatchDuration >= 120 && guestRoundsPlayed >= 3 && guestCooldownOk)) return;

        io._goldCooldowns.set(guestCooldownKey, Date.now());
        federationService.reportWinEvent(sock.federatedGuest.homeDomain, {
            playerName: sock.federatedGuest.playerName,
            roomId: gs.getId()
        });
    });
}

function kickDuplicateSessions(newSocketId, userId) {
    Object.keys(io.sockets.sockets).forEach(function(sid) {
        if (sid === newSocketId) return;
        let sock = io.sockets.sockets[sid];
        if (sock.userId === userId) {
            sock.emit('kicked', { reason: 'duplicate_session' });
            sock.disconnect(true);
        }
    });
}

// Returns true if this event should be dropped (rate limit exceeded).
// limits: { windowMs, max } — e.g. 10 events per 5000ms
const RATE_LIMITS = {
    chat:          { windowMs: 3000,  max: 5  },
    jukeboxChange: { windowMs: 2000,  max: 3  },
    chatOpen:      { windowMs: 5000,  max: 3  },
    create:        { windowMs: 10000, max: 5  },
    login:         { windowMs: 10000, max: 5  },
    restart:       { windowMs: 10000, max: 3  },
    globalChat:    { windowMs: 1500,  max: 1  },
};
function isRateLimited(socket, action) {
    const rule = RATE_LIMITS[action];
    if (!rule) return false;
    if (!socket._rl) socket._rl = {};
    const now = Date.now();
    let s = socket._rl[action];
    if (!s || now - s.t > rule.windowMs) {
        socket._rl[action] = { t: now, n: 1 };
        return false;
    }
    if (++s.n > rule.max) return true;
    return false;
}

function destroyGameIfEmpty(gs){
    let humans = gs.getClientRepository().findAll().filter(function(c){ return !c.isAI; });
    if(humans.length === 0){
        gameServiceRepository.remove(gs.getId());
        return true;
    }
    return false;
}

// BR requires 3+ players. If a player leaves and active count drops below 3, end the game.
function endBRGameForLeave(gs, leavingClient){
    let grm = gs.getGameRulesModel();
    if(!grm || !grm.battleRoyale || !grm.isSeriesStarted()) return false;
    if(leavingClient.brEliminated) return false;
    let cr = gs.getClientRepository();
    let active = cr.findAll().filter(function(c){ return !c.brEliminated; });
    if(active.length > 3) return false;
    // Sort remaining (fewest cards = best rank = winner)
    let remaining = active.filter(function(c){ return c !== leavingClient; });
    let sorted = remaining.slice().sort(function(a, b){ return a.getCardsCount() - b.getCardsCount(); });
    sorted.forEach(function(r){
        r.brEliminated = true;
        r.brRank = grm.brNextRank;
        grm.brNextRank++;
        r.brScore = 0;
        r.turn = false;
        grm.brEliminated.push({ name: r.getName(), rank: r.brRank, score: 0 });
        r.insertScore(r.brRank === 1 ? '-' : r.brRank);
    });
    leavingClient.brEliminated = true;
    leavingClient.brRank = grm.brNextRank;
    grm.brNextRank++;
    leavingClient.brScore = 0;
    leavingClient.turn = false;
    grm.brEliminated.push({ name: leavingClient.getName(), rank: leavingClient.brRank, score: 0 });
    leavingClient.insertScore(leavingClient.brRank);
    let winner = cr.findAll().find(function(c){ return c.brRank === 1; });
    if(winner) winner.hasWon = true;
    cr.findAll().forEach(function(c){ c.setReady(false); });
    grm.roundsPlayed++;
    return true;
}

io.sockets.on('connection', function(socket) {
    console.log('Socket connection');

    socket.use(function(packet, next) {
        var action = packet[0];
        if (isRateLimited(socket, action)) return;
        if (action === 'chatOpen' && socket.userId) {
            achievSvc.trigger(socket.userId, socket.id, 'chat_opened', {});
            return;
        }
        if (action === 'jukeboxChange' && socket.userId) {
            achievSvc.trigger(socket.userId, socket.id, 'jukebox_changed', {});
            return;
        }
        if (action === 'chat' && socket.userId && !socket.currentGameService) {
            achievSvc.trigger(socket.userId, socket.id, 'chat_sent', {});
            return;
        }
        next();
    });

    socket.on('requestAchievementsState', function(data) {
        let userId = socket.userId;
        if (!userId && data && data.authToken) {
            const user = userDB.getUserByToken(data.authToken);
            if (user) { userId = user.id; socket.userId = user.id; socket.username = user.username; kickDuplicateSessions(socket.id, user.id); socket.join('global'); socket.emit('globalHistory', userDB.globalMessagesGetRecent(100)); }
        }
        if (userId) {
            achievSvc.ensureFreshChallenges();
            socket.emit('achievementsState', achievSvc.getStateForUser(userId));
        }
    });

    socket.on('globalChat', function(data) {
        if (!socket.userId) return;
        if (isRateLimited(socket, 'globalChat')) return;
        const raw = (data && typeof data.text === 'string') ? data.text : String(data || '');
        const clean = raw.substring(0, 200).trim();
        if (!clean) return;
        const sentAt = Date.now();
        userDB.globalMessageSave(socket.userId, socket.username, clean);
        io.to('global').emit('globalChat', {
            senderId: socket.userId,
            senderName: socket.username,
            text: clean,
            sentAt
        });
    });

    socket.on('federationGuestMark', function(data) {
        if (!data || typeof data.sessionId !== 'string') return;
        const payload = federationService.consumeGuestSession(data.sessionId);
        if (!payload) return;
        socket.federatedGuest = { homeDomain: payload.homeDomain, playerName: String(payload.homePlayerName).substring(0, 32) };
    });

    socket.on('sendDM', function(data) {
        if (!socket.userId || !data) return;
        const receiverId = parseInt(data.receiverId);
        if (!receiverId || receiverId === socket.userId) return;
        friendsSvc.sendDM(socket.userId, receiverId, data.text || '');
    });

    socket.on('create', function(data) {
        let room, maxRounds, aiCount, aiDifficulty, bots, password, creating, afkTimeout = 0;

        if(typeof data === 'string'){
            room = data; maxRounds = 5; aiCount = 0; aiDifficulty = 'easy'; bots = []; password = null; creating = false;
        } else if(data && typeof data === 'object'){
            room = data.room;
            maxRounds = parseInt(data.maxRounds) || 5;
            if(Array.isArray(data.bots)){
                bots = data.bots
                    .filter(function(b){ return b && typeof b.name === 'string' && b.name.trim(); })
                    .slice(0, 4)
                    .map(function(b){ return { name: b.name.trim().substring(0,16), difficulty: ['easy','medium','hard'].indexOf(b.difficulty) !== -1 ? b.difficulty : 'easy' }; });
                aiCount = 0; aiDifficulty = 'easy';
            } else {
                bots = [];
                aiCount = Math.min(Math.max(parseInt(data.aiCount) || 0, 0), 4);
                aiDifficulty = ['easy','medium','hard'].indexOf(data.aiDifficulty) !== -1 ? data.aiDifficulty : 'easy';
            }
            password = (typeof data.password === 'string' && data.password.trim()) ? data.password.trim().substring(0, 32) : null;
            creating = data.creating === true;
            afkTimeout = parseInt(data.afkTimeout) || 0;
            if (afkTimeout > 0 && afkTimeout < 10) afkTimeout = 0;
            if (afkTimeout > 120) afkTimeout = 120;
        } else {
            return;
        }

        if(!room || typeof room !== 'string' || room.trim() === '') return;
        room = room.trim().substring(0, 32);

        let gameService = gameServiceRepository.findById(room);
        let ruleset = (data && typeof data === 'object' && data.ruleset === 'stacking') ? 'stacking' : 'original';
        let hardcoreMode = !!(data && typeof data === 'object' && data.hardcoreMode);
        let battleRoyale = !!(data && typeof data === 'object' && data.battleRoyale);
        let doubleDeck = !!(data && typeof data === 'object' && data.doubleDeck);
        let nextgenMode = !!(data && typeof data === 'object' && data.nextgenMode);
        let multiDiscard = !!(data && typeof data === 'object' && data.multiDiscard) && (doubleDeck || nextgenMode);
        if(battleRoyale) hardcoreMode = false;
        if(nextgenMode) doubleDeck = false;
        // Nextgen's punishment cards (+6/+8/+10) applied instantly bloat hands too
        // fast to be balanced -- stacking (deferred, combinable penalties) is
        // mandatory whenever nextgen mode is on, not just the default.
        if(nextgenMode) ruleset = 'stacking';

        if(gameService) {
            if(creating) {
                socket.emit('roomExists', { locked: !!gameService.password });
                return;
            }
            if(gameService.getGameRulesModel().isSeriesStarted()) {
                socket.emit('roomFull', { started: true });
                return;
            }
            if (!socket.userId && data && typeof data.authToken === 'string') {
                const u = userDB.getUserByToken(data.authToken);
                if (u) { socket.userId = u.id; socket.username = u.username; }
            }
            if(gameService.password && password !== gameService.password) {
                const tok = data && data.inviteToken;
                const inv = tok ? inviteTokens.get(tok) : null;
                if (inv && inv.gameId === room && inv.targetUserId === socket.userId && inv.expires > Date.now()) {
                    inviteTokens.delete(tok);
                } else {
                    socket.emit('wrongPassword');
                    return;
                }
            }
            const crCheck = gameService.getClientRepository();
            if(crCheck.count() >= 5) {
                const humansCheck = crCheck.findAll().filter(function(c){ return !c.isAI; });
                socket.emit('roomFull', { started: !crCheck.findByReady(false) && humansCheck.length >= 1 });
                return;
            }
        }

        console.log('Join room: ' + room + ' socketId: ' + socket.id);
        socket.join(room);

        let isNewGame = false;
        if(!gameService){
            isNewGame = true;
            gameService = gameServiceFactory.create("UNO", room, {
                maxRounds: maxRounds,
                aiCount: aiCount,
                aiDifficulty: aiDifficulty,
                bots: bots,
                ruleset: ruleset,
                hardcoreMode: hardcoreMode,
                battleRoyale: battleRoyale,
                doubleDeck: doubleDeck,
                nextgenMode: nextgenMode,
                multiDiscard: multiDiscard
            });
            gameService.password = password;
            gameService.afkTimeout = afkTimeout;
            gameServiceRepository.insert(gameService);
        }
        socket.currentGameService = gameService;

        socket._unoGameCalls = 0;
        if (socket.userId) {
            if (isNewGame) {
                let allBots = bots.length > 0 ? bots : [];
                let botCount = allBots.length || aiCount || 0;
                achievSvc.trigger(socket.userId, socket.id, 'game_created', {
                    aiOnly: botCount >= 4,
                    aiCount: botCount,
                });
            } else {
                achievSvc.trigger(socket.userId, socket.id, 'game_joined', { hasHumans: true });
            }
        }

        // Give the game service a broadcast callback for AI turns
        if(!gameService.broadcastFn){
            gameService.broadcastFn = function(){
                broadcastGameState(gameService);
            };
        }

        if(!socket.middlewareRegistered){
            socket.middlewareRegistered = true;
            socket.use(function(packet, next){
                let action = packet[0];
                let data = packet[1];

                if(action === 'chat'){
                    if(socket.currentGameService && data && data.name && data.text){
                        let chatName = String(data.name).substring(0, 32);
                        let chatText = String(data.text).substring(0, 200);
                        io.to(socket.currentGameService.getId()).emit('chat', {
                            name: chatName,
                            text: chatText
                        });
                        if (socket.userId) achievSvc.trigger(socket.userId, socket.id, 'chat_sent', {});
                        Object.keys(io.sockets.sockets).forEach(function(sid) {
                            if (sid === socket.id) return;
                            let s = io.sockets.sockets[sid];
                            if (s.currentGameService !== socket.currentGameService || !s.userId) return;
                            achievSvc.trigger(s.userId, sid, 'chat_received', {});
                        });
                    }
                    return;
                }

                if(action === 'quit'){
                    let gs = socket.currentGameService;
                    if(gs){
                        if(socket.userId && gs.getGameRulesModel().isSeriesStarted()){
                            userDB.bumpStat(socket.userId, 'matches_deserted', 1);
                            achievSvc.trigger(socket.userId, socket.id, 'quit', {});
                        }
                        let quitClient = gs.getClientRepository().findBySocketId(socket.id);
                        if(quitClient) endBRGameForLeave(gs, quitClient);
                        gs.removePlayer(socket.id);
                        clearAfkTimer(gs);
                        socket.leave(gs.getId());
                        socket.currentGameService = null;
                        if(!destroyGameIfEmpty(gs)){
                            broadcastGameState(gs);
                        }
                    }
                    return;
                }

                if(action === 'restart'){
                    let gs = socket.currentGameService;
                    if(gs){
                        let cr = gs.getClientRepository();
                        let client = cr.findBySocketId(socket.id);
                        if(client && gs.hostName && client.getName() !== gs.hostName) return;
                        clearAfkTimer(gs);
                        gs._afkStateKey = null;
                        gs.restart();
                        broadcastGameState(gs);
                    }
                    return;
                }

                if(action === 'place' && data && data.card && data.card.type && socket.userId){
                    if(!socket._pendingCards) socket._pendingCards = {};
                    let n = data.card.type.charAt(1);
                    if(n === 'g')      socket._pendingCards.cards_plus4    = (socket._pendingCards.cards_plus4    || 0) + 1;
                    else if(n === 'c') socket._pendingCards.cards_wildcolor = (socket._pendingCards.cards_wildcolor || 0) + 1;
                    else if(n === 'p') socket._pendingCards.cards_plus2    = (socket._pendingCards.cards_plus2    || 0) + 1;
                    else if(n === 'n') socket._pendingCards.cards_missed   = (socket._pendingCards.cards_missed   || 0) + 1;
                    else if(n === 'r') socket._pendingCards.cards_reverse  = (socket._pendingCards.cards_reverse  || 0) + 1;
                    else if(!isNaN(parseInt(n))) socket._pendingCards.cards_normal = (socket._pendingCards.cards_normal || 0) + 1;

                    let isWild = n === 'c' || n === 'g';
                    let isActionCard = n === 'c' || n === 'g' || n === 'p' || n === 'n' || n === 'r';
                    let isNormal = !isNaN(parseInt(n));
                    let cardColor = data.card.type.length > 2 ? data.card.type.charAt(2) : data.card.type.charAt(0);
                    let grm2 = socket.currentGameService && socket.currentGameService.getGameRulesModel ? socket.currentGameService.getGameRulesModel() : null;
                    // "isStack" means "this punishment card was played under the stacking
                    // ruleset" (rewards engaging with the mechanic at all), not "a stack
                    // happened to already be pending the instant before this exact card" —
                    // that narrower reading meant stack_plus2/stack_plus4 almost never
                    // fired in practice, since a +4 usually *starts* a chain rather than
                    // landing mid-chain, and by the time a human's turn comes back around
                    // an AI opponent has often already silently resolved the pending stack.
                    let isStack = !!(grm2 && grm2.ruleset === 'stacking');
                    if (isWild && socket._roundFlags) socket._roundFlags.noColorChange = false;
                    if ((n === 'p' || n === 'g') && socket._roundFlags) socket._roundFlags.noPunishmentPlayed = false;
                    achievSvc.trigger(socket.userId, socket.id, 'card_placed', {
                        cardType: data.card.type, cardChar: n, isWild, isActionCard, isNormal,
                        isStack, color: cardColor, number: isNormal ? n : null,
                    });
                    if (n === 'p' || n === 'g' || n === 'n') {
                        achievSvc.trigger(socket.userId, socket.id, 'punish_applied', {});
                        const isImmediatePunish = n === 'n' || !grm2 || grm2.ruleset !== 'stacking';
                        if (isImmediatePunish && grm2 && grm2.clientRepository) {
                            const placer = grm2.clientRepository.findByTurn(true);
                            const victim = placer && grm2.getNextClient(placer);
                            if (victim) {
                                const victimName = victim.getName();
                                const crVic = socket.currentGameService.getClientRepository();
                                Object.keys(io.sockets.sockets).forEach(function(sid) {
                                    const s = io.sockets.sockets[sid];
                                    if (s.currentGameService !== socket.currentGameService || !s.userId) return;
                                    const c = crVic.findBySocketId(sid);
                                    if (c && !c.isAI && c.getName() === victimName) {
                                        achievSvc.trigger(s.userId, sid, 'punishment_received', {});
                                    }
                                });
                            }
                        }
                    }
                }

                if(action === 'login'){
                    if(data && data.authToken){
                        let user = userDB.getUserByToken(data.authToken);
                        if(user){ socket.userId = user.id; socket.username = user.username; kickDuplicateSessions(socket.id, user.id); socket.join('global'); socket.emit('globalHistory', userDB.globalMessagesGetRecent(100)); }
                    }
                    if(socket.currentGameService && !socket.currentGameService.hostName && data && data.client && data.client.name){
                        socket.currentGameService.hostName = String(data.client.name).substring(0, 32);
                    }
                    if (socket.userId) {
                        let achState = achievSvc.getStateForUser(socket.userId);
                        socket.emit('achievementsState', achState);
                        if (!socket._matchStartTime) socket._matchStartTime = null;
                        if (!socket._roundFlags) socket._roundFlags = { noPunishmentPlayed: true, noColorChange: true };
                    }
                }

                if(action === 'begin' && socket.currentGameService){
                    let grmBr = socket.currentGameService.getGameRulesModel ? socket.currentGameService.getGameRulesModel() : null;
                    if(grmBr && grmBr.battleRoyale && socket.currentGameService.getClientRepository().count() < 3){
                        socket.emit('brTooFewPlayers');
                        return;
                    }
                    socket.currentGameService._roundStartTime = Date.now();
                    if (!socket._matchStartTime) socket._matchStartTime = Date.now();
                    if (!socket._roundFlags) socket._roundFlags = { noPunishmentPlayed: true, noColorChange: true };
                }

                if(action === 'take' && socket.currentGameService && socket.userId){
                    let grm3 = socket.currentGameService.getGameRulesModel ? socket.currentGameService.getGameRulesModel() : null;
                    if (grm3 && grm3.ruleset === 'stacking' && grm3.stackPending) {
                        achievSvc.trigger(socket.userId, socket.id, 'stack_taken', { stackCount: grm3.stackPending.count });
                    } else {
                        achievSvc.trigger(socket.userId, socket.id, 'card_taken', {});
                    }
                }


                if (socket.currentGameService && socket.currentGameService.afkTimeout > 0) {
                    var gsAfk = socket.currentGameService;
                    var crAfk = gsAfk.getClientRepository();
                    var actingClient = crAfk.findBySocketId(socket.id);
                    if (actingClient && actingClient.getTurn()) {
                        clearAfkTimer(gsAfk);
                        actingClient.afkStreak = 0;
                        gsAfk._afkStateKey = null;
                    }
                }

                if (action === 'login' && socket.currentGameService) {
                    var gs0 = socket.currentGameService;
                    var loginName = data && data.client && data.client.name ? String(data.client.name).substring(0, 32) : null;
                    if (loginName) {
                        if (gs0._bannedNames && gs0._bannedNames.has(loginName)) {
                            socket.emit('roomFull', { started: true });
                            socket.leave(gs0.getId());
                            socket.currentGameService = null;
                            return;
                        }
                        var cr0 = gs0.getClientRepository();
                        var nameTaken = Object.keys(io.sockets.sockets).some(function(sid) {
                            if (sid === socket.id) return false;
                            var s = io.sockets.sockets[sid];
                            if (s.currentGameService !== gs0) return false;
                            var c = cr0.findBySocketId(sid);
                            return c && c.getName() === loginName && !c.disconnected;
                        });
                        if (nameTaken) {
                            socket.emit('nameTaken');
                            socket.leave(gs0.getId());
                            socket.currentGameService = null;
                            return;
                        }
                    }
                }

                if(socket.currentGameService){
                    try {
                        socket.currentGameService.handleAction(socket, action, data);
                        broadcastGameState(socket.currentGameService);
                        if (action === 'take' && socket.userId) {
                            var ss = socket.currentGameService.getClientResponseData(socket.id);
                            if (ss && ss.client && ss.client.cards) achievSvc.trigger(socket.userId, socket.id, 'hand_check', { handSize: ss.client.cards.length });
                        }
                        socket.currentGameService.scheduleAITurn();
                    } catch(e) {
                        console.error('Action error [' + action + ']:', e.message);
                    }
                    return;
                }

                next();
            });
        }
    });

    socket.on('disconnect', function(){
        let gs = socket.currentGameService;
        if(!gs) return;

        let cr = gs.getClientRepository();
        let client = cr.findBySocketId(socket.id);
        if(!client || client.isAI) return;

        let humans = cr.findAll().filter(function(c){ return !c.isAI; });
        // Game in progress and removing this player drops humans below 2 — quit immediately, no grace
        if(gs.getGameRulesModel().isSeriesStarted() && humans.length <= 2){
            if(client._disconnectTimer) clearTimeout(client._disconnectTimer);
            endBRGameForLeave(gs, client);
            gs.removePlayer(socket.id);
            clearAfkTimer(gs);
            if(!destroyGameIfEmpty(gs)){
                broadcastGameState(gs);
            }
            return;
        }

        client.disconnected = true;
        console.log('Player disconnected: ' + client.getName() + ' — 30s grace period');

        // Notify remaining players immediately
        broadcastGameState(gs);

        client._disconnectTimer = setTimeout(function(){
            if(client.disconnected){
                console.log('Grace period expired for: ' + client.getName());
                if(socket.userId && gs.getGameRulesModel().isSeriesStarted()){
                    userDB.bumpStat(socket.userId, 'matches_disconnected', 1);
                }
                endBRGameForLeave(gs, client);
                gs.removePlayer(socket.id);
                clearAfkTimer(gs);
                if(!destroyGameIfEmpty(gs)){
                    broadcastGameState(gs);
                }
            }
        }, 30000);
    });
});


