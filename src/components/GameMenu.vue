<template>
    <div class="gmenu-outer" :class="{ open: open }" :style="{ zIndex: panelZ }">
        <div class="gmenu-panel">
            <div class="gmenu-header">
                {{ t('menu') }}
                <button class="panel-pin-btn" :class="{ pinned: pinned }" @click.stop="togglePin" :title="pinned ? 'Unpin' : 'Pin'">📌</button>
            </div>

            <div class="gmenu-sections">
            <div class="gmenu-section" v-if="isHost">
                <template v-if="!confirmRestart">
                    <button class="gmenu-btn" @click="confirmRestart = true">{{ t('restart') }}</button>
                </template>
                <template v-else>
                    <div class="gmenu-confirm-label">{{ t('restart_confirm') }}</div>
                    <div class="gmenu-confirm-row">
                        <button class="gmenu-btn gmenu-btn-yes" @click="doRestart">{{ t('yes') }}</button>
                        <button class="gmenu-btn gmenu-btn-no" @click="confirmRestart = false">{{ t('no') }}</button>
                    </div>
                </template>
            </div>

            <div class="gmenu-section">
                <button class="gmenu-btn" @click="$emit('open-manual')">{{ t('manual') }}</button>
            </div>

            <div class="gmenu-section">
                <template v-if="!confirmQuit">
                    <button class="gmenu-btn" @click="confirmQuit = true">{{ t('quit_btn') }}</button>
                </template>
                <template v-else>
                    <div class="gmenu-confirm-label">{{ t('quit_confirm') }}</div>
                    <div class="gmenu-confirm-row">
                        <button class="gmenu-btn gmenu-btn-yes" @click="doQuit">{{ t('yes') }}</button>
                        <button class="gmenu-btn gmenu-btn-no" @click="confirmQuit = false">{{ t('no') }}</button>
                    </div>
                </template>
            </div>

            <div class="gmenu-section">
                <div class="gmenu-sec-label">{{ t('table') }}</div>
                <div class="gmenu-table-picker">
                    <div v-for="i in 6" :key="i"
                         class="gmenu-tp-thumb"
                         :class="{active: tableIndex === i}"
                         :style="{backgroundImage: 'url(' + tableImages[i-1] + ')'}"
                         @click="$emit('table-change', i)">
                    </div>
                </div>
            </div>

            <div class="gmenu-section">
                <label class="gmenu-checkbox" :class="{ active: localPersonalHardcore }">
                    <input type="checkbox" v-model="localPersonalHardcore" @change="onPersonalHardcoreChange"/>
                    <span>{{ t('personal_hardcore_mode') }}</span>
                </label>
                <div class="gmenu-hint">{{ t('personal_hardcore_mode_desc') }}</div>
            </div>
            <div class="gmenu-section" v-if="ownedBgs.length">
                <div class="gmenu-sec-label">{{ t('animated_bg') }}</div>
                <div class="gmenu-bg-picker">
                    <div class="gmenu-bg-item gmenu-bg-none" :class="{ active: !activeBg }" @click="setBg(null)">✕</div>
                    <div v-for="bg in ownedBgs" :key="bg.id" class="gmenu-bg-item"
                         :class="{ active: activeBg === bg.file_path }"
                         @click="setBg(bg.file_path)">
                        <video :src="'/store/asset/' + bg.file_path" autoplay loop muted playsinline class="gmenu-bg-thumb"></video>
                    </div>
                </div>
            </div>
            </div><!-- gmenu-sections -->
        </div>
        <button class="gmenu-tab" @click="onTabClick" :title="t('tab_menu')">
            <span class="gmenu-tab-icon">⚙️</span>
        </button>
    </div>
</template>

