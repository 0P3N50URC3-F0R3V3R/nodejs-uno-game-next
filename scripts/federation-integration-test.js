// Manual follow-up (not automated here — needs file edits / process kill-restart):
//   5. Edit a byte in node_src/UNO/Card.js, restart server A, re-run this script's
//      steps 1-2 equivalent by hand -> both peers should show Denied (hash_mismatch).
//   6. Revert the edit, restart A -> both back to Connected.
//   7. Kill process B mid-test (before cleanup) -> A's next liveness check -> Unreachable.
//   8. Restart B -> A auto-recovers to Connected.
//   10. Hammer POST /api/federation/handshake past 30 requests/60s -> expect HTTP 429.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const ioClient = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const DATA_A = path.join(ROOT, 'data-fed-test-A');
const DATA_B = path.join(ROOT, 'data-fed-test-B');
const CONFIG_A = path.join(ROOT, 'config.fed-test-A.json');
const CONFIG_B = path.join(ROOT, 'config.fed-test-B.json');
const FEDERATION_POLL_MS = 2000;

function rmSyncWithRetry(dir) {
    // On Windows, a just-killed child process can hold better-sqlite3's file
    // handle open for a brief moment after kill() returns (EPERM/EBUSY).
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            return;
        } catch (e) {
            if (attempt === 9) throw e;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        }
    }
}

function cleanup() {
    [DATA_A, DATA_B].forEach(d => rmSyncWithRetry(d));
    [CONFIG_A, CONFIG_B].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
}

function killAndWait(proc, timeoutMs) {
    return new Promise(resolve => {
        if (proc.exitCode !== null || proc.signalCode !== null) { resolve(); return; }
        const timer = setTimeout(resolve, timeoutMs);
        proc.once('exit', () => { clearTimeout(timer); resolve(); });
        proc.kill();
    });
}

function writeConfig(configPath, port, adminPassword) {
    fs.writeFileSync(configPath, JSON.stringify({
        port, adminPassword, federationPollMs: FEDERATION_POLL_MS, federationDebugEnabled: false,
        federationDomain: 'localhost:' + port, federationScheme: 'http'
    }));
}

function spawnServer(dataDir, configPath, port) {
    fs.mkdirSync(dataDir, { recursive: true });
    return spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: Object.assign({}, process.env, { UNO_CONFIG_PATH: configPath, UNO_DATA_DIR: dataDir, PORT: String(port) }),
        stdio: 'ignore'
    });
}

async function waitForServer(port) {
    for (let i = 0; i < 50; i++) {
        try {
            const res = await fetch(`http://localhost:${port}/api/ping`);
            if (res.ok) return;
        } catch (e) { /* not up yet */ }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`server on port ${port} never came up`);
}

async function adminFetch(port, adminPassword, urlPath, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-admin-password': adminPassword, 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(`http://localhost:${port}${urlPath}`, opts);
}

async function pollUntilStatus(port, adminPassword, domain, expectedStatus, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const res = await adminFetch(port, adminPassword, '/api/admin/federation/peers');
        const peers = await res.json();
        const peer = peers.find(p => p.domain === domain);
        if (peer && peer.status === expectedStatus) return peer;
        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error(`peer ${domain} never reached status ${expectedStatus}`);
}

async function pollUntilAbsent(port, adminPassword, domain, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const res = await adminFetch(port, adminPassword, '/api/admin/federation/peers');
        const peers = await res.json();
        const peer = peers.find(p => p.domain === domain);
        if (!peer) return;
        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error(`peer ${domain} never disappeared`);
}

async function registerUser(port, username, password) {
    const res = await fetch(`http://localhost:${port}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.error) throw new Error(`register ${username}@${port} failed: ${data.error}`);
    return data;
}

function connectSocket(port) {
    return ioClient(`http://localhost:${port}`, { forceNew: true, reconnection: false });
}

function waitForSocketEvent(socket, event, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for socket event "${event}"`)), timeoutMs);
        socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
    });
}

async function createOpenRoomAsOwner(port, ownerToken, room) {
    const socket = connectSocket(port);
    await waitForSocketEvent(socket, 'connect', 5000);
    const statePromise = waitForSocketEvent(socket, 'state', 5000);
    socket.emit('create', { room, authToken: ownerToken, creating: true, bots: [], maxRounds: 5 });
    socket.emit('login', { client: { name: 'Owner' }, authToken: ownerToken });
    await statePromise;
    return socket;
}

async function pollUntilRemoteLobbyVisible(port, room, domain, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const res = await fetch(`http://localhost:${port}/api/lobbies`);
        const data = await res.json();
        const found = (data.lobbies || []).find(l => l.id === room && l.domain === domain);
        if (found) return found;
        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error(`lobby "${room}" from domain ${domain} never appeared on port ${port}`);
}

async function pollUntilGuestSessionConsumed(port, sessionId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const res = await fetch(`http://localhost:${port}/api/federation/guest-session/${sessionId}`);
        if (res.status === 404) return;
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`guest session ${sessionId} was never consumed`);
}

