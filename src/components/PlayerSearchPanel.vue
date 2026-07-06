<template>
    <div class="psearch-outer" :class="{ open: open }" :style="{ zIndex: panelZ }">
        <div class="psearch-panel">
            <div class="psearch-header">
                {{ t('find_player') }}
                <button class="panel-pin-btn" :class="{ pinned: pinned }" @click.stop="togglePin" title="Pin">📌</button>
            </div>
            <div class="psearch-body">
                <input
                    class="psearch-input"
                    v-model="query"
                    @input="onInput"
                    :placeholder="t('search_placeholder')"
                    autocomplete="off"
                />
                <div v-if="loading" class="psearch-status">...</div>
                <div v-else-if="query.length >= 2 && results.length === 0" class="psearch-status">{{ t('no_results') }}</div>
                <div v-for="r in results" :key="r.username" class="psearch-result">
                    <div class="psearch-avatar-wrap" @click="openProfile(r.username)" style="cursor:pointer">
                        <img class="psearch-avatar" :class="{ 'has-reticle': r.reticle }" :src="r.avatar || '/img/default.png'" @error="$event.target.src='/img/default.png'" />
                        <img v-if="r.reticle" class="psearch-avatar-reticle" :src="r.reticle" />
                    </div>
                    <div class="psearch-result-info" @click="openProfile(r.username)" style="cursor:pointer;flex:1;min-width:0">
                        <div class="psearch-name">{{ r.username }}</div>
                        <div v-if="r.bio" class="psearch-bio">{{ r.bio }}</div>
                    </div>
                    <span class="psearch-level">Lv{{ r.level }}</span>
                    <button v-if="r.username !== selfName" class="psearch-action-btn"
                        :disabled="friendStatus(r.username) !== 'none'"
                        @click.stop="addFriend(r)">
                        {{ friendStatus(r.username) === 'friends' ? '✓' : friendStatus(r.username) === 'pending' ? '...' : '+' }}
                    </button>
                    <button v-if="inGame && friendStatus(r.username) === 'friends'" class="psearch-action-btn"
                        @click.stop="inviteToGame(r)">
                        ✉
                    </button>
                </div>
            </div>
        </div>
        <button class="psearch-tab" @click="onTabClick" :title="t('tab_search')">🔍</button>
    </div>
</template>

<script>
    import { registerPanel, unregisterPanel, bringToFront } from '../panelManager.js';
    import { lang } from '../lang/index.js';

    export default {
        name: 'PlayerSearchPanel',
        props: {
            myUserId: { type: Number, default: 0 },
            selfName: { type: String, default: '' },
            friendList: { type: Array, default: () => [] },
            inGame: { type: Boolean, default: false },
            gameId: { type: String, default: '' },
            authToken: { type: String, default: '' }
        },
        data() {
            const pinned = localStorage.getItem('panel_pin_search') === 'true';
            return { open: pinned, pinned, panelZ: 300, query: '', results: [], loading: false, _debounce: null, pendingSent: {} };
        },
        mounted() { registerPanel('search', this); },
        beforeDestroy() { unregisterPanel('search'); },
        methods: {
            t(key) { return lang.t(key); },
            onTabClick() {
                if (this.open) {
                    this.open = false;
                    this.pinned = false;
                    localStorage.removeItem('panel_pin_search');
                } else {
                    this.open = true;
                    this.panelZ = bringToFront();
                }
            },
            togglePin() {
                this.pinned = !this.pinned;
                if (this.pinned) localStorage.setItem('panel_pin_search', 'true');
                else localStorage.removeItem('panel_pin_search');
            },
            onInput() {
                clearTimeout(this._debounce);
                if (this.query.length < 2) { this.results = []; return; }
                this._debounce = setTimeout(() => this.doSearch(), 300);
            },
            doSearch() {
                this.loading = true;
                const token = localStorage.getItem('unoAuthToken');
                const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
                fetch('/api/search-players?q=' + encodeURIComponent(this.query), { headers })
                    .then(r => r.json())
                    .then(data => { this.results = Array.isArray(data) ? data : []; this.loading = false; })
                    .catch(() => { this.results = []; this.loading = false; });
            },
            openProfile(username) { this.$emit('open-profile', username); },
            friendStatus(username) {
                const f = this.friendList.find(f => f.username === username);
                if (f) return 'friends';
                if (this.pendingSent[username]) return 'pending';
                return 'none';
            },
            addFriend(user) {
                fetch('/api/friends/request/' + user.id, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('unoAuthToken') }
                }).then(r => r.json()).then(res => {
                    if (res.ok) { this.$set(this.pendingSent, user.username, true); }
                    else if (res.error) { alert(res.error); }
                });
            },
            inviteToGame(user) {
                if (!this.gameId) return;
                fetch('/api/friends/invite/' + user.id, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('unoAuthToken'), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameId: this.gameId })
                });
            }
        }
    };
