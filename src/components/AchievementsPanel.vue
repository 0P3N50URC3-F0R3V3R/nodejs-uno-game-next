<template>
    <div class="ach-outer" :class="{ open: open }" :style="{ zIndex: panelZ }">
        <div class="ach-panel">
            <div class="ach-fixed">
                <div class="ach-header">
                    {{ t('achievements_title') }}
                    <span class="ach-ap-total">{{ apTotal }} AP</span>
                    <button class="panel-pin-btn" :class="{ pinned: pinned }" @click.stop="togglePin">📌</button>
                </div>

                <div class="ach-section">
                    <div class="ach-section-title">{{ t('daily_challenges') }} <span class="ach-countdown">{{ dailyCountdown }}</span></div>
                    <div v-for="(ch, i) in daily.challenges" :key="'d'+i" class="ach-challenge-row">
                        <div class="ach-ch-icon">{{ chIcon(ch.type) }}</div>
                        <div class="ach-ch-body">
                            <div class="ach-ch-label" :class="{ done: ch.completed }">{{ tch(ch) }}<span v-if="ch.completed" class="ach-check"> ✓</span></div>
                            <div v-if="!ch.completed" class="ach-pbar"><div class="ach-pfill" :style="{width: pct(ch.progress||0, ch.x)+'%'}"></div><span class="ach-plabel">{{ ch.progress||0 }}/{{ ch.x }}</span></div>
                            <div class="ach-xp">+{{ ch.xp }} XP</div>
                        </div>
                    </div>
                    <div v-if="!daily.challenges || !daily.challenges.length" class="ach-empty">Loading...</div>
                </div>

                <div class="ach-section">
                    <div class="ach-section-title">{{ t('weekly_challenges') }} <span class="ach-countdown">{{ weeklyCountdown }}</span></div>
                    <div v-for="(ch, i) in weekly.challenges" :key="'w'+i" class="ach-challenge-row">
                        <div class="ach-ch-icon">{{ chIcon(ch.type) }}</div>
                        <div class="ach-ch-body">
                            <div class="ach-ch-label" :class="{ done: ch.completed }">{{ tch(ch) }}<span v-if="ch.completed" class="ach-check"> ✓</span></div>
                            <div v-if="!ch.completed" class="ach-pbar"><div class="ach-pfill" :style="{width: pct(ch.progress||0, ch.x)+'%'}"></div><span class="ach-plabel">{{ ch.progress||0 }}/{{ ch.x }}</span></div>
                            <div class="ach-xp">+{{ ch.xp }} XP</div>
                        </div>
                    </div>
                    <div v-if="!weekly.challenges || !weekly.challenges.length" class="ach-empty">Loading...</div>
                </div>
            </div>

            <div class="ach-scroll">
                <div v-for="cat in CATS" :key="cat.k" class="ach-section">
                    <div class="ach-section-title" @click="toggleCat(cat.k)">
                        {{ t('cat_'+cat.k) }}
                        <span class="ach-cat-count">{{ catDone(cat.k) }}/{{ catTotal(cat.k) }}</span>
                        <span class="ach-arrow">{{ collapsed[cat.k] ? '▶' : '▼' }}</span>
                    </div>
                    <div v-if="!collapsed[cat.k]">
                        <div v-for="a in byCat(cat.k)" :key="a.id" class="ach-row" :class="{ unlocked: isUnlocked(a.id) }">
                            <img :src="'/client/img/achievements/'+a.image" class="ach-img" :alt="t('ach_'+a.id)" />
                            <div class="ach-info">
                                <div class="ach-name">{{ t('ach_'+a.id) }}</div>
                                <div class="ach-desc">{{ t('ach_'+a.id+'_desc') }}</div>
                                <div v-if="!isUnlocked(a.id) && a.threshold && (progress[a.id]||0) > 0" class="ach-pbar">
                                    <div class="ach-pfill" :style="{width: pct(progress[a.id]||0, a.threshold)+'%'}"></div>
                                    <span class="ach-plabel">{{ progress[a.id]||0 }}/{{ a.threshold }}</span>
                                </div>
                            </div>
                            <div class="ach-ap" :class="{ earned: isUnlocked(a.id) }">{{ a.ap }} AP</div>
                        </div>
                    </div>
                </div>

                <div class="ach-footer">{{ unlockedIds.length }}/{{ ACHIEVEMENTS.length }} · {{ apTotal }} AP total</div>
            </div>
        </div>
        <button class="ach-tab" @click="onTabClick" :title="t('tab_achievements')"><span>🏅</span></button>
    </div>
</template>

