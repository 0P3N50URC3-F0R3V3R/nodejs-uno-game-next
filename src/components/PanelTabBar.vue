<template>
    <div class="ptb-bar">
        <button v-for="btn in buttons" :key="btn.id"
                class="ptb-btn"
                :class="{ active: isOpen(btn.id), unavailable: !isRegistered(btn.id) }"
                :title="t(btn.key)"
                @click="onClick(btn.id)">
            <span class="ptb-icon">{{ btn.icon }}</span>
            <span v-if="btn.id === 'chat' && unreadCount > 0" class="ptb-badge">{{ unreadCount }}</span>
        </button>
    </div>
</template>

<script>
    import { panels, togglePanel } from '../panelManager.js';
    import { lang } from '../lang/index.js';

    export default {
        name: 'PanelTabBar',
        data() {
            return {
                buttons: [
                    { id: 'scores',       icon: '🏆', key: 'tab_scores'      },
                    { id: 'achievements', icon: '🏅', key: 'tab_achievements' },
                    { id: 'sound',        icon: '🎵', key: 'tab_music'        },
                    { id: 'chat',         icon: '💬', key: 'tab_chat'         },
                    { id: 'search',       icon: '🔍', key: 'tab_search'       },
                    { id: 'gmenu',        icon: '⚙️', key: 'tab_menu'         },
                ]
            };
        },
        computed: {
            unreadCount() {
                return panels.chat ? panels.chat.unreadCount : 0;
            }
        },
        methods: {
            t(key) { return lang.t(key); },
            isOpen(id) { return !!(panels[id] && panels[id].open); },
            isRegistered(id) { return !!panels[id]; },
            onClick(id) { togglePanel(id); }
        }
    };
</script>

<style scoped>
    .ptb-bar {
        position: fixed;
        left: 0;
        top: 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 9999;
        pointer-events: none;
    }
    .ptb-btn {
        position: relative;
        width: 36px;
        height: 48px;
        background: rgba(0, 0, 0, 0.92);
        border: 1px solid #9a6515;
        border-left: none;
        border-radius: 0 6px 6px 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, border-color 0.15s;
        pointer-events: all;
    }
    .ptb-btn:hover { background: rgba(40, 20, 0, 0.95); }
    .ptb-btn.active { background: rgba(154, 101, 21, 0.25); border-color: #ffb833; }
    .ptb-btn.unavailable { opacity: 0.35; cursor: default; }
    .ptb-icon { font-size: 16px; line-height: 1; }
    .ptb-badge {
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
        line-height: 1;
        padding: 0 2px;
    }
</style>
