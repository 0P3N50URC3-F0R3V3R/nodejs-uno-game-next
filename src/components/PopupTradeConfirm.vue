<template>
    <Popup>
        <template v-slot:topRow>
            <div class="trade-title">{{ t('nextgen_confirm_trade', {name: targetName}) }}</div>
        </template>
        <template v-slot:bottomRow>
            <div class="button-float">
                <Button faIcon="check-circle" :clickHandler="confirm">{{ t('yes') }}</Button>
            </div>
            <div class="button-float">
                <Button faIcon="times-circle" variant="danger" :clickHandler="decline">{{ t('no') }}</Button>
            </div>
        </template>
    </Popup>
</template>

<script>
    import Popup from "./Popup"
    import Button from "./Button"
    import { lang } from '../lang/index.js';

    export default {
        name: "PopupTradeConfirm",
        props: ['targetName', 'confirmHandler'],
        components: {Popup, Button},
        methods:{
            t: function(key, vars) { return lang.t(key, vars); },
            confirm: function(){ this.confirmHandler(true); },
            decline: function(){ this.confirmHandler(false); }
        }
    }
</script>

<style scoped>
    .trade-title{ color:#fff; font-size:14px; margin-bottom:4px; }
    .button-float{ display:inline-block; margin-left:15px; margin-right:15px; margin-top:20px; }
    /* The shared Popup component's own background is a thin full-width bar that
       barely reads as a backdrop behind this short amount of content — box it
       up with its own solid semi-transparent panel instead. */
    >>> .popup {
        width: auto;
        background: rgba(10, 10, 10, 0.88);
        border: 1px solid rgba(154, 101, 21, 0.5);
        border-radius: 8px;
        max-width: 380px;
        margin: 0 auto;
        padding: 16px 10px 10px;
    }
    >>> .popup:before, >>> .popup:after {
        display: none;
    }
</style>
