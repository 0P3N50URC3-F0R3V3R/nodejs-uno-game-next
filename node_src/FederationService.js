'use strict';
const crypto = require('crypto');
const FederationIdentity = require('./FederationIdentity.js');

function dedupeGuestName(name, takenNames) {
    const taken = new Set(takenNames);
    if (!taken.has(name)) return name;
    for (let i = 2; i <= 20; i++) {
        const candidate = name + i;
        if (!taken.has(candidate)) return candidate;
    }
    throw new Error('Could not find a free name after 20 attempts');
}

const TOKEN_FRESHNESS_MS = 30000;

class FederationService {
    constructor(opts) {
        this.db = opts.db;
        this.identity = opts.identity;
        this.getServerHash = opts.getServerHash;
        this.ourDomain = opts.ourDomain;
        this.fetchImpl = opts.fetchImpl || fetch;
        this.pollMs = opts.pollMs || 60000;
        this.scheme = opts.scheme || 'https';
        this.getLocalLobbies = opts.getLocalLobbies || (() => []);
        this.userDB = opts.userDB || null;
        this._pollTimer = null;
        this._backoff = new Map();
        this._usedJoinNonces = new Map(); // nonce -> expiryTs, purged lazily
        this._usedWinEventSignatures = new Map(); // signature -> expiryTs, purged lazily
        this._guestSessions = new Map(); // id -> { payload, expiry }
    }

    // ---- inbound (synchronous, no network) ----

    handleHandshakeRequest(reqBody) {
        const { domain, publicKey, serverHash } = reqBody || {};
        const peer = this.db.getPeerByDomain(domain);
        if (!peer) return { status: 'unknown' };

        if (peer.status === 'Connected') {
            return { status: 'connected', publicKey: this.identity.publicKey, serverHash: this.getServerHash() };
        }

        const retryable = peer.status === 'Pending' || peer.status === 'Error' ||
            peer.status === 'Unreachable' ||
            (peer.status === 'Denied' && peer.denied_reason === 'hash_mismatch');
        if (!retryable) return { status: 'unknown' };

        const ourHash = this.getServerHash();
        if (serverHash === ourHash) {
            this.db.updatePeerStatus(peer.id, {
                status: 'Connected', public_key: publicKey, server_hash: serverHash,
                denied_reason: null, connected_at: Date.now(), last_checked_at: Date.now()
            });
            return { status: 'connected', publicKey: this.identity.publicKey, serverHash: ourHash };
        }
        this.db.updatePeerStatus(peer.id, {
            status: 'Denied', denied_reason: 'hash_mismatch',
            last_error: 'version hash mismatch', last_checked_at: Date.now()
        });
        return { status: 'denied' };
    }

    handleLivenessRequest(reqBody) {
        const { domain, nonce, signature } = reqBody || {};
        const peer = this.db.getPeerByDomain(domain);
        if (!peer || !peer.public_key || !['Connected', 'Unreachable', 'Suspended'].includes(peer.status)) {
            return { status: 'unknown' };
        }
        const valid = FederationIdentity.verify(peer.public_key, nonce, signature);
        if (!valid) return { status: 'key_mismatch' };
        return { status: 'connected', serverHash: this.getServerHash() };
    }

    handleMessageRequest(reqBody) {
        const { senderDomain, body, timestamp, signature } = reqBody || {};
        const peer = this.db.getPeerByDomain(senderDomain);
        if (!peer || peer.status !== 'Connected' || !peer.public_key) return false;
        const valid = FederationIdentity.verify(peer.public_key, senderDomain + body + timestamp, signature);
        if (!valid) return false;
        this.db.addMessage(peer.id, 'incoming', body);
        return true;
    }

    handleUnlinkRequest(reqBody) {
        const { domain, signature } = reqBody || {};
        const peer = this.db.getPeerByDomain(domain);
        if (!peer || !peer.public_key) return;
        const valid = FederationIdentity.verify(peer.public_key, domain, signature);
        if (valid) this.db.deletePeer(peer.id);
    }

