'use strict';
const assert = require('assert');
const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const http = require('http');
const FederationDB = require('./FederationDB.js');
const FederationIdentity = require('./FederationIdentity.js');
const FederationService = require('./FederationService.js');

function tmpIdentity() {
    return new FederationIdentity(fs.mkdtempSync(path.join(os.tmpdir(), 'fed-test-')));
}

function mockFetch(responses) {
    // responses: array of { ok, json } consumed in order, one per call
    let i = 0;
    return async function(url, opts) {
        const r = responses[i++];
        if (r.throwError) throw new Error(r.throwError);
        return { ok: r.ok !== false, json: async () => r.json };
    };
}

async function testAttemptHandshakeConnected() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ json: { status: 'connected', publicKey: 'pubkey-b', serverHash: 'HASH_A' } }])
    });
    await svc._attemptHandshake(fdb.getPeerById(peer.id));
    const updated = fdb.getPeerById(peer.id);
    assert.strictEqual(updated.status, 'Connected', 'successful handshake reply must flip peer to Connected');
    assert.strictEqual(updated.public_key, 'pubkey-b');
    db.close();
}

async function testAttemptHandshakeUnknownStaysPending() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ json: { status: 'unknown' } }])
    });
    await svc._attemptHandshake(fdb.getPeerById(peer.id));
    assert.strictEqual(fdb.getPeerById(peer.id).status, 'Pending', 'unknown reply must leave peer Pending (not yet reciprocated)');
    db.close();
}

async function testAttemptHandshakeDenied() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ json: { status: 'denied' } }])
    });
    await svc._attemptHandshake(fdb.getPeerById(peer.id));
    const updated = fdb.getPeerById(peer.id);
    assert.strictEqual(updated.status, 'Denied');
    assert.strictEqual(updated.denied_reason, 'hash_mismatch');
    db.close();
}

async function testAttemptHandshakeNetworkFailure() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ throwError: 'ECONNREFUSED' }])
    });
    await svc._attemptHandshake(fdb.getPeerById(peer.id));
    assert.strictEqual(fdb.getPeerById(peer.id).status, 'Error', 'transport failure must flip Pending peer to Error');
    db.close();
}

async function testAttemptHandshakeUsesConfiguredScheme() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    let capturedUrl = null;
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        scheme: 'http',
        fetchImpl: async (url, opts) => { capturedUrl = url; return { ok: true, json: async () => ({ status: 'unknown' }) }; }
    });
    await svc._attemptHandshake(fdb.getPeerById(peer.id));
    assert.ok(capturedUrl.startsWith('http://'), 'configured scheme must be used for outbound handshake URL');
    assert.ok(!capturedUrl.startsWith('https://'), 'must not fall back to hardcoded https when scheme is configured');
    db.close();
}

async function testAttemptHandshakeIdempotentReplyDoesNotNullPinnedKey() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'GOOD_KEY', server_hash: 'HASH_B' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ json: { status: 'connected' } }])
    });
    await svc._attemptHandshake(fdb.getPeerById(peer.id));
    const updated = fdb.getPeerById(peer.id);
    assert.strictEqual(updated.status, 'Connected');
    assert.strictEqual(updated.public_key, 'GOOD_KEY', 'idempotent keepalive reply (no publicKey field) must not null out an already-pinned key');
    assert.strictEqual(updated.server_hash, 'HASH_B', 'idempotent keepalive reply (no serverHash field) must not null out an already-pinned server hash');
    db.close();
}

async function testCheckLivenessConnectedStaysConnected() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-b' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ json: { status: 'connected', serverHash: 'HASH_A' } }])
    });
    await svc._checkLiveness(fdb.getPeerById(peer.id));
    assert.strictEqual(fdb.getPeerById(peer.id).status, 'Connected');
    db.close();
}

async function testCheckLivenessHashMismatchBecomesDenied() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-b' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ json: { status: 'connected', serverHash: 'HASH_DIFFERENT' } }])
    });
    await svc._checkLiveness(fdb.getPeerById(peer.id));
    const updated = fdb.getPeerById(peer.id);
    assert.strictEqual(updated.status, 'Denied', 'a valid signature with a drifted hash must still deny, not silently stay Connected');
    assert.strictEqual(updated.denied_reason, 'hash_mismatch');
    db.close();
}

async function testCheckLivenessUnknownBecomesDeniedUnlinked() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-b' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ json: { status: 'unknown' } }])
    });
    await svc._checkLiveness(fdb.getPeerById(peer.id));
    const updated = fdb.getPeerById(peer.id);
    assert.strictEqual(updated.status, 'Denied');
    assert.strictEqual(updated.denied_reason, 'unlinked');
    db.close();
}

