<template>
    <div class="sound-outer" :class="{ open: open }" :style="{ zIndex: panelZ }">
        <div class="sound-panel">
            <div class="sound-header">
                {{ t('sound') }}
                <button class="panel-pin-btn" :class="{ pinned: pinned }" @click.stop="togglePin" :title="pinned ? 'Unpin' : 'Pin'">📌</button>
            </div>

            <div class="sound-row">
                <span class="sound-label">{{ t('music') }}</span>
                <input type="range" min="0" max="100" class="sound-slider"
                    :value="musicPct" @input="onMusic" />
                <span class="sound-val">{{ musicPct }}</span>
            </div>

            <div class="sound-row">
                <span class="sound-label">{{ t('sfx') }}</span>
                <input type="range" min="0" max="100" class="sound-slider"
                    :value="sfxPct" @input="onSfx" />
                <span class="sound-val">{{ sfxPct }}</span>
            </div>

            <div class="sound-btns">
                <button class="sound-btn" :class="{ muted: musicPaused }" @click="sound.toggleMusic()">
                    {{ musicPaused ? t('music_play') : t('music_pause') }}
                </button>
                <button class="sound-btn" :class="{ muted: sfxMuted }" @click="sound.toggleSfx()">
                    {{ sfxMuted ? t('sfx_off') : t('sfx_on') }}
                </button>
            </div>

            <div class="sound-track-list">
                <div v-for="(name, i) in trackNames" :key="i"
                     class="track-item"
                     :class="{ 'track-active': i === currentTrackIndex }"
                     @click="onTrackSelect(i)">
                    {{ name }}
                </div>
            </div>

            <div class="sound-track" v-if="currentTrack">♪ {{ currentTrack }}</div>

            <div class="sound-toggle-row">
                <label class="sound-toggle">
                    <input type="checkbox" :checked="nowPlayingEnabled" @change="sound.toggleNowPlaying()" />
                    <span>{{ t('now_playing_toast') }}</span>
                </label>
            </div>

            <div class="sound-toggle-row">
                <label class="sound-toggle">
                    <input type="checkbox" :checked="yourTurnEnabled" @change="sound.toggleYourTurn()" />
                    <span>{{ t('turn_chime') }}</span>
                </label>
            </div>
        </div>
        <button class="sound-tab" @click="onTabClick" :title="t('tab_music')">
            <span class="sound-tab-icon">🎵</span>
        </button>
    </div>
</template>

<script>
    import { sound, soundState } from '../sound.js';
    import { lang } from '../lang/index.js';
    import { registerPanel, unregisterPanel, bringToFront } from '../panelManager.js';

    export default {
        name: 'SoundPanel',
        props: ['socket'],
        data: function () {
            let pinned = localStorage.getItem('panel_pin_sound') === 'true';
            return { open: pinned, pinned: pinned, panelZ: 300, sound: sound };
        },
        mounted: function() {
            registerPanel('sound', this);
            if (this.open) this.panelZ = bringToFront();
        },
        beforeDestroy: function() { unregisterPanel('sound'); },
        computed: {
            trackNames:        function () { return soundState.trackNames; },
            musicPct:          function () { return Math.round(soundState.musicVolume * 100); },
            sfxPct:            function () { return Math.round(soundState.sfxVolume   * 100); },
            currentTrack:      function () { return soundState.currentTrack; },
            currentTrackIndex:  function () { return soundState.currentTrackIndex; },
            musicPaused:        function () { return soundState.musicPaused; },
            sfxMuted:           function () { return soundState.sfxMuted; },
            nowPlayingEnabled:  function () { return soundState.nowPlayingEnabled; },
            yourTurnEnabled:    function () { return soundState.yourTurnEnabled; },
        },
        methods: {
            t: function(key, vars) { return lang.t(key, vars); },
            onMusic:       function (e) { sound.setMusicVolume(parseInt(e.target.value) / 100); },
            onSfx:         function (e) { sound.setSfxVolume(  parseInt(e.target.value) / 100); },
            onTrackSelect: function (i) {
                sound.playTrackByIndex(i);
                if (this.socket) this.socket.emit('jukeboxChange');
            },
            onTabClick: function() {
                if (this.open) {
                    this.open = false;
                    this.pinned = false;
                    localStorage.removeItem('panel_pin_sound');
                } else {
                    this.open = true;
                    this.panelZ = bringToFront();
                }
            },
            togglePin: function() {
                if (this.pinned) {
                    this.pinned = false;
                    this.open = false;
                    localStorage.removeItem('panel_pin_sound');
                } else {
                    this.pinned = true;
                    localStorage.setItem('panel_pin_sound', 'true');
                }
            },
        },
    }