    handleNameCheckRequest(reqBody) {
        const name = (reqBody && reqBody.name) || '';
        if (!name || !this.userDB) return { taken: false };
        return { taken: this.userDB.usernameExists(name) };
    }

    handleWinEventReport(reqBody) {
        const { senderDomain, playerName, roomId, ts, signature } = reqBody || {};
        if (!this.userDB) return false;
        const peer = this.db.getPeerByDomain(senderDomain);
        if (!peer || peer.status !== 'Connected' || !peer.public_key) return false;
        const valid = FederationIdentity.verify(peer.public_key, senderDomain + playerName + roomId + ts, signature);
        if (!valid) return false;

        this._purgeExpiredWinEventSignatures();
        if (Date.now() - ts > TOKEN_FRESHNESS_MS) return false;
        if (this._usedWinEventSignatures.has(signature)) return false;

        const user = this.userDB.getUserByUsername ? this.userDB.getUserByUsername(playerName) : null;
        if (!user) return false;

        const goldAmount = this.userDB.goldGetEffective('gold_win');
        this.userDB.awardGold(user.id, goldAmount);
        this._usedWinEventSignatures.set(signature, ts + TOKEN_FRESHNESS_MS);
        return true;
    }

    _purgeExpiredWinEventSignatures() {
        const now = Date.now();
        for (const [signature, expiry] of this._usedWinEventSignatures) {
            if (expiry < now) this._usedWinEventSignatures.delete(signature);
        }
    }

    // ---- outbound (async, uses fetchImpl) ----

    start() {
        if (this._pollTimer) return;
        this._pollTimer = setInterval(() => { this.pollOnce(); }, this.pollMs);
    }

    stop() {
        if (this._pollTimer) clearInterval(this._pollTimer);
        this._pollTimer = null;
    }

    _shouldAttempt(peer) {
        const backoffMs = this._backoff.get(peer.id) || this.pollMs;
        if (!peer.last_checked_at) return true;
        return (Date.now() - peer.last_checked_at) >= backoffMs;
    }

    _recordSuccess(peerId) { this._backoff.set(peerId, this.pollMs); }
    _recordFailure(peerId) {
        const current = this._backoff.get(peerId) || this.pollMs;
        this._backoff.set(peerId, Math.min(current * 2, 3600000));
    }

    async pollOnce() {
        const peers = this.db.listPeers();
        for (const peer of peers) {
            if (peer.status === 'Suspended') continue;
            if (peer.status === 'Denied' && peer.denied_reason !== 'hash_mismatch') continue;
            if (!this._shouldAttempt(peer)) continue;

            // Once a peer has a pinned public_key (Connected or Unreachable — both were
            // Connected at some point), every future contact MUST go through the signed
            // liveness check, never the unsigned handshake — otherwise a "recovery" from
            // Unreachable would silently accept a brand new key from whoever answers at
            // that domain, defeating key pinning entirely. Unsigned handshake is only for
            // peers we've never successfully connected to yet (no key to protect).
            if (peer.public_key) {
                await this._checkLiveness(peer);
            } else {
                await this._attemptHandshake(peer);
            }
            const refreshed = this.db.getPeerById(peer.id);
            if (refreshed.status === 'Connected') {
                await this._fetchLobbies(refreshed);
            } else {
                this.db.deleteLobbiesForPeer(peer.id);
            }
            await this._flushMessages(refreshed);
        }
    }

