<template>
    <div class="login-box" :class="{'login-box-wide': authed && (view === 'create' || view === 'join')}" v-if="!client.code">

        <!-- AUTH VIEWS -->
        <template v-if="!authed">

            <template v-if="authView === 'landing'">
                <div class="landing-hero">
                    <div class="landing-logo"><img src="../../public/img/logo.png" alt="UNO WEB"></div>
                    <div class="landing-sub">Node.js Edition</div>
                </div>
                <div class="landing-btns">
                    <div class="land-btn land-btn-create" @click="authView = 'login'">
                        <div class="lb-icon">&#128275;</div>
                        <div class="lb-label">{{ t('login') }}</div>
                    </div>
                    <div class="land-btn land-btn-join" @click="authView = 'register'">
                        <div class="lb-icon">&#128100;</div>
                        <div class="lb-label">{{ t('register') }}</div>
                    </div>
                </div>

            </template>

            <template v-if="authView === 'login'">
                <div class="view-header">
                    <span class="back-btn" @click="authView = 'landing'">&#9664; {{ t('back') }}</span>
                    <span class="view-title">{{ t('login') }}</span>
                </div>
                <div class="form-section">
                    <div class="sec-hdr">{{ t('username') }}</div>
                    <input class="inp-name" type="text" :placeholder="t('username')" v-model="authUsername" maxlength="16" @keyup.enter="doLogin"/>
                </div>
                <div class="form-section">
                    <div class="sec-hdr">{{ t('password') }}</div>
                    <input class="inp-name" type="password" :placeholder="t('password')" v-model="authPassword" maxlength="64" @keyup.enter="doLogin"/>
                </div>
                <div class="auth-error" v-if="authError">{{ authError }}</div>
                <div class="row">
                    <Button faIcon="sign-in-alt" :clickHandler="doLogin">{{ t('login') }}</Button>
                </div>
            </template>

            <template v-if="authView === 'register'">
                <div class="view-header">
                    <span class="back-btn" @click="authView = 'landing'">&#9664; {{ t('back') }}</span>
                    <span class="view-title">{{ t('register') }}</span>
                </div>
                <div class="form-section">
                    <div class="sec-hdr">{{ t('username') }} <span class="sec-optional">{{ t('username_hint') }}</span></div>
                    <input class="inp-name" type="text" :placeholder="t('username')" v-model="authUsername" maxlength="16"/>
                </div>
                <div class="form-section">
                    <div class="sec-hdr">{{ t('email') }} <span class="sec-optional">{{ t('email_hint') }}</span></div>
                    <input class="inp-name" type="email" placeholder="your@email.com" v-model="authEmail" maxlength="100"/>
                </div>
                <div class="form-section">
                    <div class="sec-hdr">{{ t('password') }}</div>
                    <input class="inp-name" type="password" :placeholder="t('password')" v-model="authPassword" maxlength="64"/>
                </div>
                <div class="form-section">
                    <div class="sec-hdr">{{ t('password_confirm') }}</div>
                    <input class="inp-name" type="password" :placeholder="t('password_confirm')" v-model="authPassword2" maxlength="64"/>
                </div>
                <div class="auth-error" v-if="authError">{{ authError }}</div>
                <div class="row">
                    <Button faIcon="user-plus" :clickHandler="doRegister">{{ t('register') }}</Button>
                </div>
            </template>

        </template>

        <!-- GAME VIEWS -->
        <template v-if="authed">

        <!-- LANDING -->
        <template v-if="view === 'landing'">
            <div class="landing-hero">
                <div class="landing-logo"><img src="../../public/img/logo.png" alt="UNO WEB"></div>
                <div class="landing-sub">{{ t('node_edition') }}</div>
                <div class="lang-picker">
                    <select class="lang-select" :value="langCode" @change="setLang($event.target.value)">
                        <option v-for="l in langAvailable" :key="l.code" :value="l.code">{{ l.label }}</option>
                    </select>
                </div>
                <div class="landing-user-row" v-if="authUserId">
                    <span class="landing-username">{{ authUserName }}</span>
                    <button class="landing-logout-btn" @click="$emit('logout')">{{ t('logout') }}</button>
                </div>
            </div>
            <div class="landing-btns">
                <div class="land-btn land-btn-create" @click="view = 'create'">
                    <div class="lb-icon">&#127918;</div>
                    <div class="lb-label">{{ t('create') }}</div>
                </div>
                <div class="land-btn land-btn-join" @click="switchToJoin">
                    <div class="lb-icon">&#128279;</div>
                    <div class="lb-label">{{ t('join') }}</div>
                </div>
                <div class="land-btn land-btn-hof" @click="switchToHof">
                    <div class="lb-icon">&#127942;</div>
                    <div class="lb-label">{{ t('hof') }}</div>
                </div>
                <div class="land-btn land-btn-forum" @click="openForum">
                    <div class="lb-icon">&#128172;</div>
                    <div class="lb-label">{{ t('forum') }}</div>
                </div>
                <div class="land-btn land-btn-manual" @click="manualOpen = true">
                    <div class="lb-icon">&#128214;</div>
                    <div class="lb-label">{{ t('manual') }}</div>
                </div>
            </div>
        </template>

        <!-- HALL OF FAME -->
        <template v-if="view === 'hof'">
            <div class="view-header">
                <span class="back-btn" @click="view = 'landing'">&#9664; {{ t('back') }}</span>
                <span class="view-title">{{ t('hof') }}</span>
            </div>
            <div class="hof-tabs">
                <button v-for="cat in hofCategories" :key="cat.key"
                    class="hof-tab" :class="{active: hofCategory === cat.key}"
                    @click="hofCategory = cat.key; hofPage = 0">{{ cat.label }}</button>
            </div>
            <div class="hof-list">
                <div v-if="hofLoading" class="hof-empty">{{ t('loading') }}</div>
                <template v-else>
                    <div v-if="!hofAll[hofCategory] || hofAll[hofCategory].length === 0" class="hof-empty">{{ t('no_data') }}</div>
                    <div v-for="(row, i) in hofCurrentRows" :key="row.username + i" class="hof-row">
                        <span class="hof-rank" :class="{'hof-gold':hofOffset+i===0,'hof-silver':hofOffset+i===1,'hof-bronze':hofOffset+i===2}">#{{ hofOffset + i + 1 }}</span>
                        <img class="hof-avatar" :src="'/api/profile/avatar/' + row.id" @error="$event.target.src='/img/default.png'" style="cursor:pointer" @click="$emit('open-profile', row.username)" />
                        <span class="hof-name" style="cursor:pointer" @click="$emit('open-profile', row.username)">{{ row.username }}</span>
                        <span class="hof-val">{{ hofVal(row, hofCategory) }}</span>
                    </div>
                </template>
            </div>
            <div class="hof-pagination" v-if="hofPageCount > 1">
                <button class="hof-page-btn" :disabled="hofPage === 0" @click="hofPage--">&#9664;</button>
                <span class="hof-page-info">{{ hofPage + 1 }} / {{ hofPageCount }}</span>
                <button class="hof-page-btn" :disabled="hofPage >= hofPageCount - 1" @click="hofPage++">&#9654;</button>
            </div>
        </template>

        <!-- CREATE -->
        <template v-if="view === 'create'">
            <div class="view-header">
                <span class="back-btn" @click="view = 'landing'">&#9664; {{ t('back') }}</span>
                <span class="view-title">{{ t('create') }}</span>
            </div>

            <div class="create-grid">
            <div class="create-col">

            <div class="form-section">
                <div class="sec-hdr">{{ t('room_name') }}</div>
                <input class="inp-name" type="text" :placeholder="t('room_placeholder')" v-model="room" maxlength="32" @input="clearErrors"/>
                <div class="error-msg" v-if="roomError">{{ t('room_required') }}</div>
                <div class="warn-msg" v-if="roomExistsWarning">
                    {{ t('room_exists', { room: room }) }}
                    <template v-if="!roomExistsLocked"> <span class="warn-link" @click="joinInstead">{{ t('room_exists_join') }}</span></template>
                    <template v-else> {{ t('room_exists_locked') }} <span class="warn-link" @click="joinInstead">{{ t('room_exists_join_pw') }}</span></template>
                </div>
            </div>

            <div class="form-section">
                <div class="sec-hdr">{{ t('room_password') }} <span class="sec-optional">{{ t('room_password_hint') }}</span></div>
                <input class="inp-name" type="password" :placeholder="t('pw_blank')" v-model="password" maxlength="32"/>
            </div>

            <div class="form-section form-inline">
                <span class="sec-hdr">{{ t('rounds') }}</span>
                <input class="inp-rounds" type="text" v-model="maxRounds" maxlength="2" placeholder="5"/>
            </div>

            <div class="form-section">
                <div class="sec-hdr">{{ t('players') }}</div>
                <div class="player-row" v-for="(slot, i) in playerSlots" :key="i">
                    <span class="p-num">P{{ i + 2 }}</span>
                    <label class="bot-check">
                        <input type="checkbox" v-model="slot.isBot" @change="onBotToggle(i)"/>
                        <span>{{ t('bot') }}</span>
                    </label>
                    <template v-if="slot.isBot">
                        <select class="diff-sel" v-model="slot.difficulty" @change="onDiffChange(i)">
                            <option value="easy">{{ t('easy') }}</option>
                            <option value="medium">{{ t('medium') }}</option>
                            <option value="hard">{{ t('hard') }}</option>
                        </select>
                        <input class="bot-name-inp" type="text" v-model="slot.name" maxlength="16" :placeholder="t('bot_name')"/>
                    </template>
                </div>
            </div>

            </div>
            <div class="create-col">

            <div class="form-section">
                <div class="sec-hdr">{{ t('ruleset') }}</div>
                <div class="ruleset-picker">
                    <label class="rs-opt" :class="{active: ruleset === 'original', disabled: nextgenMode}" @click="nextgenMode && $event.preventDefault()">
                        <input type="radio" value="original" v-model="ruleset" :disabled="nextgenMode"/>
                        <span class="rs-name">{{ t('ruleset_original') }}</span>
                        <span class="rs-desc">{{ nextgenMode ? t('ruleset_locked_nextgen') : t('ruleset_original_desc') }}</span>
                    </label>
                    <label class="rs-opt" :class="{active: ruleset === 'stacking'}">
                        <input type="radio" value="stacking" v-model="ruleset"/>
                        <span class="rs-name">{{ t('ruleset_stacking') }}</span>
                        <span class="rs-desc">{{ t('ruleset_stacking_desc') }}</span>
                    </label>
                </div>
            </div>

            <div class="form-section">
                <label class="rs-opt" :class="{active: hardcoreMode, disabled: battleRoyale}" @click.prevent="toggleHC">
                    <input type="checkbox" v-model="hardcoreMode"/>
                    <span class="rs-name">{{ t('hardcore_mode') }}</span>
                    <span class="rs-desc">{{ t('hardcore_mode_desc') }}</span>
                </label>
                <label class="rs-opt" :class="{active: battleRoyale, disabled: hardcoreMode}" @click.prevent="toggleBR">
                    <input type="checkbox" v-model="battleRoyale"/>
                    <span class="rs-name">{{ t('battle_royale') }}</span>
                    <span class="rs-desc">{{ t('battle_royale_desc') }}</span>
                </label>
                <label class="rs-opt" :class="{active: doubleDeck, disabled: nextgenMode}" @click.prevent="toggleDoubleDeck">
                    <input type="checkbox" v-model="doubleDeck"/>
                    <span class="rs-name">{{ t('double_deck') }}</span>
                    <span class="rs-desc">{{ t('double_deck_desc') }}</span>
                </label>
                <label class="rs-opt" :class="{active: nextgenMode}" @click.prevent="toggleNextgen">
                    <input type="checkbox" v-model="nextgenMode"/>
                    <span class="rs-name">{{ t('nextgen_mode') }}</span>
                    <span class="rs-desc">{{ t('nextgen_mode_desc') }}</span>
                </label>
            </div>

            <div class="form-section">
                <label class="rs-opt" :class="{active: afkEnabled}">
                    <input type="checkbox" v-model="afkEnabled"/>
                    <span class="rs-name">{{ t('afk_timer_enable') }}</span>
                    <span class="rs-desc">{{ t('afk_timer_desc') }}</span>
                </label>
                <div v-if="afkEnabled" class="form-inline" style="margin-top:6px;">
                    <input class="inp-rounds" type="number" v-model="afkSeconds" min="10" max="120" style="width:60px;"/>
                    <span class="sec-optional" style="margin-left:4px;">{{ t('afk_timer_seconds') }} (10–120)</span>
                </div>
            </div>

            </div>
            </div>

            <div class="row">
                <Button faIcon="sign-in-alt" :clickHandler="loginCreate">{{ t('create_join') }}</Button>
            </div>
        </template>

        <!-- JOIN -->
        <template v-if="view === 'join'">
            <div class="view-header">
                <span class="back-btn" @click="view = 'landing'">&#9664; {{ t('back') }}</span>
                <span class="view-title">{{ t('join') }}</span>
            </div>

            <div class="form-section">
                <div class="sec-hdr">{{ t('channel') }}</div>
                <div class="channel-row">
                    <input class="inp-channel" type="text" :placeholder="t('channel_placeholder')" v-model="room"/>
                    <span class="refresh-btn" :class="{ spinning: lobbiesLoading }" @click="fetchLobbies">&#8635;</span>
                </div>
                <div class="error-msg" v-if="roomError">{{ t('channel_required') }}</div>
                <ul class="lobby-list" v-if="lobbies.length > 0">
                    <li v-for="lobby in lobbies" :key="(lobby.domain || '') + lobby.id" class="lobby-item"
                        :class="{ 'lobby-item-remote': isRemoteLobby(lobby) }"
                        @click="selectLobby(lobby)">
                        <span v-if="lobby.domain" class="lobby-server-tag">[{{ lobby.domain }}]</span>
                        {{ lobby.id }} [{{ lobby.players }}/{{ lobby.max }}]<span v-if="lobby.locked" class="lobby-lock">PW</span>
                    </li>
                </ul>
                <div class="no-lobbies" v-else>{{ t('no_lobbies') }}</div>
            </div>

            <div class="form-section">
                <div class="sec-hdr">{{ t('room_password') }}</div>
                <input class="inp-name" type="password" :placeholder="t('pw_required')" v-model="password" maxlength="32" @input="clearErrors"/>
                <div class="error-msg" v-if="wrongPasswordError">{{ t('wrong_password') }}</div>
            </div>

            <div class="row">
                <Button faIcon="sign-in-alt" :clickHandler="loginJoin">{{ t('join_btn') }}</Button>
            </div>
            <div class="error-msg" v-if="roomFullError" style="text-align:center;padding:4px 16px 8px">{{ roomFullError }}</div>
        </template>

        <!-- Password Change Popup -->
        <div class="popup-overlay" v-if="pwPopupOpen" @click.self="closePwPopup">
            <div class="popup-box">
                <div class="popup-title">{{ t('change_password') }}</div>
                <input class="inp-name" type="password" :placeholder="t('current_password')" v-model="pwOld" maxlength="64"/>
                <input class="inp-name" type="password" :placeholder="t('new_password')" v-model="pwNew" maxlength="64"/>
                <input class="inp-name" type="password" :placeholder="t('confirm_new_password')" v-model="pwNew2" maxlength="64" @keyup.enter="doChangePw"/>
                <div class="auth-error" v-if="pwError">{{ pwError }}</div>
                <div class="popup-success" v-if="pwSuccess">{{ pwSuccess }}</div>
                <div class="popup-btns">
                    <button class="popup-ok-btn" @click="doChangePw">{{ t('change_password') }}</button>
                    <button class="popup-cancel-btn" @click="closePwPopup">{{ t('cancel') }}</button>
                </div>
            </div>
        </div>

        <!-- Username Change Popup -->
        <div class="popup-overlay" v-if="namePopupOpen" @click.self="closeNamePopup">
            <div class="popup-box">
                <div class="popup-title">{{ t('change_username') }}</div>
                <input class="inp-name" type="text" :placeholder="t('new_username')" v-model="newUsername" maxlength="16" @keyup.enter="doChangeName"/>
                <div class="auth-error" v-if="nameChangeError">{{ nameChangeError }}</div>
                <div class="popup-success" v-if="nameSuccess">{{ nameSuccess }}</div>
                <div class="popup-btns">
                    <button class="popup-ok-btn" @click="doChangeName">{{ t('change_username') }}</button>
                    <button class="popup-cancel-btn" @click="closeNamePopup">{{ t('cancel') }}</button>
                </div>
            </div>
        </div>

        </template><!-- end authed -->

        <ManualPanel v-if="manualOpen" :closeHandler="closeManual"></ManualPanel>

    </div>
