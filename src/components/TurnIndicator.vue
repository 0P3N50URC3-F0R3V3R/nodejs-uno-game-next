<template>
    <div class="turn-bar" v-if="activeClients.length > 0">
        <div class="dir-badge" :title="direction ? 'Clockwise' : 'Counter-clockwise'">
            {{ direction ? '↻' : '↺' }}
        </div>
        <div class="chips-row">
            <template v-for="(client, i) in orderedClients">
                <div
                    :key="client.name"
                    class="chip"
                    :class="{
                        'chip-active': client.turn,
                        'chip-ai': client.isAI,
                        'chip-disconnected': client.disconnected
                    }"
                    @mouseenter="$emit('show-tooltip', { client: client, event: $event })"
                    @mouseleave="$emit('hide-tooltip')"
                    @click="!client.isAI && $emit('open-profile', client.name)"
                >
                    <span class="chip-index">{{ i + 1 }}</span>
                    <span class="chip-name" :style="chipNameStyle(client.name)">{{ client.name || '???' }}</span>
                    <span class="chip-count" :class="hoarderClass(client.cardsCount)">{{ client.cardsCount }}</span>
                    <span
                        v-for="ev in eventsFor(client.name)"
                        :key="ev.id"
                        class="chip-event"
                        :class="'ev-' + ev.type"
                    >{{ ev.label }}</span>
                </div>
                <span
                    v-if="i < orderedClients.length - 1"
                    :key="'arrow-' + i"
                    class="chip-arrow"
                    :class="arrowFlipping"
                >{{ displayDirection ? '>' : '<' }}</span>
            </template>
        </div>
    </div>
</template>

<script>
    import { lang } from '../lang/index.js';

    export default {
        name: "TurnIndicator",
        props: {
            clients:   { type: Array,   default: function(){ return []; } },
            direction: { type: Boolean, default: true },
            lastEvent: { type: Object,  default: null },
            hoarderWarning: { type: Boolean, default: false }
        },
        data: function(){
            return { clientEvents: {}, arrowFlipping: '', displayDirection: true };
        },
        created: function(){
            this._evCounter = 0;
            this.displayDirection = this.direction;
        },
        computed: {
            activeClients: function(){
                return this.clients.filter(function(c){ return !c.disconnected; });
            },
            orderedClients: function(){
                return this.activeClients;
            }
        },
        watch: {
            direction: function(newVal){
                let self = this;
                this.arrowFlipping = newVal ? 'arrow-flip-right' : 'arrow-flip-left';
                setTimeout(function(){ self.displayDirection = newVal; }, 200);
                setTimeout(function(){ self.arrowFlipping = ''; }, 500);
            },
            lastEvent: function(ev){
                if(!ev || !ev.target) return;
                let labelMap = { p: lang.t('ev_plus2'), g: lang.t('ev_plus4'), n: lang.t('ev_skip'), r: lang.t('ev_reverse'), u: lang.t('ev_uno'), uf: lang.t('ev_uno_fail') };
                let id = ++this._evCounter;
                let entry = { id: id, type: ev.type, label: labelMap[ev.type] || ev.label };
                let cur = (this.clientEvents[ev.target] || []).concat([entry]);
                this.$set(this.clientEvents, ev.target, cur);
                let self = this;
                let name = ev.target;
                setTimeout(function(){
                    let arr = self.clientEvents[name] || [];
                    self.$set(self.clientEvents, name, arr.filter(function(e){ return e.id !== id; }));
                }, 2900);
            }
        },
        methods: {
            eventsFor: function(name){
                return this.clientEvents[name] || [];
            },
            chipNameStyle: function(name){
                let len = (name || '').length;
                let size = len <= 8 ? 12 : len <= 11 ? 10 : len <= 14 ? 9 : 8;
                return { fontSize: size + 'px' };
            },
            hoarderClass: function(count){
                if(!this.hoarderWarning) return '';
                if(count >= 36) return 'count-danger';
                if(count >= 30) return 'count-warn';
                if(count >= 20) return 'count-caution';
                return '';
            }
        }
    }
</script>

