<template>
    <div class="frame" :style="{width:config.boardWidth+'px', height:config.boardHeight+'px'}" @wheel="onHandWheel">
        <Authorize :client="state.client" :socket="socket" @auth-success="onAuthSuccess" @open-profile="openProfile" @logout="doLogout" @federated-guest="onFederatedGuest"></Authorize>

        <Board v-if="state.client.code" :bg="tableBg" :videoBg="videoBg">
            <Card v-for="card in state.game.cards"
                    :ref="'card'+card.id"
                    :card="card"
                    :key="card.id"
                    :clickHandler="cardOnClick"
                    :transitionFinishHandler="cardTransitionFinish"
                    :active="state.client.turn"
                    :hardcoreMode="effectiveHardcoreMode"></Card>

            <div v-if="config.playersInitialized && !state.game.winner && state.game.ready" >
                <NamePlate v-for="(client, index) in state.clients" :key="'client_'+index" :client="client" :position="namePosition(client.name)" :index="index + 1" :afk-timer="spinnerActive ? null : afkTimer" @show-tooltip="onShowTooltip" @hide-tooltip="onHideTooltip" @open-profile="openProfile"></NamePlate>
            </div>
            <!-- Must live INSIDE Board's slot: Board's root establishes its own
                 stacking context (transform-style: preserve-3d), so a sibling div
                 outside Board can only render fully above or fully below the whole
                 board, never "between" some of its cards and others. Rendered here,
                 its z-index correctly compares against the cards' own (900+). -->
            <div v-if="stealFrameActive" class="steal-frame-backdrop"></div>
            <!-- Same stacking-context reasoning as steal-frame-backdrop above: this used
                 to live as a sibling of Board, which meant it always painted over the
                 entire board (including a hover-peeked card's z-index:99999, since that
                 z-index only ranks it among Board's own children, never against anything
                 outside Board's stacking context) regardless of any z-index set on it. -->
            <div v-if="state.game.stackPending && state.game.ready && !state.game.winner"
                 class="stack-banner"
                 :class="'stack-banner-' + state.game.stackPending.type">
                <span class="sb-count">+{{ state.game.stackPending.count }}/{{ state.game.stackPending.max || 20 }}</span>
                <span class="sb-info">
                    <span class="sb-rule">{{ t('stack_active') }}</span>
                    <span class="sb-hint" v-if="state.client.turn">
                        {{ t('stack_hint', { n: stackHintAmount }) }}
                    </span>
                </span>
            </div>
        </Board>
        <div v-if="config.playersInitialized && state.game.ready && !state.game.winner"
             class="deck-count-badge"
             :style="{left: (config.drawPos.x - 20) + 'px', top: (config.drawPos.y + 145) + 'px'}">
            {{ deckCount }}
        </div>
        <ScoresPanel v-if="state.client.code" :clients="state.clients" :roundsPlayed="state.game.roundsPlayed" :maxRounds="state.game.maxRounds"></ScoresPanel>
        <TurnIndicator v-if="config.playersInitialized && state.game.ready && !state.game.winner" :clients="state.clients" :direction="state.game.direction" :lastEvent="state.game.lastEvent" :hoarderWarning="state.game.nextgenMode" @show-tooltip="onShowTooltip" @hide-tooltip="onHideTooltip" @open-profile="openProfile"></TurnIndicator>
        <transition-group name="lnotif" tag="div" class="lobby-notifs afk-notifs" v-if="afkNotifs.length">
            <div v-for="n in afkNotifs" :key="n.id" class="lnotif lnotif-afk">{{ n.msg }}</div>
        </transition-group>
        <div v-for="ce in centerEvents" :key="ce.id" class="center-event" :class="'center-ev-'+ce.type">
            <div v-if="ce.name" class="ce-name">{{ ce.name }}</div>
            <img v-if="ce.type === 'n'" class="ce-icon ce-icon-skip" src="/img/skip.png" />
            <div v-else-if="ce.type === 'm2'" class="ce-skip2-row">
                <img class="ce-icon ce-icon-skip" src="/img/skip.png" />
                <img class="ce-icon ce-icon-skip" src="/img/skip.png" />
            </div>
            <div v-else-if="ce.type === 'r'" class="ce-reverse-row">
                <img class="ce-icon ce-icon-reverse" src="/img/reverse.png" />
                <div class="ce-label">{{ ce.label }}</div>
            </div>
            <div v-else class="ce-label">{{ ce.label }}</div>
        </div>
        <SoundPanel :socket="socket"></SoundPanel>
        <PlayerTooltip :tooltipData="tooltipClient" :x="tooltipX" :y="tooltipY"></PlayerTooltip>
        <GameMenu v-if="state.client.code" :socket="socket" :quitHandler="quitGame" :isHost="state.client.isHost" :tableIndex="tableIndex" :personalHardcoreMode="personalHardcoreMode" @table-change="setTable" @personal-hardcore-change="setPersonalHardcoreMode" @video-bg-change="videoBg = $event" @open-manual="manualOpen = true"></GameMenu>
        <ManualPanel v-if="manualOpen" :closeHandler="closeManual"></ManualPanel>
        <XPScreen :xpData="xpData"></XPScreen>
        <div class="gold-hud" v-if="gold > 0 || goldFloats.length">
            <span class="gold-icon">G</span>
            <span class="gold-amount">{{ gold }}</span>
            <span v-for="f in goldFloats" :key="f.id" class="gold-float">+{{ f.amount }}G</span>
        </div>
        <NowPlaying></NowPlaying>
        <ChatPanel v-if="isLoggedIn || isFederatedGuest" :socket="socket" :playerName="state.client.name" :inGame="!!state.client.code" :myUserId="myUserId" ref="chatPanel"></ChatPanel>
        <StorePanel v-if="isLoggedIn" :authToken="authToken" :socket="socket" @bg-change="videoBg = $event" @bg-profile-change="profileVideoBg = $event" @gold-changed="onGoldChanged"></StorePanel>
        <NewsPanel :socket="socket" :authToken="authToken" @friends-updated="loadFriendList" @accept-invite="acceptGameInvite"></NewsPanel>
        <ProfilePanel
            ref="profilePanel"
            v-if="isLoggedIn"
            :authToken="authToken"
            :socket="socket"
            :inGame="!!state.client.code"
            :gameId="state.client.code ? String(state.client.code) : ''"
            @openDm="(id, name) => $refs.chatPanel && $refs.chatPanel.openDm(id, name)"
            :videoBg="profileVideoBg"
            @bg-change="profileVideoBg = $event"
            @logout="doLogout"
            @friends-updated="loadFriendList"
        ></ProfilePanel>
        <AchievementsPanel v-if="isLoggedIn" :socket="socket"></AchievementsPanel>
        <PlayerSearchPanel
            v-if="isLoggedIn"
            @open-profile="openProfile"
            :myUserId="myUserId"
            :selfName="state.client.name"
            :friendList="friendList"
            :inGame="!!state.client.code"
            :gameId="state.client.code ? String(state.client.code) : ''"
            :authToken="authToken"
        ></PlayerSearchPanel>
        <PlayerProfileModal
            :username="profileTarget"
            :myUserId="myUserId"
            :friendList="friendList"
            :authToken="authToken"
            @close="profileTarget = null"
            @openDm="(id, name) => $refs.chatPanel && $refs.chatPanel.openDm(id, name)"
        ></PlayerProfileModal>
        <AchievementToast :socket="socket"></AchievementToast>
        <div v-if="showUnoButton" class="uno-btn" @click="pressUno">
            <div class="uno-btn-text">UNO!</div>
            <div class="uno-btn-timer">{{ unoSecondsLeft }}s</div>
        </div>
        <transition name="spinner-fade">
            <div v-if="spinnerActive" class="spinner-overlay">
                <div class="spinner-label">{{ t('first_player') }}</div>
                <div class="spinner-cryptex" :class="{'spinner-landed': spinnerLanded}">
                    <div v-for="(cell, i) in spinnerCells" :key="i" class="cryptex-cell" :class="{spinning: cell.spinning, locked: cell.locked}">
                        <span class="cryptex-char">{{ cell.char }}</span>
                    </div>
                </div>
                <div v-if="spinnerLanded" class="spinner-goes-first">{{ t('goes_first') }}</div>
            </div>
        </transition>
        <transition-group name="lnotif" tag="div" class="lobby-notifs" v-if="state.client.code">
            <div v-for="n in lobbyNotifs" :key="n.id" class="lnotif" :class="'lnotif-'+n.type">
                <span class="lnotif-name">{{ n.name }}</span> {{ n.label || t('lobby_' + n.type) }}
            </div>
        </transition-group>
        <div class="board-overlay" v-if="overlayVisible">
            <PopupReady v-if="!state.game.winner && !state.game.ready" :buttonHandler="ready" :showButton="!state.client.ready"></PopupReady>
            <BRPodiumScreen v-if="showWinnerPopup && state.game.brMode"
                :rankings="state.game.brEliminated"
                :buttonHandler="ready"
                :quitHandler="quitGame"
                :seriesWinner="state.game.seriesWinner">
            </BRPodiumScreen>
            <PopupWon v-if="showWinnerPopup && !state.game.brMode"
                :buttonHandler="ready"
                :quitHandler="quitGame"
                :winner="state.game.winner"
                :showButton="!state.client.ready"
                :clients="state.clients"
                :roundsPlayed="state.game.roundsPlayed"
                :maxRounds="state.game.maxRounds"
                :seriesWinner="state.game.seriesWinner">
            </PopupWon>
            <PopupSpecial v-if="config.specialCard" :clickHandler="playCardSpecial" :cancelHandler="cancelSpecialCard" :card="config.specialCard"></PopupSpecial>
            <PopupTake v-if="!config.specialCard && state.client.takeOrLeave" :card="state.client.takeOrLeave" :takeHandler="takeCard" :leaveHandler="playCardTOL"></PopupTake>
            <PopupTargetPicker v-if="amPendingInitiator && state.game.pendingInteraction.awaiting === 'target'" :players="pendingTargetChoices" :pickHandler="submitSelectTarget" :cancelHandler="submitCancelPending"></PopupTargetPicker>
            <PopupTradeConfirm v-if="amPendingInitiator && state.game.pendingInteraction.awaiting === 'confirm'" :targetName="state.game.pendingInteraction.targetName" :confirmHandler="submitConfirmTrade"></PopupTradeConfirm>
        </div>
        <div v-if="stealFrameActive" class="steal-frame-hint">
            <span>{{ t('nextgen_steal_hint', { n: state.game.pendingInteraction.stealCount - stealPicked.length }) }}</span>
            <span class="steal-frame-cancel" @click="cancelStealFrame">{{ t('cancel') }}</span>
        </div>
        <template v-if="myCardsCount >= 15 && state.game.ready && !state.game.winner">
            <div class="hand-scroll-arrow hand-scroll-left"
                 :style="{top: (config.boardHeight - 195) + 'px'}"
                 @click="scrollHand(-5)">&#9664;</div>
            <div class="hand-scroll-arrow hand-scroll-right"
                 :style="{top: (config.boardHeight - 195) + 'px'}"
                 @click="scrollHand(5)">&#9654;</div>
        </template>
    </div>
</template>

<script>
    
    import Board from "./components/Board"
    import Card from "./components/Card"
    import PopupReady from "./components/PopupReady"
    import PopupWon from "./components/PopupWon"
    import PopupSpecial from "./components/PopupSpecial"
    import PopupTake from "./components/PopupTake"
    import PopupTargetPicker from "./components/PopupTargetPicker"
    import PopupTradeConfirm from "./components/PopupTradeConfirm"
    import { NEXTGEN_CARDS, isWildNeedingColorPick } from "./nextgenCards.js"
    import NamePlate from "./components/NamePlate"
    import ScoresPanel from "./components/ScoresPanel"
    import Authorize from "./components/Authorize"
    import ChatPanel from "./components/ChatPanel"
    import TurnIndicator from "./components/TurnIndicator"
    import SoundPanel from "./components/SoundPanel"
    import GameMenu from "./components/GameMenu"
    import XPScreen from "./components/XPScreen"
    import NowPlaying from "./components/NowPlaying"
    import AchievementsPanel from "./components/AchievementsPanel"
    import AchievementToast  from "./components/AchievementToast"
    import PlayerTooltip from "./components/PlayerTooltip"
    import PlayerSearchPanel from "./components/PlayerSearchPanel"
    import PlayerProfileModal from "./components/PlayerProfileModal"
    import StorePanel from "./components/StorePanel"
    import ProfilePanel from "./components/ProfilePanel"
    import ManualPanel from "./components/ManualPanel"
    import NewsPanel from "./components/NewsPanel"
    import BRPodiumScreen from "./components/BRPodiumScreen"
    import { sound, soundState } from "./sound.js"
    import { lang } from "./lang/index.js"

    import testDataNew from "../public/testDataNew.json"

    const TABLE_IMAGES = [
        require('../public/img/table.jpg'),
        require('../public/img/table2.jpg'),
        require('../public/img/table3.jpg'),
        require('../public/img/table4.jpg'),
        require('../public/img/table5.jpg'),
        require('../public/img/table6.jpg'),
    ];

    import ConfigMixin from "./mixins/Config"   
    import ClientMixin from "./mixins/Client"   

    const OWNER_DRAW_DECK = "draw"
    const OWNER_DISCARD_DECK = "dsc"
    const DISCARD_ANIM_LOCK_MS = 300

    export default {
        name: "UnoGame",
        props: {
            socket: { type: Object },
        },
        mixins: [
            ConfigMixin, 
            ClientMixin
        ],
        components: {
            Board,
            Card,
            Authorize,
            PopupReady,
            PopupWon,
            PopupSpecial,
            GameMenu,
            PopupTake,
            PopupTargetPicker,
            PopupTradeConfirm,
            NamePlate,
            ScoresPanel,
            ChatPanel,
            TurnIndicator,
            SoundPanel,
            XPScreen,
            NowPlaying,
            PlayerTooltip,
            AchievementsPanel,
            AchievementToast,
            PlayerSearchPanel,
            PlayerProfileModal,
            StorePanel,
            ProfilePanel,
            ManualPanel,
            NewsPanel,
            BRPodiumScreen,
        },
        data: function() {
            return {
                state:{
                    clients:[],
                    client: { name: localStorage.getItem('unoPlayerName') || localStorage.getItem('unoAuthUser') || '' },
                    game:{
                        cards:[],
                        events:[],
                        winner: false,
                        ready: false,
                        direction: true,
                        roundsPlayed: 0,
                        maxRounds: 5,
                        seriesWinner: null,
                        lastEvent: null,
                        unoRequired: null,
                        unoTtl: null,
                        stackPending: null,
                        pendingInteraction: null,
                        ruleset: 'original',
                        hardcoreMode: false,
                        brMode: false,
                        brEliminated: []
                    },
                },
                isLoggedIn: !!localStorage.getItem('unoAuthToken'),
                isFederatedGuest: false,
                authToken: localStorage.getItem('unoAuthToken') || '',
                myUserId: 0,
                friendList: [],
                xpData: null,
                manualOpen: false,
                gold: 0,
                goldFloats: [],
                profileTarget: null,
                showWinnerPopup: false,
                _winnerTimer: null,
                _unoCountdown: null,
                unoSecondsLeft: 3,
                _lastDiscardMoveId: -1,
                centerEvents: [],
                tableIndex: 1,
                videoBg: null,
                profileVideoBg: null,
                personalHardcoreMode: localStorage.getItem('unoPersonalHardcore') === 'true',
                spinnerActive: false,
                spinnerCells: [],
                spinnerLanded: false,
                lobbyNotifs: [],
                tooltipClient: null,
                tooltipX: 0,
                tooltipY: 0,
                afkTimer: null,
                _afkInterval: null,
                afkNotifs: [],
                handScrollX: 0,
                _brEliminatedCount: 0,
                stealPicked: [],
                stealFrameActive: false,
                _victimShaking: false
            }
        },
        computed:{
            deckCount: function(){
                return this.state.game.cards.filter(function(c){ return c.owner === 'draw'; }).length;
            },
            tableBg: function(){
                return TABLE_IMAGES[this.tableIndex - 1];
            },
            effectiveHardcoreMode: function(){
                return this.state.game.hardcoreMode || this.personalHardcoreMode;
            },
            stackHintAmount: function(){
                let type = this.state.game.stackPending && this.state.game.stackPending.type;
                if(type === 'p') return '2';
                if(type === 'g') return '4';
                let def = NEXTGEN_CARDS[type];
                return def ? String(def.punishAmount) : '2';
            },
            myCardsCount: function(){
                let self = this.self;
                return this.state.game.cards.filter(function(c){ return c.owner === self; }).length;
            },
            showUnoButton: function(){
                return !!(this.state.client.code && this.state.game.unoRequired === this.state.client.name);
            },
            overlayVisible:function(){
                return this.state.client.code
                    && ((!this.state.game.winner && !this.state.game.ready)
                    || this.showWinnerPopup
                    || this.config.specialCard
                    || (!this.config.specialCard && this.state.client.takeOrLeave)
                    // The 'steal' stage gets its own in-place unfold frame instead of
                    // the generic full-board dim — see stealFrameActive.
                    || (this.amPendingInitiator && this.state.game.pendingInteraction.awaiting !== 'steal')
                    );
            },
            amPendingInitiator:function(){
                let p = this.state.game.pendingInteraction;
                return !!(p && p.from === this.state.client.name);
            },
            pendingTargetChoices:function(){
                let p = this.state.game.pendingInteraction;
                if(!p) return [];
                return this.state.clients.filter(function(c){
                    if(c.name === p.from) return false;
                    if(c.brEliminated) return false;
                    if(p.targetMin && c.cardsCount < p.targetMin) return false;
                    return true;
                });
            },
            pendingStealCards:function(){
                let p = this.state.game.pendingInteraction;
                if(!p || p.awaiting !== 'steal') return [];
                return this.state.game.cards.filter(function(c){ return c.owner === p.targetName; });
            }
        },
        watch:{
            'state.game.unoRequired': function(newVal){
                let self = this;
                clearInterval(this._unoCountdown);
                if(newVal){
                    let ttl = this.state.game.unoTtl || 3000;
                    let deadline = Date.now() + ttl;
                    this.unoSecondsLeft = Math.max(1, Math.ceil(ttl / 1000));
                    sound.play('countdown');
                    let lastSec = this.unoSecondsLeft;
                    this._unoCountdown = setInterval(function(){
                        let rem = Math.ceil((deadline - Date.now()) / 1000);
                        if(rem < lastSec && rem > 0){ sound.play('countdown'); lastSec = rem; }
                        self.unoSecondsLeft = Math.max(0, rem);
                        if(rem <= 0) clearInterval(self._unoCountdown);
                    }, 200);
                } else {
                    this.unoSecondsLeft = 3;
                }
            },
            'state.game.pendingInteraction': function(newVal, oldVal){
                // Trade Hands' actual hand-swap happens on confirm, not on the
                // original placement — that's a separate resolution step with no
                // new discard event, so it needs its own input-freeze trigger here
                // (Rotate/Redraw All resolve at placement time instead; see
                // _detectNextgenEvent). Same lock cardOnClick already checks.
                if(!newVal && oldVal && oldVal.kind === 'trade' && oldVal.awaiting === 'confirm'){
                    this._discardAnimLockUntil = Math.max(this._discardAnimLockUntil, Date.now() + 2400);
                }

                // Steal frame: open once per new interaction reaching the 'steal' stage
                // (guarded, since the server resends this object on every broadcast even
                // when nothing changed). Close on any other exit — a successful pick
                // already closes itself via stealCardClick, so this mainly covers
                // cancel/AFK-timeout/disconnect paths that don't go through that click.
                let inSteal = !!(newVal && newVal.awaiting === 'steal' && this.amPendingInitiator);
                if(inSteal){
                    if(this._stealFrameTargetName !== newVal.targetName){
                        this._openStealFrame(newVal.targetName);
                    }
                } else if(this.stealFrameActive || this._stealFrameTargetName){
                    this._closeStealFrame();
                }

                // The initiator's unfold frame (_openStealFrame above) only mutates
                // their own local card.transform values — nobody else's client ever
                // sees it, least of all the victim, whose hand just sits there with
                // zero indication someone is rifling through it. Give the victim's
                // own client a one-shot shake on their own hand when they become the
                // steal target (guarded so a resent-unchanged broadcast doesn't replay it).
                let amVictim = !!(newVal && newVal.awaiting === 'steal' && newVal.targetName === this.state.client.name);
                if(amVictim && !this._victimShaking){
                    this._victimShaking = true;
                    this._playStealVictimShake();
                } else if(!amVictim){
                    this._victimShaking = false;
                }
            },
            'state.game.stackPending': function(newVal, oldVal){
                // Announce the accumulated draw amount only once, when the stack is
                // actually taken — not on every escalation step while it's still building.
                if(!newVal && oldVal && !this.state.game.winner){
                    let c = oldVal.count;
                    sound.play(this._stackSound(c));
                    if(c === 6) sound.play('plus4');
                }
            },
            'state.game.lastEvent': function(ev){
                if(!ev) return;
                let labelMap = { p: lang.t('ev_plus2'), g: lang.t('ev_plus4'), n: lang.t('ev_skip'), r: lang.t('ev_reverse'), u: lang.t('ev_uno'), uf: lang.t('ev_uno_fail') };
                let label = labelMap[ev.type] || ev.label;
                if(!label) return;
                if(ev.type === 'uf'){
                    let missed = ['unoMissedNo','unoMissedOops','unoMissedSuffer'];
                    sound.play('unoFail');
                    sound.play(missed[Math.floor(Math.random() * missed.length)]);
                }
                if(ev.type === 'u' && ev.target !== this.self){ sound.play('uno'); sound.play('yellUno'); }
                let evName = ev.target2 ? (ev.target + ' & ' + ev.target2) : (ev.target || '');
                this.centerEvents.push({id: ev.id, type: ev.type, name: evName, label: label});
                let self = this;
                let id = ev.id;
                // Matches the faster .center-ev-rot CSS animation above.
                let displayMs = (ev.type === 'rot') ? 1200 : 2600;
                setTimeout(function(){ self.centerEvents = self.centerEvents.filter(function(e){ return e.id !== id; }); }, displayMs);
            },
            'state.game.brEliminated': function(newVal){
                let newCount = newVal ? newVal.length : 0;
                let prevCount = this._brEliminatedCount;
                this._brEliminatedCount = newCount;
                if(newCount <= prevCount) return;
                let self = this;
                let newEntries = newVal.slice(prevCount);
                sound.play('player_out');
                newEntries.forEach(function(elim, i){
                    if(!elim) return;
                    let rankSuffix = elim.rank === 1 ? '1' : elim.rank === 2 ? '2' : elim.rank === 3 ? '3' : 'x';
                    let isHoarder = elim.reason === 'hoarder';
                    let centerLabel = isHoarder ? self.t('nextgen_hoarder_out') : self.t('br_is_out');
                    let notifLabel = isHoarder ? self.t('nextgen_hoarder_out') : self.t('br_out');
                    let delay = i * 600;
                    setTimeout(function(){
                        let id = Date.now() + i;
                        self.centerEvents.push({ id: id, type: 'brout' + rankSuffix, name: elim.name, label: centerLabel });
                        setTimeout(function(){ self.centerEvents = self.centerEvents.filter(function(e){ return e.id !== id; }); }, 2600);
                        let nid = id + 1;
                        self.lobbyNotifs.push({ id: nid, name: elim.name, type: 'brout' + rankSuffix, label: notifLabel });
                        setTimeout(function(){ self.lobbyNotifs = self.lobbyNotifs.filter(function(n){ return n.id !== nid; }); }, 4000);
                    }, delay);
                });
            },
            'state.game.ready': function(newVal, oldVal){
                if(newVal && !oldVal){
                    this.lobbyNotifs = [];
                    this._prevLobbyClients = null;
                    sound.play('start');
                    sound.play('shuffle');
                    this._startSpinner();
                }
            },
            'state.client.turn': function(newVal){
                if(newVal && soundState.yourTurnEnabled) sound.play('yourTurn');
            },
            spinnerActive: function(val) {
                if (val) {
                    if (this._afkInterval) { clearInterval(this._afkInterval); this._afkInterval = null; }
                } else if (this.afkTimer) {
                    var self = this;
                    this._afkInterval = setInterval(function() {
                        if (self.afkTimer && self.afkTimer.remaining > 0) self.afkTimer.remaining--;
                    }, 1000);
                }
            },
            'state.game.winner': function(newVal){
                let self = this;
                clearTimeout(this._winnerTimer);
                if(newVal){
                    if(this.state.game.brMode){
                        let me = this.state.clients.find(function(c){ return c.name === self.self; });
                        let rank = me ? me.brRank : 0;
                        sound.play((rank >= 1 && rank <= 3) ? 'win' : 'lose');
                    } else {
                        sound.play(newVal === self.self ? 'win' : 'lose');
                    }
                    setTimeout(function(){
                        for(let i = 0; i < self.state.game.cards.length; i++){
                            let card = self.state.game.cards[i];
                            card.transform.x = self.config.drawPos.x + (5 - Math.random()*10);
                            card.transform.y = self.config.drawPos.y + (5 - Math.random()*10);
                            card.transform.angle = (5 - Math.random()*10);
                            card.transform.z = 150 + i;
                            card.transform.scale = 1;
                            card.transform.d = 0.02 + Math.random()*0.04;
                            card.transform.delay = 0;
                        }
                    }, 600);
                    this._winnerTimer = setTimeout(function(){
                        self.showWinnerPopup = true;
                    }, 2500);
                } else {
                    this.showWinnerPopup = false;
                }
            }
        },
        methods:{
            t: function(key, vars) { return lang.t(key, vars); },
            onGoldChanged: function(amount) {
                this.gold = amount;
                if (this.$refs.profilePanel && this.$refs.profilePanel.profile) this.$refs.profilePanel.profile.gold = amount;
            },
            doLogout: function() { localStorage.removeItem('unoAuthToken'); location.reload(); },
            loadUserSession: function(token) {
                fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } })
                    .then(r => r.json()).then(p => {
                        if (p && p.id) this.myUserId = p.id;
                        if (p && p.gold !== undefined) this.gold = p.gold;
                    });
                fetch('/api/store/equipped', { headers: { 'Authorization': 'Bearer ' + token } })
                    .then(r => r.json()).then(eq => {
                        if (eq && eq.background && eq.background.file_path) this.videoBg = '/store/asset/' + eq.background.file_path;
                        if (eq && eq.bg_profile && eq.bg_profile.file_path) this.profileVideoBg = '/store/asset/' + eq.bg_profile.file_path;
                    });
                this.loadFriendList();
            },
            onAuthSuccess: function() {
                this.isLoggedIn = true;
                this.authToken = localStorage.getItem('unoAuthToken') || '';
                if (this.authToken) this.loadUserSession(this.authToken);
            },
            onFederatedGuest: function(payload) {
                this.isFederatedGuest = true;
                this.socket.emit('federationGuestMark', { sessionId: payload.sessionId });
            },
            onShowTooltip: function(payload) {
                this.tooltipClient = payload.client;
                this.tooltipX = payload.event.clientX;
                this.tooltipY = payload.event.clientY;
            },
            onHideTooltip: function() {
                this.tooltipClient = null;
            },
            openProfile: function(username) { this.profileTarget = username; },
            closeManual: function() { this.manualOpen = false; },
            acceptGameInvite: function(data) {
                this.socket.emit('create', { room: data.gameId, inviteToken: data.inviteToken, authToken: this.authToken, creating: false, bots: [], maxRounds: 5 });
                this.socket.emit('login', { client: this.state.client, authToken: this.authToken });
            },
            loadFriendList: function() {
                const token = localStorage.getItem('unoAuthToken');
                if (!token) return;
                fetch('/api/friends', { headers: { 'Authorization': 'Bearer ' + token } })
                    .then(r => r.json()).then(d => { if (d && d.accepted) this.friendList = d.accepted; });
            },
            _addLobbyNotif: function(name, type) {
                var id = Date.now() + Math.random();
                this.lobbyNotifs.push({ id: id, name: name, type: type });
                var self = this;
                setTimeout(function(){ self.lobbyNotifs = self.lobbyNotifs.filter(function(n){ return n.id !== id; }); }, 4000);
            },
            setTable: function(i){
                this.tableIndex = i;
                localStorage.setItem('unoTable', String(i));
            },
            setPersonalHardcoreMode: function(v){
                this.personalHardcoreMode = v;
                localStorage.setItem('unoPersonalHardcore', v ? 'true' : 'false');
            },
            pressUno: function(){
                sound.play('uno');
                sound.play('yellUno');
                this.socket.emit('uno', { client: this.state.client });
            },
            quitGame:function(){
                this.socket.emit('quit');
                this.state.client = { name: this.state.client.name, code: null };
                this.state.clients = [];
                this.state.game.cards = [];
                this.state.game.events = [];
                this.state.game.winner = false;
                this.state.game.ready = false;
                this.state.game.roundsPlayed = 0;
                this.state.game.maxRounds = 5;
                this.state.game.seriesWinner = null;
                this.state.game.unoRequired = null;
                this.state.game.unoTtl = null;
                this.showWinnerPopup = false;
                clearTimeout(this._winnerTimer);
                clearInterval(this._unoCountdown);
                this._lastDiscardMoveId = -1;
                this._animPending = 0;
                this._clearAnimPendingWatchdog();
                this._discardAnimLockUntil = 0;
                this._stealFrameTargetName = null;
                this._stealPickOriginalY = {};
                this._processedEventCount = 0;
                this.stealPicked = [];
                this.stealFrameActive = false;
                this._victimShaking = false;
                this.config.initialized = false;
                this.config.playersInitialized = false;
                this.config.specialCard = false;
                this.config.players = {};
                this.handScrollX = 0;
            },
            playCard:function(card){
                if(!card.type) return;
                if(isWildNeedingColorPick(card.type)){
                    this.config.specialCard = card;
                }else{
                    sound.play('play');
                    this.state.client.turn = false;
                    this.cardSetOwner(card, OWNER_DISCARD_DECK);
                    this.config.specialCard = false;
                    this.socket.emit('place', {'client': this.state.client, card:card});
                }
            },
            playCardSpecial:function(cardId, type){
                let card = this.state.game.cards.find(function(elem){
                    return elem.id == cardId;
                });
                if(typeof card !== 'undefined'){
                    card.type = type;
                    this.playCard(card);
                }
            },
            cancelSpecialCard:function(){
                this.config.specialCard = false;
            },
            playCardTOL:function(cardId){
                let card = this.state.game.cards.find(function(elem){
                    return elem.id == cardId;
                });
                if(typeof card !== 'undefined'){
                    this.playCard(card);
                }                
            },
            takeCard:function(){
                this.socket.emit('take', {'client': this.state.client});
            },
            submitSelectTarget:function(targetName){
                this.socket.emit('selectTarget', {client: this.state.client, targetName: targetName});
            },
            submitConfirmTrade:function(confirm){
                this.socket.emit('confirmTrade', {client: this.state.client, confirm: confirm});
            },
            submitStealCards:function(cardIds){
                this.socket.emit('stealCards', {client: this.state.client, cardIds: cardIds});
            },
            submitCancelPending:function(){
                this.socket.emit('cancelPending', {client: this.state.client});
            },
            cancelStealFrame:function(){
                this.submitCancelPending();
                this._closeStealFrame();
            },
            _openStealFrame:function(targetName){
                this._stealFrameTargetName = targetName;
                this.stealPicked = [];
                this._stealPickOriginalY = {};
                this.stealFrameActive = true;
                this._layoutStealFrame();
            },
            _closeStealFrame:function(){
                // Unconditional first: whatever else happens below, the backdrop must
                // never be left stuck up covering the whole board (it sits above every
                // card — see the note by its template usage).
                this.stealFrameActive = false;
                this.stealPicked = [];
                this._stealPickOriginalY = {};
                if(!this._stealFrameTargetName) return;
                let targetName = this._stealFrameTargetName;
                this._stealFrameTargetName = null; // lift the updateHand gate
                this.updateHand(targetName); // fold every card back to its normal position
            },
            _layoutStealFrame:function(){
                let p = this.state.game.pendingInteraction;
                if(!p) return;
                let cards = this.pendingStealCards.slice().sort(function(a, b){ return a.id - b.id; });
                let cardsCount = cards.length;
                let config = { x: this.config.boardWidth * 0.5, y: this.config.boardHeight * 0.40 };
                let scale = 1.1;
                let pivotSetting = 320;
                let angleRange = Math.min((cardsCount * 30) / 8, 46);
                let angleMin = -(angleRange / 2);
                let angleStep = cardsCount > 1 ? angleRange / (cardsCount - 1) : 0;
                let angle = cardsCount > 1 ? angleMin : 0;
                // The draw pile's z-index is 150+moveId, and moveId climbs unboundedly
                // over the course of a round (every draw/discard/redistribute bumps it) —
                // a fixed base of 900 gets outrun by the deck in longer games, letting it
                // paint over these unfolding cards. 5000 leaves realistic headroom.
                let posZ = 5000;
                for(let i = 0; i < cards.length; i++){
                    let cosi = (1 - Math.cos(angle * (Math.PI / 180))) * pivotSetting;
                    let sini = (Math.sin(angle * (Math.PI / 180))) * pivotSetting;
                    cards[i].transform.angle = angle;
                    cards[i].transform.x = config.x + sini;
                    cards[i].transform.y = config.y + cosi;
                    cards[i].transform.z = posZ;
                    cards[i].transform.scale = scale;
                    cards[i].transform.d = 0.5;
                    cards[i].transform.delay = i * 0.03;
                    posZ++;
                    angle += angleStep;
                }
            },
            _foldBackNonPicked:function(targetName, pickedIds){
                let clientCards = [];
                for(let i = 0; i < this.state.game.cards.length; i++){
                    let c = this.state.game.cards[i];
                    if(c.owner === targetName && pickedIds.indexOf(c.id) === -1) clientCards.push(c);
                }
                let config = this.config.players[targetName];
                if(!config) return;
                let scale = this.config.opponentCardScale;
                let pivotSetting = 200;
                let cardsCount = clientCards.length;
                let angleRange = Math.min((cardsCount * 30) / 9, 35);
                let angleMin = -(angleRange / 2);
                let angleStep = cardsCount > 1 ? angleRange / (cardsCount - 1) : 0;
                let angle = cardsCount > 1 ? angleMin : 0;
                let posZ = 50;
                for(let i = 0; i < clientCards.length; i++){
                    let cosi = (1 - Math.cos(angle * (Math.PI / 180))) * pivotSetting;
                    let sini = (Math.sin(angle * (Math.PI / 180))) * pivotSetting;
                    clientCards[i].transform.angle = angle;
                    clientCards[i].transform.x = config.x + sini;
                    clientCards[i].transform.y = config.y + cosi;
                    clientCards[i].transform.z = posZ;
                    clientCards[i].transform.scale = scale;
                    clientCards[i].transform.d = 0.4;
                    clientCards[i].transform.delay = i * 0.02;
                    posZ++;
                    angle += angleStep;
                }
            },
            _playStealVictimShake:function(){
                let self = this.self;
                let clientCards = this.state.game.cards.filter(function(c){ return c.owner === self; });
                for(let i = 0; i < clientCards.length; i++){
                    let c = clientCards[i];
                    c.transform.y -= 20;
                    c.transform.angle += (i % 2 === 0 ? -4 : 4);
                    c.transform.d = 0.16;
                    c.transform.delay = i * 0.012;
                }
                let self2 = this;
                setTimeout(function(){
                    self2.updateHand(self);
                }, 260);
            },
            _flyPickedToSelf:function(pickedIds){
                let selfConfig = this.config.players[this.self];
                if(!selfConfig) return;
                let i = 0;
                for(let k = 0; k < this.state.game.cards.length; k++){
                    let c = this.state.game.cards[k];
                    if(pickedIds.indexOf(c.id) === -1) continue;
                    c.transform.x = selfConfig.x + (10 - Math.random() * 20);
                    c.transform.y = selfConfig.y + 170 + (10 - Math.random() * 20);
                    c.transform.angle = (10 - Math.random() * 20);
                    c.transform.z = 5200 + i;
                    c.transform.scale = 1.0;
                    c.transform.d = 0.45;
                    c.transform.delay = i * 0.05;
                    i++;
                }
            },
            stealCardClick:function(card){
                let p = this.state.game.pendingInteraction;
                if(!p || p.awaiting !== 'steal') return;
                let idx = this.stealPicked.indexOf(card.id);
                if(idx !== -1){
                    this.stealPicked.splice(idx, 1);
                    let origY = this._stealPickOriginalY[card.id];
                    if(typeof origY === 'number'){
                        card.transform.y = origY;
                        delete this._stealPickOriginalY[card.id];
                    }
                    card.transform.scale = 1.1;
                    card.transform.d = 0.15;
                    return;
                }
                if(this.stealPicked.length >= p.stealCount) return;
                this._stealPickOriginalY[card.id] = card.transform.y;
                this.stealPicked.push(card.id);
                card.transform.y -= 26;
                card.transform.scale = 1.3;
                card.transform.d = 0.15;

                if(this.stealPicked.length === p.stealCount){
                    let pickedIds = this.stealPicked.slice();
                    let targetName = p.targetName;
                    this._foldBackNonPicked(targetName, pickedIds);
                    this._flyPickedToSelf(pickedIds);
                    this._stealFrameTargetName = null;
                    this.stealFrameActive = false;
                    this.stealPicked = [];
                    this._stealPickOriginalY = {};
                    this.submitStealCards(pickedIds);
                }
            },
            cardSetOwner:function(card, owner){

                switch(owner){
                    case OWNER_DRAW_DECK:
                        this.transitionToDrawDeck(card);
                    break;
                    case OWNER_DISCARD_DECK:
                        this.transitionToDiscardDeck(card);                    
                    break;
                    default:
                         this.transitionToHand(card, owner);              
                };
            },
            transitionToDrawDeck:function(card){

                card.owner = OWNER_DRAW_DECK;

                card.transform.x = this.config.drawPos.x + (5 - (Math.random()*10));
                card.transform.y = this.config.drawPos.y + (5 - (Math.random()*10));
                card.transform.angle = (5 - (Math.random()*10));
                card.transform.z = 150 + parseInt(card.moveId);
                card.transform.scale = 1;
                card.transform.d = 0;
                card.transform.delay = 0;
            },
            transitionToDiscardDeck:function(card){

                card.owner = OWNER_DISCARD_DECK;

                card.transform.x = this.config.discardPos.x + (10 - (Math.random()*20));
                card.transform.y = this.config.discardPos.y + (10 - (Math.random()*20));
                card.transform.angle = (10 - (Math.random()*20));
                // A fixed z tied every discard card, so render order (array/DOM
                // order, not play order) decided which sat on top — sometimes
                // putting a just-played card visibly under an older one. Same
                // moveId-based fix already used for the draw pile.
                card.transform.z = 200 + parseInt(card.moveId);
                card.transform.scale = 1;
                card.transform.d = 0.22;
                card.transform.delay = 0;
            },
            transitionToHand:function(card, owner){
                card.owner = owner;
                if(typeof this.config.players[owner] !== 'undefined'){

                    let config = this.config.players[owner];

                    card.transform.x = config.x + (5 - (Math.random()*10));
                    card.transform.y = config.y + (5 - (Math.random()*10));
                    card.transform.z = 300;
                    card.transform.angle = (10 - (Math.random()*20));
                    card.transform.scale = config.scale;
                    card.transform.d = 0.32;
                    card.transform.delay = 0;
                }
            },
            cardOnClick:function(card){
                if(this._playCooldown) return;
                if(Date.now() < this._discardAnimLockUntil) return;

                if(this.stealFrameActive && card.owner === this._stealFrameTargetName){
                    this.stealCardClick(card);
                    return;
                }

                if(card.owner == OWNER_DRAW_DECK && card.nextMoveValid && this.state.client.turn){
                    this._playCooldown = true;
                    let self = this;
                    setTimeout(function(){ self._playCooldown = false; }, 1000);

                    sound.play('draw');
                    this.takeCard();

                    card.nextMoveValid = false;
                    this.cardSetOwner(card, this.self);

                    this.state.client.turn = false;

                }else if(card.owner == this.self && card.nextMoveValid){
                    this._playCooldown = true;
                    let selfC = this;
                    setTimeout(function(){ selfC._playCooldown = false; }, 1000);
                    this.playCard(card);
                }
            },
            cardTransitionFinish:function(card){
                if(this.state.game.winner) return;
                if(card._pendingAnim){
                    card._pendingAnim = false;
                    if(this._animPending > 0) this._animPending--;
                }
                if(this._animPending > 0) return;
                this._clearAnimPendingWatchdog();
                for(let i=0; i<this.state.clients.length; i++){
                    this.updateHand(this.state.clients[i].name);
                }
            },
            _bumpAnimPending:function(){
                this._animPending++;
                if(this._animPendingWatchdog) return;
                // Belt-and-suspenders: _animPending is a hand-maintained counter tied to
                // GSAP onComplete callbacks across a bursty, replay-prone event stream (see
                // the replay guard above). If it ever drifts positive with nothing left to
                // decrement it, hands stay permanently un-fanned. Force a resync a few
                // seconds after any card starts moving, well past the longest legitimate
                // stagger (a full-table Rotate finishes in ~1.6s).
                let self = this;
                this._animPendingWatchdog = setTimeout(function(){
                    self._animPendingWatchdog = null;
                    if(self._animPending <= 0) return;
                    self._animPending = 0;
                    for(let i = 0; i < self.state.game.cards.length; i++){
                        self.state.game.cards[i]._pendingAnim = false;
                    }
                    for(let i = 0; i < self.state.clients.length; i++){
                        self.updateHand(self.state.clients[i].name);
                    }
                }, 4000);
            },
            _clearAnimPendingWatchdog:function(){
                if(this._animPendingWatchdog){
                    clearTimeout(this._animPendingWatchdog);
                    this._animPendingWatchdog = null;
                }
            },
            onHandWheel: function(e){
                if(this.myCardsCount < 15 || !this.state.game.ready || this.state.game.winner) return;
                // If the wheel happened inside a scrollable panel, let the panel scroll
                let el = e.target;
                while(el && el !== this.$el){
                    let ov = window.getComputedStyle(el).overflowY;
                    if(ov === 'auto' || ov === 'scroll') return;
                    el = el.parentElement;
                }
                e.preventDefault();
                let SPACING = 34;
                let totalWidth = (this.myCardsCount - 1) * SPACING;
                let maxScroll = Math.max(0, (totalWidth - this.config.boardWidth + 100) / 2);
                this.handScrollX = Math.max(-maxScroll, Math.min(maxScroll, this.handScrollX - e.deltaY * 0.4));
                this.updateHand(this.self);
            },
            scrollHand: function(steps){
                let SPACING = 34;
                let totalWidth = (this.myCardsCount - 1) * SPACING;
                let maxScroll = Math.max(0, (totalWidth - this.config.boardWidth + 100) / 2);
                this.handScrollX = Math.max(-maxScroll, Math.min(maxScroll, this.handScrollX + steps * SPACING));
                this.updateHand(this.self);
            },
            initDeck:function(data){
                this.handScrollX = 0;
                this.state.game.cards = data;
                for(let i=0; i<this.state.game.cards.length; i++){
                    this.cardSetOwner(this.state.game.cards[i], this.state.game.cards[i].owner);
                    this.state.game.cards[i].transform.d = 0;
                }
            },
            updateHand:function(player){
                // Steal frame has exclusive control of this player's card transforms
                // while it's unfolded — normal re-layout resumes once it closes.
                if(this._stealFrameTargetName && player === this._stealFrameTargetName) return;
                let clientCards = [];
                for(let i=0; i<this.state.game.cards.length; i++){
                    if(this.state.game.cards[i].owner == player){
                        clientCards.push(this.state.game.cards[i]);
                    }
                }

                clientCards.sort(function(a,b){
                    if(a.type < b.type)return -1;
                    if(a.type > b.type)return 1;                    
                    return 0;
                });

                let config = this.config.players[player];

                let scale = (player === this.self)?1.2:this.config.opponentCardScale;

                let pivotSetting = (player === this.self)?400:200;

                let angleRangeDiv = (player === this.self)?7:9;
                let maxAngle = (player === this.self)?50:35;

                let cardsCount = clientCards.length;

                // Flat scrollable row for large hands
                if(player === this.self && cardsCount >= 15){
                    let SPACING = 34;
                    let totalWidth = (cardsCount - 1) * SPACING;
                    let maxScroll = Math.max(0, (totalWidth - this.config.boardWidth + 100) / 2);
                    this.handScrollX = Math.max(-maxScroll, Math.min(maxScroll, this.handScrollX));
                    let startX = config.x - totalWidth / 2 + this.handScrollX;
                    for(let i = 0; i < clientCards.length; i++){
                        clientCards[i].transform.angle = 0;
                        clientCards[i].transform.x = startX + i * SPACING;
                        clientCards[i].transform.y = config.y + 35;
                        clientCards[i].transform.z = 50 + i;
                        clientCards[i].transform.scale = 1.0;
                        clientCards[i].transform.d = 0.08;
                        clientCards[i].transform.delay = 0;
                    }
                    return;
                }

                let angleRange = (cardsCount * 30) / angleRangeDiv;
                angleRange = Math.min(angleRange, maxAngle);

                let angleMin = -(angleRange / 2);
                let angleMax = (angleRange / 2);
                let angleStep = (angleMax - angleMin) / (cardsCount - 1);
                let angle = angleMin;

                let posZ = 50;

                for(let i=0; i<clientCards.length; i++){

                    let cosi = (1 - Math.cos(angle * (Math.PI / 180))) * pivotSetting;
                    let sini = (Math.sin(angle * (Math.PI / 180))) * pivotSetting;

                    clientCards[i].transform.angle = angle;
                    if(typeof config !== 'undefined'){
                        clientCards[i].transform.x = config.x + sini;
                        clientCards[i].transform.y = config.y + cosi;
                    }
                    clientCards[i].transform.z = posZ;
                    clientCards[i].transform.scale = scale;
                    clientCards[i].transform.d = 0.18;
                    clientCards[i].transform.delay = i * 0.02;

                    posZ++;
                    angle += angleStep;
                }
            },
            updateDiscardDeck:function(){
                let clientCards = [];
                for(let i=0; i<this.state.game.cards.length; i++){
                    if(this.state.game.cards[i].owner == OWNER_DISCARD_DECK){
                        clientCards.push(this.state.game.cards[i]);
                    }
                }
                clientCards.sort(function(a,b){
                    if(parseInt(a.moveId) < parseInt(b.moveId))return -1;
                    if(parseInt(a.moveId) > parseInt(b.moveId))return 1;                    
                    return 0;
                });

                let posZ = 0;
                for(let i=0; i<clientCards.length; i++){
                    clientCards[i].transform.z = posZ;
                    posZ++;
                }
            },            
            processEvents:function(freshCards){
                let allEvents = this.state.game.events;
                if(typeof this._processedEventCount !== 'number' || allEvents.length < this._processedEventCount){
                    this._processedEventCount = 0;
                }
                // Server keeps a cumulative per-round event log, not a per-broadcast delta —
                // reprocessing already-seen entries every sync re-randomized discard-pile
                // card positions (transitionToDiscardDeck rolls new Math.random() offsets)
                // on every unrelated state push, seen as cards restlessly re-sliding in place.
                let events = allEvents.slice(this._processedEventCount);
                this._processedEventCount = allEvents.length;
                let hasDiscard = false;
                let discardPrevOwner = null;
                let drawCount = 0;
                let isRotateBatch = false;
                for(let i = 0; i < events.length; i++){
                    let e = events[i];
                    if(e.newOwner === 'dsc'){
                        hasDiscard = true;
                        let c = this.state.game.cards[e.cardId];
                        if(c){
                            discardPrevOwner = c.owner;
                            // Read type from the fresh response, not the stale local card —
                            // an opponent/AI's card is hidden (type null) in our local cache
                            // until this very broadcast reveals it, so the local copy still
                            // shows the type from before it was discarded.
                            let freshType = freshCards && freshCards[e.cardId] ? freshCards[e.cardId].type : c.type;
                            isRotateBatch = freshType && freshType.slice(1) === 'rot';
                        }
                        break;
                    }
                    if(e.newOwner === 'draw') drawCount++;
                }
                if(!hasDiscard && drawCount >= 5){
                    sound.play('reshuffle'); sound.play('shuffle');
                    let self = this;
                    setTimeout(function(){
                        for(let i = 0; i < self.state.clients.length; i++){
                            self.updateHand(self.state.clients[i].name);
                        }
                        for(let j = 0; j < self.state.game.cards.length; j++){
                            let c = self.state.game.cards[j];
                            if(c.owner === OWNER_DRAW_DECK) self.transitionToDrawDeck(c);
                        }
                    }, 80);
                }
                // opponent drew from deck (self draw is handled immediately in cardOnClick)
                // suppress during UNO fail — draw8 sound handles it from the lastEvent watcher
                let isUnoFail = this.state.game.lastEvent && this.state.game.lastEvent.type === 'uf';
                if(!hasDiscard && drawCount < 5 && !isUnoFail){
                    for(let i = 0; i < events.length; i++){
                        let e = events[i];
                        if(e.newOwner !== 'draw' && e.newOwner !== this.self){
                            sound.play('draw');
                            break;
                        }
                    }
                }
                let dealIdx = 0;
                for(let i = 0; i < events.length; i++){
                    let event = events[i];
                    let card = this.state.game.cards[event.cardId];
                    if(typeof card === 'undefined') continue;
                    this.cardSetOwner(card, event.newOwner);
                    // A replayed event (the cursor self-correction below re-slices from 0
                    // whenever the server's event log is shorter than expected, e.g. right
                    // after any clearEvents()) must not double-count a card that's already
                    // mid-animation, or _animPending gains a phantom unit with no matching
                    // decrement, permanently blocking the post-animation hand re-fan.
                    if(hasDiscard && event.newOwner !== 'dsc' && event.newOwner !== 'draw' && !card._pendingAnim){
                        if(isRotateBatch){
                            // Every active hand moves at once here (vs. a single card for
                            // Trade Hands) -- drop the per-card stagger and shorten the
                            // flight itself so the whole table's redistribution reads as
                            // one quick beat instead of a slow, busy wash of dozens of cards.
                            card.transform.d = 0.5;
                            card.transform.delay = 0;
                        } else {
                            card.transform.delay = 0.22 + dealIdx * 0.05;
                        }
                        card._pendingAnim = true;
                        this._bumpAnimPending();
                        dealIdx++;
                    }
                }
                // opponent played a card (self play is handled immediately in playCard())
                if(hasDiscard && discardPrevOwner
                   && discardPrevOwner !== this.self
                   && discardPrevOwner !== OWNER_DRAW_DECK
                   && discardPrevOwner !== OWNER_DISCARD_DECK){
                    sound.play('play');
                }
                // hold input briefly so the next player can't act before this discard's
                // travel animation visually lands (avoids overlapping plays at the pile)
                if(hasDiscard){
                    this._discardAnimLockUntil = Date.now() + DISCARD_ANIM_LOCK_MS;
                }
                if(hasDiscard && dealIdx > 0) sound.play('deal');

                // Added: universal card_play.mp3 / card_deal.mp3, beside the sounds above —
                // fires for every play/deal event regardless of who or what card type.
                if(hasDiscard) sound.play('play');
                let anyDeal = false;
                for(let i = 0; i < events.length; i++){
                    if(events[i].newOwner !== 'dsc' && events[i].newOwner !== 'draw'){ anyDeal = true; break; }
                }
                if(anyDeal) sound.play('deal');
            },
            updateState:function(cards){
                let dealIdx = 0;
                // Rotate reassigns every active player's whole hand in one broadcast
                // (dozens of cards can change owner at once) — the per-card deal
                // stagger below is tuned for a handful of dealt cards and balloons
                // linearly with table/hand size. Rotate's cards move together instead,
                // which is why a small swap like Trade Hands (same code path, few
                // cards) already looked fast: it was never staggered enough to notice.
                let isRotate = this.state.game.lastEvent && this.state.game.lastEvent.type === 'rot';
                for(let i=0; i<this.state.game.cards.length; i++){
                    if(typeof cards[i] === 'undefined')continue;

                    if(this.state.game.cards[i].moveId !== cards[i].moveId &&
                       this.state.game.cards[i].owner === OWNER_DRAW_DECK){
                        this.state.game.cards[i].transform.z = 150 + parseInt(cards[i].moveId);
                    }
                    this.state.game.cards[i].moveId = cards[i].moveId;

                    if(cards[i].owner !== this.state.game.cards[i].owner){
                        this.cardSetOwner(this.state.game.cards[i], cards[i].owner);
                        if(cards[i].owner !== OWNER_DISCARD_DECK && cards[i].owner !== OWNER_DRAW_DECK && !this.state.game.cards[i]._pendingAnim){
                            if(isRotate){
                                // Every card on the table moves at once here (vs. a single
                                // card for Trade Hands) — on top of dropping the stagger,
                                // shorten the per-card flight itself so the whole table's
                                // redistribution reads as one quick beat, not a slow, busy
                                // wash of dozens of cards each taking the normal 0.32s.
                                this.state.game.cards[i].transform.d = 0.18;
                                this.state.game.cards[i].transform.delay = 0;
                            } else {
                                this.state.game.cards[i].transform.delay = dealIdx * 0.05;
                            }
                            this.state.game.cards[i]._pendingAnim = true;
                            this._bumpAnimPending();
                            dealIdx++;
                        }
                    }

                    this.state.game.cards[i].owner = cards[i].owner;
                    this.state.game.cards[i].type = cards[i].type;
                    this.state.game.cards[i].nextMoveValid = cards[i].nextMoveValid;
                }
            },
            gameStateResponse(response){
                let prevWinner = this.state.game.winner;
                let prevTurnClient = this.state.clients.find(function(c){ return c.turn; });
                let prevTurnName = prevTurnClient ? prevTurnClient.name : null;
                let prevPendingInteraction = this.state.game.pendingInteraction;

                this.state.client = response.client;

                if (this._prevLobbyClients !== null && this.state.client && this.state.client.code) {
                    var myName = this.state.client.name;
                    var prev = this._prevLobbyClients;
                    var next = response.clients || [];
                    var self0 = this;
                    next.forEach(function(nc) {
                        if (!nc.isAI && !prev.find(function(pc){ return pc.name === nc.name; }) && nc.name !== myName)
                            self0._addLobbyNotif(nc.name, 'connected');
                    });
                    next.forEach(function(nc) {
                        if (nc.isAI) return;
                        var pc = prev.find(function(p){ return p.name === nc.name; });
                        if (pc && !pc.disconnected && nc.disconnected)
                            self0._addLobbyNotif(nc.name, 'disconnected');
                    });
                    prev.forEach(function(pc) {
                        if (pc.isAI) return;
                        if (!next.find(function(nc){ return nc.name === pc.name; }) && !pc.disconnected && pc.name !== myName)
                            self0._addLobbyNotif(pc.name, 'quit');
                    });
                }
                this._prevLobbyClients = (response.clients || []).map(function(c){ return { name: c.name, disconnected: !!c.disconnected, isAI: !!c.isAI }; });

                this.state.clients = response.clients;

                if(this.config.playersInitialized){
                    let self = this;
                    if(this.state.clients.some(function(c){ return typeof self.config.players[c.name] === 'undefined'; })){
                        this.initClientsConfig(this.state.clients);
                    }
                }

                if(this.config.initialized && response.game.ready && this.state.clients.length < 2){
                    this.quitGame();
                    return;
                }

                this.state.game.events = response.game.events;
                this.state.game.winner = response.game.winner;
                this.state.game.ready = response.game.ready;
                this.state.game.direction = response.game.direction;
                this.state.game.roundsPlayed = response.game.roundsPlayed;
                this.state.game.maxRounds = response.game.maxRounds;
                this.state.game.seriesWinner = response.game.seriesWinner;
                this.state.game.unoRequired = response.game.unoRequired || null;
                this.state.game.unoTtl = response.game.unoTtl || null;
                this.state.game.stackPending = response.game.stackPending || null;
                this.state.game.pendingInteraction = response.game.pendingInteraction || null;
                this._detectPendingResolution(prevPendingInteraction, response);
                this.state.game.ruleset = response.game.ruleset || 'original';
                this.state.game.hardcoreMode = !!response.game.hardcoreMode;
                this.state.game.brMode = !!response.game.brMode;
                this.state.game.brEliminated = response.game.brEliminated || [];
                if(response.game.unoEvent){
                    this.state.game.lastEvent = response.game.unoEvent;
                }

                if(prevWinner && !this.state.game.winner){
                    this._animPending = 0;
                    this._clearAnimPendingWatchdog();
                    for(let i = 0; i < this.state.game.cards.length; i++){
                        this.state.game.cards[i]._pendingAnim = false;
                        this.transitionToDrawDeck(this.state.game.cards[i]);
                    }
                }

                if(!this.config.initialized && response.game.cards.length > 0){
                    this.config.initialized = true;
                    if(!this.config.playersInitialized && this.state.clients.length > 0){
                        this.config.playersInitialized = true;
                        this.initClientsConfig(this.state.clients);
                    }
                    this.initDeck(response.game.cards);
                    // deal() already reflected in this snapshot pushed same-tick events; mark
                    // consumed or processEvents() replays the deal, re-folding/re-fanning hands.
                    this._processedEventCount = response.game.events.length;

                }else if(this.config.initialized && response.game.events.length > 0){
                    if(!this.config.playersInitialized){
                        this.config.playersInitialized = true;
                        this.initClientsConfig(this.state.clients);
                    }
                    this.processEvents(response.game.cards);
                    this._detectActionEvent(prevTurnName, response);
                }
                this.updateState(response.game.cards);
                this.updateDiscardDeck();
                if(this._animPending === 0 && this.config.playersInitialized && response.game.events.length === 0){
                    for(let i = 0; i < this.state.clients.length; i++){
                        this.updateHand(this.state.clients[i].name);
                    }
                }
            },
            _startSpinner: function(){
                this._clearSpinnerTimers();
                let self = this;
                let clients = this.state.clients;
                let names = clients.map(function(c){ return c.name; }).filter(Boolean);
                if(names.length === 0) return;
                let fc = clients.find(function(c){ return c.turn; });
                let firstPlayer = fc ? fc.name : names[0];
                let maxLen = names.reduce(function(m, n){ return Math.max(m, n.length); }, 0);

                let buildCells = function(name){
                    let cells = [];
                    for(let i = 0; i < maxLen; i++){
                        cells.push({ char: name[i] || '', spinning: true, locked: false });
                    }
                    return cells;
                };

                self.spinnerActive = true;
                self.spinnerLanded = false;
                self._spinnerTimers = [];
                self._curSpinName = names[Math.floor(Math.random() * names.length)];
                self.spinnerCells = buildCells(self._curSpinName);

                // cascading per-letter lock onto the landing name, left to right
                let lockIn = function(){
                    let chars = firstPlayer.split('');
                    let cellCount = self.spinnerCells.length;
                    let lockedCount = 0;
                    for(let i = 0; i < cellCount; i++){
                        let t = setTimeout(function(){
                            self.spinnerCells[i].char = chars[i] || '';
                            self.spinnerCells[i].spinning = false;
                            self.spinnerCells[i].locked = true;
                            sound.play('countdown');
                            lockedCount++;
                            if(lockedCount === cellCount){
                                self.spinnerLanded = true;
                                sound.play('yourTurn');
                                self._spinnerTimers.push(setTimeout(function(){
                                    self.spinnerActive = false;
                                    self.spinnerLanded = false;
                                }, 1400));
                            }
                        }, i * 70);
                        self._spinnerTimers.push(t);
                    }
                };

                if(names.length === 1){
                    lockIn();
                    return;
                }

                // deceleration: full-name flips get slower as they approach landing
                let delays = [60, 60, 70, 70, 80, 90, 100, 120, 140, 170, 210, 260];
                let step = 0;

                let scheduleNext = function(){
                    let t = setTimeout(function(){
                        step++;
                        if(step >= delays.length){
                            lockIn();
                            return;
                        }
                        sound.play('countdown');
                        let pick;
                        do{ pick = names[Math.floor(Math.random() * names.length)]; } while(pick === self._curSpinName);
                        self._curSpinName = pick;
                        self.spinnerCells = buildCells(pick);
                        scheduleNext();
                    }, delays[step]);
                    self._spinnerTimers.push(t);
                };
                scheduleNext();
            },
            _clearSpinnerTimers: function(){
                (this._spinnerTimers || []).forEach(function(id){ clearInterval(id); clearTimeout(id); });
                this._spinnerTimers = [];
            },
            _detectActionEvent: function(prevTurnName, response){
                let cards = response.game.cards;
                let topDiscard = null;
                let topMoveId = -1;
                for(let i = 0; i < cards.length; i++){
                    if(cards[i].owner === 'dsc' && cards[i].moveId > topMoveId){
                        topMoveId = cards[i].moveId;
                        topDiscard = cards[i];
                    }
                }
                if(!topDiscard || topMoveId === this._lastDiscardMoveId) return;
                this._lastDiscardMoveId = topMoveId;

                let numb = topDiscard.type ? topDiscard.type.slice(1) : '';
                let isClassic = ['p','n','g','r','c'].indexOf(numb) !== -1;
                let nextgenDef = NEXTGEN_CARDS[numb];
                if(!isClassic && !nextgenDef) return;
                if(!isClassic){
                    this._detectNextgenEvent(numb, nextgenDef, prevTurnName, response, topDiscard);
                    return;
                }

                let labelMap = { p: lang.t('ev_plus2'), n: lang.t('ev_skip'), g: lang.t('ev_plus4'), r: lang.t('ev_reverse') };
                let target = null;
                let clients = response.clients;

                if(numb === 'p' || numb === 'g'){
                    if(this.state.game.ruleset === 'stacking'){
                        // In stacking mode no cards are drawn yet — target is who must respond
                        let turnClient = response.clients.find(function(c){ return c.turn; });
                        if(turnClient) target = turnClient.name;
                        let stack = this.state.game.stackPending;
                        if(stack) labelMap[numb] = lang.t('ev_stack', { n: stack.count });
                    } else {
                        let gains = {};
                        response.game.events.forEach(function(ev){
                            if(ev.newOwner !== 'dsc' && ev.newOwner !== 'draw'){
                                gains[ev.newOwner] = (gains[ev.newOwner]||0) + 1;
                            }
                        });
                        let maxGain = 0;
                        Object.keys(gains).forEach(function(name){
                            if(gains[name] > maxGain){ maxGain = gains[name]; target = name; }
                        });
                    }
                } else if(numb === 'n' && prevTurnName){
                    let active = clients.filter(function(c){ return !c.brEliminated; });
                    let pool = active.length > 0 ? active : clients;
                    let prevIdx = -1;
                    for(let i = 0; i < pool.length; i++){
                        if(pool[i].name === prevTurnName){ prevIdx = i; break; }
                    }
                    if(prevIdx !== -1){
                        let nextIdx = response.game.direction
                            ? (prevIdx + 1) % pool.length
                            : (prevIdx - 1 + pool.length) % pool.length;
                        target = pool[nextIdx].name;
                    }
                } else if(numb === 'r'){
                    target = prevTurnName;
                }

                if(numb === 'p'){
                    sound.play('plus2');
                    if(this.state.game.ruleset !== 'stacking') sound.play('draw2');
                }
                else if(numb === 'g'){
                    sound.play('plus4');
                    if(this.state.game.ruleset !== 'stacking') sound.play('draw4');
                    let colorSndMap = { r:'colorRed', g:'colorGreen', b:'colorBlue', y:'colorYellow' };
                    let colorSnd = colorSndMap[topDiscard && topDiscard.type ? topDiscard.type.charAt(0) : ''];
                    if(colorSnd) setTimeout(function(){ sound.play(colorSnd); }, 1100);
                }
                else if(numb === 'n'){ sound.play('skip'); sound.play('missTurn'); }
                else if(numb === 'r'){ sound.play('reverse'); sound.play('reverseWav'); sound.play('arrowSwitch'); }
                else if(numb === 'c'){
                    let wcColorMap = { r:'colorRed', g:'colorGreen', b:'colorBlue', y:'colorYellow' };
                    let wcSnd = wcColorMap[topDiscard && topDiscard.type ? topDiscard.type.charAt(0) : ''];
                    if(wcSnd) sound.play(wcSnd);
                    sound.play('reverse');
                }

                if(target){
                    this.state.game.lastEvent = {id: Date.now(), type: numb, target: target, label: labelMap[numb]};
                }
            },
            _stackSound:function(count){
                if(count >= 20){
                    let opts = ['unoMissedNo', 'unoMissedOops', 'unoMissedSuffer'];
                    return opts[Math.floor(Math.random() * opts.length)];
                }
                if(count >= 18) return 'draw18';
                if(count >= 16) return 'draw16';
                if(count >= 14) return 'draw14';
                if(count >= 12) return 'draw_twelve';
                if(count >= 10) return 'draw10';
                if(count >= 8) return 'draw8';
                if(count >= 6) return 'draw6';
                if(count >= 4) return 'draw4';
                return 'draw2';
            },
            // Steal/trade resolution moves cards between two OTHER players' hands
            // with no new discard event, so _detectActionEvent (keyed off the top
            // discard card's moveId) never fires for it — nobody but the two
            // participants ever saw anything happen. Diff the pendingInteraction
            // that just cleared against the fresh event slice to tell a genuine
            // completion apart from a cancel/AFK-timeout (which also nulls it but
            // moves no cards), then announce it to everyone via centerEvents.
            _detectPendingResolution:function(prevP, response){
                if(!prevP || this.state.game.pendingInteraction) return;
                let allEvents = response.game.events || [];
                let newEvents = allEvents.slice(this._processedEventCount);
                let self = this;
                let pushAnnouncement = function(type, label){
                    let id = Date.now() + Math.random();
                    self.centerEvents.push({ id: id, type: type, name: '', label: label });
                    setTimeout(function(){
                        self.centerEvents = self.centerEvents.filter(function(e){ return e.id !== id; });
                    }, 2600);
                };
                if(prevP.awaiting === 'steal'){
                    let gained = newEvents.filter(function(ev){ return ev.newOwner === prevP.from; });
                    if(gained.length > 0){
                        pushAnnouncement('stealdone', lang.t('nextgen_steal_announce', { from: prevP.from, n: gained.length, target: prevP.targetName }));
                    }
                } else if(prevP.awaiting === 'confirm' && prevP.kind === 'trade'){
                    let moved = newEvents.filter(function(ev){ return ev.newOwner === prevP.from || ev.newOwner === prevP.targetName; });
                    if(moved.length > 0){
                        pushAnnouncement('tradedone', lang.t('nextgen_trade_announce', { a: prevP.from, b: prevP.targetName }));
                    }
                }
            },
            _detectNextgenEvent:function(numb, def, prevTurnName, response, topDiscard){
                let label = lang.t(def.labelKey);
                let target = null;
                let target2 = null;
                let clients = response.clients;

                if(def.punishAmount || def.redrawAll){
                    if(this.state.game.ruleset === 'stacking' && def.punishAmount){
                        let turnClient = clients.find(function(c){ return c.turn; });
                        if(turnClient) target = turnClient.name;
                        let stack = this.state.game.stackPending;
                        if(stack) label = lang.t('ev_stack', { n: stack.count });
                    } else {
                        let gains = {};
                        response.game.events.forEach(function(ev){
                            if(ev.newOwner !== 'dsc' && ev.newOwner !== 'draw'){
                                gains[ev.newOwner] = (gains[ev.newOwner]||0) + 1;
                            }
                        });
                        let maxGain = 0;
                        Object.keys(gains).forEach(function(name){
                            if(gains[name] > maxGain){ maxGain = gains[name]; target = name; }
                        });
                    }
                } else if(def.skipCount && prevTurnName){
                    let active = clients.filter(function(c){ return !c.brEliminated; });
                    let pool = active.length > 0 ? active : clients;
                    let prevIdx = -1;
                    for(let i = 0; i < pool.length; i++){
                        if(pool[i].name === prevTurnName){ prevIdx = i; break; }
                    }
                    if(prevIdx !== -1){
                        let steps = (pool.length === 2) ? 1 : def.skipCount;
                        // Name the SKIPPED player(s) — same semantics as classic Skip's
                        // single-victim label — not whoever ends up with the turn.
                        // 2x Miss (steps=2) skips indices prevIdx+1 and prevIdx+2.
                        let idx1 = response.game.direction
                            ? (prevIdx + 1) % pool.length
                            : (prevIdx - 1 + pool.length) % pool.length;
                        target = pool[idx1].name;
                        if(steps >= 2){
                            let idx2 = response.game.direction
                                ? (prevIdx + 2) % pool.length
                                : (prevIdx - 2 + pool.length) % pool.length;
                            if(idx2 !== idx1) target2 = pool[idx2].name;
                        }
                    }
                } else if(prevTurnName){
                    target = prevTurnName;
                }

                sound.play(def.soundKey);
                if(def.skipCount) sound.play('unoFail');
                // Amount-specific draw sound — only for immediate (non-stacking) resolution;
                // in stacking mode the stackPending watcher plays it on growth/take instead.
                if(def.punishAmount && this.state.game.ruleset !== 'stacking'){
                    sound.play(this._stackSound(def.punishAmount));
                }
                if(def.isWild && !def.colorless){
                    let colorSndMap = { r:'colorRed', g:'colorGreen', b:'colorBlue', y:'colorYellow' };
                    let colorSnd = colorSndMap[topDiscard && topDiscard.type ? topDiscard.type.charAt(0) : ''];
                    if(colorSnd) sound.play(colorSnd);
                }

                // Rotate and Redraw All silently redistribute hand contents the instant
                // they're played (no separate confirm step) — hold input briefly so
                // nobody acts before the hand-shuffle animation visually lands. Reuses
                // the same lock cardOnClick already checks for discard-travel timing,
                // just held longer. Rotate's cards now move unstaggered (see updateState)
                // and land in ~0.32s, so its lock only needs a small buffer over that;
                // Redraw's still runs at the default (staggered) pace, so it keeps its
                // longer lock to match.
                if(def.rotateAll){
                    this._discardAnimLockUntil = Math.max(this._discardAnimLockUntil, Date.now() + 450);
                } else if(def.redrawAll){
                    this._discardAnimLockUntil = Math.max(this._discardAnimLockUntil, Date.now() + 2400);
                }

                if(target){
                    this.state.game.lastEvent = {id: Date.now(), type: numb, target: target, target2: target2, label: label};
                }
            },
        },
        mounted:function () {
            // Browsers don't let a page block Ctrl+R/F5 outright (that's a deliberate
            // security limit, not something JS can override) — beforeunload is the
            // actual mechanism: it shows the browser's native "leave site?" confirm
            // prompt for any refresh/close/navigation-away, which is the real,
            // reliable way to guard against an accidental mid-game refresh.
            let unoGameSelf = this;
            window.addEventListener('beforeunload', function(e){
                if(unoGameSelf.state.client.code){
                    e.preventDefault();
                    e.returnValue = '';
                }
            });

            let savedTable = parseInt(localStorage.getItem('unoTable'));
            if(savedTable >= 1 && savedTable <= 6) this.tableIndex = savedTable;
            this._animPending = 0;
            this._animPendingWatchdog = null;
            this._discardAnimLockUntil = 0;
            this._prevLobbyClients = null;
            this._stealFrameTargetName = null;
            this._stealPickOriginalY = {};
            this._processedEventCount = 0;

            const token = localStorage.getItem('unoAuthToken');
            if (token) this.loadUserSession(token);
            else this.loadFriendList();

            this.socket.on('state', this.gameStateResponse);

            let self = this;

            this.socket.on('xpAwarded', function(data){
                self.xpData = data;
            });

            self._goldHandler = function(data) {
                self.gold = data.newTotal;
                const floatId = Date.now();
                self.goldFloats.push({ id: floatId, amount: data.amount });
                setTimeout(function() {
                    const idx = self.goldFloats.findIndex(function(f) { return f.id === floatId; });
                    if (idx !== -1) self.goldFloats.splice(idx, 1);
                }, 2000);
            };
            self.socket.on('goldAwarded', self._goldHandler);

            this.socket.on('turnTimer', function(d) {
                self.afkTimer = { playerName: d.playerName, duration: d.duration, remaining: d.duration };
                if (self._afkInterval) clearInterval(self._afkInterval);
                self._afkInterval = setInterval(function() {
                    if (!self.afkTimer) { clearInterval(self._afkInterval); return; }
                    self.afkTimer.remaining = Math.max(0, self.afkTimer.remaining - 1);
                    if (self.afkTimer.remaining <= 0) clearInterval(self._afkInterval);
                }, 1000);
            });

            this.socket.on('turnTimerClear', function() {
                self.afkTimer = null;
                if (self._afkInterval) { clearInterval(self._afkInterval); self._afkInterval = null; }
            });

            this.socket.on('afkSkip', function(d) {
                self.afkTimer = null;
                if (self._afkInterval) { clearInterval(self._afkInterval); self._afkInterval = null; }
                var msg = d.streak >= 2
                    ? self.t('afk_kicked', { name: d.name })
                    : self.t('afk_skip', { name: d.name });
                var id = Date.now() + Math.random();
                self.afkNotifs.push({ id: id, msg: msg });
                setTimeout(function() { self.afkNotifs = self.afkNotifs.filter(function(n) { return n.id !== id; }); }, 4000);
            });

            this.socket.on('afkKicked', function() {
                self.afkTimer = null;
                if (self._afkInterval) { clearInterval(self._afkInterval); self._afkInterval = null; }
                self.quitGame();
            });

            //this.gameStateResponse(testDataNew);


        },
        beforeDestroy:function () {
            this._clearSpinnerTimers();
            if (this._afkInterval) clearInterval(this._afkInterval);
            if (this._goldHandler) this.socket.removeListener('goldAwarded', this._goldHandler);
        }

    }