</script>

<style scoped>
    .sound-outer {
        position: fixed;
        top: 114px;
        left: 0;
        transform: translateX(-260px);
        transition: transform 0.25s ease;
    }
    .sound-outer.open {
        transform: translateX(0);
    }

    .sound-panel {
        width: 260px;
        background: rgba(0, 0, 0, 0.92);
        border: 1px solid #9a6515;
        border-radius: 0 6px 6px 0;
        display: flex;
        flex-direction: column;
        padding-bottom: 8px;
    }

    .sound-header {
        position: relative;
        padding: 5px 10px;
        color: #d4cda4;
        font-weight: bold;
        font-size: 11px;
        letter-spacing: 2px;
        border-bottom: 1px solid #3a2805;
        text-align: center;
        flex-shrink: 0;
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

    .sound-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 10px 4px;
    }

    .sound-label {
        color: #d4cda4;
        font-size: 11px;
        width: 54px;
        flex-shrink: 0;
    }

    .sound-slider {
        flex: 1;
        accent-color: #9a6515;
        cursor: pointer;
        height: 4px;
        min-width: 0;
    }

    .sound-val {
        color: #9a6515;
        font-size: 10px;
        width: 22px;
        text-align: right;
        flex-shrink: 0;
    }

    .sound-btns {
        display: flex;
        gap: 6px;
        padding: 6px 10px 2px;
    }

    .sound-btn {
        flex: 1;
        background: rgba(154, 101, 21, 0.2);
        border: 1px solid #9a6515;
        border-radius: 4px;
        color: #d4cda4;
        font-size: 10px;
        padding: 4px 2px;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.15s;
    }
    .sound-btn:hover { background: rgba(154, 101, 21, 0.45); }
    .sound-btn.muted {
        background: rgba(80, 20, 20, 0.4);
        border-color: #7a3030;
        color: #a07070;
    }

    .sound-track-list {
        margin: 4px 10px 2px;
        border: 1px solid #3a2805;
        border-radius: 4px;
        background: rgba(255,255,255,0.03);
        max-height: 160px;
        overflow-y: auto;
    }
    .sound-track-list::-webkit-scrollbar { width: 4px; }
    .sound-track-list::-webkit-scrollbar-track { background: transparent; }
    .sound-track-list::-webkit-scrollbar-thumb { background: #3a2805; border-radius: 2px; }

    .track-item {
        padding: 4px 8px;
        font-size: 10px;
        color: #9a8a6a;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: background 0.1s;
    }
    .track-item:hover { background: rgba(154,101,21,0.15); color: #d4cda4; }
    .track-active { color: #fccd4d; background: rgba(154,101,21,0.1); }

    .sound-track {
        color: #6a5a3a;
        font-size: 9px;
        padding: 4px 10px 0;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-style: italic;
    }

    .sound-toggle-row {
        padding: 6px 10px 2px;
    }
    .sound-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        color: #9a8a6a;
        font-size: 10px;
        user-select: none;
    }
    .sound-toggle input { accent-color: #9a6515; cursor: pointer; }
    .sound-tab { position:absolute; top:0; right:-36px; width:36px; height:48px; background:rgba(0,0,0,.92); border:1px solid #9a6515; border-left:none; border-radius:0 6px 6px 0; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .sound-tab:hover { background: rgba(40, 20, 0, 0.95); }
    .sound-tab-icon { font-size: 16px; line-height: 1; }
</style>
