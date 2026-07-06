export const NEXTGEN_CARDS = {
    p6:  { isWild: false, punishAmount: 6,  labelKey: 'ev_p6',  soundKey: 'plus4' },
    p8:  { isWild: false, punishAmount: 8,  labelKey: 'ev_p8',  soundKey: 'plus4' },
    m2:  { isWild: false, skipCount: 2,     labelKey: 'ev_m2',  soundKey: 'skip' },
    th:  { isWild: false, requiresTarget: 'trade',   labelKey: 'ev_th',  soundKey: 'tradeHands' },

    p10: { isWild: true, punishAmount: 10, labelKey: 'ev_p10', soundKey: 'plus4' },
    rda: { isWild: true, redrawAll: true,  labelKey: 'ev_rda', soundKey: 'redrawAll' },
    tg1: { isWild: true, requiresTarget: 'steal1', labelKey: 'ev_tg1', soundKey: 'targetSteal' },
    tg2: { isWild: true, requiresTarget: 'steal2', labelKey: 'ev_tg2', soundKey: 'targetSteal' },
    rot: { isWild: true, rotateAll: true,  labelKey: 'ev_rot', soundKey: 'rotateHands' },
    rbw: { isWild: true, colorless: true,  labelKey: 'ev_rbw', soundKey: 'rainbow' }
};

export function isWildNeedingColorPick(type){
    return type.charAt(0) === 'k' && type !== 'krbw';
}