</template>

<script>
    import Button from "./Button"
    import ManualPanel from "./ManualPanel"
    import { lang } from "../lang/index.js"

    export default {
        name: "Authorize",
        props: ['client', 'socket'],
        components: {Button, ManualPanel},
        data: function() {
            return {
                authed: false,
                authView: 'landing',
                authUsername: '',
                authPassword: '',
                authPassword2: '',
                authEmail: '',
                authError: '',
                view: 'landing',
                nameError: false,
                roomError: false,
                room: null,
                lobbies: [],
                lobbiesLoading: false,
                ownFederationDomain: null,
                federatedGuestHomeDomain: null,
                federatedGuestSessionId: null,
                _lobbyTimer: null,
                password: '',
                roomExistsWarning: false,
                roomExistsLocked: false,
                wrongPasswordError: false,
                roomFullError: '',
                maxRounds: '5',
                ruleset: 'original',
                hardcoreMode: false,
                battleRoyale: false,
                doubleDeck: false,
                nextgenMode: false,
                afkEnabled: false,
                afkSeconds: '60',
                langCode: lang.current,
                langAvailable: lang.available,
                hofRows: [],
                hofLoading: false,
                hofAll: {},
                hofCategory: 'level',
                hofPage: 0,
                authUserName: localStorage.getItem('unoAuthUser') || '',
                authUserId: localStorage.getItem('unoAuthId') || '',
                pwPopupOpen: false,
                pwOld: '', pwNew: '', pwNew2: '', pwError: '', pwSuccess: '',
                namePopupOpen: false,
                newUsername: '', nameChangeError: '', nameSuccess: '',
                manualOpen: false,
                playerSlots: [
                    { isBot: false, difficulty: 'easy', name: '' },
                    { isBot: false, difficulty: 'easy', name: '' },
                    { isBot: false, difficulty: 'easy', name: '' },
                    { isBot: false, difficulty: 'easy', name: '' }
                ]
            }
        },
        computed: {
            hofCurrentRows: function() {
                var rows = (this.hofAll[this.hofCategory] || []);
                return rows.slice(this.hofPage * 50, (this.hofPage + 1) * 50);
            },
            hofOffset: function() { return this.hofPage * 50; },
            hofPageCount: function() {
                var rows = (this.hofAll[this.hofCategory] || []);
                return Math.max(1, Math.ceil(rows.length / 50));
            },
            hofCategories: function() {
                let _ = this.langCode;
                return [
                    { key: 'level',   label: this.t('hof_level')   },
                    { key: 'wins',    label: this.t('hof_wins')     },
                    { key: 'losses',  label: this.t('hof_losses')   },
                    { key: 'cards',   label: this.t('hof_cards')    },
                    { key: 'time',    label: this.t('hof_time')     },
                    { key: 'longest', label: this.t('hof_longest')  },
                    { key: 'wild',    label: this.t('hof_wild')     },
                ];
            },
        },
        methods: {
            toggleBR: function() {
                if(this.hardcoreMode) return;
                this.battleRoyale = !this.battleRoyale;
            },
            toggleHC: function() {
                if(this.battleRoyale) return;
                this.hardcoreMode = !this.hardcoreMode;
            },
            toggleDoubleDeck:function(){
                if(this.nextgenMode) return;
                this.doubleDeck = !this.doubleDeck;
            },
            toggleNextgen:function(){
                this.nextgenMode = !this.nextgenMode;
                if(this.nextgenMode){
                    this.doubleDeck = false;
                    // Instant punishment cards (+6/+8/+10) bloat hands too fast to be
                    // balanced -- stacking is mandatory whenever nextgen mode is on.
                    this.ruleset = 'stacking';
                }
            },
            t: function(key, vars) { return lang.t(key, vars); },
            setLang: function(code) { lang.current = code; this.langCode = code; },
            fmtTime: function(s) {
                s = s || 0;
                let h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
                if(h > 0) return h + 'h ' + m + 'm';
                if(m > 0) return m + 'm ' + sec + 's';
                return sec + 's';
            },
            hofVal: function(row, cat) {
                if(cat === 'level')   return this.t('hof_val_level', { level: row.level, xp: row.xp });
                if(cat === 'wins')    return this.t('hof_val_wins', { n: row.matches_won });
                if(cat === 'losses')  return this.t('hof_val_losses', { n: row.matches_lost });
                if(cat === 'cards')   return this.t('hof_val_cards', { n: row.total_cards || 0 });
                if(cat === 'time')    return this.fmtTime(row.played_time_seconds);
                if(cat === 'longest') return this.fmtTime(row.longest_match_seconds);
                if(cat === 'wild')    return this.t('hof_val_wild', { n: row.total_wild || 0 });
                return '';
            },
            doLogin: function() {
                let self = this;
                this.authError = '';
                if(!this.authUsername || !this.authPassword){ this.authError = lang.t('fill_fields'); return; }
                fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: this.authUsername, password: this.authPassword })
                }).then(function(r){ return r.json(); }).then(function(data){
                    if(data.error){ self.authError = data.error; } else { self._onAuthSuccess(data); }
                }).catch(function(){ self.authError = lang.t('conn_error'); });
            },
            doRegister: function() {
                let self = this;
                this.authError = '';
                if(!this.authUsername || !this.authPassword){ this.authError = lang.t('fill_fields'); return; }
                if(this.authPassword !== this.authPassword2){ this.authError = lang.t('passwords_no_match'); return; }
                fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: this.authUsername, password: this.authPassword, email: this.authEmail })
                }).then(function(r){ return r.json(); }).then(function(data){
                    if(data.error){ self.authError = data.error; } else { self._onAuthSuccess(data); }
                }).catch(function(){ self.authError = lang.t('conn_error'); });
            },
            _onAuthSuccess: function(data) {
                localStorage.setItem('unoAuthToken', data.token);
                localStorage.setItem('unoAuthUser', data.username);
                localStorage.setItem('unoAuthId', String(data.id));
                localStorage.setItem('unoPlayerName', data.username);
                this.client.name = data.username;
                this.authUserName = data.username;
                this.authUserId = String(data.id);
                this.authed = true;
                this.socket.emit('login', { client: this.client, authToken: data.token });
                this.$emit('auth-success');
            },

            onBotToggle: function(i) {
                if(this.playerSlots[i].isBot) this.autoName(i);
            },
            onDiffChange: function(i) {
                if(this.playerSlots[i].isBot) this.autoName(i);
            },
            autoName: function(i) {
                let diff = this.playerSlots[i].difficulty;
                let raw = lang.t('bot_names_' + diff);
                let names = raw ? raw.split(',').map(function(n){ return n.trim(); }).filter(Boolean) : ['Bot'];
                let usedNames = this.playerSlots
                    .filter(function(p, idx){ return idx !== i && p.isBot; })
                    .map(function(p){ return p.name; });
                let available = names.filter(function(n){ return usedNames.indexOf(n) === -1; });
                this.playerSlots[i].name = available.length ? available[0] : names[i % names.length];
            },
            closePwPopup: function() {
                this.pwPopupOpen = false;
                this.pwOld = ''; this.pwNew = ''; this.pwNew2 = '';
                this.pwError = ''; this.pwSuccess = '';
            },
            doChangePw: function() {
                this.pwError = '';
                if(!this.pwOld || !this.pwNew){ this.pwError = lang.t('fill_fields'); return; }
                if(this.pwNew !== this.pwNew2){ this.pwError = lang.t('passwords_no_match'); return; }
                let token = localStorage.getItem('unoAuthToken');
                let self = this;
                fetch('/api/profile/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ oldPassword: this.pwOld, newPassword: this.pwNew })
                }).then(function(r){ return r.json(); }).then(function(d){
                    if(d.error){ self.pwError = d.error; }
                    else { self.pwSuccess = lang.t('pw_changed'); setTimeout(function(){ self.closePwPopup(); }, 1500); }
                }).catch(function(){ self.pwError = lang.t('conn_error'); });
            },
            closeNamePopup: function() {
                this.namePopupOpen = false;
                this.newUsername = ''; this.nameChangeError = ''; this.nameSuccess = '';
            },
            doChangeName: function() {
                this.nameChangeError = '';
                let token = localStorage.getItem('unoAuthToken');
                let self = this;
                fetch('/api/profile/change-username', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ username: this.newUsername })
                }).then(function(r){ return r.json(); }).then(function(d){
                    if(d.error){ self.nameChangeError = d.error; }
                    else {
                        self.nameSuccess = lang.t('username_changed');
                        self.authUserName = d.username;
                        localStorage.setItem('unoAuthUser', d.username);
                        localStorage.setItem('unoPlayerName', d.username);
                        setTimeout(function(){ self.closeNamePopup(); }, 1500);
                    }
                }).catch(function(){ self.nameChangeError = lang.t('conn_error'); });
            },
            switchToJoin: function() {
                this.view = 'join';
                this.fetchLobbies();
                this._startLobbyTimer();
            },
            openForum: function() {
                window.open('/forum', '_blank');
            },
            closeManual: function() {
                this.manualOpen = false;
            },
            switchToHof: function() {
                this.view = 'hof';
                this.hofLoading = true;
                this.hofAll = {};
                fetch('/api/leaderboard/all')
                    .then(function(r){ return r.json(); })
                    .then(function(data){ this.hofAll = data; this.hofLoading = false; }.bind(this))
                    .catch(function(){ this.hofAll = {}; this.hofLoading = false; }.bind(this));
            },
            loginCreate: function() {
                if(!this.client.name || this.client.name.length === 0){
                    this.nameError = true; return;
                }
                if(!this.room || this.room.trim() === ''){
                    this.roomError = true; return;
                }
                let rounds = parseInt(this.maxRounds);
                if(isNaN(rounds) || rounds < 1) rounds = 5;
                if(rounds > 20) rounds = 20;

                let afkTimeout = 0;
                if (this.afkEnabled) {
                    afkTimeout = parseInt(this.afkSeconds) || 60;
                    if (afkTimeout < 10) afkTimeout = 0;
                    if (afkTimeout > 120) afkTimeout = 120;
                }

                let bots = this.playerSlots
                    .filter(function(p){ return p.isBot && p.name.trim(); })
                    .map(function(p){ return { name: p.name.trim(), difficulty: p.difficulty }; });

                this.nameError = false;
                this.roomError = false;
                this.roomExistsWarning = false;
                this.wrongPasswordError = false;
                localStorage.setItem('unoRoomName', this.room.trim());
                this.socket.emit('create', {
                    room: this.room.trim(),
                    maxRounds: rounds,
                    bots: bots,
                    ruleset: this.ruleset,
                    hardcoreMode: this.hardcoreMode,
                    battleRoyale: this.battleRoyale,
                    doubleDeck: this.doubleDeck,
                    nextgenMode: this.nextgenMode,
                    afkTimeout: afkTimeout,
                    password: this.password || null,
                    creating: true
                });
                this.socket.emit('login', {'client': this.client, authToken: localStorage.getItem('unoAuthToken')});
            },
            loginJoin: function() {
                if(!this.client.name || this.client.name.length === 0){
                    this.nameError = true; return;
                }
                if(!this.room || this.room.trim() === ''){
                    this.roomError = true; return;
                }
                this.nameError = false;
                this.roomError = false;
                this.roomExistsWarning = false;
                this.wrongPasswordError = false;
                this.roomFullError = '';
                localStorage.setItem('unoRoomName', this.room.trim());
                this.socket.emit('create', {
                    room: this.room.trim(),
                    maxRounds: 5,
                    bots: [],
                    password: this.password || null,
                    creating: false
                });
                this.socket.emit('login', {'client': this.client, authToken: localStorage.getItem('unoAuthToken')});
            },
            isRemoteLobby: function(lobby) {
                return !!lobby.domain && lobby.domain !== this.ownFederationDomain;
            },
            selectLobby: function(lobby) {
                this.room = lobby.id;
                this.wrongPasswordError = false;
                if (this.isRemoteLobby(lobby)) {
                    this.joinRemoteLobby(lobby);
                }
            },
            joinRemoteLobby: function(lobby) {
                let token = localStorage.getItem('unoAuthToken');
                if (!token) { this.roomFullError = 'Log in first to join a federated room.'; return; }
                fetch('/api/federation/join-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ peerDomain: lobby.domain, roomId: lobby.id })
                })
                    .then(r => r.json())
                    .then(data => {
                        if (data.redirectUrl) { window.location.href = data.redirectUrl; }
                        else { this.roomFullError = data.error || 'Could not join that room.'; }
                    })
                    .catch(() => { this.roomFullError = 'Could not join that room.'; });
            },
            joinInstead: function() {
                this.roomExistsWarning = false;
                this.view = 'join';
            },
            clearErrors: function() {
                this.roomExistsWarning = false;
                this.wrongPasswordError = false;
                this.roomFullError = '';
            },
            fetchLobbies: function() {
                if (this.lobbiesLoading) return;
                this.lobbiesLoading = true;
                let self = this;
                fetch('/api/lobbies')
                    .then(function(r){ return r.json(); })
                    .then(function(data){
                        self.lobbies = data.lobbies;
                        self.ownFederationDomain = data.ownDomain;
                        self.lobbiesLoading = false;
                    })
                    .catch(function(){ self.lobbies = []; self.lobbiesLoading = false; });
            },
            _startLobbyTimer: function() {
                let self = this;
                if (this._lobbyTimer) clearInterval(this._lobbyTimer);
                this._lobbyTimer = setInterval(function() {
                    if (self.view === 'join') self.fetchLobbies();
                }, 15000);
            },
            _stopLobbyTimer: function() {
                if (this._lobbyTimer) { clearInterval(this._lobbyTimer); this._lobbyTimer = null; }
            }
        },
        watch: {
            view: function(v) { if (v !== 'join') this._stopLobbyTimer(); }
        },
        beforeDestroy: function() { this._stopLobbyTimer(); },
        mounted: function() {
            let params = new URLSearchParams(window.location.search);
            let fedSession = params.get('fedSession');
            let fedError = params.get('fedError');
            if (fedError) {
                this.roomFullError = 'Federated join failed: ' + fedError;
                window.history.replaceState({}, '', window.location.pathname);
            }
            if (fedSession) {
                let self2 = this;
                fetch('/api/federation/guest-session/' + fedSession)
                    .then(r => r.ok ? r.json() : null)
                    .then(function(session) {
                        if (!session) return;
                        self2.authed = true;
                        self2.client.name = session.name;
                        self2.room = session.room;
                        self2.password = null;
                        self2.federatedGuestHomeDomain = session.homeDomain;
                        self2.federatedGuestSessionId = fedSession;
                        self2.$emit('federated-guest', { homeDomain: session.homeDomain, sessionId: fedSession });
                        self2.$nextTick(function() { self2.loginJoin(); });
                    });
                window.history.replaceState({}, '', window.location.pathname);
            }

            let savedToken = localStorage.getItem('unoAuthToken');
            let savedUser = localStorage.getItem('unoAuthUser');
            if(savedToken && savedUser) {
                this.authed = true;
                this.socket.emit('login', { client: this.client, authToken: savedToken });
            }
            let savedName = localStorage.getItem('unoPlayerName');
            if(savedName && (!this.client.name || this.client.name.length === 0)){
                this.client.name = savedName;
            }
            let savedRoom = localStorage.getItem('unoRoomName');
            if(savedRoom) this.room = savedRoom;

            let self = this;
            this._onRoomExists = function(data) { self.roomExistsWarning = true; self.roomExistsLocked = !!(data && data.locked); };
            this._onWrongPassword = function() { self.wrongPasswordError = true; };
            this._onRoomFull = function(data) { self.roomFullError = (data && data.started) ? 'Game has already started.' : 'Room is full.'; };
            this._onNameTaken = function() { self.roomFullError = 'Name already taken in this room.'; };
            this._onBrTooFew = function() { self.roomFullError = lang.t('br_too_few_players'); };
            this.socket.on('roomExists', this._onRoomExists);
            this.socket.on('wrongPassword', this._onWrongPassword);
            this.socket.on('roomFull', this._onRoomFull);
            this.socket.on('nameTaken', this._onNameTaken);
            this.socket.on('brTooFewPlayers', this._onBrTooFew);
        },
        beforeDestroy: function() {
            this.socket.removeListener('roomExists', this._onRoomExists);
            this.socket.removeListener('wrongPassword', this._onWrongPassword);
            this.socket.removeListener('roomFull', this._onRoomFull);
            this.socket.removeListener('nameTaken', this._onNameTaken);
            this.socket.removeListener('brTooFewPlayers', this._onBrTooFew);
        }
    }