<style scoped>
    .turn-bar {
        position: absolute;
        top: 6px;
        left: 0;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 8px;
        box-sizing: border-box;
        z-index: 350;
        pointer-events: none;
    }

    /* ── Direction badge ── */
    .dir-badge {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 20px;
        color: #fccd4d;
        background: rgba(25, 15, 0, 0.82);
        border: 2px solid rgba(252, 205, 77, 0.85);
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(252, 205, 77, 0.55), inset 0 0 8px rgba(252, 205, 77, 0.1);
        animation: dir-pulse 2s ease-in-out infinite;
    }
    @keyframes dir-pulse {
        0%   { box-shadow: 0 0 6px  rgba(252,205,77,0.35), inset 0 0 4px rgba(252,205,77,0.07); }
        50%  { box-shadow: 0 0 18px rgba(252,205,77,0.85), inset 0 0 10px rgba(252,205,77,0.18); }
        100% { box-shadow: 0 0 6px  rgba(252,205,77,0.35), inset 0 0 4px rgba(252,205,77,0.07); }
    }

    /* ── Chips row ── */
    .chips-row {
        display: flex;
        align-items: center;
        gap: 3px;
        flex-wrap: nowrap;
    }

    .chip {
        position: relative;
        overflow: visible;
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 4px;
        background: rgba(0, 0, 0, 0.55);
        border: 1px solid rgba(154, 101, 21, 0.5);
        border-radius: 20px;
        padding: 3px 10px 3px 7px;
        transition: all 0.25s ease;
        white-space: nowrap;
    }
    .chip-active {
        background:
            linear-gradient(180deg,
                rgba(255,245,160,0.38) 0%,
                rgba(255,220,60,0.10) 48%,
                rgba(180,90,0,0.18)   52%,
                rgba(255,190,30,0.08) 100%
            ),
            rgba(22, 13, 0, 0.80);
        border: 1.5px solid rgba(255, 230, 80, 0.95);
        box-shadow:
            0 0 10px  rgba(255,200,0,0.65),
            0 0 24px  rgba(255,160,0,0.30),
            inset 0  1px 0 rgba(255,255,180,0.55),
            inset 0 -1px 0 rgba(160,70,0,0.35);
        animation: chip-pulse 1.3s ease-in-out infinite;
    }
    .chip-ai { border-color: rgba(100, 180, 255, 0.4); }
    .chip-ai.chip-active {
        background:
            linear-gradient(180deg,
                rgba(180,230,255,0.35) 0%,
                rgba(80,160,255,0.08)  48%,
                rgba(0,60,160,0.20)    52%,
                rgba(80,160,255,0.06)  100%
            ),
            rgba(5, 15, 30, 0.80);
        border-color: rgba(130, 210, 255, 0.95);
        box-shadow:
            0 0 10px  rgba(80,160,255,0.70),
            0 0 24px  rgba(60,120,255,0.30),
            inset 0  1px 0 rgba(200,240,255,0.55),
            inset 0 -1px 0 rgba(0,50,140,0.35);
    }
    .chip-disconnected { opacity: 0.4; }

    .chip-index {
        font-size: 9px;
        color: rgba(200, 180, 100, 0.7);
        font-weight: bold;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
    }
    .chip-name {
        font-size: 12px;
        font-weight: bold;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        color: #d4cda4;
        letter-spacing: 0.5px;
        max-width: 100px;
        overflow: hidden;
        white-space: nowrap;
    }
    .chip-active .chip-name { color: #fff8c0; }
    .chip-ai    .chip-name { color: #a8d4ff; }

    .chip-count {
        font-size: 10px;
        font-weight: bold;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        background: rgba(255,255,255,0.12);
        color: #ffffff;
        border-radius: 10px;
        padding: 1px 5px;
        min-width: 16px;
        text-align: center;
    }
    .chip-active .chip-count {
        background: rgba(255, 200, 0, 0.3);
        color: #ffe566;
    }
    .chip-count.count-caution { background: rgba(255, 221, 0, 0.30); color: #ffe566; }
    .chip-count.count-warn { background: rgba(255, 140, 0, 0.40); color: #ffb444; animation: count-pulse 1.4s ease-in-out infinite; }
    .chip-count.count-danger { background: rgba(255, 40, 40, 0.45); color: #ff6666; animation: count-pulse 0.8s ease-in-out infinite; }
    @keyframes count-pulse {
        0%, 100% { box-shadow: 0 0 2px rgba(255,80,0,0.4); }
        50% { box-shadow: 0 0 8px rgba(255,80,0,0.9); }
    }

    /* ── Arrows between chips ── */
    .chip-arrow {
        display: inline-block;
        font-size: 20px;
        font-weight: bold;
        color: rgba(252, 205, 77, 0.65);
        line-height: 1;
    }
    .arrow-flip-left  { animation: arrow-flip-left  0.5s ease-in-out forwards; }
    .arrow-flip-right { animation: arrow-flip-right 0.5s ease-in-out forwards; }
    @keyframes arrow-flip-left {
        0%   { transform: scaleX(1)    scale(1);   color: rgba(252,205,77,0.65); }
        35%  { transform: scaleX(1.8)  scale(1.4); color: rgba(252,205,77,1); }
        50%  { transform: scaleX(0)    scale(1.1); }
        65%  { transform: scaleX(-1.8) scale(1.4); color: rgba(252,205,77,1); }
        100% { transform: scaleX(-1)   scale(1);   color: rgba(252,205,77,0.65); }
    }
    @keyframes arrow-flip-right {
        0%   { transform: scaleX(-1)   scale(1);   color: rgba(252,205,77,0.65); }
        35%  { transform: scaleX(-1.8) scale(1.4); color: rgba(252,205,77,1); }
        50%  { transform: scaleX(0)    scale(1.1); }
        65%  { transform: scaleX(1.8)  scale(1.4); color: rgba(252,205,77,1); }
        100% { transform: scaleX(1)    scale(1);   color: rgba(252,205,77,0.65); }
    }

    /* ── Floating event labels ── */
    .chip-event {
        position: absolute;
        bottom: 0;
        left: 50%;
        font-size: 15px;
        font-weight: 900;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        letter-spacing: 1px;
        white-space: nowrap;
        pointer-events: none;
        text-shadow: 0 2px 8px rgba(0,0,0,0.98), 0 0 12px rgba(0,0,0,0.8);
        animation: event-float 2.8s ease-out forwards;
        z-index: 10;
    }
    .ev-p  { color: #ffaa44; }
    .ev-g  { color: #ff5555; }
    .ev-n  { color: #dddddd; }
    .ev-r  { color: #44ccff; }
    .ev-u  { color: #ffdd00; font-weight: 900; }
    .ev-uf { color: #ff4444; }

    /* Nextgen event colors — same mapping as the center-table popups, so a
       card's small turn-chip label and its big center announcement always
       read as the same effect. */
    .ev-p6, .ev-p8   { color: #ffaa44; }
    .ev-p10          { color: #ff5555; }
    .ev-m2           { color: #33ddaa; }
    .ev-th           { color: #4a90ff; }
    .ev-rda          { color: #aaff33; }
    .ev-rot          { color: #44ffaa; }
    .ev-tg1, .ev-tg2 {
        background: linear-gradient(90deg, #2288ff, #66ddff, #2288ff);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }
    .ev-rbw {
        background: linear-gradient(90deg, #e74c3c, #f1c40f, #2ecc71, #3498db, #9b59b6);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }
    /* Same reasoning as the center popups: a solid text-shadow paints a dark
       silhouette that shows through color:transparent gradient fills as a black
       smear. filter:drop-shadow hugs the actual rendered glyph instead. */
    .ev-p6, .ev-p8, .ev-p10, .ev-m2, .ev-th, .ev-rda, .ev-rot, .ev-tg1, .ev-tg2, .ev-rbw {
        text-shadow: none;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,0.65));
    }

    @keyframes event-float {
        0%   { opacity: 0; transform: translateX(-50%) translateY(22px);  }
        10%  { opacity: 1; transform: translateX(-50%) translateY(14px);  }
        70%  { opacity: 1;                                                 }
        100% { opacity: 0; transform: translateX(-50%) translateY(-55px); }
    }

    /* ── Active chip pulse ── */
    @keyframes chip-pulse {
        0%   {
            box-shadow: 0 0 7px  rgba(255,200,0,0.55), 0 0 16px rgba(255,160,0,0.20),
                        inset 0 1px 0 rgba(255,255,180,0.55), inset 0 -1px 0 rgba(160,70,0,0.35);
        }
        50%  {
            box-shadow: 0 0 18px rgba(255,225,0,0.95), 0 0 38px rgba(255,180,0,0.50),
                        inset 0 1px 0 rgba(255,255,200,0.70), inset 0 -1px 0 rgba(160,70,0,0.35);
        }
        100% {
            box-shadow: 0 0 7px  rgba(255,200,0,0.55), 0 0 16px rgba(255,160,0,0.20),
                        inset 0 1px 0 rgba(255,255,180,0.55), inset 0 -1px 0 rgba(160,70,0,0.35);
        }
    }
</style>
