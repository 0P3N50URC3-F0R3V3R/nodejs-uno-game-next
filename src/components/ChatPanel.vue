<template>
    <div class="chat-outer" :class="{ open: open }" :style="{ zIndex: panelZ }">
        <div class="chat-panel">
            <div class="chat-tabs-bar">
                <button
                    class="chat-tab-btn"
                    :class="{ active: activeTab === 'global' }"
                    @click="switchTab('global')"
                >
                    {{ t('tab_global') }}
                    <span class="chat-badge" v-if="activeTab !== 'global' && unread.global > 0">{{ unread.global }}</span>
                </button>
                <button
                    v-if="inGame"
                    class="chat-tab-btn"
                    :class="{ active: activeTab === 'game' }"
                    @click="switchTab('game')"
                >
                    {{ t('tab_game') }}
                    <span class="chat-badge" v-if="activeTab !== 'game' && unread.game > 0">{{ unread.game }}</span>
                </button>
                <button
                    v-for="dm in dmTabs"
                    :key="dm.friendId"
                    class="chat-tab-btn"
                    :class="{ active: activeTab === 'dm_' + dm.friendId }"
                    @click="switchTab('dm_' + dm.friendId)"
                >
                    {{ dm.friendName }}
                    <span class="chat-badge" v-if="activeTab !== 'dm_' + dm.friendId && dm.unread > 0">{{ dm.unread }}</span>
                    <span class="dm-close" @click.stop="closeDmTab(dm.friendId)">✕</span>
                </button>
                <button class="panel-pin-btn" :class="{ pinned }" @click.stop="togglePin" :title="pinned ? 'Unpin' : 'Pin'">📌</button>
            </div>

            <div class="chat-messages" ref="messageList">
                <template v-if="activeTab === 'global'">
                    <div v-for="(msg, i) in messages.global" :key="'g' + i" class="chat-msg">
                        <span class="chat-name">{{ msg.senderName }}:</span>
                        <span class="chat-text" v-html="formatText(msg.text)"></span>
                    </div>
                    <div v-if="messages.global.length === 0" class="chat-empty">{{ t('no_messages') }}</div>
                </template>
                <template v-else-if="activeTab === 'game'">
                    <div v-for="(msg, i) in messages.game" :key="'gm' + i" class="chat-msg">
                        <span class="chat-name">{{ msg.name }}:</span>
                        <span class="chat-text" v-html="formatText(msg.text)"></span>
                    </div>
                    <div v-if="messages.game.length === 0" class="chat-empty">{{ t('no_messages') }}</div>
                </template>
                <template v-else-if="activeDm">
                    <div v-for="(msg, i) in activeDm.messages" :key="'dm' + i" class="chat-msg">
                        <span class="chat-name" :class="{ 'chat-name-self': msg.senderId === myUserId }">
                            {{ msg.senderId === myUserId ? t('you') : activeDm.friendName }}:
                        </span>
                        <span class="chat-text" v-html="formatText(msg.text)"></span>
                    </div>
                    <div v-if="activeDm.messages.length === 0" class="chat-empty">{{ t('no_messages') }}</div>
                </template>
            </div>

            <div class="emoji-panel" v-if="emojiOpen">
                <div class="emoji-tabs">
                    <button v-for="(cat, key) in emojiCategories" :key="key" class="emoji-tab"
                        :class="{ active: emojiCategory === key }" @click="emojiCategory = key">{{ cat.label }}</button>
                </div>
                <div class="emoji-grid">
                    <span v-for="(emoji, idx) in emojiCategories[emojiCategory].emojis" :key="idx"
                        class="emoji-item" @click="insertEmoji(emoji)">{{ emoji }}</span>
                </div>
            </div>

            <div class="chat-input-area">
                <input type="text" class="chat-input" v-model="input" @keyup.enter="send"
                    :placeholder="t('chat_placeholder')" maxlength="200" />
                <button class="chat-send-btn" @click="send">{{ t('send') }}</button>
                <button class="chat-emoji-btn" @click="emojiOpen = !emojiOpen">😊</button>
            </div>
        </div>
        <button class="chat-tab" @click="onTabClick" :title="t('tab_chat')">
            <span class="chat-tab-icon">💬</span>
            <span class="chat-badge" v-if="!open && totalUnread > 0">{{ totalUnread }}</span>
        </button>
    </div>
