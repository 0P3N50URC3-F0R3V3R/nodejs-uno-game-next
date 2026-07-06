<template>
    <Popup>
        <template v-slot:topRow>
            <div class="target-title">{{ t('nextgen_pick_target') }}</div>
            <div class="target-list">
                <div v-for="p in players" :key="p.name" class="target-item" @click="pick(p.name)">
                    {{ p.name }} ({{ p.cardsCount }})
                </div>
            </div>
        </template>
        <template v-slot:bottomRow>
            <div class="cancel-btn" @click="cancelHandler">{{ t('cancel') }}</div>
        </template>
    </Popup>
</template>

<script>
    import Popup from "./Popup"
    import { lang } from '../lang/index.js';

    export default {
        name: "PopupTargetPicker",
        props: ['players', 'pickHandler', 'cancelHandler'],
        components: {Popup},
        methods:{
            t: function(key, vars) { return lang.t(key, vars); },
            pick: function(name){ this.pickHandler(name); }
        }
    }
</script>

<style scoped>
    .target-title{ color:#fff; font-size:14px; margin-bottom:8px; }
    .target-list{ display:flex; flex-wrap:wrap; justify-content:center; gap:8px; }
    .target-item{ display:inline-block; padding:8px 16px; background:rgba(255,255,255,0.12); color:#fff; border-radius:6px; cursor:pointer; font-size:13px; }
    .target-item:hover{ background:rgba(255,221,0,0.35); }
    .cancel-btn{ display:inline-block; margin:8px auto; padding:6px 22px; background:rgba(160,30,20,0.85); color:#fff; border-radius:6px; cursor:pointer; font-size:14px; letter-spacing:1px; }
    .cancel-btn:hover{ background:rgba(220,50,30,0.95); }
</style>
