let ClientRepository = require('./UNOClientRepository.js');
let UNOClient = require('./UNOClient.js');
let Card = require('./Card.js');
let CardRepository = require('./CardRepository.js');
let CardDefs = require('./CardDefs.js');

module.exports = class GameRulesModel{

    constructor(clientRepository, maxRounds, ruleset, hardcoreMode, options) {
        this.cardTypes = [
            'r0','r1','r2','r3','r4','r5','r6','r7','r8','r9','rp','rn','rr',
            'g0','g1','g2','g3','g4','g5','g6','g7','g8','g9','gp','gn','gr',
            'b0','b1','b2','b3','b4','b5','b6','b7','b8','b9','bp','bn','br',
            'y0','y1','y2','y3','y4','y5','y6','y7','y8','y9','yp','yn','yr',
            'kg','kc','kg','kc'
        ];
        this.clientRepository = clientRepository;
        this.cardRepository = new CardRepository();

        this.drawDeck = [];
        this.discardDeck = [];
        this.direction = true;
        this.moveIndex = 0;
        this.events = [];

        this.seriesStarted = false;
        this.roundsPlayed = 0;
        this.maxRounds = (maxRounds && maxRounds > 0) ? maxRounds : 5;
        this.seriesWinner = null;

        this.unoRequired = null;
        this.unoDeadline = null;
        this.unoDeadlines = {};
        this.pendingUnoEvent = null;
        this.ruleset = ruleset || 'original';
        this.hardcoreMode = !!hardcoreMode;
        this.battleRoyale = !!(options && options.battleRoyale);
        this.doubleDeck = !!(options && options.doubleDeck);
        this.nextgenMode = !!(options && options.nextgenMode);
        this.brEliminated = [];
        this.brNextRank = 1;
        // Hoarder losses (reason: 'hoarder') always rank worse than any
        // legitimate finish — a separate, descending counter keeps them out of
        // the ascending brNextRank sequence used for genuine round finishes.
        // This value is also written into the player's round score (see
        // _brEliminatePlayer), so it must stay a plausible placement number
        // rather than an arbitrary sentinel like 1000.
        this._hoarderRankCounter = (clientRepository.count() || 1) + 1;
        this.stackPending = null;
        // Nextgen's punishment cards run hotter (+6..+18) than classic +2/+4, so it
        // gets a higher ceiling before a stack must be resolved.
        this.stackCap = this.nextgenMode ? 20 : 10;
        this.colorless = false;
        this.pendingInteraction = null;

        this.init();
    }
    init(){
        this.shuffleDeck();
    }
    shuffleDeck(){
        this.moveIndex = 0;
        let types;
        if(this.nextgenMode){
            types = this.cardTypes.concat(this.cardTypes).concat(this._buildNextgenExtraTypes());
        } else if(this.doubleDeck){
            types = this.cardTypes.concat(this.cardTypes);
        } else {
            types = this.cardTypes.slice();
        }
        let j, x, i;
        for (i = types.length - 1; i > 0; i--) {
            j = Math.floor(Math.random() * (i + 1));
            x = types[i];
            types[i] = types[j];
            types[j] = x;
        }
        this.cardRepository.clear();
        this.drawDeck = [];
        for(let i=0; i<types.length; i++){
            let card = new Card(i, types[i]);
            card.setMoveId(this.incrementMoveIndex());
            this.cardRepository.insert(card);
            this.drawDeck.push(card);
        }
    }
    _buildNextgenExtraTypes(){
        let colors = ['r','g','b','y'];
        let colored = { p6: 2, p8: 2, m2: 2, th: 1 };
        let wild = { p10: 2, rda: 2, tg1: 4, tg2: 4, rot: 2, rbw: 4 };
        let types = [];
        for(let code in colored){
            for(let i = 0; i < colored[code]; i++){
                colors.forEach(c => types.push(c + code));
            }
        }
        for(let code in wild){
            for(let i = 0; i < wild[code]; i++){
                types.push('k' + code);
            }
        }
        return types;
    }
    reShuffleDeck(){
        let topCard = this.discardDeck.pop();
        for(let i=0; i<this.discardDeck.length; i++){
            let numb = this.discardDeck[i].getNumber();
            if(numb === 'g' || numb === 'c' || (CardDefs[numb] && CardDefs[numb].isWild)){
                this.discardDeck[i].setType('k' + numb);
            }
            this.discardDeck[i].setOwner("draw");
            this.drawDeck.push(this.discardDeck[i]);
        }
        // Shuffle the returned cards (Fisher-Yates)
        for(let i=this.drawDeck.length-1; i>0; i--){
            let j = Math.floor(Math.random() * (i + 1));
            let x = this.drawDeck[i];
            this.drawDeck[i] = this.drawDeck[j];
            this.drawDeck[j] = x;
        }
        // Assign sequential moveIds and save events after shuffle
        for(let i=0; i<this.drawDeck.length; i++){
            this.drawDeck[i].setMoveId(this.incrementMoveIndex());
            this.saveEvent(this.drawDeck[i], "draw");
        }
        this.discardDeck = [];
        this.discardDeck.push(topCard);
    }
    returnHandToDeck(client){
        let hand = client.getCards().slice();
        if(hand.length === 0) return;
        for(let i=0; i<hand.length; i++){
            let card = hand[i];
            client.removeCard(card);
            let numb = card.getNumber();
            if(numb === 'g' || numb === 'c' || (CardDefs[numb] && CardDefs[numb].isWild)){
                card.setType('k' + numb);
            }
            card.setOwner("draw");
            this.drawDeck.push(card);
        }
        // Shuffle the whole draw pile so returned cards aren't predictably on top
        for(let i=this.drawDeck.length-1; i>0; i--){
            let j = Math.floor(Math.random() * (i + 1));
            let x = this.drawDeck[i];
            this.drawDeck[i] = this.drawDeck[j];
            this.drawDeck[j] = x;
        }
        // Reassign moveIds in final array order — array position (used by slice(-1) for
        // nextMoveValid) must match moveId order (used by client z-index) or the
        // "top of deck" flag lands on a card that isn't visually on top, and drawing breaks.
        for(let i=0; i<this.drawDeck.length; i++){
            this.drawDeck[i].setMoveId(this.incrementMoveIndex());
            this.saveEvent(this.drawDeck[i], "draw");
        }
    }
    deal(){
        this.stackPending = null;
        // Nextgen's hoarder-elimination rule can eliminate players even without
        // Battle Royale on, so this reset must fire for either mode.
        if(this.battleRoyale || this.nextgenMode){
            this.brEliminated = [];
            this.brNextRank = 1;
            this._hoarderRankCounter = this.clientRepository.count() + 1;
            this.clientRepository.findAll().forEach(function(c){ c.brEliminated = false; c.brRank = 0; c.brScore = 0; });
        }
        if(this.seriesWinner !== null){
            this.roundsPlayed = 0;
            this.maxRounds = 5;
            this.seriesWinner = null;
            this.clientRepository.findAll().forEach(c => { c.score = []; });
        }
        this.seriesStarted = true;
        this.shuffleDeck();

        this.clearEvents();

        let i, k;
        let clients = this.clientRepository.findAll();
        for (k=0; k<clients.length; k++){
            clients[k].clearCards();
        }
        for(i=0; i<7; i++){
            for (k=0; k<clients.length; k++){
                this.takeCard(clients[k]);
            }
        }
        this.discardDeck = [];
        while(true) {
            let card = this.drawDeck.shift();
            this.placeCard(card);
            let num = card.getNumber();
            if(card.getType() !== 'kg' && card.getType() !== 'kc'
                && num !== 'p' && num !== 'n' && num !== 'r') {
                break;
            }
        }
        this.begin();
    }
    begin(){
        UNOClient.setArrayTurn(this.clientRepository.findAll(), false);
        UNOClient.setArrayHasWon(this.clientRepository.findAll(), false);
        let clients = this.clientRepository.findAll();
        clients[Math.floor(Math.random() * clients.length)].setTurn(true);
        this.validateNextMove();
    }
    getNextClient(unoClient){
        let all = this.clientRepository.findAll();
        let count = all.length;
        let startIdx = all.indexOf(unoClient);
        if(this.battleRoyale || this.nextgenMode){
            for(let i = 1; i < count; i++){
                let idx = this.direction ? (startIdx + i) % count : (startIdx - i + count) % count;
                if(!all[idx].brEliminated) return all[idx];
            }
            return false;
        }
        let unoClientNext;
        if(this.direction){
            unoClientNext = this.clientRepository.findNext(unoClient);
        }else{
            unoClientNext = this.clientRepository.findPrevious(unoClient);
        }
        if(unoClientNext instanceof UNOClient){
            return unoClientNext;
        }
        return false;
    }
    _activePlayerCount(){
        let all = this.clientRepository.findAll();
        return (this.battleRoyale || this.nextgenMode) ? all.filter(c => !c.brEliminated).length : all.length;
    }
    redrawAll(client){
        let count = client.getCardsCount();
        this.returnHandToDeck(client);
        for(let i = 0; i < count; i++){
            if(this.drawDeck.length === 0) this.reShuffleDeck();
            this.takeCard(client);
        }
    }
    _rotateHands(){
        let active = this.clientRepository.findAll().filter(c => !(this.battleRoyale || this.nextgenMode) || !c.brEliminated);
        if(active.length < 2) return;
        let hands = active.map(c => c.getCards().slice());
        let count = active.length;
        let newHands = new Array(count);
        for(let i = 0; i < count; i++){
            let receiverIdx = this.direction ? (i + 1) % count : (i - 1 + count) % count;
            newHands[receiverIdx] = hands[i];
        }
        for(let i = 0; i < count; i++){
            active[i].clearCards();
        }
        for(let i = 0; i < count; i++){
            let receiver = active[i];
            newHands[i].forEach(card => {
                receiver.addCard(card);
                card.setMoveId(this.incrementMoveIndex());
                this.saveEvent(card, receiver.getName());
            });
        }
    }
    selectTarget(client, targetName){
        let p = this.pendingInteraction;
        if(!p || p.from !== client.getName() || p.awaiting !== 'target') return;
        let target = this.clientRepository.findByName(targetName);
        if(!target || target.getName() === client.getName()) return;
        if((this.battleRoyale || this.nextgenMode) && target.brEliminated) return;
        if(p.targetMin && target.getCardsCount() < p.targetMin) return;
        p.targetName = targetName;
        p.awaiting = (p.kind === 'trade') ? 'confirm' : 'steal';
    }
    confirmTrade(client, confirmed){
        let p = this.pendingInteraction;
        if(!p || p.kind !== 'trade' || p.from !== client.getName() || p.awaiting !== 'confirm') return;
        if(confirmed){
            let target = this.clientRepository.findByName(p.targetName);
            if(target){
                let initiatorCards = client.getCards().slice();
                let targetCards = target.getCards().slice();
                client.clearCards();
                target.clearCards();
                targetCards.forEach(card => {
                    client.addCard(card);
                    card.setMoveId(this.incrementMoveIndex());
                    this.saveEvent(card, client.getName());
                });
                initiatorCards.forEach(card => {
                    target.addCard(card);
                    card.setMoveId(this.incrementMoveIndex());
                    this.saveEvent(card, target.getName());
                });
            }
        }
        this.pendingInteraction = null;
        this.finishTurn(client);
    }
    stealCards(client, cardIds){
        let p = this.pendingInteraction;
        if(!p || (p.kind !== 'steal1' && p.kind !== 'steal2') || p.from !== client.getName() || p.awaiting !== 'steal') return;
        if(!Array.isArray(cardIds) || cardIds.length !== p.stealCount) return;
        let uniqueIds = Array.from(new Set(cardIds));
        if(uniqueIds.length !== p.stealCount) return;
        let target = this.clientRepository.findByName(p.targetName);
        if(!target) return;
        let cards = uniqueIds.map(id => this.cardRepository.findById(id));
        let allValid = cards.every(c => c instanceof Card && c.getOwner() === target.getName());
        if(!allValid) return;
        cards.forEach(card => {
            target.removeCard(card);
            client.addCard(card);
            card.setMoveId(this.incrementMoveIndex());
            this.saveEvent(card, client.getName());
        });
        this.pendingInteraction = null;
        this.finishTurn(client);
    }
    cancelPendingInteraction(client){
        let p = this.pendingInteraction;
        if(!p || p.from !== client.getName()) return;
        this.pendingInteraction = null;
        this.finishTurn(client);
    }
    cardCanBePlaced(card){
        let current = this.discardDeck.slice(-1)[0];
        if(typeof current === 'undefined')return false;

        // Stacking mode: a pending stack takes any punishment card, any color, same or crossed type,
        // until the accumulated count hits the cap — then only take() can resolve it.
        if(this.ruleset === 'stacking' && this.stackPending){
            if(this.stackPending.count >= this.stackCap) return false;
            let numb = card.getNumber();
            return numb === 'p' || numb === 'g' || !!(CardDefs[numb] && CardDefs[numb].punishAmount);
        }

        if(this.colorless) return true;
        let numb = card.getNumber();
        if(numb === 'g'
            || numb === 'c'
            || (CardDefs[numb] && CardDefs[numb].isWild)
            || card.getColor() === current.getColor()
            || numb === current.getNumber()){
                return true;
        }
        return false;
    }
    finishTurn(unoClient, card){

        unoClient.setTakeOrLeave(false);

        if(card instanceof Card){
            let unoClientNext = this.getNextClient(unoClient);
            if(unoClientNext instanceof UNOClient){

                // Stacking mode: accumulate penalty instead of applying it immediately.
                // Cross-type stacks (any punishment card on any other) add onto the running
                // count, any color; cardCanBePlaced() enforces a cap of 20 total before
                // forcing resolution via take().
                let numb0 = card.getNumber();
                let stackAmount = numb0 === 'p' ? 2 : numb0 === 'g' ? 4 : (CardDefs[numb0] && CardDefs[numb0].punishAmount) || 0;
                if(this.ruleset === 'stacking' && stackAmount > 0){
                    if(this.stackPending){
                        this.stackPending.count += stackAmount;
                    } else {
                        this.stackPending = { count: stackAmount };
                    }
                    this.stackPending.type = numb0;
                    this.stackPending.color = card.getColor();
                    this.stackPending.max = this.stackCap;
                    // Win check: player emptied hand with a penalty card
                    if(unoClient.getCardsCount() === 0){
                        // Once a hoarder-loss has happened this round, the rest plays out
                        // ranked (Battle-Royale style) rather than ending on the first
                        // classic win — matches how a real Battle Royale game never lets
                        // hand-emptying end the round early either.
                        if(this.battleRoyale || (this.nextgenMode && this.brEliminated.length > 0)){
                            this.stackPending = null; this._brEliminatePlayer(unoClient, 'br'); return;
                        }
                        this.stackPending = null;
                        UNOClient.setArrayTurn(this.clientRepository.findAll(), false);
                        UNOClient.setArrayHasWon(this.clientRepository.findAll(), false);
                        UNOClient.setArrayReady(this.clientRepository.findAll(), false);
                        unoClient.setHasWon(true);
                        UNOClient.calculateScores(this.clientRepository.findAll());
                        this.roundsPlayed++;
                        this._checkSeriesEnd();
                        this.validateNextMove();
                        return;
                    }
                    // Pass turn to next player (no skip — they must respond to the stack)
                    UNOClient.setArrayTurn(this.clientRepository.findAll(), false);
                    unoClientNext.setTurn(true);
                    this.validateNextMove();
                    return;
                }

                let numb = card.getNumber();
                let punishAmount = numb === 'p' ? 2 : numb === 'g' ? 4 : (CardDefs[numb] && CardDefs[numb].punishAmount) || 0;
                for(let d = 0; d < punishAmount; d++){
                    this.takeCard(unoClientNext);
                }
                if(CardDefs[numb] && CardDefs[numb].redrawAll){
                    this.redrawAll(unoClientNext);
                }
                let skipCount = 0;
                if(numb === 'n' || punishAmount > 0 || (CardDefs[numb] && CardDefs[numb].redrawAll)){
                    skipCount = 1;
                } else if(CardDefs[numb] && CardDefs[numb].skipCount){
                    skipCount = CardDefs[numb].skipCount;
                    if(skipCount > 1 && this._activePlayerCount() === 2) skipCount = 1;
                }
                for(let s = 0; s < skipCount; s++){
                    unoClientNext = this.getNextClient(unoClientNext);
                }
                if(numb === 'r'){     //reverse direction
                    this.direction = !this.direction;
                    unoClientNext = this.getNextClient(unoClient);
                }
                if(CardDefs[numb] && CardDefs[numb].rotateAll && unoClient.getCardsCount() > 0){
                    // Skip the redistribution if Rotate was the player's last card —
                    // otherwise they'd immediately receive a neighbor's hand and the
                    // win a moment later at getCardsCount()===0 below would never fire.
                    this._rotateHands();
                }
                if(CardDefs[numb] && CardDefs[numb].colorless){
                    this.colorless = true;
                }
                if(unoClientNext instanceof UNOClient){
                    UNOClient.setArrayTurn(this.clientRepository.findAll(), false);
                    unoClientNext.setTurn(true);
                }
                if(unoClient.getCardsCount() === 0){
                    if(this.battleRoyale || (this.nextgenMode && this.brEliminated.length > 0)){
                        this._brEliminatePlayer(unoClient, 'br'); return;
                    }
                    UNOClient.setArrayTurn(this.clientRepository.findAll(), false);
                    UNOClient.setArrayHasWon(this.clientRepository.findAll(), false);
                    UNOClient.setArrayReady(this.clientRepository.findAll(), false);

                    unoClient.setHasWon(true);
                    UNOClient.calculateScores(this.clientRepository.findAll());
                    this.roundsPlayed++;
                    this._checkSeriesEnd();
                }
            }
        }else{
            let unoClientNext = this.getNextClient(unoClient);
            if(unoClientNext instanceof UNOClient){
                UNOClient.setArrayTurn(this.clientRepository.findAll(), false);
                unoClientNext.setTurn(true);
            }
        }
        this.validateNextMove();
    }
    place(unoClient, cardData){

        if(!unoClient.getTurn())return false;
        if(this.pendingInteraction) return false;

        if(typeof cardData.id !== 'undefined'){

            let card = this.cardRepository.findById(cardData.id);

            if(card instanceof Card){

                if(!cardData.type || typeof cardData.type !== 'string') return false;
                let numb = cardData.type.slice(1);
                let originalType = card.getType();
                let originalNumb = originalType.slice(1);
                let isWildColorPick = originalType.charAt(0) === 'k' && originalType !== 'krbw' && numb === originalNumb;
                if(isWildColorPick){
                    card.setType(cardData.type);
                }

                if(this.pendingInteraction) return;
                if(this.cardCanBePlaced(card)){
                    if(unoClient.removeCard(card)){
                        this.colorless = false;
                        unoClient.setTakeOrLeave(false);
                        this.placeCard(card);
                        let def = CardDefs[card.getNumber()];
                        if(def && def.requiresTarget){
                            this.pendingInteraction = {
                                kind: def.requiresTarget,
                                from: unoClient.getName(),
                                targetName: null,
                                awaiting: 'target',
                                stealCount: def.stealCount || 0,
                                targetMin: def.targetMin || 0
                            };
                            this.validateNextMove();
                            return;
                        }
                        this.finishTurn(unoClient, card);
                        if(def && def.colorless){
                            this.colorless = true;
                        }
                        return;
                    }
                }
                if(isWildColorPick){
                    card.setType(originalType);
                }
            }
        }
    }
    take(unoClient){

        if(unoClient.getTurn()){
            if(this.pendingInteraction) return;

            // Stacking mode: player takes the full accumulated penalty
            if(this.ruleset === 'stacking' && this.stackPending){
                let count = this.stackPending.count;
                this.stackPending = null;
                for(let i = 0; i < count; i++){
                    if(this.drawDeck.length === 0) this.reShuffleDeck();
                    this.takeCard(unoClient);
                }
                this.finishTurn(unoClient);
                return;
            }

            if(unoClient.getTakeOrLeave()){
                this.finishTurn(unoClient);
                return;
            }

            let card = this.takeCard(unoClient);
            if(!card){ this.finishTurn(unoClient); return; }

            // Reshuffle before finishTurn so validateNextMove sees a populated deck
            if(this.drawDeck.length == 0){
                this.reShuffleDeck();
            }

            if(this.cardCanBePlaced(card) && !unoClient.getTakeOrLeave()){
                unoClient.setTakeOrLeave(card);
            }else{
                this.finishTurn(unoClient);
            }
        }
    }
    takeCard(unoClient){
        if(this.drawDeck.length === 0){
            this.reShuffleDeck();
        }
        let card = this.drawDeck.pop();
        if(!card) return null;
        card.setMoveId(this.incrementMoveIndex());
        this.saveEvent(card, unoClient.getName());
        unoClient.addCard(card);
        return card;
    }
    placeCard(card){
        card.setMoveId(this.incrementMoveIndex());
        card.setOwner("dsc");
        this.saveEvent(card, "dsc");
        this.discardDeck.push(card);
    }
    incrementMoveIndex(){
        this.moveIndex++;
        return this.moveIndex;
    }
    saveEvent(card, owner){
        this.events.push({
            cardId: card.getId(),
            newOwner: owner
        });
    }
    clearEvents(){
        this.events = []
    }
    getEvents(){
        return this.events;
    }
    getDrawDeckCount(){
        return this.drawDeck.length;
    }
    getDiscardDeck(){
        return this.discardDeck;
    }
    validateNextMove(){

        Card.setArrayNextMoveValid(this.cardRepository.findAll(), false);

        this._checkHoarderElimination();

        if(this.pendingInteraction) return;

        if(this.drawDeck.length === 0 && this.discardDeck.length > 1){
            this.reShuffleDeck();
        }

        let client = this.clientRepository.findByTurn(true);
        if(client instanceof UNOClient){
            let cards = client.getCards();
            for(let i=0; i<cards.length; i++){
                if(this.cardCanBePlaced(cards[i])){
                    cards[i].setNextMoveValid(true);
                }
            }
        }

        let card = this.drawDeck.slice(-1)[0];
        if(card instanceof Card){
            card.setNextMoveValid(true);
        }
    }
    _checkSeriesEnd(){
        if(this.roundsPlayed < this.maxRounds) return;
        let clients = this.clientRepository.findAll();
        let winCounts = clients.map(c => c.getScore().filter(s => s === '-').length);
        let maxWins = Math.max(...winCounts);
        let leaders = winCounts.filter(w => w === maxWins).length;
        if(leaders > 1){
            this.maxRounds++;
        } else {
            this.seriesWinner = clients[winCounts.indexOf(maxWins)].getName();
        }
    }
    getCardRepository(){
        return this.cardRepository;
    }
    getDirection(){ return this.direction; }
    isSeriesStarted(){ return this.seriesStarted; }
    getSeriesWinner(){ return this.seriesWinner; }
    getRoundsPlayed(){ return this.roundsPlayed; }
    getMaxRounds(){ return this.maxRounds; }
    _brEliminatePlayer(unoClient, reason){
        reason = reason || 'br';
        // A dangling pendingInteraction referencing the eliminated player (as either
        // initiator or target) would softlock the game waiting on input that can
        // never come — same fix as the disconnect path in UNOGameService.
        let pi = this.pendingInteraction;
        if(pi && (pi.from === unoClient.getName() || pi.targetName === unoClient.getName())){
            this.pendingInteraction = null;
        }

        let active = this.clientRepository.findAll().filter(function(c){ return !c.brEliminated; });
        let score = 0;
        active.forEach(function(c){
            if(c !== unoClient){ let s = c.calculateScore(); score += (typeof s === 'number') ? s : 0; }
        });
        // Capture before clearing — only reassign the turn below if the eliminated
        // player actually held it. Hoarder elimination can strike a player who
        // isn't the current turn-holder (e.g. the victim of a punishment draw);
        // stealing the turn from whoever legitimately holds it would be a bug.
        let hadTurn = unoClient.getTurn();
        unoClient.brEliminated = true;
        if(reason === 'hoarder'){
            // Unlike a normal BR elimination (which only ever fires once a player's
            // hand is already empty), a hoarder is eliminated while still holding
            // 40+ cards — those must go back to the draw pile or they stay stuck
            // in a "brEliminated" hand forever, starving the deck for everyone else.
            this.returnHandToDeck(unoClient);
            unoClient.brRank = this._hoarderRankCounter--;
        } else {
            unoClient.brRank = this.brNextRank;
            this.brNextRank++;
        }
        unoClient.brScore = score;
        this.brEliminated.push({ name: unoClient.getName(), rank: unoClient.brRank, score: unoClient.brScore, reason: reason });
        unoClient.insertScore(unoClient.brRank === 1 ? '-' : unoClient.brRank);
        unoClient.turn = false;

        let remaining = this.clientRepository.findAll().filter(function(c){ return !c.brEliminated; });
        if(remaining.length <= 1){
            if(remaining.length === 1){
                let last = remaining[0];
                last.brEliminated = true;
                last.brRank = this.brNextRank;
                this.brNextRank++;
                last.brScore = 0;
                last.turn = false;
                this.brEliminated.push({ name: last.getName(), rank: last.brRank, score: 0 });
                last.insertScore(last.brRank);
            }
            let rank1 = this.clientRepository.findAll().find(function(c){ return c.brRank === 1; });
            if(rank1) rank1.hasWon = true;
            UNOClient.setArrayReady(this.clientRepository.findAll(), false);
            this.roundsPlayed++;
            this._checkSeriesEnd();
        } else {
            if(hadTurn){
                UNOClient.setArrayTurn(this.clientRepository.findAll(), false);
                let all = this.clientRepository.findAll();
                let idx = all.indexOf(unoClient);
                let count = all.length;
                for(let i = 1; i < count; i++){
                    let nextIdx = this.direction ? (idx + i) % count : (idx - i + count) % count;
                    if(!all[nextIdx].brEliminated){ all[nextIdx].setTurn(true); break; }
                }
            }
            // End round if no humans remain — AI-only games loop indefinitely
            let humansLeft = remaining.filter(function(c){ return !c.isAI; });
            if(humansLeft.length === 0){
                let sorted = remaining.slice().sort(function(a, b){ return a.getCardsCount() - b.getCardsCount(); });
                for(let i = 0; i < sorted.length; i++){
                    let r = sorted[i];
                    r.brEliminated = true;
                    r.brRank = this.brNextRank++;
                    r.brScore = 0;
                    r.turn = false;
                    this.brEliminated.push({ name: r.getName(), rank: r.brRank, score: 0 });
                    r.insertScore(r.brRank);
                }
                let rank1 = this.clientRepository.findAll().find(function(c){ return c.brRank === 1; });
                if(rank1) rank1.hasWon = true;
                UNOClient.setArrayReady(this.clientRepository.findAll(), false);
                this.roundsPlayed++;
                this._checkSeriesEnd();
                return;
            }
        }
        this.validateNextMove();
    }
    _checkHoarderElimination(){
        if(!this.nextgenMode) return;
        // Only one hoarder handled here — _brEliminatePlayer's own tail call back
        // into validateNextMove() re-runs this check, so a second simultaneous
        // hoarder (e.g. two players both dealt a monster hand by the same Rotate)
        // is caught by that recursive call, not a loop here.
        let hoarder = this.clientRepository.findAll().find(function(c){
            return !c.brEliminated && c.getCardsCount() >= 40;
        });
        if(hoarder) this._brEliminatePlayer(hoarder, 'hoarder');
    }
};
