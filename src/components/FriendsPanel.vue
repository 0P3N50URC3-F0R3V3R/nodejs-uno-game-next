<template>
    <div class="fp-outer" :class="{ open }" :style="{ zIndex: panelZ }">
        <div class="fp-panel">
            <div class="fp-header">
                {{ t('friends') }}
                <button class="panel-pin-btn" :class="{ pinned }" @click.stop="togglePin">📌</button>
            </div>
            <div class="fp-body">
                <!-- Pending incoming -->
                <div v-if="list.incoming.length > 0">
                    <div class="fp-section-title">{{ t('friend_requests') }} ({{ list.incoming.length }})</div>
                    <div v-for="r in list.incoming" :key="'in_' + r.id" class="fp-row">
                        <img class="fp-avatar" :src="'/api/profile/avatar/' + r.id" @error="$event.target.src='/img/default.png'" />
                        <span class="fp-name">{{ r.username }}</span>
                        <button class="fp-btn fp-btn-accept" @click="accept(r.id)">{{ t('accept') }}</button>
                        <button class="fp-btn fp-btn-decline" @click="decline(r.id)">{{ t('decline') }}</button>
                    </div>
                </div>

                <!-- Accepted friends -->
                <div class="fp-section-title">{{ t('friends') }} ({{ list.accepted.length }})</div>
                <div v-if="list.accepted.length === 0" class="fp-empty">{{ t('no_friends_yet') }}</div>
                <div v-for="f in list.accepted" :key="'f_' + f.id" class="fp-row">
                    <span class="fp-online-dot" :class="{ online: f.online }"></span>
                    <img class="fp-avatar" :src="f.avatar" @error="$event.target.src='/img/default.png'" />
                    <span class="fp-name">{{ f.username }}</span>
                    <button class="fp-btn" @click="openDm(f.id, f.username)">{{ t('message') }}</button>
                    <button v-if="inGame" class="fp-btn" @click="invite(f.id)">{{ t('invite') }}</button>
                </div>

                <!-- Outgoing pending -->
                <div v-if="list.outgoing.length > 0">
                    <div class="fp-section-title">{{ t('sent_requests') }}</div>
                    <div v-for="r in list.outgoing" :key="'out_' + r.id" class="fp-row">
                        <span class="fp-name">{{ r.username }}</span>
                        <button class="fp-btn fp-btn-decline" @click="cancel(r.id)">{{ t('cancel') }}</button>
                    </div>
                </div>
            </div>
        </div>
        <button class="fp-tab" @click="onTabClick" :title="t('friends')">
            💜
            <span class="chat-badge" v-if="!open && list.incoming.length > 0">{{ list.incoming.length }}</span>
        </button>
    </div>
</template>

<script>
    import { lang } from '../lang/index.js';
    import { registerPanel, unregisterPanel, bringToFront } from '../panelManager.js';

    export default {
        name: 'FriendsPanel',
        props: {
            socket: { type: Object, required: true },
            myUserId: { type: Number, default: 0 },
            inGame: { type: Boolean, default: false },
            gameId: { type: String, default: '' }
        },
        data() {
            const pinned = localStorage.getItem('panel_pin_friends') === 'true';
            return {
                open: pinned,
                pinned,
                panelZ: 300,
                list: { accepted: [], incoming: [], outgoing: [] }
            };
        },
        methods: {
            t(key) { return lang.t(key); },
            onTabClick() {
                if (this.open) {
                    this.open = false; this.pinned = false;
                    localStorage.removeItem('panel_pin_friends');
                } else {
                    this.open = true; this.panelZ = bringToFront();
                    this.loadList();
                }
            },
            togglePin() {
                this.pinned = !this.pinned;
                if (this.pinned) localStorage.setItem('panel_pin_friends', 'true');
                else { this.open = false; localStorage.removeItem('panel_pin_friends'); }
            },
            loadList() {
                fetch('/api/friends', {
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('unoAuthToken') }
                }).then(r => r.json()).then(data => {
                    if (data && data.accepted) this.list = data;
                });
            },
            accept(requesterId) {
                fetch('/api/friends/accept/' + requesterId, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('unoAuthToken') }
                }).then(() => this.loadList());
            },
            decline(requesterId) {
                fetch('/api/friends/decline/' + requesterId, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('unoAuthToken') }
                }).then(() => this.loadList());
            },
            cancel(otherId) {
                fetch('/api/friends/decline/' + otherId, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('unoAuthToken') }
                }).then(() => this.loadList());
            },
            openDm(friendId, friendName) {
                this.$emit('openDm', friendId, friendName);
            },
            invite(targetId) {
                if (!this.gameId) return;
                fetch('/api/friends/invite/' + targetId, {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + localStorage.getItem('unoAuthToken'),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ gameId: this.gameId })
                });
            }
        },
        mounted() {
            registerPanel('friends', this);
            if (this.open) this.panelZ = bringToFront();
            this.loadList();

            this._reqHandler = data => {
                this.list.incoming.push({ id: data.fromId, username: data.from });
            };
            this._acceptedHandler = () => this.loadList();
            this._removedHandler = data => {
                this.list.accepted = this.list.accepted.filter(f => f.username !== data.by);
            };

            this.socket.on('friendRequest', this._reqHandler);
            this.socket.on('friendAccepted', this._acceptedHandler);
            this.socket.on('friendRemoved', this._removedHandler);
        },
        beforeDestroy() {
            unregisterPanel('friends');
            this.socket.removeListener('friendRequest', this._reqHandler);
            this.socket.removeListener('friendAccepted', this._acceptedHandler);
            this.socket.removeListener('friendRemoved', this._removedHandler);
        }
    }
