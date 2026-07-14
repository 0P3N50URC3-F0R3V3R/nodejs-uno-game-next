<template>
    <div class="pp-outer" :class="{ open }" :style="{ zIndex: panelZ }">
        <div class="pp-panel">
            <video v-if="videoBg" class="pp-panel-bg" :src="videoBg" autoplay loop muted playsinline></video>
            <div class="pp-header">
                {{ t('profile') }}
                <button class="panel-pin-btn" :class="{ pinned }" @click.stop="togglePin">📌</button>
            </div>
            <div class="pp-body" v-if="profile">
                <div class="pp-avatar-row">
                    <div class="pp-avatar-wrap">
                        <img class="pp-avatar" :src="avatarSrc" @error="$event.target.src='/img/default.png'" />
                        <img v-if="equippedReticlePath" class="pp-avatar-reticle" :src="equippedReticlePath" />
                    </div>
                    <button v-if="equippedReticlePath" class="pp-reticle-reset" :title="t('unequip_reticle')" @click="unequipReticle">✕🎯</button>
                    <div class="pp-meta">
                        <div class="pp-name-row">
                        <span v-if="!editingName" class="pp-name" :class="equippedNameEffectClass">{{ profile.username }}</span>
                        <input v-else class="pp-name-input" v-model="newName" @keyup.enter="saveName" @keyup.escape="editingName=false" maxlength="20" />
                        <button v-if="!editingName" class="pp-edit-btn" @click="startEditName" title="Edit name">✏️</button>
                        <button v-else class="pp-save-btn" @click="saveName">✓</button>
                    </div>
                    <div v-if="nameError" class="pp-name-error">{{ nameError }}</div>
                        <div class="pp-level">Lv {{ profile.level }}</div>
                        <div class="pp-gold">💰 {{ profile.gold || 0 }}G</div>
                    </div>
                </div>
                <div class="pp-xpbar-wrap">
                    <div class="pp-xpbar-fill" :style="{ width: xpPct + '%' }"></div>
                </div>
                <div class="pp-xpinfo">{{ profile.xpInLevel }} / {{ profile.xpToNext }} XP</div>

                <div class="pp-stats">
                    <div class="pp-stat"><span class="pp-val">{{ profile.matches_won || 0 }}</span><span class="pp-lbl">{{ t('stat_won') }}</span></div>
                    <div class="pp-stat"><span class="pp-val">{{ profile.matches_lost || 0 }}</span><span class="pp-lbl">{{ t('stat_lost') }}</span></div>
                    <div class="pp-stat"><span class="pp-val">{{ profile.ap_total || 0 }}</span><span class="pp-lbl">AP</span></div>
                </div>

                <div class="pp-bio-wrap">
                    <textarea v-if="editingBio" class="pp-bio-input" v-model="newBio" @keyup.escape="editingBio=false" maxlength="300" rows="3" :placeholder="t('bio_placeholder')"></textarea>
                    <div v-else class="pp-bio-text" @click="startEditBio">{{ profile.bio || t('add_bio') }}</div>
                    <div v-if="editingBio" class="pp-bio-actions">
                        <button class="pp-save-btn" @click="saveBio">✓</button>
                        <button class="pp-save-btn" style="border-color:#cc4444;color:#cc4444" @click="editingBio=false">✕</button>
                    </div>
                </div>

                <div class="pp-section-title">{{ t('friends') }}</div>
                <div v-if="friends.length === 0" class="pp-empty">{{ t('no_friends_yet') }}</div>
                <div class="pp-friends-scroll">
                <div v-for="f in friends" :key="f.id" class="pp-friend-row">
                    <span class="fp-online-dot" :class="{ online: f.online }"></span>
                    <img class="pp-friend-avatar" :src="f.avatar" @error="$event.target.src='/img/default.png'" />
                    <span class="pp-friend-name">{{ f.username }}</span>
                    <span class="pp-online-lbl" :class="{ online: f.online }">{{ f.online ? t('online') : t('offline') }}</span>
                    <button v-if="inGame" class="fp-btn fp-btn-invite" :disabled="!f.online" @click="inviteFriend(f.id)">{{ t('invite') }}</button>
                    <button class="fp-btn" @click="$emit('openDm', f.id, f.username)">{{ t('message') }}</button>
                    <button class="fp-btn fp-btn-decline" @click="removeFriend(f.id)">✕</button>
                </div>
                </div>

                <template v-if="outgoing.length > 0">
                    <div class="pp-section-title" style="margin-top:4px">{{ t('sent_requests') }}</div>
                    <div v-for="r in outgoing" :key="'out_' + r.id" class="pp-friend-row">
                        <span class="pp-friend-name" style="color:#888">{{ r.username }}</span>
                        <button class="fp-btn fp-btn-decline" @click="cancelRequest(r.id)">{{ t('cancel') }}</button>
                    </div>
                </template>

                <div class="pp-equip" v-if="ownedTitles.length || ownedNameEffects.length || ownedBackgrounds.length">
                    <div v-if="ownedTitles.length" class="pp-equip-row">
                        <span class="pp-equip-label">{{ t('title') }}</span>
                        <select class="pp-equip-select" v-model="equippedTitleId" @change="equipItem('title', equippedTitleId)">
                            <option :value="null">— {{ t('none') }} —</option>
                            <option v-for="item in ownedTitles" :key="item.id" :value="item.id">{{ item.name }}</option>
                        </select>
                    </div>
                    <div v-if="ownedNameEffects.length" class="pp-equip-row">
                        <span class="pp-equip-label">{{ t('name_effect') }}</span>
                        <select class="pp-equip-select" v-model="equippedNameEffectId" @change="equipNameEffect(equippedNameEffectId)">
                            <option :value="null">— {{ t('none') }} —</option>
                            <option v-for="item in ownedNameEffects" :key="item.id" :value="item.id">{{ item.name }}</option>
                        </select>
                    </div>
                    <div v-if="ownedBackgrounds.length" class="pp-equip-row">
                        <span class="pp-equip-label">{{ t('background') }}</span>
                        <select class="pp-equip-select" v-model="equippedBackgroundId" @change="equipBg(equippedBackgroundId)">
                            <option :value="null">— {{ t('none') }} —</option>
                            <option v-for="item in ownedBackgrounds" :key="item.id" :value="item.id">{{ item.name }}</option>
                        </select>
                    </div>
                </div>
                <div v-if="changingPw" class="pp-pw-form">
                    <input class="pp-pw-input" type="password" v-model="pwOld" :placeholder="t('current_password')" />
                    <input class="pp-pw-input" type="password" v-model="pwNew" :placeholder="t('new_password')" />
                    <div v-if="pwErr" class="pp-name-error">{{ pwErr }}</div>
                    <div class="pp-pw-actions">
                        <button class="pp-action-btn" @click="submitPw">{{ t('save') }}</button>
                        <button class="pp-action-btn" @click="changingPw=false; pwOld=''; pwNew=''; pwErr=''">{{ t('cancel') }}</button>
                    </div>
                </div>
                <div class="pp-actions">
                    <label class="pp-action-btn">
                        {{ t('upload') }}
                        <input type="file" accept="image/*" style="display:none" @change="uploadAvatar" />
                    </label>
                    <button class="pp-action-btn" @click="changingPw = !changingPw; pwErr=''">{{ t('change_password') }}</button>
                    <button class="pp-action-btn pp-action-btn-danger" @click="clearLocalData">{{ t('clear_local_data') }}</button>
                    <button class="pp-action-btn" @click="$emit('logout')">{{ t('logout') }}</button>
                </div>
            </div>
            <div class="pp-body" v-else><div class="pp-empty">{{ t('loading') }}</div></div>
        </div>
        <button class="pp-tab" @click="onTabClick" :title="t('profile')">
            😊
        </button>
    </div>
