<template>
    <div class="br-podium-overlay">
        <div class="br-podium-box">
            <div class="br-title" v-if="seriesWinner">
                <span class="br-series-win">{{ t('series_winner', { name: seriesWinner }) }}</span>
            </div>
            <div class="br-title" v-else>{{ t('br_results') }}</div>

            <div class="podium-stage">
                <div class="podium-slot podium-2" v-if="rank(2)">
                    <div class="podium-name">{{ rank(2).name }}</div>
                    <div class="podium-score">{{ rank(2).score }} {{ t('br_pts') }}</div>
                    <div class="podium-block silver">
                        <span class="podium-medal">2</span>
                    </div>
                </div>
                <div class="podium-slot podium-1" v-if="rank(1)">
                    <div class="podium-crown">&#9733;</div>
                    <div class="podium-name gold-name">{{ rank(1).name }}</div>
                    <div class="podium-score">{{ rank(1).score }} {{ t('br_pts') }}</div>
                    <div class="podium-block gold">
                        <span class="podium-medal">1</span>
                    </div>
                </div>
                <div class="podium-slot podium-3" v-if="rank(3)">
                    <div class="podium-name">{{ rank(3).name }}</div>
                    <div class="podium-score">{{ rank(3).score }} {{ t('br_pts') }}</div>
                    <div class="podium-block bronze">
                        <span class="podium-medal">3</span>
                    </div>
                </div>
            </div>

            <div class="br-rest" v-if="rest.length">
                <div v-for="r in rest" :key="r.rank" class="br-rest-row">
                    <span class="br-rest-rank">#{{ r.rank }}</span>
                    <span class="br-rest-name">{{ r.name }}</span>
                    <span class="br-rest-score">{{ r.score }} {{ t('br_pts') }}</span>
                </div>
            </div>

            <div class="br-buttons">
                <button class="br-btn br-btn-continue" @click="buttonHandler">{{ t('continue') }}</button>
                <button class="br-btn br-btn-quit" @click="quitHandler">{{ t('quit_btn') }}</button>
            </div>
        </div>
    </div>
</template>

<script>
    import { lang } from '../lang/index.js';

    export default {
        name: 'BRPodiumScreen',
        props: ['rankings', 'buttonHandler', 'quitHandler', 'seriesWinner'],
        computed: {
            sorted: function() {
                if(!this.rankings) return [];
                return this.rankings.slice().sort(function(a, b){ return a.rank - b.rank; });
            },
            rest: function() {
                return this.sorted.filter(function(r){ return r.rank > 3; });
            }
        },
        methods: {
            t: function(key, vars) { return lang.t(key, vars); },
            rank: function(n) {
                return this.sorted.find(function(r){ return r.rank === n; }) || null;
            }
        }
    }
</script>

<style scoped>
    .br-podium-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0,0,0,0.82);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .br-podium-box {
        background: linear-gradient(160deg, #1a0a00 0%, #2a1400 60%, #1a0a00 100%);
        border: 2px solid rgba(255,180,0,0.4);
        border-radius: 16px;
        padding: 32px 40px 24px;
        min-width: 380px;
        max-width: 520px;
        width: 100%;
        box-shadow: 0 0 60px rgba(255,160,0,0.18);
        text-align: center;
    }
    .br-title {
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        font-size: 26px;
        font-weight: 700;
        color: #ffd700;
        text-shadow: 0 0 18px rgba(255,200,0,0.6);
        margin-bottom: 28px;
        letter-spacing: 2px;
    }
    .br-series-win {
        font-size: 22px;
    }
    .podium-stage {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 8px;
        margin-bottom: 20px;
    }
    .podium-slot {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 120px;
    }
    .podium-crown {
        font-size: 28px;
        color: #ffd700;
        text-shadow: 0 0 14px #ffd700;
        margin-bottom: 4px;
        animation: crown-pulse 1.6s ease-in-out infinite;
    }
    @keyframes crown-pulse {
        0%,100% { text-shadow: 0 0 14px #ffd700; }
        50%      { text-shadow: 0 0 28px #ffd700, 0 0 48px #ffaa00; }
    }
    .podium-name {
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        font-size: 14px;
        font-weight: 700;
        color: #fff;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 110px;
    }
    .gold-name {
        color: #ffd700;
        text-shadow: 0 0 10px rgba(255,210,0,0.5);
        font-size: 15px;
    }
    .podium-score {
        font-size: 11px;
        color: rgba(255,255,255,0.6);
        margin-bottom: 6px;
    }
    .podium-block {
        width: 100px;
        border-radius: 6px 6px 0 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .podium-block.gold   { height: 80px; background: linear-gradient(180deg,#ffd700,#c8900a); box-shadow: 0 0 18px rgba(255,200,0,0.4); }
    .podium-block.silver { height: 60px; background: linear-gradient(180deg,#d0d0d0,#888); }
    .podium-block.bronze { height: 44px; background: linear-gradient(180deg,#cd7f32,#7a4010); }
    .podium-medal {
        font-size: 28px;
        font-weight: 900;
        color: rgba(0,0,0,0.45);
        font-family: "Trebuchet MS", Helvetica, sans-serif;
    }
    .br-rest {
        margin: 8px 0 18px;
        border-top: 1px solid rgba(255,180,0,0.15);
        padding-top: 10px;
    }
    .br-rest-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 3px 0;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
    }
    .br-rest-rank {
        width: 32px;
        color: rgba(255,255,255,0.5);
        font-size: 13px;
        text-align: right;
    }
    .br-rest-name {
        flex: 1;
        color: #ddd;
        font-size: 13px;
        text-align: left;
    }
    .br-rest-score {
        color: rgba(255,255,255,0.5);
        font-size: 12px;
    }
    .br-buttons {
        display: flex;
        justify-content: center;
        gap: 16px;
        margin-top: 16px;
    }
    .br-btn {
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        font-size: 14px;
        font-weight: 700;
        padding: 9px 28px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        letter-spacing: 1px;
        transition: filter 0.15s;
    }
    .br-btn:hover { filter: brightness(1.2); }
    .br-btn-continue {
        background: linear-gradient(135deg,#ffb833,#c87000);
        color: #1a0a00;
    }
    .br-btn-quit {
        background: rgba(180,40,20,0.7);
        color: #fff;
        border: 1px solid rgba(200,60,40,0.5);
    }
</style>