async function testCheckLivenessKeyMismatchBecomesDenied() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-b' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ json: { status: 'key_mismatch' } }])
    });
    await svc._checkLiveness(fdb.getPeerById(peer.id));
    const updated = fdb.getPeerById(peer.id);
    assert.strictEqual(updated.status, 'Denied');
    assert.strictEqual(updated.denied_reason, 'key_mismatch');
    db.close();
}

async function testCheckLivenessNetworkFailureBecomesUnreachable() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-b' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ throwError: 'ETIMEDOUT' }])
    });
    await svc._checkLiveness(fdb.getPeerById(peer.id));
    assert.strictEqual(fdb.getPeerById(peer.id).status, 'Unreachable');
    db.close();
}

async function testFetchLobbiesCachesOnSuccess() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-b' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        getLocalLobbies: () => [],
        fetchImpl: mockFetch([{ json: [{ room_id: 'r1', room_name: 'r1', players: 2, max_players: 5 }] }])
    });
    await svc._fetchLobbies(fdb.getPeerById(peer.id));
    const cached = fdb.listCachedLobbies();
    assert.strictEqual(cached.length, 1);
    assert.strictEqual(cached[0].room_id, 'r1');
    db.close();
}

async function testFetchLobbiesClearsCacheOnFailure() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-b' });
    fdb.replaceLobbiesForPeer(peer.id, [{ room_id: 'stale', room_name: 'stale', players: 1, max_players: 5 }]);
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        getLocalLobbies: () => [],
        fetchImpl: mockFetch([{ throwError: 'ECONNREFUSED' }])
    });
    await svc._fetchLobbies(fdb.getPeerById(peer.id));
    assert.strictEqual(fdb.listCachedLobbies().length, 0, 'a failed fetch must clear stale cached rows, not leave them');
    db.close();
}

async function testPollOnceAlsoFetchesLobbiesForConnectedPeer() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-b' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        getLocalLobbies: () => [],
        fetchImpl: mockFetch([
            { json: { status: 'connected', serverHash: 'HASH_A' } },
            { json: [{ room_id: 'r1', room_name: 'r1', players: 2, max_players: 5 }] }
        ])
    });
    await svc.pollOnce();
    assert.strictEqual(fdb.listCachedLobbies().length, 1, 'pollOnce must fetch lobbies right after a successful liveness check');
    db.close();
}

async function testPollOnceDispatchesByStatus() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const pending = fdb.addPeer('pending.example.com:1');
    const connected = fdb.addPeer('connected.example.com:2');
    fdb.updatePeerStatus(connected.id, { status: 'Connected', public_key: 'pubkey' });
    const suspended = fdb.addPeer('suspended.example.com:3');
    fdb.updatePeerStatus(suspended.id, { status: 'Suspended' });
    const deniedKeyMismatch = fdb.addPeer('denied-key.example.com:4');
    fdb.updatePeerStatus(deniedKeyMismatch.id, { status: 'Denied', denied_reason: 'key_mismatch' });

    // Keyed by domain rather than call order: listPeers() sorts newest-first (DESC) for the
    // admin UI, so pollOnce() does not visit peers in insertion order — a positional response
    // queue would silently hand the wrong canned reply to the wrong peer depending on exactly
    // when each addPeer() call's millisecond timestamp lands.
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: async (url) => {
            if (url.includes('pending.example.com')) return { ok: true, json: async () => ({ status: 'unknown' }) };
            if (url.includes('connected.example.com')) return { ok: true, json: async () => ({ status: 'connected', serverHash: 'HASH_A' }) };
            throw new Error('unexpected fetch to ' + url);
        }
    });
    await svc.pollOnce();

    assert.strictEqual(fdb.getPeerById(pending.id).status, 'Pending', 'pending peer must have been polled (stays Pending on unknown reply)');
    assert.strictEqual(fdb.getPeerById(connected.id).status, 'Connected');
    assert.strictEqual(fdb.getPeerById(suspended.id).status, 'Suspended', 'suspended peer must be skipped entirely');
    assert.strictEqual(fdb.getPeerById(deniedKeyMismatch.id).status, 'Denied', 'key_mismatch Denied peer must be excluded from auto-retry');
    db.close();
}

async function testCheckNameAvailableAllClear() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peerA = fdb.addPeer('a.example.com:1');
    fdb.updatePeerStatus(peerA.id, { status: 'Connected', public_key: 'pubkey-a' });
    const peerB = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peerB.id, { status: 'Connected', public_key: 'pubkey-b' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_X', ourDomain: 'x.example.com:9',
        fetchImpl: mockFetch([{ json: { taken: false } }, { json: { taken: false } }])
    });
    const available = await svc.checkNameAvailable('Peter');
    assert.strictEqual(available, true);
    db.close();
}

