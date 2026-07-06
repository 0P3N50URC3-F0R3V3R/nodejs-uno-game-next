<template>
    <div class="sp-outer" :class="{ open }" :style="{ zIndex: panelZ }">
        <div class="sp-panel">
            <div class="sp-header">
                {{ t('store') }}
                <span class="sp-gold">{{ gold }}G</span>
                <button class="panel-pin-btn" :class="{ pinned }" @click.stop="togglePin">📌</button>
            </div>
            <div class="sp-tabs">
                <button v-for="tab in tabs" :key="tab.key"
                    class="sp-tab-btn" :class="{ active: activeTab === tab.key }"
                    :title="t(tab.tip)"
                    @click="activeTab = tab.key">{{ tab.label }}</button>
            </div>
            <div class="sp-body">
                <div v-if="loading" class="sp-empty">...</div>
                <template v-else>
                    <div v-if="filteredItems.length === 0" class="sp-empty">—</div>
                    <div v-for="item in filteredItems" :key="item.id" class="sp-item">
                        <div class="sp-preview">
                            <img v-if="item.type === 'reticle'" :src="'/store/asset/' + item.file_path" class="sp-preview-img" />
                            <video v-else-if="item.type === 'background'" :src="'/store/asset/' + item.file_path"
                                autoplay loop muted playsinline class="sp-preview-img" />
                            <div v-else-if="item.type === 'title'" class="sp-preview-title" :style="titleStyle(item)">{{ item.name }}</div>
                            <div v-else-if="item.type === 'name_effect'" class="sp-preview-name" :class="nameEffectClass(item)">{{ item.name }}</div>
                        </div>
                        <div class="sp-info">
                            <div class="sp-item-name">{{ item.name }}</div>
                            <div class="sp-item-desc" v-if="item.description">{{ item.description }}</div>
                            <div class="sp-item-price" v-if="!item.owned">{{ item.price }}G</div>
                        </div>
                        <div class="sp-actions">
                            <button v-if="!item.owned" class="sp-btn sp-btn-buy"
                                :disabled="gold < item.price"
                                @click="buy(item)">{{ t('buy') }}</button>
                            <template v-else>
                                <span class="sp-owned-badge">✓</span>
                                <template v-if="item.type === 'background'">
                                    <button class="sp-btn sp-btn-sm"
                                        :class="equippedGameBgId === item.id ? 'sp-btn-unequip' : 'sp-btn-equip'"
                                        @click="equipBgSlot(item, 'background')">
                                        {{ equippedGameBgId === item.id ? '✕' : '▶' }} Game
                                    </button>
                                    <button class="sp-btn sp-btn-sm"
                                        :class="equippedProfileBgId === item.id ? 'sp-btn-unequip' : 'sp-btn-equip'"
                                        @click="equipBgSlot(item, 'bg_profile')">
                                        {{ equippedProfileBgId === item.id ? '✕' : '▶' }} Prof
                                    </button>
                                </template>
                                <template v-else>
                                    <button class="sp-btn" :class="item.equipped ? 'sp-btn-unequip' : 'sp-btn-equip'"
                                        @click="equip(item)">{{ item.equipped ? t('unequip') : t('equip') }}</button>
                                </template>
                            </template>
                        </div>
                    </div>
                </template>
            </div>
        </div>
        <button class="sp-tab" @click="onTabClick" :title="t('store')">🛒</button>
    </div>
</template>