    async _attemptHandshake(peer) {
        const body = {
            serverId: this.identity.serverId,
            publicKey: this.identity.publicKey,
            serverHash: this.getServerHash(),
            domain: this.ourDomain
        };
        let res;
        try {
            res = await this.fetchImpl(`${this.scheme}://${peer.domain}/api/federation/handshake`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
        } catch (e) {
            this._recordFailure(peer.id);
            this.db.updatePeerStatus(peer.id, { status: 'Error', last_error: e.message, last_checked_at: Date.now() });
            return;
        }
        const data = await res.json();
        this.db.updatePeerStatus(peer.id, { last_checked_at: Date.now(), debug_last_response: JSON.stringify(data) });

        if (data.status === 'unknown') { this._recordFailure(peer.id); return; }
        if (data.status === 'connected') {
            this._recordSuccess(peer.id);
            const fields = { status: 'Connected', denied_reason: null, connected_at: Date.now() };
            if (data.publicKey) fields.public_key = data.publicKey;
            if (data.serverHash) fields.server_hash = data.serverHash;
            this.db.updatePeerStatus(peer.id, fields);
            return;
        }
        if (data.status === 'denied') {
            this._recordFailure(peer.id);
            this.db.updatePeerStatus(peer.id, {
                status: 'Denied', denied_reason: 'hash_mismatch', last_error: 'version hash mismatch'
            });
        }
    }

    async _checkLiveness(peer) {
        const nonce = crypto.randomBytes(16).toString('hex');
        const signature = this.identity.sign(nonce);
        let res;
        try {
            res = await this.fetchImpl(`${this.scheme}://${peer.domain}/api/federation/liveness`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: this.ourDomain, nonce, signature })
            });
        } catch (e) {
            this._recordFailure(peer.id);
            this.db.updatePeerStatus(peer.id, { status: 'Unreachable', last_error: e.message, last_checked_at: Date.now() });
            return;
        }
        const data = await res.json();
        this.db.updatePeerStatus(peer.id, { last_checked_at: Date.now(), debug_last_response: JSON.stringify(data) });

        if (data.status === 'connected') {
            if (data.serverHash === this.getServerHash()) {
                this._recordSuccess(peer.id);
                this.db.updatePeerStatus(peer.id, { status: 'Connected', server_hash: data.serverHash });
            } else {
                this._recordFailure(peer.id);
                this.db.updatePeerStatus(peer.id, {
                    status: 'Denied', denied_reason: 'hash_mismatch',
                    last_error: 'version hash mismatch (detected during liveness check)'
                });
            }
            return;
        }
        this._recordFailure(peer.id);
        if (data.status === 'unknown') {
            this.db.updatePeerStatus(peer.id, { status: 'Denied', denied_reason: 'unlinked', last_error: 'peer no longer recognizes us' });
        } else if (data.status === 'key_mismatch') {
            this.db.updatePeerStatus(peer.id, {
                status: 'Denied', denied_reason: 'key_mismatch',
                last_error: 'public key mismatch — remove and re-add to re-establish trust'
            });
        }
    }

    async _fetchLobbies(peer) {
        try {
            const res = await this.fetchImpl(`${this.scheme}://${peer.domain}/api/federation/lobbies`, {
                method: 'GET'
            });
            const data = await res.json();
            this.db.replaceLobbiesForPeer(peer.id, Array.isArray(data) ? data : []);
        } catch (e) {
            this.db.deleteLobbiesForPeer(peer.id);
        }
    }

    async checkNameAvailable(name) {
        const peers = this.db.listPeers().filter(p => p.status === 'Connected');
        const checks = peers.map(async (peer) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2000);
            try {
                const res = await this.fetchImpl(`${this.scheme}://${peer.domain}/api/federation/name-check`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }), signal: controller.signal
                });
                const data = await res.json();
                return !data.taken;
            } catch (e) {
                return true; // fail open — unreachable or timed-out peer never blocks a name
            } finally {
                clearTimeout(timer);
            }
        });
        const results = await Promise.all(checks);
        return results.every(Boolean);
    }

    issueJoinToken(roomId, playerName) {
        const payload = {
            domain: this.ourDomain,
            playerName,
            roomId,
            ts: Date.now(),
            nonce: crypto.randomBytes(12).toString('hex')
        };
        const signature = this.identity.sign(JSON.stringify(payload));
        return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
    }

    verifyJoinToken(peerDomain, token) {
        let parsed;
        try {
            parsed = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
        } catch (e) {
            return { ok: false, reason: 'bad_signature' };
        }
        const { payload, signature } = parsed || {};
        if (!payload || payload.domain !== peerDomain) return { ok: false, reason: 'unknown_peer' };

        const peer = this.db.getPeerByDomain(peerDomain);
        if (!peer || peer.status !== 'Connected') return { ok: false, reason: 'unknown_peer' };

        const valid = FederationIdentity.verify(peer.public_key, JSON.stringify(payload), signature);
        if (!valid) return { ok: false, reason: 'bad_signature' };

        this._purgeExpiredNonces();
        if (Date.now() - payload.ts > TOKEN_FRESHNESS_MS) return { ok: false, reason: 'expired' };
        if (this._usedJoinNonces.has(payload.nonce)) return { ok: false, reason: 'replayed' };
        this._usedJoinNonces.set(payload.nonce, payload.ts + TOKEN_FRESHNESS_MS);

        return { ok: true, playerName: payload.playerName, roomId: payload.roomId };
    }

    _purgeExpiredNonces() {
        const now = Date.now();
        for (const [nonce, expiry] of this._usedJoinNonces) {
            if (expiry < now) this._usedJoinNonces.delete(nonce);
        }
    }

    async reportWinEvent(homeDomain, payload) {
        const ts = Date.now();
        try {
            const signature = this.identity.sign(this.ourDomain + payload.playerName + payload.roomId + ts);
            await this.fetchImpl(`${this.scheme}://${homeDomain}/api/federation/win-event`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    senderDomain: this.ourDomain, playerName: payload.playerName, roomId: payload.roomId, ts, signature
                })
            });
        } catch (e) { /* best-effort — a guest's home server being unreachable must not break the visited game */ }
    }

    createGuestSession(payload) {
        this._purgeExpiredGuestSessions();
        const id = crypto.randomBytes(16).toString('hex');
        this._guestSessions.set(id, { payload, expiry: Date.now() + 60000 });
        return id;
    }

    consumeGuestSession(id) {
        const entry = this._guestSessions.get(id);
        this._guestSessions.delete(id);
        if (!entry || entry.expiry < Date.now()) return null;
        return entry.payload;
    }

    peekGuestSession(id) {
        const entry = this._guestSessions.get(id);
        if (!entry || entry.expiry < Date.now()) return null;
        return { ...entry.payload };
    }

    _purgeExpiredGuestSessions() {
        const now = Date.now();
        for (const [id, entry] of this._guestSessions) {
            if (entry.expiry < now) this._guestSessions.delete(id);
        }
    }

    async sendMessage(peerId, bodyText) {
        const peer = this.db.getPeerById(peerId);
        const msg = this.db.addMessage(peerId, 'outgoing', bodyText);
        await this._pushMessage(peer, msg);
        return msg;
    }

    async _pushMessage(peer, msg) {
        const timestamp = msg.created_at;
        const signature = this.identity.sign(this.ourDomain + msg.body + timestamp);
        try {
            const res = await this.fetchImpl(`${this.scheme}://${peer.domain}/api/federation/message`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senderDomain: this.ourDomain, body: msg.body, timestamp, signature })
            });
            if (res.ok) this.db.markDelivered(msg.id);
        } catch (e) { /* stays undelivered, retried by the next flush */ }
    }

    async _flushMessages(peer) {
        if (!peer || (peer.status !== 'Connected' && peer.status !== 'Unreachable')) return;
        const undelivered = this.db.listUndelivered(peer.id);
        for (const msg of undelivered) {
            await this._pushMessage(peer, msg);
        }
    }

    async removePeer(id) {
        const peer = this.db.getPeerById(id);
        if (peer && ['Connected', 'Unreachable', 'Suspended'].includes(peer.status)) {
            try {
                const signature = this.identity.sign(this.ourDomain);
                await this.fetchImpl(`${this.scheme}://${peer.domain}/api/federation/unlink`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain: this.ourDomain, signature })
                });
            } catch (e) { /* best-effort */ }
        }
        this.db.deletePeer(id);
    }

    async resumePeer(peer) {
        // Suspend/resume is purely local — the remote side's record of us never
        // changed, so a plain signed liveness check (same one Connected/Unreachable
        // peers get) is enough to verify we still hold a mutually-trusted link
        // before flipping this row back to Connected. No separate "resume" protocol.
        await this._checkLiveness(peer);
    }
}

module.exports = FederationService;
module.exports.dedupeGuestName = dedupeGuestName;