</script>

<style scoped>
    .fp-outer {
        position: fixed;
        top: 322px;
        left: 0;
        transform: translateX(-220px);
        transition: transform 0.25s ease;
    }
    .fp-outer.open { transform: translateX(0); }

    .fp-panel {
        width: 220px;
        background: rgba(0,0,0,0.92);
        border: 1px solid #9a6515;
        border-radius: 0 6px 6px 0;
        display: flex;
        flex-direction: column;
        max-height: 400px;
    }
    .fp-header {
        padding: 5px 10px;
        color: #d4cda4;
        font-weight: bold;
        font-size: 11px;
        letter-spacing: 2px;
        border-bottom: 1px solid #3a2805;
        text-align: center;
        flex-shrink: 0;
        position: relative;
    }
    .fp-body {
        overflow-y: auto;
        padding: 6px 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .fp-section-title {
        color: #9a6515;
        font-size: 10px;
        font-weight: bold;
        letter-spacing: 1px;
        text-transform: uppercase;
        padding: 4px 0 2px;
        border-bottom: 1px solid #3a2805;
        margin-bottom: 2px;
    }
    .fp-empty { color: #666; font-size: 11px; font-style: italic; text-align: center; padding: 8px 0; }
    .fp-row {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 3px 0;
    }
    .fp-online-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #444;
        flex-shrink: 0;
    }
    .fp-online-dot.online { background: #4caf50; }
    .fp-avatar {
        width: 22px;
        height: 22px;
        border-radius: 0;
        object-fit: cover;
        flex-shrink: 0;
    }
    .fp-name {
        flex: 1;
        color: #d4cda4;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .fp-btn {
        background: transparent;
        border: 1px solid #9a6515;
        border-radius: 3px;
        color: #d4cda4;
        font-size: 9px;
        padding: 2px 5px;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
    }
    .fp-btn:hover { background: rgba(154,101,21,0.3); }
    .fp-btn-accept { border-color: #4caf50; color: #4caf50; }
    .fp-btn-accept:hover { background: rgba(76,175,80,0.2); }
    .fp-btn-decline { border-color: #cc3333; color: #cc3333; }
    .fp-btn-decline:hover { background: rgba(204,51,51,0.2); }

    .fp-tab {
        position: absolute;
        top: 0;
        right: -36px;
        width: 36px;
        height: 48px;
        background: rgba(0,0,0,0.92);
        border: 1px solid #9a6515;
        border-left: none;
        border-radius: 0 6px 6px 0;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        position: relative;
    }
    .fp-tab:hover { background: rgba(40,20,0,0.95); }

    .chat-badge {
        position: absolute;
        top: 4px;
        right: 4px;
        background: #cc3333;
        color: #fff;
        border-radius: 50%;
        min-width: 14px;
        height: 14px;
        font-size: 9px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 2px;
    }

    .panel-pin-btn {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 11px;
        opacity: 0.25;
        padding: 2px;
    }
    .panel-pin-btn:hover { opacity: 0.7; }
    .panel-pin-btn.pinned { opacity: 1; }

    .fp-body::-webkit-scrollbar { width: 4px; }
    .fp-body::-webkit-scrollbar-track { background: transparent; }
    .fp-body::-webkit-scrollbar-thumb { background: #3a2805; border-radius: 2px; }
</style>
