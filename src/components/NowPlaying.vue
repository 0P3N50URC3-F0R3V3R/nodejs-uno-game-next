<template>
    <transition name="np-slide">
        <div class="now-playing" v-if="visible">
            <div class="np-label">♪ NOW PLAYING</div>
            <div class="np-title">{{ track }}</div>
        </div>
    </transition>
</template>

<script>
    import { soundState } from '../sound.js';

    export default {
        name: 'NowPlaying',
        data: function() {
            return { visible: false, track: '', _timer: null };
        },
        computed: {
            currentTrack: function() { return soundState.currentTrack; }
        },
        watch: {
            currentTrack: function(newVal) {
                if(!newVal || !soundState.nowPlayingEnabled) return;
                clearTimeout(this._timer);
                this.track = newVal;
                this.visible = true;
                let self = this;
                this._timer = setTimeout(function() { self.visible = false; }, 5000);
            }
        }
    }
</script>

<style scoped>
    .now-playing {
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 260px;
        background: linear-gradient(160deg, rgba(4,8,18,0.97) 0%, rgba(8,14,28,0.97) 100%);
        border: 1px solid rgba(80,140,255,0.4);
        border-radius: 10px;
        padding: 10px 14px 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.8), 0 0 16px rgba(80,140,255,0.15);
        z-index: 9998;
        pointer-events: none;
    }
    .np-label {
        color: rgba(80,160,255,0.8);
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        margin-bottom: 4px;
    }
    .np-title {
        color: #e0eaff;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: 0.3px;
    }

    .np-slide-enter-active { transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease; }
    .np-slide-leave-active { transition: transform 0.3s ease, opacity 0.3s ease; }
    .np-slide-enter { transform: translateX(40px); opacity: 0; }
    .np-slide-leave-to { transform: translateX(40px); opacity: 0; }
</style>
