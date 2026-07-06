'use strict';

function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.substring(0, 200).trim();
}

class FriendsService {
    constructor(db, io) {
        this.db = db;
        this.io = io;
    }

    _socketsForUser(userId) {
        const sockets = this.io.sockets.sockets;
        return Object.keys(sockets)
            .filter(sid => sockets[sid].userId === userId)
            .map(sid => sockets[sid]);
    }

    _emitToUser(userId, event, data) {
        this._socketsForUser(userId).forEach(s => s.emit(event, data));
    }

    _usernameById(userId) {
        const row = this.db.db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        return row ? row.username : '';
    }

    getOnlineIds() {
        const sockets = this.io.sockets.sockets;
        const ids = new Set();
        Object.keys(sockets).forEach(sid => {
            if (sockets[sid].userId) ids.add(sockets[sid].userId);
        });
        return ids;
    }

    sendRequest(requesterId, addresseeId) {
        const result = this.db.friendSendRequest(requesterId, addresseeId);
        if (result.error) return result;
        this._emitToUser(addresseeId, 'friendRequest', {
            from: this._usernameById(requesterId),
            fromId: requesterId
        });
        return { ok: true };
    }

    acceptRequest(userId, requesterId) {
        const result = this.db.friendAccept(userId, requesterId);
        if (result.error) return result;
        this._emitToUser(requesterId, 'friendAccepted', {
            by: this._usernameById(userId),
            byId: userId
        });
        return { ok: true };
    }

    declineRequest(userId, requesterId) {
        return this.db.friendDecline(userId, requesterId);
    }

    removeFriend(userId, otherId) {
        const result = this.db.friendRemove(userId, otherId);
        this._emitToUser(otherId, 'friendRemoved', { by: this._usernameById(userId) });
        return result;
    }

    getList(userId) {
        const onlineIds = this.getOnlineIds();
        const accepted = this.db.friendsGet(userId).map(f => ({
            id: f.id,
            username: f.username,
            online: onlineIds.has(f.id),
            avatar: '/api/profile/avatar/' + f.id
        }));
        return {
            accepted,
            incoming: this.db.friendsPendingIncoming(userId),
            outgoing: this.db.friendsPendingOutgoing(userId)
        };
    }

    sendDM(senderId, receiverId, text) {
        if (!this.db.areFriends(senderId, receiverId)) return { error: 'Not friends' };
        const clean = sanitizeText(text);
        if (!clean) return { error: 'Empty message' };
        const senderName = this._usernameById(senderId);
        const result = this.db.dmSend(senderId, receiverId, clean);
        this._emitToUser(receiverId, 'dmMessage', {
            fromId: senderId,
            fromName: senderName,
            text: clean,
            sentAt: result.sentAt
        });
        return { ok: true };
    }

    getDMHistory(userId, otherId) {
        if (!this.db.areFriends(userId, otherId)) return [];
        return this.db.dmGetHistory(userId, otherId);
    }

    inviteToGame(senderId, targetId, gameId, inviteToken) {
        if (!this.db.areFriends(senderId, targetId)) return { error: 'Not friends' };
        const inGame = this._socketsForUser(senderId).some(s => s.currentGameService != null);
        if (!inGame) return { error: 'Not in a game' };
        this._emitToUser(targetId, 'gameInvite', {
            fromName: this._usernameById(senderId),
            gameId,
            inviteToken,
            expiresAt: Date.now() + 60000
        });
        return { ok: true };
    }
}

module.exports = FriendsService;