<script>
    import { lang } from '../lang/index.js';
    import { registerPanel, unregisterPanel, bringToFront } from '../panelManager.js';

    export default {
        name: 'StorePanel',
        props: {
            authToken: { type: String, default: '' },
            socket: { type: Object, default: null }
        },
        data() {
            const pinned = localStorage.getItem('panel_pin_store') === 'true';
            return {
                open: pinned, pinned, panelZ: 300,
                activeTab: 'reticle',
                items: [],
                gold: 0,
                loading: false,
                equippedGameBgId: null,
                equippedProfileBgId: null,
                tabs: [
                    { key: 'reticle',     label: '🎯', tip: 'store_tab_reticle' },
                    { key: 'background',  label: '🎬', tip: 'store_tab_background' },
                    { key: 'title',       label: '🏅', tip: 'store_tab_title' },
                    { key: 'name_effect', label: '✨', tip: 'store_tab_name_effect' }
                ]
            };
        },
        computed: {
            filteredItems() {
                return this.items.filter(i => i.type === this.activeTab)
                    .slice().sort((a, b) => (b.owned ? 1 : 0) - (a.owned ? 1 : 0));
            }
        },
        methods: {
            t(key) { return lang.t(key); },
            onTabClick() {
                if (this.open) {
                    this.open = false; this.pinned = false;
                    localStorage.removeItem('panel_pin_store');
                } else {
                    this.open = true; this.panelZ = bringToFront();
                    this.load();
                }
            },
            togglePin() {
                this.pinned = !this.pinned;
                if (this.pinned) localStorage.setItem('panel_pin_store', 'true');
                else { this.open = false; localStorage.removeItem('panel_pin_store'); }
            },
            load() {
                this.loading = true;
                const h = { 'Authorization': 'Bearer ' + this.authToken };
                Promise.all([
                    fetch('/api/store/items', { headers: h }).then(r => r.json()),
                    fetch('/api/auth/me', { headers: h }).then(r => r.json()),
                    fetch('/api/store/equipped', { headers: h }).then(r => r.json())
                ]).then(([items, me, eq]) => {
                    this.items = Array.isArray(items) ? items : [];
                    this.gold = (me && me.gold) || 0;
                    this.equippedGameBgId = eq && eq.background ? eq.background.id : null;
                    this.equippedProfileBgId = eq && eq.bg_profile ? eq.bg_profile.id : null;
                    this.loading = false;
                });
            },
            buy(item) {
                fetch('/api/store/buy/' + item.id, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                }).then(r => r.json()).then(d => {
                    if (d.error) { alert(d.error); return; }
                    this.gold = d.gold;
                    this.$emit('gold-changed', d.gold);
                    item.owned = true;
                });
            },
            equip(item) {
                const slotMap = { reticle: 'reticle', title: 'title', name_effect: 'name_effect' };
                const slot = slotMap[item.type];
                if (!slot) return;
                const newItemId = item.equipped ? null : item.id;
                fetch('/api/store/equip', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slot, itemId: newItemId })
                }).then(r => r.json()).then(d => {
                    if (d.error) { alert(d.error); return; }
                    if (newItemId === null) { item.equipped = false; }
                    else { this.items.filter(i => i.type === item.type).forEach(i => { i.equipped = false; }); item.equipped = true; }
                });
            },
            equipBgSlot(item, slot) {
                const isEquipped = slot === 'background' ? this.equippedGameBgId === item.id : this.equippedProfileBgId === item.id;
                const newItemId = isEquipped ? null : item.id;
                fetch('/api/store/equip', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.authToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slot, itemId: newItemId })
                }).then(r => r.json()).then(d => {
                    if (d.error) { alert(d.error); return; }
                    const url = newItemId ? '/store/asset/' + item.file_path : null;
                    if (slot === 'background') { this.equippedGameBgId = newItemId; this.$emit('bg-change', url); }
                    else { this.equippedProfileBgId = newItemId; this.$emit('bg-profile-change', url); }
                });
            },
            titleStyle(item) {
                try {
                    const meta = JSON.parse(item.meta || '{}');
                    const s = { fontWeight: 'bold', fontSize: '12px', textAlign: 'center', letterSpacing: '0.5px' };
                    if (meta.color) { s.color = meta.color; s.textShadow = '0 0 8px ' + meta.color; }
                    return s;
                } catch(e) { return {}; }
            },
            nameEffectClass(item) {
                try {
                    return JSON.parse(item.meta || '{}').cssClass || '';
                } catch(e) { return ''; }
            }
        },
        mounted() {
            registerPanel('store', this);
            if (this.open) { this.panelZ = bringToFront(); this.load(); }
            if (this.socket) {
                this._goldHandler = data => { this.gold = data.newTotal; };
                this.socket.on('goldAwarded', this._goldHandler);
            }
        },
        beforeDestroy() {
            unregisterPanel('store');
            if (this.socket && this._goldHandler) this.socket.removeListener('goldAwarded', this._goldHandler);
        }
    }
