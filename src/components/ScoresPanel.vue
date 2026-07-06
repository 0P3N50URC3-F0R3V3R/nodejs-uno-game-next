<template>
    <div class="scores-outer" :class="{ open: open }" :style="{ zIndex: panelZ }">
        <div class="scores-panel">
            <div class="scores-header">
                {{ t('scores') }} <span class="scores-rounds">{{ roundsPlayed }}/{{ maxRounds }}</span>
                <button class="panel-pin-btn" :class="{ pinned: pinned }" @click.stop="togglePin" :title="pinned ? 'Unpin' : 'Pin'">📌</button>
            </div>
            <div v-if="clients && clients.length">
                <div class="scores-names-row">
                    <div class="scores-name-cell" v-for="(client, i) in clients" :key="i">{{ client.name }}</div>
                </div>
                <div class="scores-rows" ref="scoreRows">
                    <div class="scores-score-row" v-for="r in roundCount" :key="r">
                        <div class="scores-score-cell" v-for="(client, i) in clients" :key="i">
                            <i v-if="isWin(client, r-1)" class="far" :class="winIcon(i)"></i>
                            <span v-else>{{ scoreVal(client, r-1) }}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="scores-empty" v-else>{{ t('no_players') }}</div>
        </div>
        <button class="scores-tab" @click="onTabClick" :title="t('tab_scores')">
            <span class="scores-tab-icon">🏆</span>
        </button>
    </div>
</template>

<script>
    import { lang } from '../lang/index.js';
    import { registerPanel, unregisterPanel, bringToFront } from '../panelManager.js';

    export default {
        name: 'ScoresPanel',
        props: ['clients', 'roundsPlayed', 'maxRounds'],
        data: function () {
            let pinned = localStorage.getItem('panel_pin_scores') === 'true';
            return { open: true, pinned: pinned, panelZ: 300 };
        },
        mounted: function() {
            registerPanel('scores', this);
            this.panelZ = bringToFront();
        },
        beforeDestroy: function() { unregisterPanel('scores'); },
        computed: {
            roundCount: function () {
                if (!this.clients || !this.clients.length) return 0;
                return Math.max.apply(null, this.clients.map(function (c) { return (c.score || []).length; }));
            }
        },
        watch: {
            roundCount: function () {
                let self = this;
                this.$nextTick(function () {
                    if (self.$refs.scoreRows) {
                        self.$refs.scoreRows.scrollTop = self.$refs.scoreRows.scrollHeight;
                    }
                });
            }
        },
        methods: {
            t: function(key, vars) { return lang.t(key, vars); },
            onTabClick: function() {
                if (this.open) {
                    this.open = false;
                    this.pinned = false;
                    localStorage.removeItem('panel_pin_scores');
                } else {
                    this.open = true;
                    this.panelZ = bringToFront();
                }
            },
            togglePin: function() {
                if (this.pinned) {
                    this.pinned = false;
                    this.open = false;
                    localStorage.removeItem('panel_pin_scores');
                } else {
                    this.pinned = true;
                    localStorage.setItem('panel_pin_scores', 'true');
                }
            },
            isWin: function (client, r) {
                return client.score && client.score[r] === '-';
            },
            winIcon: function (index) {
                let smileys = ["fa-smile","fa-grin-squint","fa-grin-beam","fa-laugh-squint","fa-smile-beam","fa-laugh","fa-laugh-beam"];
                return smileys[index] || smileys[0];
            },
            scoreVal: function (client, r) {
                let s = client.score && client.score[r];
                return (s === undefined || s === null) ? '' : s;
            }
        }
    }
</script>

<style scoped>
    .scores-outer {
        position: fixed;
        top: 10px;
        left: 0;
        transform: translateX(-260px);
        transition: transform 0.25s ease;
    }
    .scores-outer.open {
        transform: translateX(0);
    }

    .scores-panel {
        width: 260px;
        background: rgba(0, 0, 0, 0.92);
        border: 1px solid #9a6515;
        border-radius: 0 6px 6px 0;
        padding-bottom: 8px;
    }

    .scores-header {
        position: relative;
        padding: 5px 10px;
        color: #d4cda4;
        font-weight: bold;
        font-size: 11px;
        letter-spacing: 2px;
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
        font-size: 11px;
        opacity: 0.25;
        padding: 2px;
        line-height: 1;
    }
    .panel-pin-btn:hover { opacity: 0.7; }
    .panel-pin-btn.pinned { opacity: 1; }
    .scores-rounds {
        color: #9a6515;
        font-size: 10px;
        letter-spacing: 1px;
        margin-left: 6px;
    }

    .scores-names-row {
        display: flex;
        border-bottom: 1px solid #3a2805;
        padding: 4px 8px 3px;
    }

    .scores-name-cell {
        flex: 1;
        color: #9a6515;
        font-weight: bold;
        font-size: 10px;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 0 2px;
    }

    .scores-rows {
        max-height: 110px;
        overflow-y: auto;
        padding: 2px 8px 2px;
        scrollbar-width: thin;
        scrollbar-color: #3a2805 transparent;
    }
    .scores-rows::-webkit-scrollbar { width: 4px; }
    .scores-rows::-webkit-scrollbar-track { background: transparent; }
    .scores-rows::-webkit-scrollbar-thumb { background: #3a2805; border-radius: 2px; }

    .scores-score-row {
        display: flex;
    }

    .scores-score-cell {
        flex: 1;
        color: #d4cda4;
        font-size: 11px;
        text-align: center;
        line-height: 22px;
        padding: 0 2px;
    }

    .scores-empty {
        color: #6a5a3a;
        font-size: 10px;
        text-align: center;
        padding: 10px;
        font-style: italic;
    }

    .scores-tab {
        position: absolute;
        top: 0;
        right: -36px;
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
    }
    .scores-tab:hover { background: rgba(40, 20, 0, 0.95); }
    .scores-tab-icon { font-size: 16px; line-height: 1; }
</style>