<script>
    import { lang } from '../lang/index.js';
    import { registerPanel, unregisterPanel, bringToFront } from '../panelManager.js';

    const TABLE_IMAGES = [
        require('../../public/img/table.jpg'),
        require('../../public/img/table2.jpg'),
        require('../../public/img/table3.jpg'),
        require('../../public/img/table4.jpg'),
        require('../../public/img/table5.jpg'),
        require('../../public/img/table6.jpg'),
    ];

    export default {
        name: 'GameMenu',
        props: ['socket', 'quitHandler', 'isHost', 'tableIndex', 'personalHardcoreMode'],
        data: function() {
            let pinned = localStorage.getItem('panel_pin_gmenu') === 'true';
            return {
                open: pinned,
                pinned: pinned,
                panelZ: 300,
                confirmRestart: false,
                confirmQuit: false,
                localPersonalHardcore: !!this.personalHardcoreMode,
                tableImages: TABLE_IMAGES,
                ownedBgs: [],
                activeBg: null
            };
        },
        mounted: function() {
            registerPanel('gmenu', this);
            if (this.open) this.panelZ = bringToFront();
            this.loadBgs();
        },
        beforeDestroy: function() { unregisterPanel('gmenu'); },
        watch: {
            personalHardcoreMode: function(v) { this.localPersonalHardcore = !!v; }
        },
        methods: {
            t: function(key, vars) { return lang.t(key, vars); },
            onTabClick: function() {
                if (this.open) {
                    this.open = false;
                    this.pinned = false;
                    localStorage.removeItem('panel_pin_gmenu');
                } else {
                    this.open = true;
                    this.panelZ = bringToFront();
                }
            },
            togglePin: function() {
                if (this.pinned) {
                    this.pinned = false;
                    this.open = false;
                    localStorage.removeItem('panel_pin_gmenu');
                } else {
                    this.pinned = true;
                    localStorage.setItem('panel_pin_gmenu', 'true');
                }
            },
            doRestart: function() {
                this.socket.emit('restart');
                this.confirmRestart = false;
                this.open = false;
            },
            doQuit: function() {
                this.quitHandler();
                this.confirmQuit = false;
                this.open = false;
            },
            onPersonalHardcoreChange: function() {
                this.$emit('personal-hardcore-change', this.localPersonalHardcore);
            },
            loadBgs: function() {
                const token = localStorage.getItem('unoAuthToken');
                if (!token) return;
                fetch('/api/store/owned', { headers: { 'Authorization': 'Bearer ' + token } })
                    .then(function(r) { return r.json(); })
                    .then(function(items) {
                        this.ownedBgs = Array.isArray(items) ? items.filter(function(i) { return i.type === 'background'; }) : [];
                        const equipped = this.ownedBgs.find(function(b) { return b.equipped; });
                        if (equipped) this.activeBg = equipped.file_path;
                    }.bind(this));
            },
            setBg: function(filePath) {
                this.activeBg = filePath || null;
                this.$emit('video-bg-change', filePath ? '/store/asset/' + filePath : null);
                const token = localStorage.getItem('unoAuthToken');
                if (!token) return;
                let itemId = null;
                if (filePath) {
                    const item = this.ownedBgs.find(function(b) { return b.file_path === filePath; });
                    if (item) itemId = item.id;
                }
                fetch('/api/store/equip', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slot: 'background', itemId: itemId })
                });
            }
        }
    }
</script>

