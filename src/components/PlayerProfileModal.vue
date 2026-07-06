<template>
    <transition name="ppm-fade">
        <div v-if="username" class="ppm-backdrop" @click.self="$emit('close')">
            <div class="ppm-box">
                <video v-if="bgVideoSrc" class="ppm-bg" :src="bgVideoSrc" autoplay loop muted playsinline></video>
                <button class="ppm-close" @click="$emit('close')">✕</button>
                <div class="ppm-content">
                <div v-if="loading" class="ppm-loading">...</div>
                <template v-else-if="profile">
                    <div class="ppm-top">
                        <div class="ppm-avatar-wrap" :class="{ 'has-reticle': reticleSrc }">
                            <img class="ppm-avatar" :src="avatarSrc" @error="avatarFailed = true" />
                            <img v-if="reticleSrc" class="ppm-avatar-reticle" :src="reticleSrc" />
                        </div>
                        <div class="ppm-topinfo">
                            <div class="ppm-name" :class="nameEffectClass">{{ profile.username }}</div>
                            <div class="ppm-level">{{ t('stat_level') }} {{ profile.level }}</div>
                            <div class="ppm-xpbar-wrap">
                                <div class="ppm-xpbar-fill" :style="{ width: xpPct + '%' }"></div>
                            </div>
                            <div class="ppm-xpinfo">{{ xpInLevel }} / {{ xpToNext }} XP</div>
                        </div>
                    </div>
                    <div v-if="profile.bio" class="ppm-bio">{{ profile.bio }}</div>
                    <div class="ppm-stats">
                        <div class="ppm-stat">
                            <span class="ppm-stat-v">{{ profile.matches_won }}</span>
                            <span class="ppm-stat-l">{{ t('stat_wins') }}</span>
                        </div>
                        <div class="ppm-stat">
                            <span class="ppm-stat-v">{{ profile.matches_lost }}</span>
                            <span class="ppm-stat-l">{{ t('stat_losses') }}</span>
                        </div>
                        <div class="ppm-stat">
                            <span class="ppm-stat-v">{{ formatTime(profile.played_time_seconds) }}</span>
                            <span class="ppm-stat-l">{{ t('stat_time') }}</span>
                        </div>
                        <div class="ppm-stat">
                            <span class="ppm-stat-v">{{ profile.ap_total }}</span>
                            <span class="ppm-stat-l">{{ t('stat_ap') }}</span>
                        </div>
                        <div class="ppm-stat">
                            <span class="ppm-stat-v">{{ profile.achievements_count }}/{{ ACHIEVEMENTS.length }}</span>
                            <span class="ppm-stat-l">{{ t('achievements_title') }}</span>
                        </div>
                    </div>
                    <div class="ppm-actions" v-if="friendStatus !== 'self'">
                        <button class="ppm-action-btn"
                            :disabled="friendStatus !== 'none'"
                            @click="addFriend">
                            {{ friendStatus === 'friends' ? t('already_friends') : friendStatus === 'pending' ? t('request_sent') : t('add_friend') }}
                        </button>
                    </div>
                    <div class="ppm-ach-title">{{ t('achievements_title') }}</div>
                    <div class="ppm-ach-grid">
                        <div v-for="a in ACHIEVEMENTS" :key="a.id"
                             class="ppm-ach-item"
                             :class="{ unlocked: isUnlocked(a.id) }"
                             :title="t('ach_' + a.id) + '\n' + t('ach_' + a.id + '_desc')">
                            <img :src="'/client/img/achievements/' + a.image" class="ppm-ach-img" />
                        </div>
                    </div>
                    <template v-if="profile.id === myUserId">
                        <div class="ppm-ach-title">{{ t('friends') }}</div>
                        <div v-if="friendList.length === 0" class="ppm-loading">{{ t('no_friends_yet') }}</div>
                        <div v-for="f in friendList" :key="f.id" class="ppm-friend-row">
                            <span class="fp-online-dot" :class="{ online: f.online }"></span>
                            <img class="ppm-friend-avatar" :src="f.avatar" @error="$event.target.src='/img/default.png'" />
                            <span class="ppm-friend-name">{{ f.username }}</span>
                            <button class="fp-btn" @click="$emit('openDm', f.id, f.username)">{{ t('message') }}</button>
                        </div>
                    </template>
                </template>
                <div v-else class="ppm-loading">{{ t('player_not_found') }}</div>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
    import { ACHIEVEMENTS } from '../../node_src/achievements_data.js';
    import { lang } from '../lang/index.js';

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
        name: 'PlayerProfileModal',
        props: {
            username: { type: String, default: null },
            myUserId: { type: Number, default: 0 },
            friendList: { type: Array, default: () => [] },
            authToken: { type: String, default: '' }
        },
        data() { return { profile: null, loading: false, avatarFailed: false, ACHIEVEMENTS, requestSent: false }; },
        computed: {
            avatarSrc() {
                if (this.avatarFailed || !this.profile) return '/img/default.png';
                return this.profile.avatar || '/img/default.png';
            },
            reticleSrc() { return this.profile && this.profile.reticle ? this.profile.reticle : null; },
            xpInfo() { return this.profile ? levelFromXp(this.profile.xp) : null; },
            xpInLevel() { return this.xpInfo ? this.xpInfo.xpInLevel : 0; },
            xpToNext() { return this.xpInfo ? this.xpInfo.xpToNext : 100; },
            xpPct() { return this.xpToNext ? Math.round(this.xpInLevel / this.xpToNext * 100) : 0; },
            friendStatus() {
                if (!this.profile || this.profile.id === this.myUserId) return 'self';
                const f = this.friendList.find(f => f.id === this.profile.id);
                return f ? 'friends' : (this.requestSent ? 'pending' : 'none');
            },
            bgVideoSrc() { return this.profile && this.profile.bgProfile ? this.profile.bgProfile : null; },
            nameEffectClass() {
                if (!this.profile || !this.profile.nameEffect) return '';
                try { return JSON.parse(this.profile.nameEffect.meta || '{}').cssClass || ''; } catch(e) { return ''; }
            }
        },
        watch: {
            username(val) {
                this.profile = null;
                this.avatarFailed = false;
                this.requestSent = false;
                if (!val) return;
                this.loading = true;
                fetch('/api/player-stats/' + encodeURIComponent(val))
                    .then(r => r.json())
                    .then(data => { if (data && !data.error) this.profile = data; this.loading = false; })
                    .catch(() => { this.loading = false; });
            }
        },
        methods: {
            t(key) { return lang.t(key); },
            isUnlocked(id) { return !!(this.profile && this.profile.unlocked_ids && this.profile.unlocked_ids.includes(id)); },
            formatTime(secs) {
                if (!secs) return '0m';
                let h = Math.floor(secs / 3600);
                let m = Math.floor((secs % 3600) / 60);
                return h ? (h + 'h ' + m + 'm') : (m + 'm');
            },
            addFriend() {
                fetch('/api/friends/request/' + this.profile.id, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('unoAuthToken') }
                }).then(r => r.json()).then(res => { if (res.ok) this.requestSent = true; });
            }
        }
    };
