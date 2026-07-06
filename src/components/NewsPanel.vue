<template>
    <div class="np-wrap">
        <button class="np-tab" v-show="!open" @click="open = true" :title="t('news')">
            📰
            <span class="np-badge" v-if="totalUnread > 0">{{ totalUnread }}</span>
        </button>
        <transition name="np-slide">
            <div class="np-panel" v-if="open">
                <div class="np-header">
                    <span>📰 {{ t('news') }}</span>
                    <button class="np-close" @click="close">✕ {{ t('close') }}</button>
                </div>
                <div class="np-body">
                    <div v-for="inv in gameInvites" :key="'gi_' + inv.gameId + inv.fromName" class="np-fr np-gi">
                        <div class="np-fr-text">🎮 <strong>{{ inv.fromName }}</strong> {{ t('invited_you_to_game') }} <em>{{ inv.gameId }}</em></div>
                        <div class="np-fr-actions">
                            <button class="np-fr-accept" @click="acceptInvite(inv)">{{ t('join') }}</button>
                            <button class="np-fr-decline" @click="declineInvite(inv)">{{ t('decline') }}</button>
                        </div>
                    </div>
                    <div v-for="req in friendRequests" :key="'fr_' + req.fromId" class="np-fr">
                        <div class="np-fr-text">😊 <strong>{{ req.fromName }}</strong> {{ t('sent_you_friend_request') }}</div>
                        <div class="np-fr-actions">
                            <button class="np-fr-accept" @click="acceptFriend(req)">{{ t('accept') }}</button>
                            <button class="np-fr-decline" @click="declineFriend(req)">{{ t('decline') }}</button>
                        </div>
                    </div>
                    <div v-if="loading" class="np-empty">...</div>
                    <div v-else-if="posts.length === 0 && friendRequests.length === 0" class="np-empty">{{ t('no_news') }}</div>
                    <div v-for="post in posts" :key="post.id" class="np-post" :class="{ unread: post.id > lastReadId }">
                        <div class="np-post-title">
                            <span v-if="post.id > lastReadId" class="np-new-dot"></span>
                            {{ post.title }}
                        </div>
                        <div class="np-post-date">{{ formatDate(post.created_at) }}</div>
                        <div class="np-post-content">{{ post.content }}</div>
                    </div>
                </div>
            </div>
        </transition>
    </div>
</template>

<script>
    import { lang } from '../lang/index.js';

    const LS_KEY = 'unoNewsRead';

    export default {
        name: 'NewsPanel',
        props: {
            socket: { type: Object, default: null },
            authToken: { type: String, default: '' }
        },
        data() {
            return {
                open: false,
                posts: [],
                loading: false,
                lastReadId: parseInt(localStorage.getItem(LS_KEY) || '0'),
                friendRequests: [],
                gameInvites: []
            };
        },
        computed: {
            unreadNews() {
                return this.posts.filter(p => p.id > this.lastReadId).length;
            },
            totalUnread() {
                return this.unreadNews + this.friendRequests.length + this.gameInvites.length;
            }
        },
        methods: {
            t(key) { return lang.t(key); },
            close() {
                if (this.posts.length) {
                    const maxId = Math.max(...this.posts.map(p => p.id));
                    this.lastReadId = maxId;
                    localStorage.setItem(LS_KEY, String(maxId));
                }
                this.open = false;
            },
            load() {
                this.loading = true;
                fetch('/api/news').then(r => r.json()).then(posts => {
                    this.posts = Array.isArray(posts) ? posts : [];
                    this.loading = false;
                    const maxId = this.posts.length ? Math.max(...this.posts.map(p => p.id)) : 0;
                    if (maxId > this.lastReadId) this.open = true;
                });
            },
            loadFriendRequests() {
                if (!this.authToken) return;
                fetch('/api/friends', { headers: { 'Authorization': 'Bearer ' + this.authToken } })
                    .then(r => r.json()).then(d => {
                        if (d && d.incoming) {
                            this.friendRequests = d.incoming.map(r => ({ fromId: r.id, fromName: r.username }));
                            if (this.friendRequests.length) this.open = true;
                        }
                    });
            },
            acceptFriend(req) {
                fetch('/api/friends/accept/' + req.fromId, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                }).then(() => {
                    this.friendRequests = this.friendRequests.filter(r => r.fromId !== req.fromId);
                    this.$emit('friends-updated');
                });
            },
            declineFriend(req) {
                fetch('/api/friends/decline/' + req.fromId, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                }).then(() => {
                    this.friendRequests = this.friendRequests.filter(r => r.fromId !== req.fromId);
                });
            },
            acceptInvite(inv) {
                this.gameInvites = this.gameInvites.filter(i => i !== inv);
                this.$emit('accept-invite', { gameId: inv.gameId, inviteToken: inv.inviteToken });
            },
            declineInvite(inv) {
                this.gameInvites = this.gameInvites.filter(i => i !== inv);
            },
            formatDate(ts) {
                return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            }
        },
        watch: {
            authToken(val) {
                if (val) this.loadFriendRequests();
            }
        },
        mounted() {
            this.load();
            if (this.authToken) this.loadFriendRequests();
            if (this.socket) {
                this._frHandler = data => {
                    if (!this.friendRequests.find(r => r.fromId === data.fromId)) {
                        this.friendRequests.push({ fromId: data.fromId, fromName: data.from });
                        this.open = true;
                    }
                };
                this._newsHandler = post => {
                    if (!this.posts.find(p => p.id === post.id)) {
                        this.posts.unshift(post);
                        this.open = true;
                    }
                };
                this._inviteHandler = data => {
                    this.gameInvites.push({ fromName: data.fromName, gameId: data.gameId, inviteToken: data.inviteToken });
                    this.open = true;
                };
                this.socket.on('friendRequest', this._frHandler);
                this.socket.on('newNews', this._newsHandler);
                this.socket.on('gameInvite', this._inviteHandler);
            }
        },
        beforeDestroy() {
            if (this.socket) {
                if (this._frHandler) this.socket.removeListener('friendRequest', this._frHandler);
                if (this._newsHandler) this.socket.removeListener('newNews', this._newsHandler);
                if (this._inviteHandler) this.socket.removeListener('gameInvite', this._inviteHandler);
            }
        }
    }
