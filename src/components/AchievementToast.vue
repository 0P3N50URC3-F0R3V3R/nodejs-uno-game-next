<template>
    <transition name="toast-slide">
        <div v-if="current" class="ach-toast">
            <img :src="current.imagePath" class="ach-toast-img" />
            <div class="ach-toast-body">
                <div class="ach-toast-title">{{ t('achievement_unlocked') }}</div>
                <div class="ach-toast-name">{{ t('ach_' + current.id) }}</div>
                <div class="ach-toast-ap">+{{ current.ap }} AP</div>
            </div>
        </div>
    </transition>
</template>

<script>
    import { sound } from '../sound.js';
    import { lang } from '../lang/index.js';
    export default {
        name: 'AchievementToast',
        props: ['socket'],
        data() { return { queue: [], current: null }; },
        mounted() {
            if (!this.socket) return;
            const self = this;
            this._unlockHandler = function(d) {
                self.queue.push(d);
                if (!self.current) self._next();
            };
            this.socket.on('achievementUnlocked', this._unlockHandler);
        },
        beforeDestroy() {
            clearTimeout(this._t);
            if (this.socket && this._unlockHandler) this.socket.removeListener('achievementUnlocked', this._unlockHandler);
        },
        methods: {
            t: function(key) { return lang.t(key); },
            _next() {
                if (!this.queue.length) { this.current = null; return; }
                this.current = this.queue.shift();
                sound.play('uno');
                clearTimeout(this._t);
                this._t = setTimeout(() => {
                    this.current = null;
                    setTimeout(() => this._next(), 350);
                }, 3000);
            }
        }
    }
</script>

<style scoped>
.ach-toast { position:fixed; top:16px; right:16px; z-index:9000; display:flex; align-items:center; gap:10px; background:rgba(0,0,0,.93); border:1px solid #9a6515; border-radius:8px; padding:10px 14px; min-width:220px; max-width:300px; box-shadow:0 4px 20px rgba(0,0,0,.6); }
.ach-toast-img { width:48px; height:48px; flex-shrink:0; background:#2a1500; border-radius:6px; border:1px solid #3a2805; object-fit:cover; }
.ach-toast-body { min-width:0; }
.ach-toast-title { color:#9a6515; font-size:9px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; }
.ach-toast-name { color:#d4cda4; font-size:12px; font-weight:bold; margin-top:2px; }
.ach-toast-ap { color:#f5c542; font-size:10px; margin-top:2px; }
.toast-slide-enter-active, .toast-slide-leave-active { transition:all .3s ease; }
.toast-slide-enter, .toast-slide-leave-to { transform:translateX(120%); opacity:0; }
</style>
