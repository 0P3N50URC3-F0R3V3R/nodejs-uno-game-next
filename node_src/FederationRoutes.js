'use strict';
const rateLimit = require('express-rate-limit');

module.exports = function(application, federationDB, federationService, federationIdentity, adminAuth, config) {
    const fedLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

    application.post('/api/federation/handshake', fedLimiter, function(req, res) {
        res.json(federationService.handleHandshakeRequest(req.body || {}));
    });

    application.post('/api/federation/liveness', fedLimiter, function(req, res) {
        res.json(federationService.handleLivenessRequest(req.body || {}));
    });

    application.post('/api/federation/message', fedLimiter, function(req, res) {
        const accepted = federationService.handleMessageRequest(req.body || {});
        if (accepted) { res.json({ ok: true }); } else { res.status(400).json({ ok: false }); }
    });

    application.post('/api/federation/unlink', fedLimiter, function(req, res) {
        federationService.handleUnlinkRequest(req.body || {});
        res.json({ ok: true });
    });

    application.get('/api/admin/federation/peers', adminAuth, function(req, res) {
        res.json(federationDB.listPeers());
    });

    application.post('/api/admin/federation/peers', adminAuth, function(req, res) {
        const domain = ((req.body && req.body.domain) || '').trim();
        if (!domain) { res.status(400).json({ error: 'domain required' }); return; }
        if (federationDB.getPeerByDomain(domain)) { res.status(400).json({ error: 'peer already exists' }); return; }
        res.json(federationDB.addPeer(domain));
    });

    application.delete('/api/admin/federation/peers/:id', adminAuth, async function(req, res) {
        await federationService.removePeer(Number(req.params.id));
        res.json({ ok: true });
    });

    application.put('/api/admin/federation/peers/:id/suspend', adminAuth, function(req, res) {
        federationDB.updatePeerStatus(Number(req.params.id), { status: 'Suspended' });
        res.json(federationDB.getPeerById(Number(req.params.id)));
    });

    application.put('/api/admin/federation/peers/:id/resume', adminAuth, async function(req, res) {
        const peer = federationDB.getPeerById(Number(req.params.id));
        if (!peer) { res.status(404).json({ error: 'not found' }); return; }
        await federationService.resumePeer(peer);
        res.json(federationDB.getPeerById(peer.id));
    });

    application.get('/api/admin/federation/peers/:id/messages', adminAuth, function(req, res) {
        res.json(federationDB.listMessages(Number(req.params.id)));
    });

    application.post('/api/admin/federation/peers/:id/messages', adminAuth, async function(req, res) {
        const body = ((req.body && req.body.body) || '').trim().slice(0, 2000);
        if (!body) { res.status(400).json({ error: 'body required' }); return; }
        const msg = await federationService.sendMessage(Number(req.params.id), body);
        res.json(msg);
    });

    application.delete('/api/admin/federation/peers/:id/messages', adminAuth, function(req, res) {
        federationDB.deleteConversation(Number(req.params.id));
        res.json({ ok: true });
    });

    if (config.federationDebugEnabled) {
        application.get('/api/admin/federation/identity', adminAuth, function(req, res) {
            res.json({ serverId: federationIdentity.serverId, publicKey: federationIdentity.publicKey });
        });

        application.post('/api/admin/federation/identity/rotate', adminAuth, function(req, res) {
            federationIdentity.rotate();
            res.json({ serverId: federationIdentity.serverId, publicKey: federationIdentity.publicKey });
        });

        application.put('/api/admin/federation/peers/:id/pubkey-override', adminAuth, function(req, res) {
            const publicKey = ((req.body && req.body.publicKey) || '').trim();
            if (!publicKey) { res.status(400).json({ error: 'publicKey required' }); return; }
            const id = Number(req.params.id);
            federationDB.updatePeerStatus(id, { status: 'Connected', public_key: publicKey, denied_reason: null, connected_at: Date.now() });
            res.json(federationDB.getPeerById(id));
        });

        application.put('/api/admin/federation/peers/:id/status-override', adminAuth, function(req, res) {
            const status = (req.body && req.body.status) || '';
            const valid = ['Pending', 'Connected', 'Denied', 'Error', 'Unreachable', 'Suspended'];
            if (!valid.includes(status)) { res.status(400).json({ error: 'invalid status' }); return; }
            const id = Number(req.params.id);
            federationDB.updatePeerStatus(id, { status });
            res.json(federationDB.getPeerById(id));
        });

        application.post('/api/admin/federation/poll-now', adminAuth, async function(req, res) {
            await federationService.pollOnce();
            res.json({ ok: true });
        });

        application.delete('/api/admin/federation/wipe', adminAuth, function(req, res) {
            federationDB.wipeAll();
            res.json({ ok: true });
        });
    }
};