function signWithIdentityFile(dataDir, data) {
    const identity = JSON.parse(fs.readFileSync(path.join(dataDir, 'federation_identity.json'), 'utf8'));
    const privKey = crypto.createPrivateKey({ key: Buffer.from(identity.privateKey, 'base64'), format: 'der', type: 'pkcs8' });
    return crypto.sign(null, Buffer.from(data), privKey).toString('base64');
}

// Task 9: cross-server room join (lobby merge -> join-request -> redirect -> guest
// session peek/consume) plus win-event crediting, exercised against two real processes.
async function testCrossServerRoomsAndWinEvent(PORT_A, PORT_B, federationPollMs) {
    const DOMAIN_A = `localhost:${PORT_A}`;
    const DOMAIN_B = `localhost:${PORT_B}`;
    const room = 'fed-cross-room';

    const owner = await registerUser(PORT_A, 'Owner', 'ownerpass1');
    const ownerSocket = await createOpenRoomAsOwner(PORT_A, owner.token, room);

    try {
        const remoteLobby = await pollUntilRemoteLobbyVisible(PORT_B, room, DOMAIN_A, federationPollMs + 5000);
        assert.strictEqual(remoteLobby.id, room, 'B must see A\'s room under the correct id');
        console.log('PASS: task9 step 3 (cross-server lobby merge)');

        const visitor = await registerUser(PORT_B, 'Visitor', 'visitorpass1');
        const jrRes = await fetch(`http://localhost:${PORT_B}/api/federation/join-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + visitor.token },
            body: JSON.stringify({ peerDomain: DOMAIN_A, roomId: room })
        });
        const jrData = await jrRes.json();
        assert.ok(jrData.redirectUrl && jrData.redirectUrl.startsWith(`http://${DOMAIN_A}/federated-join?token=`),
            `join-request must return a redirectUrl targeting A, got: ${JSON.stringify(jrData)}`);
        console.log('PASS: task9 step 4 (join-request issues redirectUrl)');

        const redirectRes = await fetch(jrData.redirectUrl, { redirect: 'manual' });
        assert.strictEqual(redirectRes.status, 302, 'GET /federated-join must redirect');
        const location = redirectRes.headers.get('location');
        assert.ok(location && location.startsWith('/?fedSession='), `expected /?fedSession=<id>, got: ${location}`);
        const sessionId = location.substring('/?fedSession='.length);
        console.log('PASS: task9 step 5 (redirect targets /?fedSession=<id>)');

        const peek1Res = await fetch(`http://localhost:${PORT_A}/api/federation/guest-session/${sessionId}`);
        assert.strictEqual(peek1Res.status, 200);
        const peek1 = await peek1Res.json();
        assert.strictEqual(peek1.room, room);
        assert.ok(peek1.name.startsWith('Visitor'), `guest name must start with "Visitor", got: ${peek1.name}`);
        assert.strictEqual(peek1.homeDomain, DOMAIN_B);
        console.log('PASS: task9 step 6 (guest-session peek returns {room, name, homeDomain})');

        const peek2Res = await fetch(`http://localhost:${PORT_A}/api/federation/guest-session/${sessionId}`);
        assert.strictEqual(peek2Res.status, 200, 'second read must still be 200 -- peek is non-destructive');
        const peek2 = await peek2Res.json();
        assert.deepStrictEqual(peek2, peek1, 'repeated peeks must return the same payload');
        console.log('PASS: task9 step 7 (guest-session peek is non-destructive, repeatable)');

        const guestSocket = connectSocket(PORT_A);
        await waitForSocketEvent(guestSocket, 'connect', 5000);
        guestSocket.emit('federationGuestMark', { sessionId });
        try {
            await pollUntilGuestSessionConsumed(PORT_A, sessionId, 5000);
            console.log('PASS: task9 steps 8-9 (federationGuestMark socket event consumes the session -> 404)');
        } finally {
            guestSocket.close();
        }

        const meBefore = await (await fetch(`http://localhost:${PORT_A}/api/auth/me`, { headers: { 'Authorization': 'Bearer ' + owner.token } })).json();
        const ts = Date.now();
        const signature = signWithIdentityFile(DATA_B, DOMAIN_B + 'Owner' + room + ts);
        const winRes = await fetch(`http://localhost:${PORT_A}/api/federation/win-event`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderDomain: DOMAIN_B, playerName: 'Owner', roomId: room, ts, signature })
        });
        const winData = await winRes.json();
        assert.deepStrictEqual(winData, { ok: true }, `win-event must be accepted, got: ${JSON.stringify(winData)}`);
        const meAfter = await (await fetch(`http://localhost:${PORT_A}/api/auth/me`, { headers: { 'Authorization': 'Bearer ' + owner.token } })).json();
        assert.ok(meAfter.gold > meBefore.gold, `gold must increase after win-event crediting (before=${meBefore.gold}, after=${meAfter.gold})`);
        console.log('PASS: task9 step 10 (win-event crediting)');
    } finally {
        ownerSocket.close();
    }
}