</template>

<script>
    import { sound } from '../sound.js';
    import { lang } from '../lang/index.js';
    import { registerPanel, unregisterPanel, bringToFront } from '../panelManager.js';

    export default {
        name: 'ChatPanel',
        props: {
            socket: { type: Object, required: true },
            playerName: { type: String, required: true },
            inGame: { type: Boolean, default: false },
            myUserId: { type: Number, default: 0 }
        },
        data() {
            const pinned = localStorage.getItem('panel_pin_chat') === 'true';
            return {
                open: pinned,
                pinned,
                panelZ: 300,
                activeTab: 'global',
                messages: { global: [], game: [] },
                unread: { global: 0, game: 0 },
                dmTabs: [],
                input: '',
                emojiOpen: false,
                emojiCategory: 'smileys',
                emojiCategories: {
                    smileys: { label: '😊', emojis: ['😀','😂','😍','😢','😡','😱','🤔','😎','🥳','😴'] },
                    hands:   { label: '👋', emojis: ['👋','👍','👎','✌️','🤞','🙌','👏','🤜','🤛','🫶'] },
                    animals: { label: '🐱', emojis: ['🐶','🐱','🐭','🐰','🦊','🐻','🐼','🐨','🐯','🦁'] },
                    food:    { label: '🍕', emojis: ['🍕','🍔','🌮','🍣','🍜','🍰','🍩','🍺','🎂','🍎'] },
                    objects: { label: '🎮', emojis: ['🎮','🃏','🎯','🏆','🎲','🔥','💡','🎵','🎤','📱'] },
                    symbols: { label: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','⭐','💥'] }
                }
            };
        },
        computed: {
            totalUnread() {
                return this.unread.global + this.unread.game + this.dmTabs.reduce((s, d) => s + d.unread, 0);
            },
            activeDm() {
                const match = this.activeTab.startsWith('dm_') ? parseInt(this.activeTab.slice(3)) : null;
                return match ? this.dmTabs.find(d => d.friendId === match) : null;
            }
        },
        watch: {
            inGame: {
                immediate: true,
                handler(val) { if (val) this.activeTab = 'game'; }
            }
        },
        methods: {
            t(key, vars) { return lang.t(key, vars); },
            switchTab(tab) {
                this.activeTab = tab;
                if (tab === 'global') this.unread.global = 0;
                if (tab === 'game') this.unread.game = 0;
                const dm = this.activeDm;
                if (dm) dm.unread = 0;
                this.$nextTick(this.scrollToBottom);
            },
            onTabClick() {
                if (this.open) {
                    this.open = false;
                    this.pinned = false;
                    localStorage.removeItem('panel_pin_chat');
                } else {
                    this.open = true;
                    this.panelZ = bringToFront();
                    if (this.activeTab === 'global') this.unread.global = 0;
                    if (this.activeTab === 'game') this.unread.game = 0;
                    this.$nextTick(this.scrollToBottom);
                    this.socket.emit('chatOpen');
                }
            },
            togglePin() {
                this.pinned = !this.pinned;
                if (this.pinned) localStorage.setItem('panel_pin_chat', 'true');
                else { this.open = false; localStorage.removeItem('panel_pin_chat'); }
            },
            send() {
                const text = this.input.trim();
                if (!text) return;
                if (this.activeTab === 'global') {
                    this.socket.emit('globalChat', { text });
                } else if (this.activeTab === 'game') {
                    this.socket.emit('chat', { name: this.playerName, text });
                } else if (this.activeDm) {
                    this.socket.emit('sendDM', { receiverId: this.activeDm.friendId, text });
                    this.activeDm.messages.push({ senderId: this.myUserId, text, sentAt: Date.now() });
                    this.$nextTick(this.scrollToBottom);
                }
                this.input = '';
                this.emojiOpen = false;
            },
            insertEmoji(emoji) { this.input += emoji; },
            openDm(friendId, friendName) {
                let tab = this.dmTabs.find(d => d.friendId === friendId);
                if (!tab) {
                    tab = { friendId, friendName, messages: [], unread: 0 };
                    this.dmTabs.push(tab);
                    fetch('/api/friends/dm/' + friendId, {
                        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('unoAuthToken') }
                    }).then(r => r.json()).then(msgs => {
                        if (Array.isArray(msgs)) tab.messages = msgs;
                        this.$nextTick(this.scrollToBottom);
                    });
                }
                if (!this.open) { this.open = true; this.panelZ = bringToFront(); }
                this.switchTab('dm_' + friendId);
            },
            closeDmTab(friendId) {
                const idx = this.dmTabs.findIndex(d => d.friendId === friendId);
                if (idx !== -1) this.dmTabs.splice(idx, 1);
                if (this.activeTab === 'dm_' + friendId) this.activeTab = 'global';
            },
            escapeHtml(str) {
                return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            },
            formatText(text) {
                return text.split(/(https?:\/\/\S+)/).map((part, i) => {
                    if (i % 2 === 1) {
                        const u = this.escapeHtml(part);
                        return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>';
                    }
                    return this.escapeHtml(part);
                }).join('');
            },
            scrollToBottom() {
                const el = this.$refs.messageList;
                if (el) el.scrollTop = el.scrollHeight;
            }
        },
        mounted() {
            registerPanel('chat', this);
            if (this.open) this.panelZ = bringToFront();

            this._chatHandler = msg => {
                this.messages.game.push(msg);
                if (this.activeTab !== 'game') { this.unread.game++; sound.play('chat'); }
                else this.$nextTick(this.scrollToBottom);
            };
            this.socket.on('chat', this._chatHandler);

            this._globalHistoryHandler = msgs => {
                if (Array.isArray(msgs)) this.messages.global = msgs;
                this.$nextTick(this.scrollToBottom);
            };
            this.socket.on('globalHistory', this._globalHistoryHandler);

            this._globalChatHandler = msg => {
                this.messages.global.push(msg);
                if (this.activeTab !== 'global' || !this.open) { this.unread.global++; sound.play('chat'); }
                else this.$nextTick(this.scrollToBottom);
            };
            this.socket.on('globalChat', this._globalChatHandler);

            this._dmHandler = msg => {
                let tab = this.dmTabs.find(d => d.friendId === msg.fromId);
                if (!tab) {
                    tab = { friendId: msg.fromId, friendName: msg.fromName, messages: [], unread: 0 };
                    this.dmTabs.push(tab);
                }
                tab.messages.push({ senderId: msg.fromId, text: msg.text, sentAt: msg.sentAt });
                if (this.activeTab !== 'dm_' + msg.fromId || !this.open) { tab.unread++; sound.play('chat'); }
                else this.$nextTick(this.scrollToBottom);
            };
            this.socket.on('dmMessage', this._dmHandler);
        },
        beforeDestroy() {
            unregisterPanel('chat');
            this.socket.removeListener('chat', this._chatHandler);
            this.socket.removeListener('globalHistory', this._globalHistoryHandler);
            this.socket.removeListener('globalChat', this._globalChatHandler);
            this.socket.removeListener('dmMessage', this._dmHandler);
        }
    }
