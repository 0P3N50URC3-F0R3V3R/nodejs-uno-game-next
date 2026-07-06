module.exports = {
    p6:  { isWild: false, punishAmount: 6,  scoreValue: 20 },
    p8:  { isWild: false, punishAmount: 8,  scoreValue: 20 },
    m2:  { isWild: false, skipCount: 2, scoreValue: 20 },
    th:  { isWild: false, requiresTarget: 'trade', scoreValue: 20 },

    p10: { isWild: true, punishAmount: 10, scoreValue: 50 },
    rda: { isWild: true, redrawAll: true, scoreValue: 50 },
    tg1: { isWild: true, requiresTarget: 'steal1', stealCount: 1, targetMin: 2, scoreValue: 50 },
    tg2: { isWild: true, requiresTarget: 'steal2', stealCount: 2, targetMin: 3, scoreValue: 50 },
    rot: { isWild: true, rotateAll: true, scoreValue: 50 },
    rbw: { isWild: true, colorless: true, scoreValue: 50 }
};
