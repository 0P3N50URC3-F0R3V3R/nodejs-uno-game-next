<template>
    <img v-if="size==='lg' && faceIconSrc" class="ng-glyph ng-face" :class="sizeClass" :src="faceIconSrc" />
    <img v-else-if="size!=='lg' && cornerIconSrc" class="ng-glyph ng-face" :class="sizeClass" :src="cornerIconSrc" />
    <svg v-else-if="isNumeral && size !== 'lg'" class="ng-glyph" :class="sizeClass" viewBox="0 0 26 24">
        <text x="13" y="19" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" :font-size="numeralFontSize" fill="#fff" stroke="#000" stroke-width="1.2" paint-order="stroke">{{ numeralText }}</text>
    </svg>
    <svg v-else-if="isNumeral" class="ng-glyph" :class="sizeClass" viewBox="0 0 24 24">
        <!-- Same tilted "draw card" pictogram the classic +2/+4 center icon uses —
             the corner slots (above) carry the actual number, this stays generic. -->
        <rect x="6" y="4" width="12" height="16" rx="2.4" transform="rotate(-18 12 12)" fill="#fff" stroke="#000" stroke-width="1"/>
    </svg>
    <svg v-else-if="code==='m2'" class="ng-glyph" :class="sizeClass" viewBox="0 0 24 24">
        <circle cx="12" cy="9" r="6" fill="none" stroke="#fff" stroke-width="2.2"/>
        <line x1="7.8" y1="13.2" x2="16.2" y2="4.8" stroke="#fff" stroke-width="2.2"/>
        <text x="12" y="22" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="8" fill="#fff">&#215;2</text>
    </svg>
    <svg v-else-if="code==='th'" class="ng-glyph" :class="sizeClass" viewBox="0 0 24 24">
        <!-- Open palm: trade hands, not another pair of arrows (too close to Reverse). -->
        <path d="M8 21v-8.2c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v3.2M11.2 15v-6.4c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6V15M14.4 15v-5.2c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6V15M17.6 15.5v-3c0-.85.65-1.5 1.5-1.5s1.5.65 1.5 1.5v5.5c0 2.5-2 4.5-4.5 4.5h-3c-1.7 0-3-.6-4-2l-3-4c-.5-.7-.3-1.6.4-2.1.6-.4 1.4-.3 1.9.3l1.7 2"
              fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <svg v-else-if="code==='rda'" class="ng-glyph" :class="sizeClass" viewBox="0 0 24 24">
        <!-- Double downward chevron, Citroën-badge style — replaces the old circular-arrow icon. -->
        <path d="M4 6l8 7 8-7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 13l8 7 8-7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <svg v-else-if="code==='tg1' || code==='tg2'" class="ng-glyph" :class="sizeClass" viewBox="0 0 24 24">
        <!-- Same reticle for both — only the center number differs (was two
             different shapes before, inconsistent). -->
        <circle cx="12" cy="12" r="8" fill="none" stroke="#fff" stroke-width="2"/>
        <circle cx="12" cy="12" r="2.4" fill="#fff"/>
        <line x1="12" y1="1" x2="12" y2="5" stroke="#fff" stroke-width="2"/>
        <line x1="12" y1="19" x2="12" y2="23" stroke="#fff" stroke-width="2"/>
        <line x1="1" y1="12" x2="5" y2="12" stroke="#fff" stroke-width="2"/>
        <line x1="19" y1="12" x2="23" y2="12" stroke="#fff" stroke-width="2"/>
        <text x="12" y="14.5" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="7" fill="#000">{{ code === 'tg1' ? '1' : '2' }}</text>
    </svg>
    <svg v-else-if="code==='rot'" class="ng-glyph" :class="sizeClass" viewBox="0 0 24 24">
        <path d="M12 4a8 8 0 0 1 6.9 4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M12 20a8 8 0 0 1 -6.9 -4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
        <polygon points="19,3 19,9 14,7" fill="#fff"/>
        <polygon points="5,21 5,15 10,17" fill="#fff"/>
    </svg>
    <svg v-else-if="code==='rbw'" class="ng-glyph" :class="sizeClass" viewBox="0 0 24 24">
        <path d="M2 18a10 10 0 0 1 20 0" fill="none" stroke="#e74c3c" stroke-width="2"/>
        <path d="M4.5 18a7.5 7.5 0 0 1 15 0" fill="none" stroke="#f1c40f" stroke-width="2"/>
        <path d="M7 18a5 5 0 0 1 10 0" fill="none" stroke="#2ecc71" stroke-width="2"/>
        <path d="M9.5 18a2.5 2.5 0 0 1 5 0" fill="none" stroke="#3498db" stroke-width="2"/>
    </svg>
    <svg v-else class="ng-glyph" :class="sizeClass" viewBox="0 0 24 24"></svg>
</template>

<script>
    const NUMERAL_CODES = ['p6','p8','p10'];
    const FACE_ICONS = {
        p6:  require('../../public/img/symbol_ng_punishment_large_icon.png'),
        p8:  require('../../public/img/symbol_ng_punishment_large_icon.png'),
        p10: require('../../public/img/symbol_ng_punishment_large_icon.png'),
        m2:  require('../../public/img/symbol_ng_skip2_large_icon.png'),
        th:  require('../../public/img/symbol_ng_change_hands_large_icon.png'),
        rda: require('../../public/img/symbol_ng_redraw_large_icon.png'),
        rot: require('../../public/img/symbol_ng_rotate_large_icon.png'),
        rbw: require('../../public/img/symbol_ng_rainbow_large_icon.png'),
        tg1: require('../../public/img/symbol_ng_target1_large_icon.png'),
        tg2: require('../../public/img/symbol_ng_target2_large_icon.png')
    };
    const CORNER_ICONS = {
        m2:  require('../../public/img/symbol_ng_skip2_corner_icon.png'),
        th:  require('../../public/img/symbol_ng_change_hands_corner_icon.png'),
        rda: require('../../public/img/symbol_ng_redraw_corner_icon.png'),
        rot: require('../../public/img/symbol_ng_rotate_corner_icon.png'),
        rbw: require('../../public/img/symbol_ng_rainbow_corner_icon.png'),
        tg1: require('../../public/img/symbol_ng_target1_2_CORNER_icon.png'),
        tg2: require('../../public/img/symbol_ng_target1_2_CORNER_icon.png')
    };
    export default {
        name: "NextgenGlyph",
        props: ['code', 'size'],
        computed: {
            isNumeral: function(){ return NUMERAL_CODES.indexOf(this.code) !== -1; },
            numeralText: function(){ return '+' + this.code.slice(1); },
            // "+10" is 3 characters vs "+6"/"+8" at 2 -- same font-size overflows
            // the small corner glyph's viewBox, so give the longer label a bit less room.
            numeralFontSize: function(){ return this.numeralText.length > 2 ? 18 : 22; },
            sizeClass: function(){ return 'ng-' + (this.size || 'sm'); },
            faceIconSrc: function(){ return FACE_ICONS[this.code] || null; },
            cornerIconSrc: function(){ return CORNER_ICONS[this.code] || null; }
        }
    }
</script>

<style scoped>
    .ng-glyph{ display:block; pointer-events:none; }
    .ng-sm{ width:24px; height:20px; }
    .ng-lg{ width:70px; height:76px; }
    img.ng-face{ object-fit:contain; }
</style>
