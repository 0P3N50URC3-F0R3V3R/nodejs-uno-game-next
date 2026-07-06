<template>
    <transition name="xp-slide">
        <div class="xp-screen" v-if="visible" :class="{'xp-screen-winner': xpData && xpData.isWinner}">
            <div class="xp-title">
                <span v-if="displayLevelUp">{{ t('level_up') }}</span>
                <span v-else-if="xpData && xpData.isWinner">{{ t('xp_winner') }}</span>
                <span v-else-if="xpData && xpData.reason === 'challenge'">{{ t('challenge_done') }}</span>
                <span v-else-if="xpData && xpData.reason === 'achievement'">{{ t('achievement_unlocked') }}</span>
                <span v-else>{{ t('round_over') }}</span>
            </div>
            <div class="xp-gain">+{{ displayGain }} XP</div>
            <div class="xp-bar-wrap">
                <div class="xp-bar-fill" :style="{width: barPct + '%', transition: barNoTransition ? 'none' : ('width ' + barTransitionMs + 'ms cubic-bezier(0.22,1,0.36,1)')}"></div>
            </div>
            <div class="xp-info">
                <span v-if="displayLevelUp">{{ t('now_level', { n: xpData.level }) }}</span>
                <span v-else>{{ t('xp_level_info', { level: xpData ? xpData.level : 1, cur: levelXp, max: xpPerLevel }) }}</span>
            </div>
        </div>
    </transition>
</template>

<script>
    import { lang } from '../lang/index.js';

    // must match computeXpInfo() in node_src/UserDB.js
    function xpForLevel(level) {
        return Math.floor(100 * Math.pow(1.035, Math.min(level, 120) - 1));
    }
    function levelFromXp(totalXp) {
        totalXp = Math.max(0, totalXp || 0);
        let level = 1, remaining = totalXp;
        while (remaining >= xpForLevel(level)) { remaining -= xpForLevel(level); level++; }
        return { level, xpInLevel: remaining, xpToNext: xpForLevel(level) };
    }

    export default {
        name: 'XPScreen',
        props: ['xpData'],
        data: function() {
            return {
                visible: false,
                barPct: 0,
                barNoTransition: false,
                barTransitionMs: 1600,
                displayGain: 0,
                displayLevelUp: false,
                _dismissTimer: null,
                _countTimer: null,
                _stepTimer: null
            };
        },
        methods: {
            t: function(key, vars) { return lang.t(key, vars); }
        },
        computed: {
            levelXp: function() {
                if(!this.xpData) return 0;
                return levelFromXp(this.xpData.xp).xpInLevel;
            },
            xpPerLevel: function() {
                if(!this.xpData) return 100;
                return levelFromXp(this.xpData.xp).xpToNext;
            }
        },
        watch: {
            xpData: function(newVal) {
                if(!newVal) return;
                clearTimeout(this._dismissTimer);
                clearTimeout(this._stepTimer);
                clearInterval(this._countTimer);

                let prevXp = newVal.xp - newVal.gain;
                let gain = newVal.gain;

                // Build animation steps — each step fills bar from s% to e%, lu=true means level boundary crossed
                let steps = [];
                let xp = prevXp;
                let rem = gain;
                while (rem > 0) {
                    let info = levelFromXp(xp);
                    let inLevel = info.xpInLevel;
                    let capacity = info.xpToNext;
                    let toNext = capacity - inLevel;
                    if (rem >= toNext) {
                        steps.push({ s: inLevel / capacity * 100, e: 100, lu: true });
                        xp += toNext;
                        rem -= toNext;
                    } else {
                        let endIn = inLevel + rem;
                        steps.push({ s: inLevel / capacity * 100, e: endIn / capacity * 100, lu: false });
                        rem = 0;
                    }
                }

                this.displayGain = 0;
                this.displayLevelUp = false;
                this.visible = true;
                this.barNoTransition = true;
                this.barPct = 0;

                let self = this;
                let totalDuration = Math.min(2000, 600 + gain * 3);
                let stepIdx = 0;
                let isFast = steps.length > 3;
                let fillMs       = isFast ? 300  : 1600;
                let flashDelay   = isFast ? 350  : 1700;
                let flashHold    = isFast ? 300  : 750;
                let stepGap      = isFast ? 80   : 200;
                self.barTransitionMs = fillMs;

                function runStep() {
                    if (stepIdx >= steps.length) return;
                    let step = steps[stepIdx++];
                    self.barNoTransition = true;
                    self.barPct = step.s;
                    self.displayLevelUp = false;
                    self._stepTimer = setTimeout(function() {
                        self.barNoTransition = false;
                        self._stepTimer = setTimeout(function() {
                            self.barPct = step.e;
                            if (step.lu) {
                                self._stepTimer = setTimeout(function() {
                                    self.displayLevelUp = true;
                                    self._stepTimer = setTimeout(function() {
                                        self.barNoTransition = true;
                                        self.barPct = 0;
                                        self.displayLevelUp = false;
                                        self._stepTimer = setTimeout(runStep, stepGap);
                                    }, flashHold);
                                }, flashDelay);
                            }
                        }, 32);
                    }, stepIdx === 1 ? 150 : (isFast ? 30 : 60));
                }

                // XP counter runs independently across all steps
                let countStart = Date.now() + 100;
                self._countTimer = setInterval(function() {
                    let elapsed = Date.now() - countStart;
                    if (elapsed < 0) return;
                    let t = Math.min(elapsed / totalDuration, 1);
                    t = 1 - Math.pow(1 - t, 3);
                    self.displayGain = Math.round(gain * t);
                    if (t >= 1) { clearInterval(self._countTimer); self.displayGain = gain; }
                }, 16);

                runStep();

                let levelUps = steps.filter(function(s) { return s.lu; }).length;
                let dismissMs = isFast
                    ? 2000 + levelUps * 800
                    : 5000 + levelUps * 2500;
                this._dismissTimer = setTimeout(function() { self.visible = false; }, dismissMs);
            }
        }
    }