<script>
    import { registerPanel, unregisterPanel, bringToFront } from '../panelManager.js';
    import { ACHIEVEMENTS } from '../../node_src/achievements_data.js';
    import { sound } from '../sound.js';
    import { lang } from '../lang/index.js';

    const CATS = [
        { k:'beginner' }, { k:'advanced' },
        { k:'online'  }, { k:'vs_ai'    },
        { k:'longterm'},
    ];

    const CH_ICONS = {
        punish_players:   '💥', win_matches:      '🏆', win_rounds:       '⭐',
        lose_matches:     '💀', lose_rounds:      '😔', play_normal:      '🃏',
        change_colors:    '🎨', stack_plus2:      '➕', stack_plus4:      '⚡',
        play_plus2:       '➕', play_plus4:       '⚡', skip_uno:         '🔇',
        press_uno:        '🔴', host_games:       '🏠', join_games:       '🚪',
        take_punishment:  '😢', play_skip:        '⏭', play_reverse:     '🔄',
        stack_punishment: '📚', play_red:         '🔴', play_green:       '🟢',
        play_blue:        '🔵', play_yellow:      '🟡', play_0s:          '0️⃣',
        play_5s:          '5️⃣', play_9s:          '9️⃣', win_ai_only:      '🤖',
        play_action:      '⚡', press_uno_streak: '🎯', play_wild:        '🌈',
        win_hardcore_games: '🔥', play_hardcore_games: '🩸',
    };

    export default {
        name: 'AchievementsPanel',
        props: ['socket'],
        data: function() {
            var col = {};
            CATS.forEach(function(c) { col[c.k] = false; });
            return {
                open: false,
                pinned: localStorage.getItem('panel_pin_achievements') === 'true',
                panelZ: 300,
                CATS: CATS, ACHIEVEMENTS: ACHIEVEMENTS,
                unlockedIds: [], apTotal: 0, progress: {},
                daily:  { challenges: [], expiresAt: 0 },
                weekly: { challenges: [], expiresAt: 0 },
                collapsed: col,
                dailyCountdown: '', weeklyCountdown: '',
            };
        },
        mounted: function() {
            registerPanel('achievements', this);
            if (this.pinned) { this.open = true; this.panelZ = bringToFront(); }
            this._tick = setInterval(this.updateCountdowns, 1000);
            this.updateCountdowns();
            if (!this.socket) return;
            var self = this;
            this.socket.emit('requestAchievementsState', { authToken: localStorage.getItem('unoAuthToken') });
            this._achStateHandler = function(d) {
                self.unlockedIds = d.unlockedIds || [];
                self.apTotal     = d.apTotal || 0;
                self.progress    = d.progress || {};
                self.daily       = d.daily  || { challenges: [] };
                self.weekly      = d.weekly || { challenges: [] };
            };
            this._achUnlockedHandler = function(d) {
                if (!self.unlockedIds.includes(d.id)) self.unlockedIds.push(d.id);
                self.apTotal = d.newApTotal || self.apTotal;
            };
            this._chalProgressHandler = function(d) {
                var arr = d.type === 'weekly' ? self.weekly.challenges : self.daily.challenges;
                if (arr && arr[d.idx]) { arr[d.idx].progress = d.progress; arr[d.idx].completed = d.completed; }
                if (d.completed) sound.play('uno');
            };
            this._chalResetHandler = function(d) {
                if (d.type === 'daily') self.daily = { challenges: d.challenges, expiresAt: d.expiresAt };
                else self.weekly = { challenges: d.challenges, expiresAt: d.expiresAt };
            };
            this.socket.on('achievementsState', this._achStateHandler);
            this.socket.on('achievementUnlocked', this._achUnlockedHandler);
            this.socket.on('challengeProgress', this._chalProgressHandler);
            this.socket.on('challengesReset', this._chalResetHandler);
        },
        beforeDestroy: function() {
            unregisterPanel('achievements');
            clearInterval(this._tick);
            if (this.socket) {
                this.socket.removeListener('achievementsState', this._achStateHandler);
                this.socket.removeListener('achievementUnlocked', this._achUnlockedHandler);
                this.socket.removeListener('challengeProgress', this._chalProgressHandler);
                this.socket.removeListener('challengesReset', this._chalResetHandler);
            }
        },
        methods: {
            t: function(key, vars) { return lang.t(key, vars); },
            tch: function(ch) {
                var key = 'ch_' + ch.type;
                var translated = lang.t(key, { x: ch.x });
                return translated !== key ? translated : ch.label;
            },
            chIcon: function(type) { return CH_ICONS[type] || '📋'; },
            isUnlocked: function(id) { return this.unlockedIds.includes(id); },
            byCat: function(k) { return ACHIEVEMENTS.filter(function(a) { return a.category === k; }); },
            catDone: function(k) {
                var self = this;
                return ACHIEVEMENTS.filter(function(a) { return a.category === k && self.isUnlocked(a.id); }).length;
            },
            catTotal: function(k) { return ACHIEVEMENTS.filter(function(a) { return a.category === k; }).length; },
            pct: function(v, max) { return Math.min(100, max > 0 ? (v / max) * 100 : 0); },
            toggleCat: function(k) { this.$set(this.collapsed, k, !this.collapsed[k]); },
            updateCountdowns: function() {
                this.dailyCountdown  = this._fmt(this.daily.expiresAt);
                this.weeklyCountdown = this._fmt(this.weekly.expiresAt);
            },
            _fmt: function(ms) {
                if (!ms) return '';
                var diff = Math.max(0, ms - Date.now());
                var h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
                return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
            },
            onTabClick: function() {
                if (this.open) { this.open = false; this.pinned = false; localStorage.removeItem('panel_pin_achievements'); }
                else {
                    this.open = true; this.panelZ = bringToFront();
                    if (this.socket) this.socket.emit('requestAchievementsState', { authToken: localStorage.getItem('unoAuthToken') });
                }
            },
            togglePin: function() {
                if (this.pinned) { this.pinned = false; this.open = false; localStorage.removeItem('panel_pin_achievements'); }
                else { this.pinned = true; localStorage.setItem('panel_pin_achievements', 'true'); }
            },
        }
    }
