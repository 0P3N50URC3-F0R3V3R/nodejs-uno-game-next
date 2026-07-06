<template>
    <div class="name" :style="transform" :class="{'br-eliminated': client.brEliminated}">
        <div v-if="client.title" class="np-title" :style="titleStyle">{{ client.title.name }}</div>
        <div class="nameplate-row"
            @mouseenter="$emit('show-tooltip', { client: client, event: $event })"
            @mouseleave="$emit('hide-tooltip')"
            @click="!client.isAI && $emit('open-profile', client.name)"
            :style="{ cursor: client.isAI ? 'default' : 'pointer' }"
        >
            <div class="avatar-wrap">
                <img class="avatar-img" :class="{ 'has-reticle': client.reticle }" :src="avatarSrc" alt="" @error="onAvatarError" />
                <img v-if="client.reticle" class="avatar-reticle" :src="client.reticle" alt="" />
            </div>
            <div class="client-name" :class="[{active:client.turn}, nameEffectCls]" :style="nameStyle">
                <span>{{displayName}}</span>
            </div>
        </div>
        <div class="ai-badge" v-if="client.isAI">{{ difficultyLabel }}</div>
        <div v-if="client.brEliminated" class="br-rank-badge" :class="brRankClass">#{{ client.brRank }}</div>
        <div v-if="afkTimer && afkTimer.playerName === client.name" class="afk-bar-wrap">
            <div class="afk-bar-track">
                <div class="afk-bar-fill" :style="{
                    width: (afkTimer.remaining / afkTimer.duration * 100) + '%',
                    backgroundColor: afkTimer.remaining <= 10 ? '#e04040' : '#e09020'
                }"></div>
            </div>
        </div>
    </div>
</template>

<script>
    export default {
        name: "NamePlate",
        props: ['client', 'position', 'index', 'afkTimer'],
        data: function() { return { avatarFailed: false }; },
        computed:{
            transform:function(){
                return {
                    transform:'translate3d('+this.position.x+'px, '+this.position.y+'px, 300px)'
                };
            },
            displayName:function(){
                let prefix = this.index ? (this.index + '. ') : '';
                let name = this.client.name || '???';
                return prefix + name;
            },
            difficultyLabel:function(){
                let labels = { easy: 'EASY BOT', medium: 'MED BOT', hard: 'HARD BOT' };
                return labels[this.client.aiDifficulty] || 'BOT';
            },
            nameStyle:function(){
                let len = this.displayName.length;
                let size = len <= 7 ? 24 : len <= 9 ? 20 : len <= 12 ? 16 : len <= 16 ? 13 : 11;
                let style = { fontSize: size + 'px' };
                if (this.client.nameEffect) {
                    try {
                        let meta = JSON.parse(this.client.nameEffect.meta || '{}');
                        let effectColors = {
                            'name-fire':   { c: '#ff6600', s: '0 0 8px #ff3300, 0 0 16px #ff6600' },
                            'name-ice':    { c: '#66ddff', s: '0 0 8px #0099cc, 0 0 16px #66ddff' },
                            'name-gold':   { c: '#f0c040', s: '0 0 8px #c8a020, 0 0 16px #f0c040' },
                            'name-shadow': { c: '#cc0000', s: '0 0 6px #000, 2px 2px 4px #660000' }
                        };
                        let eff = meta.cssClass ? effectColors[meta.cssClass] : null;
                        if (eff) {
                            style.background = 'none';
                            style.webkitTextFillColor = eff.c;
                            style.textShadow = eff.s;
                        }
                    } catch(e) {}
                }
                return style;
            },
            titleStyle: function() {
                if (!this.client.title) return {};
                try {
                    let meta = JSON.parse(this.client.title.meta || '{}');
                    let s = {};
                    if (meta.color) { s.color = meta.color; s.textShadow = '0 0 6px ' + meta.color; }
                    return s;
                } catch(e) { return {}; }
            },
            nameEffectCls: function() {
                if (!this.client.nameEffect) return '';
                try {
                    let meta = JSON.parse(this.client.nameEffect.meta || '{}');
                    const map = {
                        'name-rainbow':       'np-name-rainbow',
                        'name-rainbow-sweep': 'np-name-rainbow-sweep',
                        'name-bg-gradient':   'np-name-bg-gradient',
                        'name-glitter':       'np-name-glitter',
                        'name-electric':      'np-name-electric',
                    };
                    return map[meta.cssClass] || '';
                } catch(e) { return ''; }
            },
            brRankClass: function() {
                let r = this.client.brRank;
                if(r === 1) return 'br-rank-gold';
                if(r === 2) return 'br-rank-silver';
                if(r === 3) return 'br-rank-bronze';
                return '';
            },
            avatarSrc: function() {
                if(this.avatarFailed) return '/img/default.png';
                if(this.client.isAI){
                    let d = (this.client.aiDifficulty || 'easy').charAt(0);
                    return '/img/AI_' + d + '.png';
                }
                return this.client.avatar || '/img/default.png';
            }
        },
        methods: {
            onAvatarError: function() { this.avatarFailed = true; }
        }
    }
