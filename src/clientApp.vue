<template>
    <div>
        <UnoGame :socket="socket"></UnoGame>

        <transition name="server-down-fade">
            <div v-if="kickedMsg" class="server-down-overlay" style="pointer-events:all">
                <div class="server-down-box">
                    <div class="server-down-icon">🔒</div>
                    <div class="server-down-title">LOGGED IN ELSEWHERE</div>
                    <div class="server-down-msg">This account was opened on another device. Refresh to reconnect.</div>
                    <button @click="location.reload()" style="margin-top:16px;padding:8px 24px;background:#9a6515;border:none;border-radius:6px;color:#fff;font-size:13px;cursor:pointer;letter-spacing:1px;">REFRESH</button>
                </div>
            </div>
        </transition>

        <transition name="server-down-fade">
            <div v-if="serverDown" class="server-down-overlay">
                <div class="server-down-box">
                    <div class="server-down-icon">⚡</div>
                    <div class="server-down-title">DISCONNECTED</div>
                    <div class="server-down-msg">Connection to server lost. Reconnecting...</div>
                </div>
            </div>
        </transition>

        <div v-if="!unlocked" class="intro-overlay" @click="startAudio">
            <div class="intro-inner">
                <img class="intro-logo-img" src="../public/img/logo.png" alt="UNO"/>
                <div class="intro-sub">{{ t('click_to_start') }}</div>
            </div>
            <div class="intro-version">unoweb v{{ version }}</div>
        </div>
    </div>
</template>

<script>

    import socket from 'socket.io-client'
    import UnoGame from "./UnoGame"
    import { sound, soundState } from './sound.js'
    import { lang } from './lang/index.js'
    import { version } from '../package.json'

    export default {
        name: "clientApp",
        data: function() {
            return {
                version: version,
                socket: socket("http://" + window.location.hostname + ":" + window.location.port),
                unlocked: false,
                serverDown: false,
                kickedMsg: false,
                _pingTimer: null,
            }
        },
        components: {
            UnoGame
        },
        methods: {
            t(key) { return lang.t(key); },
            startAudio: function () {
                sound.unlock();
                this.unlocked = true;
            },
            applyScale: function() {
                var REF_W = 1300, REF_H = 870;
                var el = this.$el;
                // touch-primary devices (phones/tablets): native Config.js layout
                if (window.matchMedia('(pointer: coarse) and (hover: none)').matches) {
                    el.style.width = '';
                    el.style.transform = '';
                    return;
                }
                var scale = Math.min(window.innerWidth / REF_W, window.innerHeight / REF_H, 1);
                if (scale < 1) {
                    el.style.width = REF_W + 'px';
                    el.style.transformOrigin = 'top left';
                    el.style.transform = 'scale(' + scale + ')';
                } else {
                    el.style.width = '';
                    el.style.transform = '';
                }
            }
        },
        created: function () {
            sound.init();
        },
        mounted: function() {
            let self = this;
            this.socket.on('disconnect', function() { self.serverDown = true; });
            this.socket.on('connect', function() { self.serverDown = false; });
            this.socket.on('kicked', function(d) {
                if (d && d.reason === 'duplicate_session') {
                    self.kickedMsg = true;
                }
            });
            this._pingTimer = setInterval(function() {
                fetch('/api/ping', { signal: AbortSignal.timeout(5000) })
                    .then(function(r) { if (r.ok) self.serverDown = false; })
                    .catch(function() { self.serverDown = true; });
            }, 15000);
            this._scaleHandler = this.applyScale.bind(this);
            window.addEventListener('resize', this._scaleHandler);
            this.applyScale();
        },
        beforeDestroy: function() {
            if (this._pingTimer) clearInterval(this._pingTimer);
            window.removeEventListener('resize', this._scaleHandler);
        }
    }
</script>

<style scoped>
    .server-down-overlay {
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        z-index: 99999;
        background: rgba(0,0,0,0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    }
    .server-down-box {
        background: linear-gradient(160deg, rgba(30,5,5,0.98), rgba(50,10,10,0.98));
        border: 2px solid rgba(220,50,50,0.7);
        border-radius: 12px;
        padding: 28px 40px;
        text-align: center;
        box-shadow: 0 0 40px rgba(220,50,50,0.3), 0 8px 32px rgba(0,0,0,0.8);
    }
    .server-down-icon {
        font-size: 36px;
        margin-bottom: 8px;
        animation: sd-pulse 1.2s ease-in-out infinite;
    }
    .server-down-title {
        color: #ff4444;
        font-size: 18px;
        font-weight: bold;
        letter-spacing: 4px;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        margin-bottom: 8px;
    }
    .server-down-msg {
        color: rgba(212,205,164,0.7);
        font-size: 12px;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        letter-spacing: 1px;
    }
    @keyframes sd-pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
    .server-down-fade-enter-active { transition: opacity 0.3s ease; }
    .server-down-fade-leave-active { transition: opacity 0.5s ease; }
    .server-down-fade-enter, .server-down-fade-leave-to { opacity: 0; }

    .intro-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 9999;
        background: radial-gradient(ellipse at center, #1a0a00 0%, #0a0008 60%, #000 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    .intro-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        pointer-events: none;
    }

    .intro-logo-img {
        max-width: 360px;
        width: 80vw;
        animation: logo-in 0.9s cubic-bezier(0.2, 1.2, 0.4, 1) 0.2s both;
    }

    @keyframes logo-in {
        0%   { opacity: 0; transform: scale(0.7); }
        100% { opacity: 1; transform: scale(1);   }
    }

    .intro-sub {
        color: rgba(255,255,255,0.75);
        font-size: 18px;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        letter-spacing: 3px;
        text-transform: uppercase;
        animation: pulse-sub 1.4s ease-in-out infinite 1.2s both;
    }

    @keyframes pulse-sub {
        0%, 100% { opacity: 0.5; }
        50%       { opacity: 1;   }
    }

    .intro-version {
        position: absolute;
        bottom: 18px;
        right: 22px;
        color: rgba(255,255,255,0.25);
        font-size: 11px;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        letter-spacing: 1.5px;
        pointer-events: none;
    }
</style>

<style>
    .fp-btn, .pp-action-btn, .psearch-action-btn, .ppm-action-btn,
    .store-btn, .store-action-btn, .panel-tab-btn, .game-action-btn {
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        min-width: 0 !important;
    }
    body {
        background-color: #1b1b21;
        background-image: url('../public/img/page_bg.png');
        background-size: cover;
        background-position: top center;
        background-attachment: fixed;
        background-repeat: no-repeat;
        margin: 0 auto;
        width: 100%;
        font: 12px normal Verdana, Arial, Helvetica, sans-serif;
        user-select: none;
        overflow: hidden;
    }
    a{
        text-decoration:none;
        color:inherit;
    }

</style>