</script>

<style scoped>
    .sp-outer {
        position: fixed;
        top: 322px;
        left: 0;
        transform: translateX(-480px);
        transition: transform 0.25s ease;
    }
    .sp-outer.open { transform: translateX(0); }
    .sp-panel {
        width: 480px;
        background: rgba(0,0,0,0.92);
        border: 1px solid #9a6515;
        border-radius: 0 6px 6px 0;
        display: flex;
        flex-direction: column;
        max-height: 480px;
    }
    .sp-header {
        padding: 5px 10px;
        color: #d4cda4;
        font-weight: bold;
        font-size: 11px;
        letter-spacing: 2px;
        border-bottom: 1px solid #3a2805;
        text-align: center;
        position: relative;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }
    .sp-gold { color: #f0c040; font-size: 11px; }
    .sp-tabs { display: flex; border-bottom: 1px solid #3a2805; flex-shrink: 0; }
    .sp-tab-btn {
        flex: 1; background: transparent; border: none; border-right: 1px solid #3a2805;
        color: #666; font-size: 14px; padding: 4px 2px; cursor: pointer;
    }
    .sp-tab-btn:last-child { border-right: none; }
    .sp-tab-btn.active { color: #d4cda4; background: rgba(154,101,21,0.15); }
    .sp-tab-btn:hover:not(.active) { color: #9a6515; }
    .sp-body { overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 6px; }
    .sp-item { display: flex; gap: 6px; align-items: center; padding: 4px; border: 1px solid #2a1a00; border-radius: 4px; }
    .sp-item:hover { border-color: #9a6515; }
    .sp-preview {
        width: 48px; height: 48px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        background: #111; border-radius: 3px; overflow: hidden;
    }
    .sp-preview-img { width: 48px; height: 48px; object-fit: contain; }
    video.sp-preview-img { object-fit: cover; }
    .sp-preview-title { font-size: 10px; font-weight: bold; text-align: center; padding: 2px; word-break: break-word; color: #d4cda4; }
    .sp-preview-name { font-size: 11px; font-weight: bold; text-align: center; color: #d4cda4; }
    .sp-info { flex: 1; min-width: 0; }
    .sp-item-name { color: #d4cda4; font-size: 11px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sp-item-desc { color: #666; font-size: 9px; }
    .sp-item-price { color: #f0c040; font-size: 10px; font-weight: bold; }
    .sp-actions { display: flex; flex-direction: column; gap: 3px; align-items: center; flex-shrink: 0; }
    .sp-btn { font-size: 9px; padding: 3px 6px; border-radius: 3px; cursor: pointer; white-space: nowrap; border: 1px solid; font-family: inherit; }
    .sp-btn-sm { font-size: 8px; padding: 2px 4px; }
    .sp-btn-buy { background: rgba(154,101,21,0.3); border-color: #9a6515; color: #f0c040; }
    .sp-btn-buy:hover:not(:disabled) { background: rgba(154,101,21,0.55); }
    .sp-btn-buy:disabled { opacity: 0.4; cursor: not-allowed; }
    .sp-btn-equip { background: rgba(76,175,80,0.2); border-color: #4caf50; color: #4caf50; }
    .sp-btn-equip:hover { background: rgba(76,175,80,0.4); }
    .sp-btn-unequip { background: rgba(100,100,100,0.2); border-color: #555; color: #888; }
    .sp-btn-unequip:hover { background: rgba(100,100,100,0.35); }
    .sp-owned-badge { color: #4caf50; font-size: 10px; }
    .sp-empty { color: #666; font-size: 11px; font-style: italic; text-align: center; padding: 20px 0; }
    .sp-tab {
        position: absolute; top: 0; right: -36px; width: 36px; height: 48px;
        background: rgba(0,0,0,0.92); border: 1px solid #9a6515; border-left: none;
        border-radius: 0 6px 6px 0; cursor: pointer; font-size: 16px;
        display: flex; align-items: center; justify-content: center;
    }
    .sp-tab:hover { background: rgba(40,20,0,0.95); }
    .panel-pin-btn {
        position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
        background: transparent; border: none; cursor: pointer; font-size: 11px; opacity: 0.25; padding: 2px;
    }
    .panel-pin-btn:hover { opacity: 0.7; }
    .panel-pin-btn.pinned { opacity: 1; }
    .sp-body::-webkit-scrollbar { width: 4px; }
    .sp-body::-webkit-scrollbar-track { background: transparent; }
    .sp-body::-webkit-scrollbar-thumb { background: #3a2805; border-radius: 2px; }

    /* Name effect preview classes */
    .name-fire { color: #ff6600; text-shadow: 0 0 8px #ff3300, 0 0 16px #ff6600; }
    .name-ice  { color: #66ddff; text-shadow: 0 0 8px #0099cc, 0 0 16px #66ddff; }
    .name-gold { color: #f0c040; text-shadow: 0 0 8px #c8a020, 0 0 16px #f0c040; }
    .name-shadow { color: #cc0000; text-shadow: 0 0 6px #000, 2px 2px 4px #660000; }
    .name-rainbow { animation: sp-rainbow 2s linear infinite; }
    @keyframes sp-rainbow {
        0%   { color: #ff0000; } 17%  { color: #ff8800; } 33%  { color: #ffff00; }
        50%  { color: #00ff00; } 67%  { color: #0088ff; } 83%  { color: #8800ff; } 100% { color: #ff0000; }
    }
    .name-rainbow-sweep {
        background: linear-gradient(90deg,#ff0000,#ff8800,#ffff00,#00ff00,#0088ff,#8800ff,#ff0000);
        background-size: 200% auto;
        -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        animation: sp-rainbow-sweep 4s linear infinite;
    }
    @keyframes sp-rainbow-sweep { from { background-position: 0% center; } to { background-position: 200% center; } }
    .name-bg-gradient {
        background: linear-gradient(180deg,#00ff88,#00ccff,#0055ff,#00ccff,#00ff88);
        background-size: auto 400%;
        -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        animation: sp-bg-gradient 3s ease-in-out infinite;
    }
    @keyframes sp-bg-gradient { 0%,100% { background-position: 0% 0%; } 50% { background-position: 0% 100%; } }
    .name-glitter {
        color: #ffd700;
        animation: sp-glitter 0.3s steps(1) infinite;
    }
    @keyframes sp-glitter {
        0%  { text-shadow: 0 0 4px #fff, 2px -2px 5px #ffd700, -2px 2px 6px #ffaa00; }
        33% { text-shadow: -1px 1px 5px #fff8c0, 1px -1px 4px #ffd700, 0 2px 7px #ffcc00; }
        66% { text-shadow: 2px 0 3px #fffde0, -1px -2px 6px #ffd700, 1px 1px 5px #ff9900; }
    }
    .name-electric {
        color: #d0eeff;
        animation: sp-electric 0.12s steps(1) infinite;
    }
    @keyframes sp-electric {
        0%  { text-shadow: 0 0 4px #fff, 0 0 8px #88ccff, 0 0 16px #0088ff; }
        33% { text-shadow: 1px 0 3px #fff, -1px 0 10px #aaddff, 0 0 20px #0066ff; }
        66% { text-shadow: -1px 0 4px #fff, 0 0 8px #88ccff, 2px 0 12px #00aaff; }
    }
</style>