async function testCheckNameAvailableConflict() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peerA = fdb.addPeer('a.example.com:1');
    fdb.updatePeerStatus(peerA.id, { status: 'Connected', public_key: 'pubkey-a' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_X', ourDomain: 'x.example.com:9',
        fetchImpl: mockFetch([{ json: { taken: true } }])
    });
    const available = await svc.checkNameAvailable('Peter');
    assert.strictEqual(available, false);
    db.close();
}

async function testCheckNameAvailableFailsOpenOnTimeout() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peerA = fdb.addPeer('a.example.com:1');
    fdb.updatePeerStatus(peerA.id, { status: 'Connected', public_key: 'pubkey-a' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_X', ourDomain: 'x.example.com:9',
        fetchImpl: mockFetch([{ throwError: 'ETIMEDOUT' }])
    });
    const available = await svc.checkNameAvailable('Peter');
    assert.strictEqual(available, true, 'an unreachable peer must not block a name — fail open');
    db.close();
}

async function testCheckNameAvailableFailsOpenOnHang() {
    // fetchImpl never settles on its own — only the AbortController's 2s timeout
    // aborting opts.signal makes it reject, same as a real hanging fetch() would.
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peerA = fdb.addPeer('a.example.com:1');
    fdb.updatePeerStatus(peerA.id, { status: 'Connected', public_key: 'pubkey-a' });
    const hangingFetch = (url, opts) => new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
        });
    });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_X', ourDomain: 'x.example.com:9',
        fetchImpl: hangingFetch
    });
    const available = await svc.checkNameAvailable('Peter');
    assert.strictEqual(available, true, 'a hanging peer request must be aborted and fail open, not hang forever');
    db.close();
}

async function testReportWinEventSendsSignedPayload() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('home.example.com:1');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-home' });

    let capturedBody = null;
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'visited.example.com:2',
        fetchImpl: async (url, opts) => { capturedBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ ok: true }) }; }
    });
    await svc.reportWinEvent('home.example.com:1', { playerName: 'Peter', roomId: 'roomX' });
    assert.strictEqual(capturedBody.senderDomain, 'visited.example.com:2', 'report must identify us as the visited server');
    assert.strictEqual(capturedBody.playerName, 'Peter');
    assert.strictEqual(capturedBody.roomId, 'roomX');
    assert.ok(capturedBody.signature);
    db.close();
}

async function testReportWinEventSwallowsNetworkFailure() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('home.example.com:1');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-home' });
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'visited.example.com:2',
        fetchImpl: mockFetch([{ throwError: 'ECONNREFUSED' }])
    });
    await svc.reportWinEvent('home.example.com:1', { playerName: 'Peter', roomId: 'roomX' });
    // no assertion beyond "did not throw" — a guest's home server being briefly unreachable
    // must not blow up the visited server's game-end flow
}

async function testSendMessageDeliveredAndFlush() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-b' });

    const svcOk = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ ok: true, json: { ok: true } }])
    });
    const msg = await svcOk.sendMessage(peer.id, 'hello');
    const stored = fdb.listMessages(peer.id).find(m => m.id === msg.id);
    assert.strictEqual(stored.delivered, 1, 'successful push must mark the message delivered');

    const svcFail = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ throwError: 'ECONNREFUSED' }])
    });
    const msg2 = await svcFail.sendMessage(peer.id, 'still waiting to deliver');
    const stored2 = fdb.listMessages(peer.id).find(m => m.id === msg2.id);
    assert.strictEqual(stored2.delivered, 0, 'failed push must leave the message undelivered');

    const svcFlush = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: mockFetch([{ ok: true, json: { ok: true } }])
    });
    await svcFlush._flushMessages(fdb.getPeerById(peer.id));
    const stored2After = fdb.listMessages(peer.id).find(m => m.id === msg2.id);
    assert.strictEqual(stored2After.delivered, 1, 'flush must retry and mark the previously-undelivered message delivered');

    db.close();
}

async function testRemovePeerSendsSignedUnlinkThenDeletes() {
    const db = new Database(':memory:');
    const fdb = new FederationDB(db);
    const identity = tmpIdentity();
    const peer = fdb.addPeer('b.example.com:2');
    fdb.updatePeerStatus(peer.id, { status: 'Connected', public_key: 'pubkey-b' });

    let capturedBody = null;
    const svc = new FederationService({
        db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'a.example.com:1',
        fetchImpl: async (url, opts) => { capturedBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ ok: true }) }; }
    });
    await svc.removePeer(peer.id);
    assert.strictEqual(capturedBody.domain, 'a.example.com:1', 'unlink payload must identify us by our own domain');
    assert.ok(capturedBody.signature, 'unlink payload must carry a signature');
    assert.strictEqual(fdb.getPeerById(peer.id), undefined, 'removePeer must delete the local peer row regardless of push outcome');
    db.close();
}