</template>

<script>
    import { lang } from '../lang/index.js';
    import { registerPanel, unregisterPanel, bringToFront } from '../panelManager.js';

    export default {
        name: 'ProfilePanel',
        props: {
            authToken: { type: String, default: '' },
            socket: { type: Object, default: null },
            inGame: { type: Boolean, default: false },
            gameId: { type: String, default: '' },
            videoBg: { type: String, default: null }
        },
        data() {
            const pinned = localStorage.getItem('panel_pin_profile') === 'true';
            return { open: pinned, pinned, panelZ: 300, profile: null, friends: [], outgoing: [], editingName: false, newName: '', nameError: '',
                ownedTitles: [], ownedNameEffects: [], ownedBackgrounds: [],
                equippedTitleId: null, equippedNameEffectId: null, equippedReticlePath: null, equippedBackgroundId: null,
                equippedNameEffectClass: '',
                changingPw: false, pwOld: '', pwNew: '', pwErr: '',
                editingBio: false, newBio: '' };
        },
        computed: {
            avatarSrc() {
                return this.profile ? '/api/profile/avatar/' + this.profile.id + '?v=' + Date.now() : '/img/default.png';
            },
            xpPct() {
                if (!this.profile) return 0;
                return Math.min(100, Math.floor((this.profile.xpInLevel / this.profile.xpToNext) * 100));
            }
        },
        methods: {
            t(key) { return lang.t(key); },
            onTabClick() {
                if (this.open) {
                    this.open = false; this.pinned = false;
                    localStorage.removeItem('panel_pin_profile');
                } else {
                    this.open = true; this.panelZ = bringToFront();
                    this.load();
                }
            },
            togglePin() {
                this.pinned = !this.pinned;
                if (this.pinned) localStorage.setItem('panel_pin_profile', 'true');
                else { this.open = false; localStorage.removeItem('panel_pin_profile'); }
            },
            load() {
                const h = { 'Authorization': 'Bearer ' + this.authToken };
                fetch('/api/auth/me', { headers: h })
                    .then(r => r.json()).then(p => { if (p && p.id) this.profile = p; });
                fetch('/api/friends', { headers: h })
                    .then(r => r.json()).then(d => {
                        if (d && d.accepted) { this.friends = d.accepted; this.outgoing = d.outgoing || []; }
                    });
                fetch('/api/store/owned', { headers: h })
                    .then(r => r.json()).then(items => {
                        if (!Array.isArray(items)) return;
                        this.ownedTitles = items.filter(i => i.type === 'title');
                        this.ownedNameEffects = items.filter(i => i.type === 'name_effect');
                        this.ownedBackgrounds = items.filter(i => i.type === 'background');
                    });
                fetch('/api/store/equipped', { headers: h })
                    .then(r => r.json()).then(eq => {
                        this.equippedTitleId = eq.title ? eq.title.id : null;
                        this.equippedNameEffectId = eq.name_effect ? eq.name_effect.id : null;
                        this.equippedReticlePath = eq.reticle ? '/store/asset/' + eq.reticle.file_path : null;
                        this.equippedBackgroundId = eq.bg_profile ? eq.bg_profile.id : null;
                        try { this.equippedNameEffectClass = eq.name_effect ? (JSON.parse(eq.name_effect.meta || '{}').cssClass || '') : ''; } catch(e) { this.equippedNameEffectClass = ''; }
                    });
            },
            startEditName() {
                this.newName = this.profile.username;
                this.nameError = '';
                this.editingName = true;
                this.$nextTick(() => { const el = this.$el.querySelector('.pp-name-input'); if (el) el.focus(); });
            },
            saveName() {
                const name = this.newName.trim();
                if (!name || name === this.profile.username) { this.editingName = false; return; }
                fetch('/api/profile/change-username', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: name })
                }).then(r => r.json()).then(d => {
                    if (d.error) { this.nameError = d.error; return; }
                    this.editingName = false;
                    this.nameError = '';
                    this.load();
                });
            },
            equipItem(slot, itemId) {
                return fetch('/api/store/equip', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slot, itemId: itemId || null })
                }).then(r => r.json()).then(d => { if (d.error) { alert(d.error); } return d; });
            },
            unequipReticle() {
                this.equipItem('reticle', null);
                this.equippedReticlePath = null;
            },
            equipNameEffect(itemId) {
                this.equipItem('name_effect', itemId).then(d => {
                    if (d && !d.error) {
                        const item = this.ownedNameEffects.find(i => i.id === itemId);
                        try { this.equippedNameEffectClass = item ? (JSON.parse(item.meta || '{}').cssClass || '') : ''; } catch(e) { this.equippedNameEffectClass = ''; }
                    }
                });
            },
            equipBg(itemId) {
                this.equipItem('bg_profile', itemId).then(d => {
                    if (d && !d.error) {
                        const item = this.ownedBackgrounds.find(i => i.id === itemId);
                        this.$emit('bg-change', item ? '/store/asset/' + item.file_path : null);
                    }
                });
            },
            inviteFriend(friendId) {
                fetch('/api/friends/invite/' + friendId, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameId: this.gameId })
                }).then(r => r.json()).then(d => { if (d.error) alert(d.error); });
            },
            cancelRequest(otherId) {
                fetch('/api/friends/decline/' + otherId, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                }).then(() => { this.outgoing = this.outgoing.filter(r => r.id !== otherId); });
            },
            removeFriend(friendId) {
                fetch('/api/friends/' + friendId, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                }).then(() => { this.friends = this.friends.filter(f => f.id !== friendId); });
            },
            submitPw() {
                if (!this.pwOld || !this.pwNew) { this.pwErr = 'Fill both fields'; return; }
                fetch('/api/profile/change-password', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldPassword: this.pwOld, newPassword: this.pwNew })
                }).then(r => r.json()).then(d => {
                    if (d.error) { this.pwErr = d.error; return; }
                    this.changingPw = false; this.pwOld = ''; this.pwNew = ''; this.pwErr = '';
                });
            },
            startEditBio() {
                this.newBio = this.profile.bio || '';
                this.editingBio = true;
                this.$nextTick(() => { const el = this.$el.querySelector('.pp-bio-input'); if (el) el.focus(); });
            },
            saveBio() {
                fetch('/api/profile/bio', {
                    method: 'PUT',
                    headers: { 'Authorization': 'Bearer ' + this.authToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bio: this.newBio })
                }).then(r => r.json()).then(d => {
                    if (!d.error) { this.profile.bio = this.newBio; this.editingBio = false; }
                });
            },
            uploadAvatar(e) {
                const file = e.target.files[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('avatar', file);
                fetch('/api/profile/avatar', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken },
                    body: fd
                }).then(r => r.json()).then(() => this.load());
            },
            clearLocalData() {
                if (!window.confirm(this.t('clear_local_data_confirm'))) return;
                localStorage.clear();
                window.location.reload();
            }
        },
        watch: {
            authToken(val) { if (val) this.load(); }
        },
        mounted() {
            registerPanel('profile', this);
            if (this.authToken) this.load();
            if (this.open) { this.panelZ = bringToFront(); }
            if (this.socket) {
                this._goldHandler = data => { if (this.profile) this.profile.gold = data.newTotal; };
                this._acceptedHandler = () => { this.load(); this.$emit('friends-updated'); };
                this._removedHandler = data => {
                    this.friends = this.friends.filter(f => f.username !== data.by);
                    this.$emit('friends-updated');
                };
                this.socket.on('goldAwarded', this._goldHandler);
                this.socket.on('friendAccepted', this._acceptedHandler);
                this.socket.on('friendRemoved', this._removedHandler);
            }
        },
        beforeDestroy() {
            unregisterPanel('profile');
            if (this.socket) {
                if (this._goldHandler) this.socket.removeListener('goldAwarded', this._goldHandler);
                if (this._acceptedHandler) this.socket.removeListener('friendAccepted', this._acceptedHandler);
                if (this._removedHandler) this.socket.removeListener('friendRemoved', this._removedHandler);
            }
        }
    }