</script>

<style scoped>
.ach-outer { position:fixed; top:62px; left:0; transform:translateX(-360px); transition:transform .25s ease; }
.ach-outer.open { transform:translateX(0); }
.ach-panel { width:360px; height:85vh; display:flex; flex-direction:column; background:rgba(0,0,0,.93); border:1px solid #9a6515; border-radius:0 6px 6px 0; overflow:hidden; }
.ach-fixed { flex-shrink:0; border-bottom:2px solid #3a2805; }
.ach-scroll { flex:1; min-height:0; overflow-y:auto; scrollbar-width:thin; scrollbar-color:#3a2805 transparent; }
.ach-scroll::-webkit-scrollbar { width:4px; } .ach-scroll::-webkit-scrollbar-thumb { background:#3a2805; border-radius:2px; }
@media (max-height:700px) {
    .ach-panel { height:auto; max-height:calc(100vh - 62px); overflow-y:auto; scrollbar-width:thin; scrollbar-color:#3a2805 transparent; }
    .ach-panel::-webkit-scrollbar { width:4px; } .ach-panel::-webkit-scrollbar-thumb { background:#3a2805; border-radius:2px; }
    .ach-scroll { flex:none; max-height:35vh; }
}
.ach-header { position:relative; padding:6px 10px; color:#d4cda4; font-weight:bold; font-size:17px; letter-spacing:2px; border-bottom:1px solid #3a2805; text-align:center; }
.ach-ap-total { color:#f5c542; font-size:16px; margin-left:8px; }
.panel-pin-btn { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; font-size:14px; opacity:.25; padding:2px; }
.panel-pin-btn:hover { opacity:.7; } .panel-pin-btn.pinned { opacity:1; }
.ach-section { border-bottom:1px solid #2a1a00; padding:2px 0; }
.ach-section-title { padding:5px 10px; color:#9a6515; font-size:15px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; cursor:pointer; display:flex; align-items:center; gap:4px; }
.ach-countdown { color:#d4cda4; font-size:13px; margin-left:auto; font-weight:normal; letter-spacing:0; }
.ach-cat-count { color:#d4cda4; font-size:13px; margin-left:auto; font-weight:normal; }
.ach-arrow { font-size:12px; color:#6a5a3a; }
.ach-challenge-row { padding:2px 8px; display:flex; align-items:center; gap:5px; }
.ach-ch-icon { font-size:14px; flex-shrink:0; line-height:1; }
.ach-ch-body { flex:1; min-width:0; }
.ach-ch-label { color:#d4cda4; font-size:13px; line-height:1.1; }
.ach-ch-label.done { color:#5a9a5a; text-decoration:line-through; }
.ach-check { color:#5a9a5a; font-weight:bold; }
.ach-xp { color:#9a6515; font-size:11px; text-align:right; line-height:1; }
.ach-pbar { position:relative; height:8px; background:#1a1200; border-radius:4px; margin:1px 0; overflow:hidden; }
.ach-pfill { position:absolute; left:0; top:0; height:100%; background:#9a6515; border-radius:4px; transition:width .3s ease; }
.ach-plabel { position:absolute; right:4px; top:0; font-size:10px; color:#d4cda4; line-height:10px; }
.ach-row { display:flex; align-items:flex-start; gap:8px; padding:7px 10px; opacity:.4; border-bottom:1px solid #1a0f00; }
.ach-row.unlocked { opacity:1; }
.ach-img { width:44px; height:44px; flex-shrink:0; background:#2a1500; border-radius:4px; border:1px solid #3a2805; object-fit:cover; }
.ach-info { flex:1; min-width:0; }
.ach-name { color:#d4cda4; font-size:16px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ach-desc { color:#6a5a3a; font-size:14px; margin-top:2px; line-height:1.3; }
.ach-ap { flex-shrink:0; font-size:15px; color:#6a5a3a; font-weight:bold; white-space:nowrap; }
.ach-ap.earned { color:#f5c542; }
.ach-empty { color:#6a5a3a; font-size:15px; padding:6px 10px; font-style:italic; }
.ach-footer { padding:8px 10px; color:#9a6515; font-size:15px; text-align:center; border-top:1px solid #3a2805; }
.ach-tab { position:absolute; top:0; right:-36px; width:36px; height:48px; background:rgba(0,0,0,.92); border:1px solid #9a6515; border-left:none; border-radius:0 6px 6px 0; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:16px; }
.ach-tab:hover { background:rgba(40,20,0,.95); }
</style>