function startTestServer(federationDebugEnabled) {
    return new Promise((resolve) => {
        const app = express();
        app.use(express.json());
        const db = new Database(':memory:');
        const fdb = new FederationDB(db);
        const identity = tmpIdentity();
        const svc = new FederationService({
            db: fdb, identity, getServerHash: () => 'HASH_A', ourDomain: 'localhost:0'
        });
        const adminAuth = (req, res, next) => {
            if (req.headers['x-admin-token'] === 'test-token') { next(); return; }
            res.status(401).json({ error: 'Unauthorized' });
        };
        require('./FederationRoutes.js')(app, fdb, svc, identity, adminAuth, { federationDebugEnabled });
        const server = app.listen(0, () => {
            const port = server.address().port;
            resolve({ server, port, fdb });
        });
    });
}

async function testRoutesPublicHandshakeUnknown() {
    const { server, port } = await startTestServer(false);
    const res = await fetch(`http://localhost:${port}/api/federation/handshake`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'nope:1', publicKey: 'x', serverHash: 'x' })
    });
    const data = await res.json();
    assert.strictEqual(data.status, 'unknown');
    server.close();
}

async function testRoutesAdminRequiresAuth() {
    const { server, port } = await startTestServer(false);
    const res = await fetch(`http://localhost:${port}/api/admin/federation/peers`);
    assert.strictEqual(res.status, 401, 'admin endpoints must reject requests without a valid admin token');
    server.close();
}

async function testRoutesAdminAddAndListPeer() {
    const { server, port } = await startTestServer(false);
    const addRes = await fetch(`http://localhost:${port}/api/admin/federation/peers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-token' },
        body: JSON.stringify({ domain: 'peer.example.com:9' })
    });
    assert.strictEqual(addRes.status, 200);
    const listRes = await fetch(`http://localhost:${port}/api/admin/federation/peers`, {
        headers: { 'x-admin-token': 'test-token' }
    });
    const list = await listRes.json();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].domain, 'peer.example.com:9');
    server.close();
}

async function testRoutesAdvancedModeGatedByConfig() {
    const { server, port } = await startTestServer(false);
    const res = await fetch(`http://localhost:${port}/api/admin/federation/identity`, {
        headers: { 'x-admin-token': 'test-token' }
    });
    assert.strictEqual(res.status, 404, 'advanced-mode endpoints must not exist when federationDebugEnabled is false');
    server.close();

    const enabled = await startTestServer(true);
    const res2 = await fetch(`http://localhost:${enabled.port}/api/admin/federation/identity`, {
        headers: { 'x-admin-token': 'test-token' }
    });
    assert.strictEqual(res2.status, 200, 'advanced-mode endpoints must exist when federationDebugEnabled is true');
    enabled.server.close();
}

async function run() {
    await testAttemptHandshakeConnected();
    await testAttemptHandshakeUnknownStaysPending();
    await testAttemptHandshakeDenied();
    await testAttemptHandshakeNetworkFailure();
    await testAttemptHandshakeUsesConfiguredScheme();
    await testAttemptHandshakeIdempotentReplyDoesNotNullPinnedKey();
    await testCheckLivenessConnectedStaysConnected();
    await testCheckLivenessHashMismatchBecomesDenied();
    await testCheckLivenessUnknownBecomesDeniedUnlinked();
    await testCheckLivenessKeyMismatchBecomesDenied();
    await testCheckLivenessNetworkFailureBecomesUnreachable();
    await testFetchLobbiesCachesOnSuccess();
    await testFetchLobbiesClearsCacheOnFailure();
    await testPollOnceAlsoFetchesLobbiesForConnectedPeer();
    await testCheckNameAvailableAllClear();
    await testCheckNameAvailableConflict();
    await testCheckNameAvailableFailsOpenOnTimeout();
    await testCheckNameAvailableFailsOpenOnHang();
    await testPollOnceDispatchesByStatus();
    await testReportWinEventSendsSignedPayload();
    await testReportWinEventSwallowsNetworkFailure();
    await testSendMessageDeliveredAndFlush();
    await testRemovePeerSendsSignedUnlinkThenDeletes();
    await testRoutesPublicHandshakeUnknown();
    await testRoutesAdminRequiresAuth();
    await testRoutesAdminAddAndListPeer();
    await testRoutesAdvancedModeGatedByConfig();
}

module.exports = { run };
