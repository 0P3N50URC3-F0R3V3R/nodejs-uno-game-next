<template>
    <div v-if="visible" class="player-tooltip" :style="style">
        <img class="pt-avatar" :src="avatarSrc" @error="avatarFailed = true" />
        <div class="pt-body">
            <div class="pt-name">{{ name }}</div>
            <template v-if="isAI">
                <div class="pt-ai-badge">{{ difficultyLabel }}</div>
            </template>
            <template v-else-if="loading">
                <div class="pt-loading">...</div>
            </template>
            <template v-else-if="stats">
                <div class="pt-level">{{ t('stat_level') }} {{ stats.level }}</div>
                <div class="pt-stats-row">
                    <span class="pt-stat-label">{{ t('stat_wins') }}</span>
                    <span class="pt-stat-val">{{ stats.matches_won }}</span>
                    <span class="pt-stat-label">{{ t('stat_losses') }}</span>
                    <span class="pt-stat-val">{{ stats.matches_lost }}</span>
                </div>
                <div class="pt-time">{{ t('stat_time') }}: {{ formatTime(stats.played_time_seconds) }}</div>
            </template>
        </div>
    </div>
</template>

<script>
    import { lang } from '../lang/index.js';

    export default {
        name: 'PlayerTooltip',
        props: {
            tooltipData: { type: Object, default: null },
            x: { type: Number, default: 0 },
            y: { type: Number, default: 0 },
        },
        data: function() {
            return { stats: null, loading: false, avatarFailed: false };
        },
        computed: {
            visible: function() { return !!this.tooltipData; },
            name: function() { return this.tooltipData ? this.tooltipData.name : ''; },
            isAI: function() { return this.tooltipData ? !!this.tooltipData.isAI : false; },
            difficultyLabel: function() {
                let labels = { easy: 'EASY BOT', medium: 'MED BOT', hard: 'HARD BOT' };
                return this.tooltipData ? (labels[this.tooltipData.aiDifficulty] || 'BOT') : '';
            },
            avatarSrc: function() {
                if(this.avatarFailed) return '/img/default.png';
                if(!this.tooltipData) return '/img/default.png';
                if(this.isAI) {
                    let d = (this.tooltipData.aiDifficulty || 'easy').charAt(0);
                    return '/img/AI_' + d + '.png';
                }
                if(this.stats && this.stats.avatar) return this.stats.avatar;
                return this.tooltipData.avatar || '/img/default.png';
            },
            style: function() {
                let x = this.x + 14;
                let y = this.y - 20;
                if(x + 190 > window.innerWidth) x = this.x - 190;
                if(y + 140 > window.innerHeight) y = window.innerHeight - 150;
                if(y < 4) y = 4;
                return { left: x + 'px', top: y + 'px' };
            },
        },
        watch: {
            tooltipData: function(val) {
                this.stats = null;
                this.avatarFailed = false;
                if(!val || val.isAI) return;
                this.loading = true;
                let self = this;
                fetch('/api/player-stats/' + encodeURIComponent(val.name))
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if(data && !data.error) self.stats = data;
                        self.loading = false;
                    })
                    .catch(function() { self.loading = false; });
            }
        },
        methods: {
            t: function(key) { return lang.t(key); },
            formatTime: function(secs) {
                if(!secs) return '0m';
                let h = Math.floor(secs / 3600);
                let m = Math.floor((secs % 3600) / 60);
                return h ? (h + 'h ' + m + 'm') : (m + 'm');
            }
        }
    };
</script>

<style scoped>
    .player-tooltip {
        position: fixed;
        z-index: 9000;
        background: rgba(8, 5, 0, 0.96);
        border: 1px solid #9a6515;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        gap: 10px;
        align-items: flex-start;
        min-width: 160px;
        max-width: 200px;
        pointer-events: none;
        box-shadow: 0 4px 20px rgba(0,0,0,0.85), 0 0 12px rgba(154,101,21,0.25);
    }

    .pt-avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 2px solid rgba(154,101,21,0.55);
        object-fit: cover;
        flex-shrink: 0;
    }

    .pt-body {
        flex: 1;
        min-width: 0;
    }

    .pt-name {
        font-size: 12px;
        font-weight: bold;
        color: #fccd4d;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 4px;
    }

    .pt-ai-badge {
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 1.5px;
        color: #a8d4ff;
        text-shadow: 0 0 8px rgba(80,160,255,0.5);
    }

    .pt-level {
        font-size: 10px;
        color: #d4cda4;
        margin-bottom: 3px;
    }

    .pt-stats-row {
        display: flex;
        gap: 5px;
        align-items: center;
        margin-bottom: 2px;
    }

    .pt-stat-label {
        font-size: 9px;
        color: #6a5a3a;
        letter-spacing: 0.5px;
    }

    .pt-stat-val {
        font-size: 10px;
        font-weight: bold;
        color: #9a8a6a;
        margin-right: 3px;
    }

    .pt-time {
        font-size: 9px;
        color: #6a5a3a;
    }

    .pt-loading {
        font-size: 10px;
        color: #6a5a3a;
        letter-spacing: 2px;
    }
</style>