</script>

<style scoped>
    .xp-screen {
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 240px;
        background: linear-gradient(160deg, rgba(6,16,6,0.98) 0%, rgba(14,28,14,0.98) 100%);
        border: 1px solid rgba(109,232,109,0.5);
        border-radius: 10px;
        padding: 14px 16px 12px;
        box-shadow: 0 6px 28px rgba(0,0,0,0.8), 0 0 20px rgba(109,232,109,0.2);
        z-index: 9999;
        pointer-events: none;
    }
    .xp-screen-winner {
        border-color: rgba(255,221,0,0.6);
        background: linear-gradient(160deg, rgba(18,14,2,0.98) 0%, rgba(30,24,4,0.98) 100%);
        box-shadow: 0 6px 28px rgba(0,0,0,0.8), 0 0 24px rgba(255,221,0,0.25);
    }
    .xp-title {
        color: #6de86d;
        font-size: 11px;
        font-weight: bold;
        letter-spacing: 3px;
        text-transform: uppercase;
        margin-bottom: 6px;
    }
    .xp-screen-winner .xp-title {
        color: #ffdd00;
        font-size: 13px;
        text-shadow: 0 0 12px rgba(255,221,0,0.6);
    }
    .xp-gain {
        color: #ffffff;
        font-size: 26px;
        font-weight: 900;
        letter-spacing: 1px;
        text-shadow: 0 0 12px rgba(109,232,109,0.5);
        margin-bottom: 10px;
        font-variant-numeric: tabular-nums;
    }
    .xp-screen-winner .xp-gain {
        color: #ffdd00;
        text-shadow: 0 0 14px rgba(255,221,0,0.5);
    }
    .xp-bar-wrap {
        height: 7px;
        background: rgba(255,255,255,0.08);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 7px;
    }
    .xp-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #2a8f2a, #6de86d);
        border-radius: 4px;

        box-shadow: 0 0 8px rgba(109,232,109,0.6);
    }
    .xp-screen-winner .xp-bar-fill {
        background: linear-gradient(90deg, #a07800, #ffdd00);
        box-shadow: 0 0 8px rgba(255,221,0,0.6);
    }
    .xp-info {
        color: rgba(212,205,164,0.6);
        font-size: 10px;
        font-weight: bold;
        letter-spacing: 0.5px;
    }

    .xp-slide-enter-active { transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease; }
    .xp-slide-leave-active { transition: transform 0.35s ease, opacity 0.35s ease; }
    .xp-slide-enter { transform: translateX(40px); opacity: 0; }
    .xp-slide-leave-to { transform: translateX(40px); opacity: 0; }
</style>