</script>

<style scoped>
    .login-box {
        position: relative;
        top: 30px;
        width: 360px;
        max-height: 90vh;
        overflow-y: auto;
        margin: 0 auto;
        border-bottom: solid 1px #000000;
        border-top: solid 1px #000000;
        border-left: solid 1px #9a6515;
        border-right: solid 1px #9a6515;
        border-radius: 12px;
        background: url('../../public/img/table.jpg');
        box-shadow: 0 6px 12px #000;
        padding-bottom: 16px;
    }
    .login-box-wide {
        width: 680px;
        max-width: 94vw;
    }
    .create-grid {
        display: flex;
        align-items: flex-start;
    }
    .create-grid .create-col {
        flex: 1;
        min-width: 0;
    }
    .create-grid .create-col:first-child {
        border-right: 1px solid rgba(154, 101, 21, 0.3);
    }

    /* ── LANDING ── */
    .landing-hero {
        text-align: center;
        padding: 28px 16px 16px;
        border-bottom: 1px solid rgba(154, 101, 21, 0.3);
    }
    .landing-logo {
        font-size: 64px;
        font-weight: 900;
        color: #ffdd00;
        letter-spacing: 6px;
        text-shadow: 0 0 24px rgba(255,200,0,0.6), 0 3px 8px #000;
        line-height: 1;
    }
    .landing-sub {
        color: #d4cda4;
        font-size: 12px;
        letter-spacing: 2px;
        margin-top: 4px;
        opacity: 0.7;
    }
    .landing-btns {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 20px 20px 8px;
    }
    .land-btn {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        font-size: 15px;
        letter-spacing: 1.5px;
        transition: transform 0.1s, box-shadow 0.1s;
        user-select: none;
        border: 2px solid transparent;
    }
    .land-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
    .land-btn:active { transform: translateY(0); }
    .land-btn-create {
        background: linear-gradient(135deg, #c47d0a, #7a4c05);
        border-color: #ffb833;
        color: #fff;
        box-shadow: 0 2px 10px rgba(196,125,10,0.4);
    }
    .land-btn-join {
        background: linear-gradient(135deg, #1a5a8a, #0d3558);
        border-color: #4aabf0;
        color: #fff;
        box-shadow: 0 2px 10px rgba(26,90,138,0.4);
    }
    .lb-icon { font-size: 22px; line-height: 1; }
    .lb-label { flex: 1; }

    /* ── VIEW HEADER ── */
    .view-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px 8px;
        border-bottom: 1px solid rgba(154, 101, 21, 0.3);
    }
    .back-btn {
        color: #d4cda4;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        user-select: none;
        opacity: 0.75;
        flex-shrink: 0;
    }
    .back-btn:hover { opacity: 1; }
    .view-title {
        color: #ffdd00;
        font-size: 12px;
        font-weight: bold;
        letter-spacing: 2px;
    }

    /* ── FORM ── */
    .form-section {
        padding: 10px 16px 8px;
        border-bottom: 1px solid rgba(154, 101, 21, 0.3);
    }
    .form-section:last-of-type {
        border-bottom: none;
    }
    .form-inline {
        display: flex;
        align-items: center;
        gap: 14px;
        padding-top: 8px;
        padding-bottom: 8px;
    }
    .sec-hdr {
        color: #d4cda4;
        font-size: 10px;
        font-weight: bold;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        margin-bottom: 6px;
    }
    .form-inline .sec-hdr {
        margin-bottom: 0;
    }

    .inp-name {
        display: block;
        width: 100%;
        box-sizing: border-box;
        background: transparent;
        border: none;
        border-bottom: 1px solid #d4cda4;
        color: #ffffff;
        font-weight: bold;
        font-size: 18px;
        padding: 4px 0;
        outline: none;
    }

    .inp-rounds {
        width: 48px;
        background: rgba(0,0,0,0.4);
        border: 1px solid #9a6515;
        border-radius: 4px;
        color: #ffffff;
        font-weight: bold;
        font-size: 16px;
        text-align: center;
        padding: 3px 0;
        outline: none;
    }

    /* ── RULESET PICKER ── */
    .ruleset-picker {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .rs-opt {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 6px;
        border: 2px solid rgba(154,101,21,0.25);
        cursor: pointer;
        background: rgba(0,0,0,0.25);
        transition: border-color 0.15s, background 0.15s;
    }
    .rs-opt.active {
        border-color: #ffb833;
        background: rgba(154,101,21,0.25);
    }
    .rs-opt.disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .rs-opt input[type="radio"] {
        accent-color: #ffb833;
        width: 14px;
        height: 14px;
        margin: 0;
        flex-shrink: 0;
    }
    .rs-name {
        color: #ffffff;
        font-size: 13px;
        font-weight: bold;
        flex: 1;
    }
    .rs-desc {
        color: rgba(212,205,164,0.65);
        font-size: 10px;
    }

    /* ── CHANNEL ── */
    .channel-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .inp-channel {
        flex: 1;
        background: transparent;
        border: none;
        border-bottom: 1px solid #d4cda4;
        color: #ffffff;
        font-weight: bold;
        font-size: 16px;
        padding: 4px 0;
        outline: none;
    }
    .refresh-btn {
        cursor: pointer;
        color: #ffb833;
        font-size: 20px;
        line-height: 1;
        user-select: none;
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(154,101,21,0.7);
        border-radius: 6px;
        background: rgba(154,101,21,0.2);
        transition: background 0.15s, border-color 0.15s;
    }
    .refresh-btn:hover { background: rgba(154,101,21,0.45); border-color: #ffb833; }
    .refresh-btn.spinning { animation: lobby-spin 0.7s linear infinite; pointer-events: none; opacity: 0.6; }
    @keyframes lobby-spin { to { transform: rotate(360deg); } }
    .lobby-list {
        list-style: none;
        margin: 8px 0 0 0;
        padding: 0;
        max-height: 130px;
        overflow-y: auto;
        border: solid 1px #9a6515;
        border-radius: 4px;
        background: rgba(0,0,0,0.4);
    }
    .lobby-item {
        padding: 5px 10px;
        color: #ffffff;
        font-weight: bold;
        font-size: 13px;
        cursor: pointer;
        border-bottom: solid 1px #3a2805;
        text-align: left;
    }
    .lobby-item:hover { background: rgba(154,101,21,0.4); }
    .lobby-item:last-child { border-bottom: none; }
    .no-lobbies {
        color: #aaaaaa;
        font-size: 12px;
        font-style: italic;
        margin-top: 6px;
    }
    .lobby-server-tag { color: #9a6515; font-weight: bold; margin-right: 4px; }
    .lobby-item-remote { border-left: 3px solid #9a6515; padding-left: 6px; }

    /* ── PLAYERS ── */
    .player-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        min-height: 26px;
    }
    .player-row:last-child { margin-bottom: 0; }
    .p-num {
        color: rgba(212, 205, 164, 0.7);
        font-size: 11px;
        font-weight: bold;
        width: 22px;
        flex-shrink: 0;
    }
    .bot-check {
        display: flex;
        align-items: center;
        gap: 4px;
        color: #d4cda4;
        font-size: 12px;
        cursor: pointer;
        width: 52px;
        flex-shrink: 0;
    }
    .bot-check input[type="checkbox"] {
        cursor: pointer;
        accent-color: #9a6515;
        width: 14px;
        height: 14px;
        margin: 0;
    }
    .diff-sel {
        background: rgba(0,0,0,0.5);
        color: #ffffff;
        border: 1px solid #9a6515;
        border-radius: 4px;
        padding: 2px 4px;
        font-size: 11px;
        cursor: pointer;
        outline: none;
        width: 68px;
        flex-shrink: 0;
    }
    .bot-name-inp {
        flex: 1;
        min-width: 0;
        background: rgba(0,0,0,0.3);
        border: none;
        border-bottom: 1px solid rgba(212, 205, 164, 0.5);
        color: #ffffff;
        font-size: 12px;
        font-weight: bold;
        padding: 3px 4px;
        outline: none;
    }

    .error-msg {
        color: #ff6666;
        font-size: 11px;
        font-weight: bold;
        margin-top: 3px;
    }
    .warn-msg {
        color: #ffcc44;
        font-size: 11px;
        font-weight: bold;
        margin-top: 3px;
    }
    .warn-link {
        cursor: pointer;
        text-decoration: underline;
    }
    .warn-link:hover { color: #fff; }
    .sec-optional {
        color: rgba(212,205,164,0.45);
        font-size: 9px;
        font-weight: normal;
        letter-spacing: 1px;
    }
    .lobby-lock {
        margin-left: 6px;
        font-size: 9px;
        font-weight: bold;
        color: #ffb833;
        background: rgba(154,101,21,0.35);
        border: 1px solid #9a6515;
        border-radius: 3px;
        padding: 0 3px;
        vertical-align: middle;
    }
    .row {
        text-align: center;
        margin-top: 14px;
        margin-bottom: 4px;
    }
    .auth-error {
        color: #ff6666;
        font-size: 11px;
        font-weight: bold;
        margin: 4px 16px 0;
        padding: 4px 8px;
        background: rgba(255, 60, 60, 0.1);
        border: 1px solid rgba(255, 60, 60, 0.3);
        border-radius: 4px;
    }

    /* ── FORUM ── */
    .land-btn-forum {
        background: linear-gradient(135deg, #1a3a6e, #0e2045);
        border-color: #5599ff;
        color: #fff;
        box-shadow: 0 2px 10px rgba(26,58,110,0.4);
    }

    /* ── MANUAL ── */
    .land-btn-manual {
        background: linear-gradient(135deg, #6e4e1a, #453017);
        border-color: #d4a94a;
        color: #fff;
        box-shadow: 0 2px 10px rgba(110,78,26,0.4);
    }

    /* ── HALL OF FAME ── */
    .land-btn-hof {
        background: linear-gradient(135deg, #2a6e2a, #174517);
        border-color: #6de86d;
        color: #fff;
        box-shadow: 0 2px 10px rgba(42,110,42,0.4);
    }
    .hof-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px 12px 4px;
        border-bottom: 1px solid rgba(154,101,21,0.25);
    }
    .hof-tab {
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(154,101,21,0.3);
        border-radius: 4px;
        color: rgba(212,205,164,0.55);
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 1px;
        padding: 3px 7px;
        cursor: pointer;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        transition: background 0.12s, color 0.12s;
    }
    .hof-tab:hover { background: rgba(154,101,21,0.2); color: #d4cda4; }
    .hof-tab.active {
        background: rgba(154,101,21,0.35);
        border-color: rgba(154,101,21,0.7);
        color: #ffdd00;
    }
    .hof-list {
        padding: 8px 12px 12px;
        min-height: 60px;
    }
    .hof-empty {
        color: rgba(212,205,164,0.5);
        font-size: 12px;
        font-style: italic;
        text-align: center;
        padding: 12px 0;
    }
    .hof-row {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 5px 7px;
        border-radius: 5px;
        margin-bottom: 4px;
        background: rgba(0,0,0,0.25);
        border: 1px solid rgba(154,101,21,0.2);
    }
    .hof-rank {
        color: rgba(212,205,164,0.5);
        font-size: 11px;
        font-weight: bold;
        width: 22px;
        flex-shrink: 0;
        text-align: center;
    }
    .hof-gold   { color: #ffdd00; text-shadow: 0 0 6px rgba(255,221,0,0.5); }
    .hof-silver { color: #c0c0c0; }
    .hof-bronze { color: #cd7f32; }
    .hof-avatar {
        width: 26px;
        height: 26px;
        border-radius: 0;
        object-fit: cover;
        border: 1px solid rgba(154,101,21,0.4);
        flex-shrink: 0;
    }
    .hof-name {
        color: #ffffff;
        font-size: 13px;
        font-weight: bold;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .hof-name:hover { color: #f0c040; text-decoration: underline; }
    .hof-pagination {
        display: flex; align-items: center; justify-content: center;
        gap: 10px; padding: 6px 0; border-top: 1px solid #2a1a00;
    }
    .hof-page-btn {
        background: rgba(154,101,21,0.2); border: 1px solid #9a6515; color: #d4cda4;
        padding: 2px 8px; cursor: pointer; border-radius: 3px; font-size: 11px;
    }
    .hof-page-btn:disabled { opacity: 0.3; cursor: default; }
    .hof-page-info { color: #888; font-size: 11px; }
    .hof-val {
        color: #ffb833;
        font-size: 11px;
        font-weight: bold;
        flex-shrink: 0;
        text-align: right;
    }

    /* ── LANG PICKER ── */
    .lang-picker {
        display: flex;
        justify-content: center;
        margin-top: 10px;
    }
    .lang-select {
        background: rgba(0,0,0,0.7);
        border: 1px solid rgba(154,101,21,0.5);
        border-radius: 4px;
        color: #d4cda4;
        font-size: 12px;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        padding: 4px 8px;
        cursor: pointer;
        outline: none;
        min-width: 160px;
    }
    .lang-select:hover { border-color: #9a6515; }
    .lang-select:focus { border-color: #ffb833; }
    .lang-select option { background: #1a0f00; color: #d4cda4; }

    /* ── LANDING USER ── */
    .landing-user-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-top: 10px;
        padding: 6px 12px;
        background: rgba(109,232,109,0.07);
        border: 1px solid rgba(109,232,109,0.2);
        border-radius: 6px;
        margin-left: 20px;
        margin-right: 20px;
    }
    .landing-username {
        color: #6de86d;
        font-size: 13px;
        font-weight: bold;
        letter-spacing: 1px;
        flex: 1;
        text-align: left;
    }
    .landing-logout-btn {
        color: #ffaaaa;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        padding: 3px 8px;
        border: 1px solid rgba(220,60,60,0.4);
        border-radius: 4px;
        background: rgba(180,30,30,0.2);
        letter-spacing: 0.5px;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        transition: color 0.15s, border-color 0.15s, background 0.15s;
        white-space: nowrap;
    }
    .landing-logout-btn:hover { color: #fff; border-color: #ff6666; background: rgba(220,30,30,0.45); }
    .landing-profile-link {
        color: #d4cda4;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        padding: 3px 8px;
        border: 1px solid rgba(212,205,164,0.3);
        border-radius: 4px;
        background: rgba(0,0,0,0.3);
        letter-spacing: 0.5px;
        transition: color 0.15s, border-color 0.15s, background 0.15s;
        white-space: nowrap;
    }
    .landing-profile-link:hover { color: #fff; border-color: #d4cda4; background: rgba(212,205,164,0.12); }

    /* ── PROFILE ── */
    .profile-scroll {
        overflow-y: auto;
        max-height: calc(100% - 60px);
    }
    .profile-body {
        padding: 12px 16px 10px;
        border-bottom: 1px solid rgba(154,101,21,0.3);
    }
    .profile-avatar-row {
        display: flex;
        gap: 12px;
        align-items: flex-start;
    }
    .profile-avatar-wrap {
        flex-shrink: 0;
        width: 64px;
        height: 64px;
    }
    .profile-avatar-img {
        width: 64px;
        height: 64px;
        border-radius: 0;
        object-fit: cover;
        border: 2px solid rgba(154,101,21,0.6);
    }
    .profile-avatar-meta {
        flex: 1;
        min-width: 0;
    }
    .profile-name {
        color: #ffffff;
        font-size: 18px;
        font-weight: 900;
        letter-spacing: 1px;
        margin-bottom: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .profile-since {
        color: rgba(212,205,164,0.35);
        font-size: 10px;
        margin-bottom: 6px;
    }
    .avatar-upload-btn {
        display: inline-block;
        background: rgba(154,101,21,0.2);
        border: 1px solid rgba(154,101,21,0.5);
        border-radius: 4px;
        color: #d4cda4;
        font-size: 10px;
        font-weight: bold;
        letter-spacing: 1px;
        padding: 3px 8px;
        cursor: pointer;
        transition: background 0.15s;
    }
    .avatar-upload-btn:hover { background: rgba(154,101,21,0.4); }
    .avatar-btn-row {
        display: flex;
        gap: 6px;
        align-items: center;
        margin-bottom: 4px;
    }
    .avatar-delete-btn {
        background: rgba(180,30,30,0.2);
        border: 1px solid rgba(220,60,60,0.4);
        border-radius: 4px;
        color: #ffaaaa;
        font-size: 10px;
        font-weight: bold;
        letter-spacing: 1px;
        padding: 3px 8px;
        cursor: pointer;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        transition: background 0.15s;
    }
    .avatar-delete-btn:hover { background: rgba(220,30,30,0.4); color: #fff; }
    .avatar-upload-msg {
        color: #6de86d;
        font-size: 10px;
        margin-top: 3px;
    }
    .profile-level-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
    }
    .profile-level-badge {
        background: rgba(109,232,109,0.2);
        border: 1px solid rgba(109,232,109,0.5);
        color: #6de86d;
        font-size: 12px;
        font-weight: bold;
        border-radius: 4px;
        padding: 2px 8px;
    }
    .profile-xp-text {
        color: rgba(212,205,164,0.6);
        font-size: 11px;
    }
    .profile-bar-wrap {
        height: 6px;
        background: rgba(255,255,255,0.1);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 4px;
    }
    .profile-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #2a8f2a, #6de86d);
        border-radius: 3px;
        transition: width 0.5s ease-out;
    }
    .profile-bar-hint {
        color: rgba(212,205,164,0.45);
        font-size: 10px;
    }
    .pstat-title {
        color: rgba(212,205,164,0.4);
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 2px;
        margin-bottom: 8px;
    }
    .pstat-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
    }
    .pstat-grid-2 { grid-template-columns: repeat(2, 1fr); }
    .pstat-grid-3 { grid-template-columns: repeat(3, 1fr); }
    .pstat {
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(154,101,21,0.2);
        border-radius: 5px;
        padding: 6px 4px;
        text-align: center;
    }
    .pstat-val {
        color: #ffffff;
        font-size: 16px;
        font-weight: 900;
        line-height: 1.1;
    }
    .pstat-val-sm { font-size: 13px; }
    .pstat-lbl {
        color: rgba(212,205,164,0.45);
        font-size: 9px;
        letter-spacing: 0.5px;
        margin-top: 2px;
    }
    .profile-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 16px 8px;
        border-bottom: 1px solid rgba(154,101,21,0.3);
    }
    .profile-action-btn {
        display: block;
        width: 100%;
        background: rgba(154,101,21,0.15);
        border: 1px solid rgba(154,101,21,0.4);
        border-radius: 5px;
        color: #d4cda4;
        font-size: 12px;
        font-weight: bold;
        letter-spacing: 1px;
        padding: 7px;
        cursor: pointer;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        transition: background 0.15s;
        text-align: center;
    }
    .profile-action-btn:hover { background: rgba(154,101,21,0.35); color: #fff; }

    .popup-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.75);
        z-index: 500;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .popup-box {
        background: #161a10;
        border: 1px solid rgba(154,101,21,0.6);
        border-radius: 8px;
        padding: 20px;
        width: 300px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .popup-title {
        color: #ffdd00;
        font-size: 12px;
        font-weight: bold;
        letter-spacing: 1.5px;
        margin-bottom: 4px;
    }
    .popup-success {
        color: #6de86d;
        font-size: 11px;
        font-weight: bold;
        padding: 4px 8px;
        background: rgba(109,232,109,0.1);
        border: 1px solid rgba(109,232,109,0.3);
        border-radius: 4px;
    }
    .popup-btns { display: flex; gap: 8px; margin-top: 4px; }
    .popup-ok-btn {
        flex: 1;
        background: rgba(154,101,21,0.3);
        border: 1px solid rgba(154,101,21,0.7);
        border-radius: 4px;
        color: #ffdd00;
        font-size: 11px;
        font-weight: bold;
        padding: 6px;
        cursor: pointer;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        transition: background 0.15s;
    }
    .popup-ok-btn:hover { background: rgba(154,101,21,0.55); }
    .popup-cancel-btn {
        flex: 1;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(154,101,21,0.3);
        border-radius: 4px;
        color: rgba(212,205,164,0.7);
        font-size: 11px;
        font-weight: bold;
        padding: 6px;
        cursor: pointer;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        transition: background 0.15s;
    }
    .popup-cancel-btn:hover { background: rgba(255,255,255,0.1); }

    .gmenu-logout-btn {
        display: block;
        width: 100%;
        background: rgba(180,30,30,0.25);
        border: 1px solid rgba(220,60,60,0.4);
        border-radius: 5px;
        color: #ffaaaa;
        font-size: 13px;
        font-weight: bold;
        letter-spacing: 1px;
        padding: 8px;
        cursor: pointer;
        font-family: "Trebuchet MS", Helvetica, sans-serif;
        transition: background 0.15s;
    }
    .gmenu-logout-btn:hover { background: rgba(220,30,30,0.45); color: #fff; }
</style>