</script>

<style scoped>
    .name{
        width:180px;
        height:45px;
        position:absolute;
        left:0;
        top:0;
    }
    .name.br-eliminated {
        opacity: 0.45;
        filter: grayscale(0.7);
    }
    .nameplate-row {
        display: flex;
        align-items: center;
        position: relative;
        left: -90px;
        width: 180px;
        height: 35px;
        gap: 5px;
    }
    .np-title {
        position: relative;
        left: -90px;
        width: 180px;
        text-align: center;
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 1px;
        line-height: 11px;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #f0c040;
        text-shadow: 0 0 6px #f0c040;
        margin-bottom: 1px;
    }
    .avatar-wrap {
        position: relative;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
    }
    .avatar-img {
        width: 30px;
        height: 30px;
        border-radius: 0;
        border: 1px solid rgba(255,222,65,0.4);
        object-fit: cover;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.9));
        opacity: 0.88;
    }
    .avatar-img.has-reticle { border-color: transparent; }
    .avatar-reticle {
        position: absolute;
        top: 0;
        left: 0;
        width: 30px;
        height: 30px;
        pointer-events: none;
        object-fit: contain;
    }
    .np-name-rainbow {
        background: none !important;
        -webkit-text-fill-color: unset !important;
        opacity: 1 !important;
        animation: np-rainbow 2s linear infinite !important;
    }
    @keyframes np-rainbow {
        0%   { color: #ff0000; } 17%  { color: #ff8800; } 33%  { color: #ffff00; }
        50%  { color: #00ff00; } 67%  { color: #0088ff; } 83%  { color: #8800ff; } 100% { color: #ff0000; }
    }
    .np-name-rainbow-sweep {
        background: linear-gradient(90deg,#ff0000,#ff8800,#ffff00,#00ff00,#0088ff,#8800ff,#ff0000) !important;
        background-size: 200% auto !important;
        -webkit-background-clip: text !important;
        background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        opacity: 1 !important;
        animation: np-rainbow-sweep 4s linear infinite !important;
    }
    @keyframes np-rainbow-sweep { from { background-position: 0% center; } to { background-position: 200% center; } }
    .np-name-bg-gradient {
        background: linear-gradient(180deg,#00ff88,#00ccff,#0055ff,#00ccff,#00ff88) !important;
        background-size: auto 400% !important;
        -webkit-background-clip: text !important;
        background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        opacity: 1 !important;
        animation: np-bg-gradient 3s ease-in-out infinite !important;
    }
    @keyframes np-bg-gradient { 0%,100% { background-position: 0% 0%; } 50% { background-position: 0% 100%; } }
    .np-name-glitter {
        background: none !important;
        -webkit-text-fill-color: #ffd700 !important;
        color: #ffd700 !important;
        opacity: 1 !important;
        animation: np-glitter 0.3s steps(1) infinite !important;
    }
    @keyframes np-glitter {
        0%  { text-shadow: 0 0 4px #fff, 2px -2px 6px #ffd700, -2px 2px 8px #ffaa00, 0 0 14px #ffc700; }
        25% { text-shadow: -1px 1px 6px #fff8c0, 1px -1px 4px #ffd700, 0 2px 8px #ffcc00, -2px 0 12px #ffb800; }
        50% { text-shadow: 2px 0 4px #fffde0, -1px -2px 8px #ffd700, 1px 1px 6px #ff9900, 0 -2px 14px #ffd700; }
        75% { text-shadow: 0 2px 6px #fff, -2px 1px 8px #ffcc00, 2px -1px 4px #ffd700, 1px 0 12px #ffaa00; }
    }
    .np-name-electric {
        background: none !important;
        -webkit-text-fill-color: #d0eeff !important;
        color: #d0eeff !important;
        opacity: 1 !important;
        animation: np-electric 0.12s steps(1) infinite !important;
    }
    @keyframes np-electric {
        0%  { text-shadow: 0 0 4px #fff, 0 0 8px #88ccff, 0 0 18px #0088ff, 0 0 32px #0044ff; }
        20% { text-shadow: 1px 0 3px #fff, -1px 0 10px #aaddff, 0 0 22px #0066ff, 3px 0 6px #0099ff, -3px 0 16px #0044ff; }
        40% { text-shadow: -1px 0 4px #fff, 0 0 8px #88ccff, 2px 0 14px #00aaff, 0 0 28px #0033ff; }
        60% { text-shadow: 0 0 6px #fffeff, 3px -1px 8px #aaddff, -2px 1px 20px #0077ff, 1px 0 10px #44aaff; }
        80% { text-shadow: -2px 0 4px #fff, 0 0 12px #88ddff, 1px 0 16px #0088ff, -1px 0 8px #0066ff; }
    }
    .client-name{
        flex: 1;
        height:35px;
        line-height:35px;
        text-align: center;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        font-size: 24px;
        letter-spacing: 0px;
        word-spacing: 0.2px;
        font-weight: 700;
        filter: drop-shadow(0px 5px 3px black);
        background: linear-gradient(to bottom, rgba(252,234,187,1) 0%, rgba(252,205,77,1) 61%, rgba(248,181,0,1) 62%, rgba(251,223,147,1) 100%);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        opacity: 0.6;
    }
    .client-name.active{
        opacity: 1;
        background:
            linear-gradient(180deg,
                rgba(255,248,160,0.34) 0%,
                rgba(255,215,55,0.09)  48%,
                rgba(155,75,0,0.22)    52%,
                rgba(255,188,30,0.07)  100%
            ),
            rgba(18, 10, 0, 0.80);
        background-clip: border-box;
        -webkit-background-clip: border-box;
        -webkit-text-fill-color: rgba(255, 242, 155, 1);
        border-radius: 22px;
        border: 1.5px solid rgba(255, 222, 65, 0.92);
        animation: turn-pulse 1.3s ease-in-out infinite;
    }
    .client-name span{
        line-height: 25px;
        padding-left: 6px;
        padding-right: 10px;
        border-bottom: none;
        display: block;
        overflow: hidden;
        white-space: nowrap;
    }
    .client-name.active span{
        background: none;
        border-bottom: none;
        line-height: 35px;
    }
    .ai-badge{
        position:relative;
        left:-55px;
        width:145px;
        text-align:center;
        font-size:9px;
        font-weight:bold;
        letter-spacing:2px;
        color:rgba(180,220,255,0.7);
        line-height:10px;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,80,180,0.6);
    }
    .br-rank-badge {
        position: relative;
        left: -55px;
        width: 145px;
        text-align: center;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 2px;
        color: rgba(255,255,255,0.7);
        line-height: 11px;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
    }
    .br-rank-gold   { color: #ffd700; text-shadow: 0 0 8px #ffd700; }
    .br-rank-silver { color: #c0c0c0; text-shadow: 0 0 6px #aaa; }
    .br-rank-bronze { color: #cd7f32; text-shadow: 0 0 6px #cd7f32; }
    .afk-bar-wrap {
        position: relative;
        left: -90px;
        width: 180px;
        padding: 2px 10px 0;
        box-sizing: border-box;
    }
    .afk-bar-track {
        height: 4px;
        background: rgba(60, 30, 0, 0.7);
        border-radius: 2px;
        overflow: hidden;
    }
    .afk-bar-fill {
        height: 100%;
        border-radius: 2px;
        transition: width 1s linear, background-color 0.3s;
    }
    @keyframes turn-pulse {
        0%   {
            box-shadow: 0 0 8px rgba(255,200,0,0.55), 0 0 18px rgba(255,155,0,0.22),
                        inset 0  1px 0 rgba(255,255,185,0.52), inset 0 -1px 0 rgba(145,62,0,0.42);
            filter: drop-shadow(0px 0px 4px rgba(255,215,0,0.55));
        }
        50%  {
            box-shadow: 0 0 18px rgba(255,222,0,0.92), 0 0 36px rgba(255,175,0,0.46),
                        inset 0  1px 0 rgba(255,255,205,0.68), inset 0 -1px 0 rgba(145,62,0,0.42);
            filter: drop-shadow(0px 0px 10px rgba(255,220,0,0.95));
        }
        100% {
            box-shadow: 0 0 8px rgba(255,200,0,0.55), 0 0 18px rgba(255,155,0,0.22),
                        inset 0  1px 0 rgba(255,255,185,0.52), inset 0 -1px 0 rgba(145,62,0,0.42);
            filter: drop-shadow(0px 0px 4px rgba(255,215,0,0.55));
        }
    }
</style>