</script>

<style scoped>
    .deck-count-badge {
        position: absolute;
        width: 40px;
        text-align: center;
        color: #fff;
        font-size: 13px;
        font-weight: bold;
        text-shadow: 0 1px 3px #000;
        pointer-events: none;
        z-index: 400;
        background: rgba(0,0,0,0.45);
        border-radius: 8px;
        padding: 1px 0;
    }
    .frame{
        top:5px;
        position:relative;
        width:800px;
        margin:0 auto;
    }
    .hand-scroll-arrow{
        position:absolute;
        z-index:300;
        width:30px;
        height:56px;
        background:rgba(0,0,0,0.55);
        color:#fff;
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius:5px;
        cursor:pointer;
        font-size:16px;
        user-select:none;
    }
    .hand-scroll-arrow:hover{ background:rgba(255,255,255,0.18); }
    .hand-scroll-left{ left:4px; }
    .hand-scroll-right{ right:4px; }
    .board-overlay{
        position:absolute;
        width:100%;
        height:100%;
        transform: translateZ(500px);
        z-index: 500;
    }
    .steal-frame-backdrop{
        position:absolute;
        top:0; left:0;
        width:100%;
        height:100%;
        background:rgba(0,0,0,0.55);
        z-index:800;
        animation: steal-frame-fade-in 0.35s ease-out;
    }
    @keyframes steal-frame-fade-in{
        from{ opacity:0; }
        to{ opacity:1; }
    }
    .steal-frame-hint{
        position:absolute;
        left:50%;
        top:22%;
        transform:translateX(-50%);
        z-index:850;
        color:#fff;
        font-size:15px;
        letter-spacing:0.5px;
        text-align:center;
        text-shadow:0 2px 6px rgba(0,0,0,0.8);
        display:flex;
        align-items:center;
        gap:14px;
    }
    .steal-frame-cancel{
        display:inline-block;
        padding:5px 16px;
        background:rgba(160,30,20,0.85);
        border-radius:6px;
        cursor:pointer;
        font-size:13px;
        letter-spacing:1px;
    }
    .steal-frame-cancel:hover{
        background:rgba(220,50,30,0.95);
    }
    .center-event {
        position: absolute;
        left: 50%;
        top: 40%;
        pointer-events: none;
        text-align: center;
        white-space: nowrap;
        animation: center-float 2.5s ease-out forwards;
        z-index: 400;
    }
    /* Rotate visibly moves cards around fast — a snappier label keeps pace,
       instead of the full 2.5s float used for classic action-card labels.
       Trade Hands and Redraw All went through this same fast path once but
       ended up barely visible/rushed, so they now use the default duration. */
    .center-ev-rot {
        animation-duration: 1.1s;
    }
    .ce-name {
        font-size: 20px;
        font-weight: 700;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        color: rgba(255,255,255,0.88);
        letter-spacing: 1px;
        text-shadow: 0 2px 8px rgba(0,0,0,1);
        margin-bottom: 2px;
    }
    .ce-label {
        font-size: 52px;
        font-weight: 900;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        letter-spacing: 2px;
        text-shadow: 0 3px 16px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,0.8);
    }
    .center-ev-p  .ce-label { color: #ffaa44; }
    .center-ev-g  .ce-label { color: #ff5555; }
    .center-ev-r  .ce-label { color: #44ccff; }
    .center-ev-n, .center-ev-r {
        animation-duration: 2.2s;
    }
    /* Nextgen card labels — same colored-text treatment classic p/g/r already
       get, applied to every new type so none of them render as plain/black text.
       Also covers the "+N STACK" variant of these same labels during stacking,
       since that reuses the same event type/class, just different text. */
    .center-ev-p6 .ce-label, .center-ev-p8 .ce-label { color: #ffaa44; }
    .center-ev-p10 .ce-label { color: #ff5555; }
    .center-ev-m2 .ce-label { color: #33ddaa; }
    .center-ev-th .ce-label { color: #4a90ff; }
    .center-ev-rda .ce-label { color: #aaff33; }
    .center-ev-rot .ce-label { color: #44ffaa; }
    .center-ev-tg1 .ce-label, .center-ev-tg2 .ce-label {
        background: linear-gradient(90deg, #2288ff, #66ddff, #2288ff);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }
    .center-ev-rbw .ce-label {
        background: linear-gradient(90deg, #e74c3c, #f1c40f, #2ecc71, #3498db, #9b59b6);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }
    /* Base .ce-label shadow is a heavy double-black drop shadow tuned for plain
       white text. text-shadow paints a solid silhouette behind the glyph — for
       the gradient/color:transparent labels below that silhouette shows straight
       through the transparent fill instead of hiding behind an opaque glyph, so
       it reads as a black smear inside the letters. filter:drop-shadow works on
       the actual rendered/composited pixels instead, so it hugs the visible
       glyph correctly regardless of fill technique. */
    .center-ev-p6 .ce-label, .center-ev-p8 .ce-label, .center-ev-p10 .ce-label,
    .center-ev-m2 .ce-label, .center-ev-th .ce-label, .center-ev-rda .ce-label,
    .center-ev-rot .ce-label, .center-ev-tg1 .ce-label, .center-ev-tg2 .ce-label,
    .center-ev-rbw .ce-label {
        text-shadow: none;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,0.65));
    }
    .center-ev-n .ce-name, .center-ev-r .ce-name {
        font-size: 40px;
    }
    .ce-icon {
        display: block;
        margin: 0 auto;
        width: 90px;
        height: auto;
        filter: drop-shadow(0 3px 16px rgba(0,0,0,1)) drop-shadow(0 0 30px rgba(0,0,0,0.8));
    }
    .ce-icon-reverse {
        animation: reverse-icon-spin 2.2s ease-out forwards;
        margin: 0;
    }
    .ce-reverse-row {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .ce-skip2-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }
    .ce-skip2-row .ce-icon {
        margin: 0;
    }
    .center-ev-u {
        animation: uno-center-float 3.2s ease-out forwards;
    }
    .center-ev-u  .ce-name  {
        font-size: 22px;
        color: #fff176;
        text-shadow: 0 0 18px rgba(255,220,0,0.95), 0 2px 8px rgba(0,0,0,1);
        letter-spacing: 2px;
    }
    .center-ev-u  .ce-label {
        color: #ffe600;
        font-size: 100px;
        letter-spacing: 6px;
        -webkit-text-stroke: 2px rgba(200,80,0,0.9);
        text-shadow:
            0 0 20px rgba(255,220,0,1),
            0 0 50px rgba(255,160,0,0.85),
            0 0 90px rgba(255,80,0,0.5),
            0 4px 18px rgba(0,0,0,1);
    }
    .center-ev-uf {
        animation: fail-bounce 3.2s ease-out forwards;
    }
    .center-ev-uf .ce-label {
        color: #ff2200;
        font-size: 52px;
        letter-spacing: 2px;
        -webkit-text-stroke: 1.5px rgba(255,80,0,0.8);
        text-shadow:
            0 0 18px rgba(255,60,0,1),
            0 0 40px rgba(255,20,0,0.7),
            0 0 70px rgba(255,0,0,0.4),
            0 4px 16px rgba(0,0,0,1);
    }
    .center-ev-uf .ce-name {
        font-size: 24px;
        font-weight: 900;
        color: #ff9966;
        letter-spacing: 2px;
        text-shadow: 0 0 12px rgba(255,100,0,0.9), 0 2px 8px rgba(0,0,0,1);
    }
    @keyframes fail-bounce {
        0%   { opacity: 0; transform: translateX(-50%) scale(0.2) rotate(-8deg); }
        10%  { opacity: 1; transform: translateX(-50%) scale(1.2) rotate(4deg); }
        17%  { opacity: 1; transform: translateX(-50%) scale(0.92) rotate(-3deg); }
        24%  { opacity: 1; transform: translateX(-50%) scale(1.06) rotate(2deg); }
        31%  { opacity: 1; transform: translateX(-50%) scale(0.98) rotate(-1deg); }
        38%  { opacity: 1; transform: translateX(-50%) scale(1.0) rotate(0deg); }
        65%  { opacity: 1; }
        100% { opacity: 0; transform: translateX(-50%) translateY(-90px) scale(1.05); }
    }

    .uno-btn {
        position: absolute;
        bottom: 18px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 450;
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: radial-gradient(circle at 40% 35%, #ff6600, #cc0000);
        border: 3px solid #ffdd00;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        user-select: none;
        animation: uno-pulse 0.65s ease-in-out infinite;
    }
    .uno-btn-text {
        color: #ffff00;
        font-size: 22px;
        font-weight: 900;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        text-shadow: 0 2px 6px rgba(0,0,0,0.9);
        line-height: 1;
    }
    .uno-btn-timer {
        color: rgba(255,255,255,0.85);
        font-size: 11px;
        font-weight: bold;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        text-shadow: 0 1px 3px rgba(0,0,0,0.9);
        margin-top: 2px;
    }
    @keyframes uno-pulse {
        0%   { box-shadow: 0 0 12px rgba(255,100,0,0.7), 0 0 28px rgba(255,50,0,0.3); transform: translateX(-50%) scale(1);    }
        50%  { box-shadow: 0 0 22px rgba(255,160,0,1),   0 0 50px rgba(255,80,0,0.6); transform: translateX(-50%) scale(1.1);  }
        100% { box-shadow: 0 0 12px rgba(255,100,0,0.7), 0 0 28px rgba(255,50,0,0.3); transform: translateX(-50%) scale(1);    }
    }

    @keyframes uno-center-float {
        0%   { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.3);  }
        14%  { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1.28); }
        22%  { opacity: 1; transform: translateX(-50%) translateY(2px)  scale(0.94); }
        30%  { opacity: 1; transform: translateX(-50%) translateY(-4px) scale(1.05); }
        38%  { opacity: 1; transform: translateX(-50%) translateY(0px)  scale(1.0);  }
        65%  { opacity: 1; }
        100% { opacity: 0; transform: translateX(-50%) translateY(-110px) scale(1.1); }
    }

    @keyframes center-float {
        0%   { opacity: 0; transform: translateX(-50%) translateY(10px)  scale(0.6); }
        12%  { opacity: 1; transform: translateX(-50%) translateY(0px)   scale(1);   }
        65%  { opacity: 1;                                                             }
        100% { opacity: 0; transform: translateX(-50%) translateY(-90px) scale(1.05);}
    }

    @keyframes reverse-icon-spin {
        0%   { transform: rotate(0deg); }
        100% { transform: rotate(180deg); }
    }

    .stack-banner {
        position: absolute;
        top: calc(50% + 90px);
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 18px;
        border-radius: 10px;
        pointer-events: none;
        z-index: 300;
        animation: stack-pulse 1.2s ease-in-out infinite;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        white-space: nowrap;
    }
    .stack-banner-p {
        background: rgba(20, 80, 200, 0.82);
        border: 2px solid #5599ff;
        box-shadow: 0 0 18px rgba(85,153,255,0.55);
    }
    .stack-banner-g {
        background: rgba(160, 30, 20, 0.85);
        border: 2px solid #ff6633;
        box-shadow: 0 0 18px rgba(255,80,40,0.55);
    }
    /* Nextgen punishment codes had no matching rule at all here — same bug
       class as the wild-card recolor issue: the banner class is keyed by
       stackPending.type, which for these cards is 'p6'/'p8'/'p10', not
       'p'/'g', so the panel rendered with no background whatsoever. */
    .stack-banner-p6, .stack-banner-p8 {
        background: rgba(20, 80, 200, 0.82);
        border: 2px solid #5599ff;
        box-shadow: 0 0 18px rgba(85,153,255,0.55);
    }
    .stack-banner-p10 {
        background: rgba(160, 30, 20, 0.85);
        border: 2px solid #ff6633;
        box-shadow: 0 0 18px rgba(255,80,40,0.55);
    }
    .sb-count {
        font-size: 30px;
        font-weight: 900;
        color: #ffffff;
        text-shadow: 0 0 12px rgba(255,255,255,0.7), 0 2px 4px rgba(0,0,0,0.8);
        line-height: 1;
    }
    .sb-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
    }
    .sb-rule {
        font-size: 11px;
        font-weight: bold;
        letter-spacing: 1.5px;
        color: rgba(255,255,255,0.8);
        text-transform: uppercase;
    }
    .sb-hint {
        font-size: 12px;
        font-weight: bold;
        color: #ffee88;
        text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    }
    @keyframes stack-pulse {
        0%   { box-shadow: 0 0 14px rgba(255,255,255,0.2); }
        50%  { box-shadow: 0 0 28px rgba(255,255,255,0.5); }
        100% { box-shadow: 0 0 14px rgba(255,255,255,0.2); }
    }

    .spinner-overlay {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 600;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.78);
        border-radius: 16px;
        padding: 22px 44px 26px;
        min-width: 260px;
        text-align: center;
        border: 2px solid rgba(255,200,0,0.55);
        box-shadow: 0 0 50px rgba(255,180,0,0.25), 0 8px 32px rgba(0,0,0,0.6);
        pointer-events: none;
    }
    .spinner-label {
        font-size: 12px;
        font-weight: bold;
        letter-spacing: 3px;
        color: rgba(255,255,255,0.55);
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        margin-bottom: 10px;
        text-transform: uppercase;
    }
    .spinner-cryptex {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-height: 52px;
        padding: 4px 6px;
        background: linear-gradient(180deg, #4a4a4a 0%, #1a1a1a 12%, #0c0c0c 50%, #1a1a1a 88%, #4a4a4a 100%);
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.18);
        box-shadow: inset 0 2px 6px rgba(0,0,0,0.8), inset 0 -2px 6px rgba(0,0,0,0.8), 0 0 0 transparent;
        transition: box-shadow 0.3s ease-out;
    }
    .spinner-cryptex.spinner-landed {
        box-shadow: inset 0 2px 6px rgba(0,0,0,0.8), inset 0 -2px 6px rgba(0,0,0,0.8),
                    0 0 24px rgba(255,200,0,0.8), 0 0 50px rgba(255,160,0,0.5);
        animation: spinner-pop 0.35s ease-out;
    }
    .cryptex-cell {
        position: relative;
        width: 32px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border-radius: 3px;
        background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.25));
        border-right: 1px solid rgba(0,0,0,0.5);
        border-left: 1px solid rgba(255,255,255,0.06);
    }
    .cryptex-char {
        font-size: 36px;
        font-weight: 900;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        color: #ffffff;
        text-shadow: 0 2px 8px rgba(0,0,0,1);
        transition: filter 0.15s, color 0.2s, text-shadow 0.2s;
        will-change: filter, transform;
    }
    .cryptex-cell.spinning .cryptex-char {
        filter: blur(2.5px);
        animation: cryptex-jitter 0.09s linear infinite;
    }
    .cryptex-cell.locked .cryptex-char {
        color: #ffe600;
        text-shadow: 0 0 16px rgba(255,220,0,0.9), 0 0 32px rgba(255,160,0,0.5), 0 2px 8px rgba(0,0,0,1);
        animation: spinner-pop 0.3s ease-out;
    }
    @keyframes cryptex-jitter {
        0%   { transform: translateY(-3px); }
        50%  { transform: translateY(3px); }
        100% { transform: translateY(-3px); }
    }
    .spinner-goes-first {
        font-size: 13px;
        font-weight: bold;
        letter-spacing: 3px;
        color: #ffe600;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        margin-top: 8px;
        text-shadow: 0 0 10px rgba(255,200,0,0.8);
        text-transform: uppercase;
        animation: spinner-sub-in 0.3s ease-out;
    }
    @keyframes spinner-pop {
        0%   { transform: scale(0.85); }
        55%  { transform: scale(1.12); }
        100% { transform: scale(1.0); }
    }
    @keyframes spinner-sub-in {
        0%   { opacity: 0; transform: translateY(6px); }
        100% { opacity: 1; transform: translateY(0); }
    }
    .spinner-fade-enter-active, .spinner-fade-leave-active { transition: opacity 0.3s; }
    .spinner-fade-enter, .spinner-fade-leave-to { opacity: 0; }

    .lobby-notifs { position:fixed; top:38%; left:50%; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:10px; z-index:500; pointer-events:none; }
    .lnotif { padding:12px 32px; border-radius:8px; font-size:22px; font-weight:bold; letter-spacing:0.5px; border:1px solid; white-space:nowrap; }
    .lnotif-connected  { color:#4eff88; border-color:#4eff88; text-shadow:0 0 10px #4eff88,0 0 22px #4eff88; box-shadow:0 0 10px rgba(78,255,136,.25); background:rgba(0,25,10,.85); }
    .lnotif-quit       { color:#ffaa33; border-color:#ffaa33; text-shadow:0 0 10px #ffaa33,0 0 22px #ffaa33; box-shadow:0 0 10px rgba(255,170,51,.25); background:rgba(25,12,0,.85); }
    .lnotif-disconnected { color:#ff4444; border-color:#ff4444; text-shadow:0 0 10px #ff4444,0 0 22px #ff4444; box-shadow:0 0 10px rgba(255,68,68,.25); background:rgba(25,0,0,.85); }
    .lnotif-name { font-weight:900; }
    .lnotif-enter-active { animation: lnotif-in .3s ease; }
    .lnotif-leave-active { transition: opacity .5s ease; }
    .lnotif-leave-to { opacity:0; }
    @keyframes lnotif-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

    .afk-notifs { top: 46%; }
    .center-ev-brout1 .ce-name,.center-ev-brout2 .ce-name,.center-ev-brout3 .ce-name,.center-ev-broutx .ce-name{
        font-size:22px; letter-spacing:2px; text-shadow:0 2px 8px rgba(0,0,0,1);
    }
    .center-ev-stealdone .ce-label, .center-ev-tradedone .ce-label {
        font-size: 30px;
        color: #cdeeff;
    }
    .center-ev-brout1 .ce-label,.center-ev-brout2 .ce-label,.center-ev-brout3 .ce-label,.center-ev-broutx .ce-label{
        font-size:68px; letter-spacing:5px; -webkit-text-stroke:1px rgba(0,0,0,0.5);
        text-shadow:0 0 18px currentColor,0 0 45px currentColor,0 4px 16px rgba(0,0,0,1);
    }
    .center-ev-brout1 .ce-name { color:#fff176; }
    .center-ev-brout1 .ce-label{ color:#ffe600; }
    .center-ev-brout2 .ce-name { color:#e0e0e0; }
    .center-ev-brout2 .ce-label{ color:#c0c0c0; }
    .center-ev-brout3 .ce-name { color:#ffcc88; }
    .center-ev-brout3 .ce-label{ color:#ff8800; }
    .center-ev-broutx .ce-name { color:#ffffff; }
    .center-ev-broutx .ce-label{ color:#ffffff; }
    .lnotif-brout1{ color:#ffe600; border-color:#ffe600; text-shadow:0 0 10px #ffe600,0 0 22px #ffe600; box-shadow:0 0 10px rgba(255,230,0,.25); background:rgba(20,18,0,.85); }
    .lnotif-brout2{ color:#c0c0c0; border-color:#c0c0c0; text-shadow:0 0 10px #c0c0c0,0 0 22px #c0c0c0; box-shadow:0 0 10px rgba(192,192,192,.25); background:rgba(12,12,12,.85); }
    .lnotif-brout3{ color:#ff8800; border-color:#ff8800; text-shadow:0 0 10px #ff8800,0 0 22px #ff8800; box-shadow:0 0 10px rgba(255,136,0,.25); background:rgba(20,10,0,.85); }
    .lnotif-broutx{ color:#ffffff; border-color:#ffffff; text-shadow:0 0 8px #fff; box-shadow:0 0 8px rgba(255,255,255,.15); background:rgba(10,10,10,.85); }
    .lnotif-afk { color:#ffcc44; border-color:#ffcc44; text-shadow:0 0 10px #ffcc44,0 0 22px #ffcc44; box-shadow:0 0 10px rgba(255,204,68,.25); background:rgba(25,18,0,.85); }

    .gold-hud {
        position: fixed;
        top: 8px;
        right: 120px;
        background: rgba(0,0,0,0.7);
        border: 1px solid #9a6515;
        border-radius: 4px;
        padding: 3px 8px;
        color: #f0c040;
        font-size: 12px;
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 4px;
        z-index: 100;
        pointer-events: none;
    }
    .gold-icon { font-size: 14px; }
    .gold-amount { color: #f0c040; }
    .gold-float {
        position: absolute;
        top: -20px;
        left: 50%;
        transform: translateX(-50%);
        color: #f0c040;
        font-size: 13px;
        font-weight: bold;
        animation: goldFloat 2s ease-out forwards;
        pointer-events: none;
        white-space: nowrap;
    }
    @keyframes goldFloat {
        0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-30px); }
    }
</style>