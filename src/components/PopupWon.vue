<template>
    <Popup>
        <template v-slot:topRow>
            <div v-if="seriesWinner" class="series-message">
                {{ t('series_winner', { name: seriesWinner }) }}
            </div>
            <div v-else class="won-message">{{ t('round_winner', { name: winner }) }}</div>
            <div class="series-score">
                <span v-for="c in clients" :key="c.name" class="score-entry">
                    <span class="score-ai" v-if="c.isAI">🤖</span>{{ c.name }}: {{ wins(c) }}W
                </span>
            </div>
            <div class="round-counter" v-if="!seriesWinner">
                {{ t('round_of', { n: roundsPlayed, max: maxRounds }) }}
            </div>
            <div class="waiting-msg" v-if="showButton && isWaiting">
                {{ t('waiting_players') }}
            </div>
        </template>
        <template v-slot:bottomRow>
            <template v-if="showButton && !isWaiting">
                <Button faIcon="paper-plane" :clickHandler="buttonHandler">
                    {{ seriesWinner ? t('new_series') : t('continue') }}
                </Button>
                <Button faIcon="sign-out-alt" :clickHandler="quitHandler" variant="danger">
                    {{ t('quit_btn') }}
                </Button>
            </template>
            <template v-else-if="showButton && isWaiting">
                <Button faIcon="sign-out-alt" :clickHandler="quitHandler" variant="danger">
                    {{ t('leave_room') }}
                </Button>
            </template>
        </template>
    </Popup>
</template>

<script>
    import Popup from "./Popup"
    import Button from "./Button"
    import { lang } from '../lang/index.js';

    export default {
        name: "PopupWon",
        components: {Popup, Button},
        props: ['buttonHandler', 'quitHandler', 'winner', 'showButton', 'clients', 'roundsPlayed', 'maxRounds', 'seriesWinner'],
        computed: {
            isWaiting: function() {
                if(!this.clients) return false;
                return this.clients.length < 2;
            }
        },
        methods: {
            t: function(key, vars) { return lang.t(key, vars); },
            wins: function(client) {
                if(!client || !client.score) return 0;
                return client.score.filter(function(s){ return s === '-'; }).length;
            }
        }
    }
</script>

<style scoped>
    .won-message{
        text-align:center;
        font-family:"Trebuchet MS", Helvetica, sans-serif;
        font-weight:700;
        filter:drop-shadow(0px 4px 4px black);
        height:50px;
        line-height:50px;
        font-size:58px;
        background:linear-gradient(to bottom, rgba(248,80,50,1) 0%, rgba(241,111,92,1) 50%, rgba(246,41,12,1) 51%, rgba(240,47,23,1) 71%, rgba(231,56,39,1) 100%);
        background-clip:text;
        -webkit-text-fill-color:transparent;
        margin-bottom:20px;
    }
    .series-message{
        text-align:center;
        font-family:"Trebuchet MS", Helvetica, sans-serif;
        font-weight:700;
        filter:drop-shadow(0px 4px 4px black);
        height:50px;
        line-height:50px;
        font-size:40px;
        background:linear-gradient(to bottom, rgba(80,220,80,1) 0%, rgba(40,180,40,1) 100%);
        background-clip:text;
        -webkit-text-fill-color:transparent;
        margin-bottom:10px;
    }
    .series-score{
        display:flex;
        justify-content:center;
        gap:18px;
        flex-wrap:wrap;
        color:#fff;
        font-weight:bold;
        font-size:15px;
        margin-bottom:8px;
    }
    .score-ai{
        margin-right:3px;
        font-style:normal;
    }
    .round-counter{
        text-align:center;
        color:#d4cda4;
        font-size:14px;
        margin-bottom:10px;
    }
    .waiting-msg{
        text-align:center;
        color:#d4cda4;
        font-size:13px;
        font-style:italic;
        margin-top:6px;
        margin-bottom:4px;
    }
</style>