async function main() {
    cleanup();
    const PORT_A = 15678, PORT_B = 15679;
    writeConfig(CONFIG_A, PORT_A, 'pwA');
    writeConfig(CONFIG_B, PORT_B, 'pwB');
    const procA = spawnServer(DATA_A, CONFIG_A, PORT_A);
    const procB = spawnServer(DATA_B, CONFIG_B, PORT_B);

    try {
        await waitForServer(PORT_A);
        await waitForServer(PORT_B);

        // Step 1: add peer both directions -> both Pending
        await adminFetch(PORT_A, 'pwA', '/api/admin/federation/peers', { method: 'POST', body: JSON.stringify({ domain: `localhost:${PORT_B}` }) });
        await adminFetch(PORT_B, 'pwB', '/api/admin/federation/peers', { method: 'POST', body: JSON.stringify({ domain: `localhost:${PORT_A}` }) });

        // Step 2: wait for reconciliation -> both Connected
        const peerBFromA = await pollUntilStatus(PORT_A, 'pwA', `localhost:${PORT_B}`, 'Connected', 15000);
        const peerAFromB = await pollUntilStatus(PORT_B, 'pwB', `localhost:${PORT_A}`, 'Connected', 15000);
        assert.ok(peerBFromA.public_key, 'A must have stored B\'s public key');
        assert.ok(peerAFromB.public_key, 'B must have stored A\'s public key');
        console.log('PASS: step 2 (mutual Connected)');

        // Step 3: chat A -> B
        await adminFetch(PORT_A, 'pwA', `/api/admin/federation/peers/${peerBFromA.id}/messages`, { method: 'POST', body: JSON.stringify({ body: 'hello from A' }) });
        await new Promise(r => setTimeout(r, 500));
        const bMessagesRes = await adminFetch(PORT_B, 'pwB', `/api/admin/federation/peers/${peerAFromB.id}/messages`);
        const bMessages = await bMessagesRes.json();
        assert.ok(bMessages.some(m => m.direction === 'incoming' && m.body === 'hello from A'), 'B must have received the chat message');
        console.log('PASS: step 3 (chat delivered)');

        // Step 4: delete conversation on B, A's copy unaffected
        await adminFetch(PORT_B, 'pwB', `/api/admin/federation/peers/${peerAFromB.id}/messages`, { method: 'DELETE' });
        const bMessagesAfter = await (await adminFetch(PORT_B, 'pwB', `/api/admin/federation/peers/${peerAFromB.id}/messages`)).json();
        assert.strictEqual(bMessagesAfter.length, 0, 'B\'s conversation must be empty after delete');
        const aMessagesAfter = await (await adminFetch(PORT_A, 'pwA', `/api/admin/federation/peers/${peerBFromA.id}/messages`)).json();
        assert.ok(aMessagesAfter.length > 0, 'A\'s copy must be unaffected by B\'s local delete');
        console.log('PASS: step 4 (local-only delete)');

        // Task 9: cross-server room join + win-event crediting (needs both peers still Connected)
        await testCrossServerRoomsAndWinEvent(PORT_A, PORT_B, FEDERATION_POLL_MS);
        console.log('PASS: task9 (cross-server room join and win-event crediting)');

        // Step 9: remove peer on A -> B (reachable) receives the signed unlink push and deletes its own row
        await adminFetch(PORT_A, 'pwA', `/api/admin/federation/peers/${peerBFromA.id}`, { method: 'DELETE' });
        await pollUntilAbsent(PORT_B, 'pwB', `localhost:${PORT_A}`, 15000);
        console.log('PASS: step 9 (reachable unlink -> peer deleted on both sides)');

        console.log('ALL FEDERATION INTEGRATION TESTS PASSED');
    } finally {
        await killAndWait(procA, 3000);
        await killAndWait(procB, 3000);
        cleanup();
    }
}

main().catch(e => { console.error(e); process.exit(1); });
