<template>
    <Popup>
        <template v-slot:topRow>
            <div class="card-float">
                <CardTemplate :type="'r'+getNumber()" :clickHandler="click" hover="true"></CardTemplate>
            </div>
            <div class="card-float">
                <CardTemplate :type="'y'+getNumber()" :clickHandler="click" hover="true"></CardTemplate>
            </div>
            <div class="card-float">
                <CardTemplate :type="'g'+getNumber()" :clickHandler="click" hover="true"></CardTemplate>
            </div>
            <div class="card-float">
                <CardTemplate :type="'b'+getNumber()" :clickHandler="click" hover="true"></CardTemplate>
            </div>
        </template>
        <template v-slot:bottomRow>
            <div class="cancel-btn" @click="cancelHandler">{{ t('cancel') }}</div>
        </template>
    </Popup>
</template>

<script>

    import Popup from "./Popup"
    import CardTemplate from "../components/CardTemplate"
    import { lang } from '../lang/index.js';

    export default {
        name: "PopupSpecial",
        props:['clickHandler', 'cancelHandler', 'card'],
        components: {Popup, CardTemplate},
        methods:{
            t: function(key, vars) { return lang.t(key, vars); },
            getNumber:function(){
                return this.card.type.slice(1);
            },
            click:function(cardType){
                this.clickHandler(this.card.id, cardType);
            }
        }
    }
</script>

<style scoped>
    .card-float{
        display: inline-block;
        margin-left: 5px;
        margin-right: 5px;
    }
    .cancel-btn{
        display: inline-block;
        margin: 8px auto;
        padding: 6px 22px;
        background: rgba(160,30,20,0.85);
        color: #fff;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        letter-spacing: 1px;
    }
    .cancel-btn:hover{
        background: rgba(220,50,30,0.95);
    }
</style>