<style scoped>
    .gmenu-outer {
        position: fixed;
        top: 374px;
        left: 0;
        transform: translateX(-260px);
        transition: transform 0.25s ease;
    }
    .gmenu-outer.open {
        transform: translateX(0);
    }

    .gmenu-panel {
        width: 260px;
        background: rgba(0, 0, 0, 0.92);
        border: 1px solid #9a6515;
        border-radius: 0 6px 6px 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .gmenu-header {
        position: relative;
        padding: 5px 10px;
        color: #d4cda4;
        font-weight: bold;
        font-size: 11px;
        letter-spacing: 2px;
        border-bottom: 1px solid #3a2805;
        text-align: center;
        flex-shrink: 0;
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
        line-height: 1;
    }
    .panel-pin-btn:hover { opacity: 0.7; }
    .panel-pin-btn.pinned { opacity: 1; }

    .gmenu-sections {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
    }
    .gmenu-section {
        padding: 8px 10px 4px;
        border-bottom: 1px solid rgba(58, 40, 5, 0.5);
    }
    .gmenu-section:last-child { border-bottom: none; }

    .gmenu-sec-label {
        color: rgba(212, 205, 164, 0.6);
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 1.5px;
        margin-bottom: 5px;
    }

    .gmenu-btn {
        display: block;
        width: 100%;
        background: rgba(154, 101, 21, 0.2);
        border: 1px solid rgba(154, 101, 21, 0.5);
        border-radius: 4px;
        color: #d4cda4;
        font-size: 12px;
        font-weight: bold;
        letter-spacing: 1px;
        padding: 5px 8px;
        cursor: pointer;
        text-align: left;
        transition: background 0.15s, border-color 0.15s;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
    }
    .gmenu-btn:hover {
        background: rgba(154, 101, 21, 0.4);
        border-color: #ffb833;
        color: #fff;
    }

    .gmenu-confirm-label {
        color: #ffcc44;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 5px;
    }
    .gmenu-confirm-row {
        display: flex;
        gap: 6px;
    }
    .gmenu-btn-yes {
        flex: 1;
        background: rgba(180, 30, 30, 0.4);
        border-color: rgba(220, 60, 60, 0.6);
        color: #ffaaaa;
        text-align: center;
    }
    .gmenu-btn-yes:hover {
        background: rgba(220, 30, 30, 0.6);
        border-color: #ff6666;
        color: #fff;
    }
    .gmenu-btn-no {
        flex: 1;
        text-align: center;
    }

    .gmenu-checkbox {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0;
        cursor: pointer;
        color: #d4cda4;
        font-size: 11px;
        font-weight: bold;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        border-radius: 4px;
        transition: color 0.1s;
    }
    .gmenu-checkbox.active { color: #ffdd00; }
    .gmenu-checkbox input[type="checkbox"] {
        accent-color: #ffb833;
        width: 13px;
        height: 13px;
        margin: 0;
        flex-shrink: 0;
        cursor: pointer;
    }
    .gmenu-hint {
        color: rgba(212, 205, 164, 0.45);
        font-size: 9px;
        font-style: italic;
        line-height: 1.3;
        margin-top: 2px;
    }

    .gmenu-table-picker {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
    }
    .gmenu-tp-thumb {
        width: 46px;
        height: 32px;
        border-radius: 3px;
        border: 2px solid rgba(255,255,255,0.15);
        background-size: cover;
        background-position: center;
        opacity: 0.6;
        cursor: pointer;
        transition: opacity 0.15s, border-color 0.15s;
    }
    .gmenu-tp-thumb:hover { opacity: 1; }
    .gmenu-tp-thumb.active { border-color: #ffdd00; opacity: 1; }
    .gmenu-bg-picker { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 0; }
    .gmenu-bg-item { width: 46px; height: 32px; border: 2px solid rgba(255,255,255,0.15); border-radius: 3px; cursor: pointer; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #111; transition: border-color 0.15s; }
    .gmenu-bg-item:hover, .gmenu-bg-item.active { border-color: #ffdd00; }
    .gmenu-bg-item.gmenu-bg-none { color: #666; font-size: 14px; }
    .gmenu-bg-thumb { width: 46px; height: 32px; object-fit: cover; }
    .gmenu-tab { position:absolute; top:0; right:-36px; width:36px; height:48px; background:rgba(0,0,0,.92); border:1px solid #9a6515; border-left:none; border-radius:0 6px 6px 0; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .gmenu-tab:hover { background: rgba(154, 101, 21, 0.3); }
    .gmenu-tab-icon { font-size: 16px; color: #d4cda4; line-height: 1; }
</style>