</script>

<style scoped>
    .psearch-outer {
        position: fixed;
        top: 218px;
        left: 0;
        transform: translateX(-260px);
        transition: transform 0.25s ease;
    }
    .psearch-outer.open { transform: translateX(0); }
    .psearch-panel {
        width: 260px;
        background: rgba(0, 0, 0, 0.92);
        border: 1px solid #9a6515;
        border-radius: 0 6px 6px 0;
        overflow: hidden;
    }
    .psearch-header {
        position: relative;
        padding: 5px 10px;
        color: #d4cda4;
        font-weight: bold;
        font-size: 11px;
        letter-spacing: 1px;
        border-bottom: 1px solid #3a2805;
        text-align: center;
    }
    .panel-pin-btn {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 12px;
        opacity: 0.25;
        padding: 2px;
    }
    .panel-pin-btn:hover { opacity: 0.7; }
    .panel-pin-btn.pinned { opacity: 1; }
    .psearch-body { padding: 8px; }
    .psearch-input {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255,255,255,0.06);
        border: 1px solid #3a2805;
        border-radius: 4px;
        color: #d4cda4;
        font-size: 12px;
        padding: 5px 8px;
        margin-bottom: 6px;
        outline: none;
    }
    .psearch-input::placeholder { color: #4a3a2a; }
    .psearch-input:focus { border-color: #9a6515; }
    .psearch-status { color: #6a5a3a; font-size: 11px; text-align: center; padding: 8px 0; letter-spacing: 1px; }
    .psearch-result {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 4px;
        border-radius: 4px;
    }
    .psearch-result:hover { background: rgba(255,255,255,0.06); }
    .psearch-avatar-wrap { position: relative; width: 28px; height: 28px; flex-shrink: 0; }
    .psearch-avatar {
        width: 28px;
        height: 28px;
        border-radius: 0;
        border: 1px solid rgba(154,101,21,0.4);
        object-fit: cover;
        display: block;
    }
    .psearch-avatar.has-reticle { border-color: transparent; }
    .psearch-avatar-reticle { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
    .psearch-name { color: #d4cda4; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .psearch-bio { color: #5a4a2a; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-style: italic; margin-top: 1px; }
    .psearch-level { color: #9a6515; font-size: 10px; font-weight: bold; flex-shrink: 0; }
    .psearch-tab { position:absolute; top:0; right:-36px; width:36px; height:48px; background:rgba(0,0,0,.92); border:1px solid #9a6515; border-left:none; border-radius:0 6px 6px 0; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:16px; }
    .psearch-tab:hover { background: rgba(40, 20, 0, 0.95); }
    .psearch-action-btn {
        background: transparent;
        border: 1px solid #9a6515;
        border-radius: 3px;
        color: #d4cda4;
        font-size: 10px;
        padding: 2px 5px;
        cursor: pointer;
        flex-shrink: 0;
    }
    .psearch-action-btn:hover { background: rgba(154,101,21,0.3); }
    .psearch-action-btn:disabled { opacity: 0.5; cursor: default; }
</style>