</script>

<style scoped>
    .np-wrap {
        position: fixed;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9000;
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .np-tab {
        background: rgba(0,0,0,0.88);
        border: 1px solid #9a6515;
        border-top: none;
        border-radius: 0 0 6px 6px;
        color: #d4cda4;
        font-size: 12px;
        padding: 1px 10px 3px;
        cursor: pointer;
        position: relative;
        line-height: 1;
    }
    .np-tab:hover { background: rgba(40,20,0,0.95); }
    .np-badge {
        position: absolute;
        top: 2px; right: 4px;
        background: #cc3333;
        color: #fff;
        border-radius: 50%;
        min-width: 14px; height: 14px;
        font-size: 9px; font-weight: bold;
        display: flex; align-items: center; justify-content: center;
        padding: 0 2px;
    }
    .np-panel {
        width: min(600px, 96vw);
        background: rgba(8,5,0,0.97);
        border: 1px solid #9a6515;
        border-top: none;
        border-radius: 0 0 10px 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.8);
        display: flex;
        flex-direction: column;
        max-height: 70vh;
    }
    .np-header {
        padding: 8px 14px;
        border-bottom: 1px solid #3a2805;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        font-weight: bold;
        letter-spacing: 1.5px;
        color: #d4cda4;
        flex-shrink: 0;
    }
    .np-close {
        background: transparent;
        border: 1px solid #3a2805;
        border-radius: 4px;
        color: #888;
        font-size: 10px;
        padding: 3px 8px;
        cursor: pointer;
    }
    .np-close:hover { border-color: #9a6515; color: #d4cda4; }
    .np-body {
        overflow-y: auto;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .np-empty { color: #666; font-size: 12px; font-style: italic; text-align: center; padding: 12px 0; }

    .np-fr {
        border: 1px solid rgba(76,175,80,0.4);
        border-radius: 6px;
        padding: 10px 12px;
        background: rgba(76,175,80,0.06);
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .np-gi { border-color: rgba(100,160,255,0.4); background: rgba(60,100,220,0.06); }
    .np-fr-text { color: #d4cda4; font-size: 12px; }
    .np-fr-text strong { color: #f0c040; }
    .np-fr-text em { color: #88bbff; font-style: normal; font-weight: bold; }
    .np-fr-actions { display: flex; gap: 8px; }
    .np-fr-accept {
        background: rgba(76,175,80,0.2); border: 1px solid #4caf50;
        border-radius: 4px; color: #4caf50; font-size: 11px;
        padding: 4px 12px; cursor: pointer; font-family: inherit;
    }
    .np-fr-accept:hover { background: rgba(76,175,80,0.4); }
    .np-fr-decline {
        background: transparent; border: 1px solid #555;
        border-radius: 4px; color: #888; font-size: 11px;
        padding: 4px 12px; cursor: pointer; font-family: inherit;
    }
    .np-fr-decline:hover { border-color: #cc3333; color: #cc3333; }

    .np-post {
        border: 1px solid #2a1a00;
        border-radius: 6px;
        padding: 10px 12px;
    }
    .np-post.unread { border-color: rgba(154,101,21,0.5); background: rgba(154,101,21,0.05); }
    .np-post-title {
        color: #d4cda4;
        font-weight: bold;
        font-size: 13px;
        margin-bottom: 3px;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .np-new-dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: #f0c040;
        flex-shrink: 0;
    }
    .np-post-date { color: #555; font-size: 10px; margin-bottom: 6px; }
    .np-post-content { color: #a09870; font-size: 12px; white-space: pre-wrap; line-height: 1.5; }
    .np-body::-webkit-scrollbar { width: 4px; }
    .np-body::-webkit-scrollbar-track { background: transparent; }
    .np-body::-webkit-scrollbar-thumb { background: #3a2805; border-radius: 2px; }

    .np-slide-enter-active, .np-slide-leave-active { transition: transform 0.25s ease, opacity 0.2s ease; transform-origin: top center; }
    .np-slide-enter { transform: scaleY(0); opacity: 0; }
    .np-slide-leave-to { transform: scaleY(0); opacity: 0; }
</style>
