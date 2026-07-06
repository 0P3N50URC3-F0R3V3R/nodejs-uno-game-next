<template>
    <div class="popup-overlay manual-overlay" @click.self="closeHandler">
        <div class="manual-box">
            <div class="manual-header">
                <span class="manual-title">{{ t('manual') }}</span>
                <button class="manual-close-btn" @click="closeHandler">&#10005;</button>
            </div>
            <div class="manual-scroll">
                <p class="manual-intro">{{ t('manual_intro') }}</p>

                <div class="manual-section">
                    <div class="manual-sec-title">{{ t('manual_section_basics') }}</div>
                    <p class="manual-text">{{ t('manual_basics_text') }}</p>
                </div>

                <div class="manual-section">
                    <div class="manual-sec-title">{{ t('manual_section_classic') }}</div>
                    <div class="manual-card-grid">
                        <div class="manual-card-item" v-for="c in classicCards" :key="c.type">
                            <CardTemplate :type="c.type"></CardTemplate>
                            <div class="manual-card-name">{{ c.name }}</div>
                            <div class="manual-card-desc">{{ c.desc }}</div>
                        </div>
                    </div>
                </div>

                <div class="manual-section">
                    <div class="manual-sec-title">{{ t('ruleset_stacking') }}</div>
                    <p class="manual-text">{{ t('ruleset_stacking_desc') }}</p>
                    <p class="manual-text">{{ t('manual_stacking_note') }}</p>
                </div>

                <div class="manual-section">
                    <div class="manual-sec-title">{{ t('battle_royale') }}</div>
                    <p class="manual-text">{{ t('battle_royale_desc') }}</p>
                </div>

                <div class="manual-section">
                    <div class="manual-sec-title">{{ t('hardcore_mode') }}</div>
                    <p class="manual-text">{{ t('hardcore_mode_desc') }}</p>
                </div>

                <div class="manual-section">
                    <div class="manual-sec-title">{{ t('double_deck') }}</div>
                    <p class="manual-text">{{ t('double_deck_desc') }}</p>
                </div>

                <div class="manual-section">
                    <div class="manual-sec-title">{{ t('nextgen_mode') }}</div>
                    <p class="manual-text">{{ t('nextgen_mode_desc') }}</p>
                    <p class="manual-text">{{ t('manual_hoarder_note') }}</p>
                    <div class="manual-card-grid">
                        <div class="manual-card-item" v-for="c in nextgenCards" :key="c.type">
                            <CardTemplate :type="c.type"></CardTemplate>
                            <div class="manual-card-name">{{ c.name }}</div>
                            <div class="manual-card-desc">{{ c.desc }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
    import CardTemplate from "./CardTemplate"
    import { lang } from "../lang/index.js"

    export default {
        name: "ManualPanel",
        props: ['closeHandler'],
        components: { CardTemplate },
        computed: {
            classicCards: function(){
                return [
                    { type: 'r5', name: this.t('manual_card_number_title'), desc: this.t('manual_card_number_desc') },
                    { type: 'rn', name: this.t('ev_skip'), desc: this.t('manual_card_skip_desc') },
                    { type: 'rr', name: this.t('ev_reverse'), desc: this.t('manual_card_reverse_desc') },
                    { type: 'rp', name: this.t('ev_plus2'), desc: this.t('manual_card_plus2_desc') },
                    { type: 'kg', name: this.t('manual_card_wild4_title'), desc: this.t('manual_card_wild4_desc') },
                    { type: 'kc', name: this.t('manual_card_wildcolor_title'), desc: this.t('manual_card_wildcolor_desc') }
                ];
            },
            nextgenCards: function(){
                return [
                    { type: 'rp6', name: this.t('ev_p6'), desc: this.t('manual_card_p6_desc') },
                    { type: 'rp8', name: this.t('ev_p8'), desc: this.t('manual_card_p8_desc') },
                    { type: 'kp10', name: this.t('ev_p10'), desc: this.t('manual_card_p10_desc') },
                    { type: 'rm2', name: this.t('ev_m2'), desc: this.t('manual_card_m2_desc') },
                    { type: 'rth', name: this.t('ev_th'), desc: this.t('manual_card_th_desc') },
                    { type: 'krda', name: this.t('ev_rda'), desc: this.t('manual_card_rda_desc') },
                    { type: 'ktg1', name: this.t('ev_tg1'), desc: this.t('manual_card_tg1_desc') },
                    { type: 'ktg2', name: this.t('ev_tg2'), desc: this.t('manual_card_tg2_desc') },
                    { type: 'krot', name: this.t('ev_rot'), desc: this.t('manual_card_rot_desc') },
                    { type: 'krbw', name: this.t('ev_rbw'), desc: this.t('manual_card_rbw_desc') }
                ];
            }
        },
        methods: {
            t: function(key, vars) { return lang.t(key, vars); }
        }
    }
</script>

<style scoped>
    .manual-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.75);
        z-index: 600;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .manual-box {
        background: #161a10;
        border: 1px solid rgba(154,101,21,0.6);
        border-radius: 8px;
        width: 720px;
        max-width: 94vw;
        max-height: 86vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 6px 24px rgba(0,0,0,0.6);
    }
    .manual-header {
        position: relative;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(154,101,21,0.4);
        flex-shrink: 0;
        text-align: center;
    }
    .manual-title {
        color: #ffdd00;
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 2px;
    }
    .manual-close-btn {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: rgba(212,205,164,0.7);
        font-size: 16px;
        cursor: pointer;
        line-height: 1;
        padding: 4px;
    }
    .manual-close-btn:hover { color: #fff; }
    .manual-scroll {
        overflow-y: auto;
        padding: 14px 20px 20px;
    }
    .manual-intro {
        color: rgba(212,205,164,0.75);
        font-size: 12px;
        font-style: italic;
        margin: 0 0 14px;
        line-height: 1.4;
    }
    .manual-section {
        margin-bottom: 16px;
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(154,101,21,0.2);
    }
    .manual-section:last-child { border-bottom: none; margin-bottom: 0; }
    .manual-sec-title {
        color: #ffb833;
        font-size: 13px;
        font-weight: bold;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        margin-bottom: 6px;
    }
    .manual-text {
        color: #d4cda4;
        font-size: 12px;
        line-height: 1.5;
        margin: 0 0 6px;
    }
    .manual-card-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 8px;
    }
    .manual-card-item {
        width: 100px;
        text-align: center;
    }
    .manual-card-item .playing_card {
        margin: 0 auto;
        transform: scale(0.85);
        transform-origin: top center;
    }
    .manual-card-name {
        color: #ffffff;
        font-size: 11px;
        font-weight: bold;
        margin-top: -8px;
    }
    .manual-card-desc {
        color: rgba(212,205,164,0.6);
        font-size: 10px;
        line-height: 1.3;
        margin-top: 2px;
    }
</style>
