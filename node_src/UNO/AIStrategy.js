const CardDefs = require('./CardDefs.js');

const AI_NAMES = {
    easy:   ['Dizzy',  'Lucky',  'Lazy',   'Bumby'],
    medium: ['Crafty', 'Swift',  'Clever', 'Sly'],
    hard:   ['Sharp',  'Nexus',  'Omega',  'Titan'],
    mixed:  ['Bolt',   'Zara',   'Rex',    'Nova']
};

const MIXED_DIFFICULTIES = ['easy', 'medium', 'hard', 'medium'];

const AIStrategy = {

    namesFor(difficulty) {
        return AI_NAMES[difficulty] || AI_NAMES.easy;
    },

    difficultyFor(groupDifficulty, index) {
        if (groupDifficulty === 'mixed') return MIXED_DIFFICULTIES[index % MIXED_DIFFICULTIES.length];
        return groupDifficulty;
    },

    getMove(aiClient, gameRulesModel) {
        const difficulty = aiClient.aiDifficulty || 'easy';

        const pending = gameRulesModel.pendingInteraction;
        if (pending && pending.from === aiClient.getName()) {
            return this._resolvePendingInteraction(pending, aiClient, gameRulesModel);
        }

        // TakeOrLeave state: drew a playable card, decide to play or pass
        const takeOrLeave = aiClient.getTakeOrLeave();
        if (takeOrLeave) {
            const shouldPlay = (difficulty === 'easy') ? (Math.random() > 0.3) : true;
            if (shouldPlay) {
                return { action: 'place', card: this._buildCardData(takeOrLeave, aiClient, difficulty) };
            }
            return { action: 'take' }; // pass
        }

        const hand = aiClient.getCards();
        const validCards = hand.filter(card => gameRulesModel.cardCanBePlaced(card));

        if (validCards.length === 0) {
            return { action: 'take' };
        }

        let chosen;
        if (difficulty === 'easy') {
            chosen = validCards[Math.floor(Math.random() * validCards.length)];
        } else if (difficulty === 'medium') {
            chosen = this._mediumChoice(validCards);
        } else {
            chosen = this._hardChoice(validCards, hand, aiClient, gameRulesModel);
        }

        return { action: 'place', card: this._buildCardData(chosen, aiClient, difficulty) };
    },

    _buildCardData(card, aiClient, difficulty) {
        let type = card.getType();
        // Wild card: choose a color (Rainbow excluded — it never takes a color)
        if (type.charAt(0) === 'k' && type !== 'krbw') {
            const numb = type.slice(1);
            const color = this._chooseColor(aiClient.getCards(), difficulty);
            type = color + numb;
        }
        return { id: card.getId(), type: type };
    },

    _mediumChoice(validCards) {
        // Prefer action/special cards
        const actionCards = validCards.filter(c => {
            const n = c.getNumber();
            return n === 'p' || n === 'n' || n === 'r' || n === 'g' || n === 'c' || !!CardDefs[n];
        });
        if (actionCards.length > 0) return actionCards[0];
        return validCards[0];
    },

    _hardChoice(validCards, hand, aiClient, gameRulesModel) {
        const opponents = gameRulesModel.clientRepository.findAll().filter(c => c !== aiClient);
        const opponentClose = opponents.some(c => c.getCardsCount() <= 3);

        // If opponent is close to winning, attack with +2/+4/skip
        if (opponentClose) {
            const attackCards = validCards.filter(c => {
                const n = c.getNumber();
                return n === 'p' || n === 'g' || (CardDefs[n] && CardDefs[n].punishAmount); // +2, +4, +6..+18
            });
            if (attackCards.length > 0) return attackCards[0];

            const stopCards = validCards.filter(c => {
                const n = c.getNumber();
                return n === 'n' || n === 'r' || (CardDefs[n] && CardDefs[n].skipCount); // skip, reverse, 2x Miss
            });
            if (stopCards.length > 0) return stopCards[0];
        }

        // Save wild cards for emergencies
        const nonWilds = validCards.filter(c => {
            const n = c.getNumber();
            return c.getType() !== 'kg' && c.getType() !== 'kc' && !(CardDefs[n] && CardDefs[n].isWild);
        });
        if (nonWilds.length > 0) {
            const actionCards = nonWilds.filter(c => {
                const n = c.getNumber();
                return n === 'p' || n === 'n' || n === 'r' || !!CardDefs[n];
            });
            if (actionCards.length > 0) return actionCards[0];
            return nonWilds[0];
        }

        return validCards[0];
    },

    _resolvePendingInteraction(pending, aiClient, gameRulesModel) {
        if (pending.awaiting === 'target') {
            const candidates = gameRulesModel.clientRepository.findAll().filter(c => {
                if (c === aiClient) return false;
                if ((gameRulesModel.battleRoyale || gameRulesModel.nextgenMode) && c.brEliminated) return false;
                if (pending.targetMin && c.getCardsCount() < pending.targetMin) return false;
                return true;
            });
            if (candidates.length === 0) return { action: 'cancelPending' };
            let best = candidates[0];
            if (pending.kind === 'trade') {
                // Trading wants the SMALLEST hand (a genuine improvement over the
                // AI's own), unlike steal which wants the biggest hand to rob.
                candidates.forEach(c => { if (c.getCardsCount() < best.getCardsCount()) best = c; });
                if (best.getCardsCount() >= aiClient.getCardsCount()) return { action: 'cancelPending' };
            } else {
                candidates.forEach(c => { if (c.getCardsCount() > best.getCardsCount()) best = c; });
            }
            return { action: 'selectTarget', targetName: best.getName() };
        }
        if (pending.awaiting === 'confirm') {
            const target = gameRulesModel.clientRepository.findByName(pending.targetName);
            const myCount = aiClient.getCardsCount();
            const theirCount = target ? target.getCardsCount() : myCount;
            return { action: 'confirmTrade', confirm: theirCount < myCount };
        }
        if (pending.awaiting === 'steal') {
            const target = gameRulesModel.clientRepository.findByName(pending.targetName);
            if (!target || target.getCardsCount() < pending.stealCount) return { action: 'cancelPending' };
            const pool = target.getCards().slice();
            const picks = [];
            while (picks.length < pending.stealCount && pool.length > 0) {
                const idx = Math.floor(Math.random() * pool.length);
                picks.push(pool.splice(idx, 1)[0].getId());
            }
            return { action: 'stealCards', cardIds: picks };
        }
        return { action: 'cancelPending' };
    },

    _chooseColor(hand, difficulty) {
        if (difficulty === 'easy') {
            const colors = ['r', 'g', 'b', 'y'];
            return colors[Math.floor(Math.random() * colors.length)];
        }
        // Pick most common color in hand
        const counts = { r: 0, g: 0, b: 0, y: 0 };
        hand.forEach(card => {
            const color = card.getColor();
            if (counts[color] !== undefined) counts[color]++;
        });
        let best = 'r', bestCount = -1;
        for (const [color, count] of Object.entries(counts)) {
            if (count > bestCount) { bestCount = count; best = color; }
        }
        return best;
    }
};

module.exports = AIStrategy;