</script>

<style scoped>
    .chat-outer {
        position: fixed;
        top: 166px;
        left: 0;
        transform: translateX(-260px);
        transition: transform 0.25s ease;
    }
    .chat-outer.open { transform: translateX(0); }

    .chat-panel {
        width: 260px;
        background: rgba(0, 0, 0, 0.92);
        border: 1px solid #9a6515;
        border-radius: 0 6px 6px 0;
        display: flex;
        flex-direction: column;
    }

    .chat-tabs-bar {
        display: flex;
        align-items: center;
        border-bottom: 1px solid #3a2805;
        flex-wrap: wrap;
        padding: 2px 4px;
        gap: 2px;
        position: relative;
    }
    .chat-tab-btn {
        background: transparent;
        border: 1px solid transparent;
        border-radius: 4px;
        color: #888;
        font-size: 10px;
        padding: 3px 6px;
        cursor: pointer;
        position: relative;
        white-space: nowrap;
    }
    .chat-tab-btn.active { color: #d4cda4; border-color: #9a6515; }
    .chat-tab-btn:hover { color: #d4cda4; }
    .dm-close {
        margin-left: 3px;
        font-size: 9px;
        opacity: 0.5;
        cursor: pointer;
    }
    .dm-close:hover { opacity: 1; color: #cc3333; }

    .panel-pin-btn {
        margin-left: auto;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 11px;
        opacity: 0.25;
        padding: 2px;
    }
    .panel-pin-btn:hover { opacity: 0.7; }
    .panel-pin-btn.pinned { opacity: 1; }

    .chat-messages {
        height: 200px;
        overflow-y: auto;
        padding: 6px 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .chat-msg { font-size: 12px; line-height: 1.4; word-break: break-word; }
    .chat-name { color: #d4cda4; font-weight: bold; margin-right: 4px; }
    .chat-name-self { color: #7ab8f5; }
    .chat-text { color: #ffffff; }
    .chat-text a { color: #d4a04a; text-decoration: underline; }
    .chat-empty { color: #666; font-size: 12px; font-style: italic; text-align: center; margin-top: 20px; }

    .chat-badge {
        position: absolute;
        top: 0;
        right: 0;
        background: #cc3333;
        color: #fff;
        border-radius: 50%;
        min-width: 13px;
        height: 13px;
        font-size: 8px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 2px;
        transform: translate(50%, -50%);
    }

    .emoji-panel { border-top: 1px solid #3a2805; background: rgba(0,0,0,0.6); padding: 6px; }
    .emoji-tabs { display: flex; gap: 2px; margin-bottom: 6px; flex-wrap: wrap; }
    .emoji-tab { background: transparent; border: 1px solid #3a2805; border-radius: 4px; padding: 2px 5px; cursor: pointer; font-size: 14px; }
    .emoji-tab.active { border-color: #9a6515; background: rgba(154,101,21,0.3); }
    .emoji-grid { display: flex; flex-wrap: wrap; gap: 4px; }
    .emoji-item { font-size: 18px; cursor: pointer; padding: 2px; border-radius: 4px; }
    .emoji-item:hover { background: rgba(154,101,21,0.3); }

    .chat-input-area {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 8px;
        border-top: 1px solid #3a2805;
    }
    .chat-input {
        flex: 1;
        background: rgba(255,255,255,0.08);
        border: 1px solid #3a2805;
        border-radius: 4px;
        color: #fff;
        font-size: 12px;
        padding: 5px 7px;
        outline: none;
        min-width: 0;
    }
    .chat-input:focus { border-color: #9a6515; }
    .chat-send-btn {
        background: #9a6515;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 5px 8px;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        white-space: nowrap;
    }
    .chat-send-btn:hover { background: #b87820; }
    .chat-emoji-btn { background: transparent; border: 1px solid #3a2805; border-radius: 4px; font-size: 16px; padding: 2px 4px; cursor: pointer; }
    .chat-emoji-btn:hover { border-color: #9a6515; }

    .chat-tab {
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
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
    }
    .chat-tab:hover { background: rgba(40,20,0,0.95); }
    .chat-tab-icon { font-size: 16px; line-height: 1; }

    .chat-messages::-webkit-scrollbar { width: 4px; }
    .chat-messages::-webkit-scrollbar-track { background: transparent; }
    .chat-messages::-webkit-scrollbar-thumb { background: #3a2805; border-radius: 2px; }
</style>