</script>

<style scoped>
    .ppm-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .ppm-box {
        position: relative;
        background: linear-gradient(160deg, rgba(6,16,6,0.99) 0%, rgba(14,28,14,0.99) 100%);
        border: 1px solid #9a6515;
        border-radius: 10px;
        width: 460px;
        max-width: 95vw;
        max-height: 88vh;
        overflow: hidden;
        box-shadow: 0 8px 40px rgba(0,0,0,0.9);
    }
    .ppm-bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.18;
        pointer-events: none;
        z-index: 0;
        border-radius: 10px;
    }
    .ppm-content {
        position: relative;
        z-index: 1;
        padding: 20px;
        max-height: 88vh;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #3a2805 transparent;
    }
    .ppm-close {
        position: absolute;
        top: 10px;
        right: 12px;
        background: transparent;
        border: none;
        color: #6a5a3a;
        font-size: 16px;
        cursor: pointer;
        line-height: 1;
        z-index: 2;
    }
    .ppm-close:hover { color: #d4cda4; }
    .ppm-loading {
        text-align: center;
        color: #6a5a3a;
        font-size: 13px;
        padding: 30px 0;
        letter-spacing: 2px;
    }
    .ppm-top {
        display: flex;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 16px;
    }
    .ppm-avatar-wrap {
        position: relative;
        flex-shrink: 0;
        width: 72px;
        height: 72px;
        border: 2px solid rgba(154,101,21,0.55);
    }
    .ppm-avatar-wrap.has-reticle { border-color: transparent; }
    .ppm-bio {
        color: #9a8a6a;
        font-size: 11px;
        font-style: italic;
        margin: -8px 0 8px;
        line-height: 1.5;
        border-left: 2px solid #3a2805;
        padding-left: 8px;
    }
    .ppm-avatar {
        width: 100%;
        height: 100%;
        border-radius: 0;
        object-fit: cover;
        display: block;
    }
    .ppm-avatar-reticle {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;
    }
    .ppm-topinfo { flex: 1; min-width: 0; }
    .ppm-name {
        color: #fccd4d;
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 2px;
    }
    .ppm-level {
        color: #9a8a6a;
        font-size: 12px;
        margin-bottom: 6px;
    }
    .ppm-xpbar-wrap {
        height: 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 3px;
    }
    .ppm-xpbar-fill {
        height: 100%;
        background: linear-gradient(90deg, #a07800, #ffdd00);
        border-radius: 3px;
        transition: width 0.5s ease;
    }
    .ppm-xpinfo { color: #6a5a3a; font-size: 10px; }
    .ppm-stats {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 16px;
        padding-bottom: 14px;
        border-bottom: 1px solid #2a1a00;
    }
    .ppm-stat {
        flex: 1;
        min-width: 60px;
        background: rgba(255,255,255,0.04);
        border: 1px solid #2a1a00;
        border-radius: 6px;
        padding: 6px 4px;
        text-align: center;
    }
    .ppm-stat-v { display: block; color: #d4cda4; font-size: 14px; font-weight: bold; }
    .ppm-stat-l { display: block; color: #6a5a3a; font-size: 9px; letter-spacing: 0.5px; margin-top: 2px; }
    .ppm-actions { padding: 8px 0; display: flex; gap: 8px; }
    .ppm-action-btn {
        background: transparent; border: 1px solid #9a6515; border-radius: 4px;
        color: #d4cda4; font-size: 11px; padding: 5px 10px; cursor: pointer;
    }
    .ppm-action-btn:hover { background: rgba(154,101,21,0.3); }
    .ppm-action-btn:disabled { opacity: 0.5; cursor: default; }
    .ppm-ach-title {
        color: #9a6515;
        font-size: 11px;
        font-weight: bold;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-bottom: 8px;
    }
    .ppm-ach-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .ppm-ach-item {
        width: 40px;
        height: 40px;
        border-radius: 4px;
        border: 1px solid #2a1500;
        background: #1a0f00;
        opacity: 0.25;
        overflow: hidden;
    }
    .ppm-ach-item.unlocked { opacity: 1; border-color: #9a6515; }
    .ppm-ach-img { width: 100%; height: 100%; object-fit: cover; }
    .ppm-friend-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
    .ppm-friend-avatar { width: 22px; height: 22px; border-radius: 0; object-fit: cover; }
    .ppm-friend-name { flex: 1; color: #d4cda4; font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
    .fp-online-dot { width: 7px; height: 7px; border-radius: 50%; background: #444; flex-shrink: 0; }
    .fp-online-dot.online { background: #4caf50; }
    .fp-btn {
        background: transparent; border: 1px solid #9a6515; border-radius: 3px;
        color: #d4cda4; font-size: 9px; padding: 2px 5px; cursor: pointer;
    }
    .fp-btn:hover { background: rgba(154,101,21,0.3); }
    .ppm-fade-enter-active, .ppm-fade-leave-active { transition: opacity 0.2s ease; }
    .ppm-fade-enter, .ppm-fade-leave-to { opacity: 0; }
    .ppm-name.name-fire { color: #ff6600; text-shadow: 0 0 8px #ff6600, 0 0 16px #ff3300; animation: ppmFireFlicker 1.2s ease-in-out infinite alternate; }
    .ppm-name.name-ice { color: #88ddff; text-shadow: 0 0 8px #88ddff, 0 0 16px #00aaff; animation: ppmIcePulse 2s ease-in-out infinite; }
    .ppm-name.name-gold { color: #f0c040; text-shadow: 0 0 8px #f0c040, 0 0 16px #cc8800; animation: ppmGoldShimmer 1.5s ease-in-out infinite; }
    .ppm-name.name-shadow { color: #9966cc; text-shadow: 0 0 10px #9966cc, 0 0 20px #6600aa; animation: ppmShadowPulse 2s ease-in-out infinite; }
    .ppm-name.name-rainbow { animation: ppmRainbow 3s linear infinite; }
    .ppm-name.name-rainbow-sweep { background: linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff, #8800ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; background-size: 200% auto; animation: ppmRainbowSweep 2s linear infinite; }
    .ppm-name.name-bg-gradient { background: linear-gradient(135deg, #f0c040 0%, #ff8800 50%, #cc4400 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: ppmBgGradient 3s ease-in-out infinite; }
    .ppm-name.name-glitter { animation: ppmGlitter 0.8s steps(1) infinite; }
    .ppm-name.name-electric { color: #44ffff; text-shadow: 0 0 5px #44ffff, 0 0 10px #0088ff, 0 0 20px #0044ff; animation: ppmElectric 0.15s ease-in-out infinite alternate; }
    @keyframes ppmFireFlicker { from { text-shadow: 0 0 8px #ff6600, 0 0 16px #ff3300; } to { text-shadow: 0 0 14px #ffaa00, 0 0 28px #ff6600; } }
    @keyframes ppmIcePulse { 0%,100% { text-shadow: 0 0 8px #88ddff, 0 0 16px #00aaff; } 50% { text-shadow: 0 0 14px #ccf4ff, 0 0 28px #44ccff; } }
    @keyframes ppmGoldShimmer { 0%,100% { text-shadow: 0 0 8px #f0c040, 0 0 16px #cc8800; } 50% { text-shadow: 0 0 12px #ffe080, 0 0 24px #f0c040; } }
    @keyframes ppmShadowPulse { 0%,100% { text-shadow: 0 0 10px #9966cc, 0 0 20px #6600aa; } 50% { text-shadow: 0 0 16px #cc88ff, 0 0 32px #9966cc; } }
    @keyframes ppmRainbow { 0% { color: #ff0000; } 16% { color: #ff8800; } 33% { color: #ffff00; } 50% { color: #00ff00; } 66% { color: #0088ff; } 83% { color: #8800ff; } 100% { color: #ff0000; } }
    @keyframes ppmRainbowSweep { to { background-position: 200% center; } }
    @keyframes ppmBgGradient { 0%,100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(30deg); } }
    @keyframes ppmGlitter { 0% { color: #fff; } 25% { color: #ffff00; } 50% { color: #00ffff; } 75% { color: #ff88ff; } 100% { color: #fff; } }
    @keyframes ppmElectric { from { text-shadow: 0 0 5px #44ffff, 0 0 10px #0088ff; } to { text-shadow: 0 0 10px #88ffff, 0 0 20px #44aaff, 0 0 30px #0044ff; } }
</style>