</script>

<style scoped>
    .pp-outer {
        position: fixed;
        top: 270px;
        left: 0;
        transform: translateX(-280px);
        transition: transform 0.25s ease;
    }
    .pp-outer.open { transform: translateX(0); }

    .pp-panel {
        width: 280px;
        background: rgba(0,0,0,0.92);
        border: 1px solid #9a6515;
        border-radius: 0 6px 6px 0;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow: hidden;
        max-height: 500px;
    }
    .pp-header {
        padding: 5px 10px;
        color: #d4cda4;
        font-weight: bold;
        font-size: 11px;
        letter-spacing: 2px;
        border-bottom: 1px solid #3a2805;
        text-align: center;
        position: relative;
        flex-shrink: 0;
    }
    .pp-body { overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
    .pp-avatar-row { display: flex; align-items: center; gap: 8px; }
    .pp-avatar-wrap { position: relative; flex-shrink: 0; width: 48px; height: 48px; }
    .pp-avatar { width: 48px; height: 48px; border-radius: 0; object-fit: cover; display: block; }
    .pp-avatar-reticle { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
    .pp-reticle-reset { background: transparent; border: 1px solid #555; border-radius: 3px; color: #888; font-size: 10px; padding: 2px 5px; cursor: pointer; flex-shrink: 0; }
    .pp-reticle-reset:hover { border-color: #cc4444; color: #cc4444; }
    .pp-meta { flex: 1; }
    .pp-name-row { display: flex; align-items: center; gap: 4px; }
    .pp-name { color: #d4cda4; font-weight: bold; font-size: 13px; flex: 1; }
    .pp-name-input { background: rgba(0,0,0,0.5); border: 1px solid #9a6515; color: #d4cda4; font-size: 13px; font-weight: bold; padding: 1px 4px; border-radius: 2px; flex: 1; min-width: 0; width: 100%; }
    .pp-edit-btn { background: transparent; border: none; cursor: pointer; font-size: 10px; opacity: 0.4; padding: 0; line-height: 1; }
    .pp-edit-btn:hover { opacity: 1; }
    .pp-save-btn { background: transparent; border: 1px solid #4caf50; border-radius: 2px; color: #4caf50; font-size: 11px; padding: 1px 5px; cursor: pointer; }
    .pp-name-error { color: #e74c3c; font-size: 10px; }
    .pp-level { color: #9a6515; font-size: 11px; }
    .pp-gold { color: #f0c040; font-size: 11px; font-weight: bold; }
    .pp-xpbar-wrap { height: 5px; background: #222; border-radius: 3px; overflow: hidden; }
    .pp-xpbar-fill { height: 100%; background: #9a6515; transition: width 0.3s; }
    .pp-xpinfo { color: #666; font-size: 10px; text-align: right; }
    .pp-stats { display: flex; gap: 4px; justify-content: space-between; }
    .pp-stat { text-align: center; flex: 1; }
    .pp-val { display: block; color: #d4cda4; font-size: 14px; font-weight: bold; }
    .pp-lbl { color: #666; font-size: 9px; text-transform: uppercase; }
    .pp-section-title {
        color: #9a6515; font-size: 10px; font-weight: bold; letter-spacing: 1px;
        text-transform: uppercase; border-bottom: 1px solid #3a2805; padding-bottom: 2px;
    }
    .pp-empty { color: #666; font-size: 11px; font-style: italic; text-align: center; padding: 4px 0; }
    .pp-friend-row { display: flex; align-items: center; gap: 4px; }
    .fp-online-dot { width: 7px; height: 7px; border-radius: 50%; background: #444; flex-shrink: 0; }
    .fp-online-dot.online { background: #4caf50; }
    .pp-friend-avatar { width: 20px; height: 20px; border-radius: 0; object-fit: cover; }
    .pp-friend-name { flex: 1; color: #d4cda4; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fp-btn {
        background: transparent; border: 1px solid #9a6515; border-radius: 3px;
        color: #d4cda4; font-size: 9px; padding: 2px 5px; cursor: pointer; white-space: nowrap;
    }
    .fp-btn:hover { background: rgba(154,101,21,0.3); }
    .fp-btn-decline { border-color: #cc3333; color: #cc3333; }
    .fp-btn-decline:hover { background: rgba(204,51,51,0.2); border-color: #cc3333; }
    .fp-btn-invite { border-color: #4488ff; color: #4488ff; }
    .fp-btn-invite:hover:not(:disabled) { background: rgba(68,136,255,0.2); }
    .fp-btn-invite:disabled { opacity: 0.3; cursor: not-allowed; }
    .pp-online-lbl { font-size: 9px; color: #555; white-space: nowrap; }
    .pp-online-lbl.online { color: #4caf50; }
    .pp-friends-scroll { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
    .pp-friends-scroll::-webkit-scrollbar { width: 3px; }
    .pp-friends-scroll::-webkit-scrollbar-track { background: transparent; }
    .pp-friends-scroll::-webkit-scrollbar-thumb { background: #3a2805; border-radius: 2px; }
    .pp-equip { display: flex; flex-direction: column; gap: 4px; padding: 4px 0; border-top: 1px solid #3a2805; }
    .pp-equip-row { display: flex; align-items: center; gap: 6px; }
    .pp-equip-label { color: #666; font-size: 10px; white-space: nowrap; min-width: 60px; }
    .pp-equip-select { flex: 1; background: rgba(0,0,0,0.5); border: 1px solid #9a6515; color: #d4cda4; font-size: 10px; border-radius: 3px; padding: 2px 4px; font-family: inherit; }
    .pp-pw-form { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; border-top: 1px solid #3a2805; }
    .pp-pw-input { background: rgba(0,0,0,0.5); border: 1px solid #9a6515; border-radius: 3px; color: #d4cda4; font-size: 11px; padding: 4px 6px; font-family: inherit; }
    .pp-pw-actions { display: flex; gap: 4px; }
    .pp-pw-actions .pp-action-btn { flex: 1; }
    .pp-bio-wrap { padding: 2px 0; border-top: 1px solid #3a2805; border-bottom: 1px solid #3a2805; }
    .pp-bio-text { color: #6a5a3a; font-size: 10px; font-style: italic; cursor: pointer; line-height: 1.4; min-height: 16px; padding: 2px 0; }
    .pp-bio-text:hover { color: #9a8a6a; }
    .pp-bio-input { width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.4); border: 1px solid #9a6515; border-radius: 3px; color: #d4cda4; font-size: 10px; padding: 4px 6px; font-family: inherit; resize: none; }
    .pp-bio-actions { display: flex; gap: 4px; margin-top: 3px; }
    .pp-actions { display: flex; flex-direction: column; gap: 4px; padding-top: 4px; border-top: 1px solid #3a2805; }
    .pp-action-btn {
        background: transparent; border: 1px solid #3a2805; border-radius: 4px; color: #d4cda4;
        font-size: 11px; padding: 5px 8px; cursor: pointer; text-align: center;
    }
    .pp-action-btn:hover { border-color: #9a6515; }
    .pp-action-btn-danger { color: #cc4444; border-color: rgba(204, 68, 68, 0.4); }
    .pp-action-btn-danger:hover { border-color: #ff6666; color: #ff6666; }
    .pp-tab {
        position: absolute; top: 0; right: -36px; width: 36px; height: 48px;
        background: rgba(0,0,0,0.92); border: 1px solid #9a6515; border-left: none;
        border-radius: 0 6px 6px 0; cursor: pointer; font-size: 16px;
        display: flex; align-items: center; justify-content: center;
    }
    .pp-tab:hover { background: rgba(40,20,0,0.95); }
    .panel-pin-btn {
        position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
        background: transparent; border: none; cursor: pointer; font-size: 11px; opacity: 0.25; padding: 2px;
    }
    .panel-pin-btn:hover { opacity: 0.7; }
    .panel-pin-btn.pinned { opacity: 1; }
    .pp-body::-webkit-scrollbar { width: 4px; }
    .pp-body::-webkit-scrollbar-track { background: transparent; }
    .pp-body::-webkit-scrollbar-thumb { background: #3a2805; border-radius: 2px; }
    .pp-header, .pp-body { position: relative; z-index: 1; }
    .pp-panel-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.2; pointer-events: none; z-index: 0; }
    .name-fire { color: #ff6600; text-shadow: 0 0 8px #ff6600, 0 0 16px #ff3300; animation: nameFireFlicker 1.2s ease-in-out infinite alternate; }
    .name-ice { color: #88ddff; text-shadow: 0 0 8px #88ddff, 0 0 16px #00aaff; animation: nameIcePulse 2s ease-in-out infinite; }
    .name-gold { color: #f0c040; text-shadow: 0 0 8px #f0c040, 0 0 16px #cc8800; animation: nameGoldShimmer 1.5s ease-in-out infinite; }
    .name-shadow { color: #9966cc; text-shadow: 0 0 10px #9966cc, 0 0 20px #6600aa; animation: nameShadowPulse 2s ease-in-out infinite; }
    .name-rainbow { animation: nameRainbow 3s linear infinite; }
    .name-rainbow-sweep { background: linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff, #8800ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; background-size: 200% auto; animation: nameRainbowSweep 2s linear infinite; }
    .name-bg-gradient { background: linear-gradient(135deg, #f0c040 0%, #ff8800 50%, #cc4400 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: nameBgGradient 3s ease-in-out infinite; }
    .name-glitter { color: #d4cda4; animation: nameGlitter 0.8s steps(1) infinite; }
    .name-electric { color: #44ffff; text-shadow: 0 0 5px #44ffff, 0 0 10px #0088ff, 0 0 20px #0044ff; animation: nameElectric 0.15s ease-in-out infinite alternate; }
    @keyframes nameFireFlicker { from { text-shadow: 0 0 8px #ff6600, 0 0 16px #ff3300; } to { text-shadow: 0 0 12px #ffaa00, 0 0 24px #ff6600; } }
    @keyframes nameIcePulse { 0%,100% { text-shadow: 0 0 8px #88ddff, 0 0 16px #00aaff; } 50% { text-shadow: 0 0 14px #ccf4ff, 0 0 28px #44ccff; } }
    @keyframes nameGoldShimmer { 0%,100% { text-shadow: 0 0 8px #f0c040, 0 0 16px #cc8800; } 50% { text-shadow: 0 0 12px #ffe080, 0 0 24px #f0c040; } }
    @keyframes nameShadowPulse { 0%,100% { text-shadow: 0 0 10px #9966cc, 0 0 20px #6600aa; } 50% { text-shadow: 0 0 16px #cc88ff, 0 0 32px #9966cc; } }
    @keyframes nameRainbow { 0% { color: #ff0000; } 16% { color: #ff8800; } 33% { color: #ffff00; } 50% { color: #00ff00; } 66% { color: #0088ff; } 83% { color: #8800ff; } 100% { color: #ff0000; } }
    @keyframes nameRainbowSweep { to { background-position: 200% center; } }
    @keyframes nameBgGradient { 0%,100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(30deg); } }
    @keyframes nameGlitter { 0% { color: #fff; text-shadow: 0 0 4px #fff; } 25% { color: #ffff00; text-shadow: 0 0 4px #ffff00; } 50% { color: #00ffff; text-shadow: 0 0 4px #00ffff; } 75% { color: #ff88ff; text-shadow: 0 0 4px #ff88ff; } 100% { color: #fff; text-shadow: 0 0 4px #fff; } }
    @keyframes nameElectric { from { text-shadow: 0 0 5px #44ffff, 0 0 10px #0088ff; } to { text-shadow: 0 0 10px #88ffff, 0 0 20px #44aaff, 0 0 30px #0044ff; } }
</style>
