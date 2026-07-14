let GameService = require('../GameService.js');

let GameRulesModel = require('./GameRulesModel.js');
let UNOClient = require('./UNOClient.js');
let UNOClientRepository = require('./UNOClientRepository.js');
let MessageRepository = require('../MessageRepository.js');
let LoginActionHandler = require('./LoginActionHandler.js');
let BeginActionHandler = require('./BeginActionHandler.js');
let PlaceCardActionHandler = require('./PlaceCardActionHandler.js');
let TakeCardActionHandler = require('./TakeCardActionHandler.js');
let SelectTargetActionHandler = require('./SelectTargetActionHandler.js');
let ConfirmTradeActionHandler = require('./ConfirmTradeActionHandler.js');
let StealCardsActionHandler = require('./StealCardsActionHandler.js');
let CancelPendingActionHandler = require('./CancelPendingActionHandler.js');
let ClientResponseBuilder = require('./ClientResponseBuilder.js');
let AIStrategy = require('./AIStrategy.js');
let CardDefs = require('./CardDefs.js');

module.exports = class UNOGameService extends GameService{
    constructor(id, config) {
        config = config || {};
        super(id, new MessageRepository(), new UNOClientRepository());

        this.gameRulesModel = new GameRulesModel(this.getClientRepository(), config.maxRounds, config.ruleset, config.hardcoreMode, { battleRoyale: config.battleRoyale, doubleDeck: config.doubleDeck, nextgenMode: config.nextgenMode, multiDiscard: config.multiDiscard });
        this.clientResponseBuilder = new ClientResponseBuilder(this.getClientRepository(), this.getGameRulesModel());

        this.actionHandlers.login = new LoginActionHandler(this);
        this.actionHandlers.begin = new BeginActionHandler(this);
        this.actionHandlers.place = new PlaceCardActionHandler(this);
        this.actionHandlers.take = new TakeCardActionHandler(this);
        this.actionHandlers.selectTarget = new SelectTargetActionHandler(this);
        this.actionHandlers.confirmTrade = new ConfirmTradeActionHandler(this);
        this.actionHandlers.stealCards = new StealCardsActionHandler(this);
        this.actionHandlers.cancelPending = new CancelPendingActionHandler(this);

        this.broadcastFn = null;
        this._aiTimer = null;
        this._unoTimers = {};

        if(config.bots && config.bots.length > 0){
            this._addBotsFromConfig(config.bots);
        } else if(config.aiCount && config.aiCount > 0){
            this._addAIPlayers(config.aiCount, config.aiDifficulty || 'easy');
        }

        let self = this;
        this.actionHandlers.uno = {
            handleAction: function(data){
                let cr = self.getClientRepository();
                let client = cr.findBySocketId(data.socketId);
                if(!client && data.client) client = cr.findByName(data.client.name);
                if(client && self.gameRulesModel.unoDeadlines[client.getName()]){
                    self._handleUnoSuccess(client.getName());
                }
            }
        };
    }

    _addBotsFromConfig(bots){
        let max = Math.min(bots.length, 4);
        for(let i = 0; i < max; i++){
            let bot = bots[i];
            let ai = new UNOClient(bot.name || ('Bot-' + (i + 1)));
            ai.isAI = true;
            ai.aiDifficulty = bot.difficulty || 'easy';
            ai.setReady(true);
            this.getClientRepository().insert(ai);
        }
    }

    _addAIPlayers(count, difficulty){
        let names = AIStrategy.namesFor(difficulty);
        let max = Math.min(count, 4);
        for(let i = 0; i < max; i++){
            let ai = new UNOClient(names[i] || ('Bot-' + (i + 1)));
            ai.isAI = true;
            ai.aiDifficulty = AIStrategy.difficultyFor(difficulty, i);
            ai.setReady(true);
            this.getClientRepository().insert(ai);
        }
    }

    removePlayer(socketId){
        let cr = this.getClientRepository();
        let client = cr.findBySocketId(socketId);
        if(client){
            let name = client.getName();
            if(this._unoTimers[name]){
                clearTimeout(this._unoTimers[name].t);
                clearTimeout(this._unoTimers[name].ai);
                delete this._unoTimers[name];
                delete this.gameRulesModel.unoDeadlines[name];
            }
            if(Object.keys(this._unoTimers).length === 0){
                this.gameRulesModel.unoRequired = null;
                this.gameRulesModel.unoDeadline = null;
                this.gameRulesModel.pendingUnoEvent = null;
            }

            // A dangling pendingInteraction referencing the departing player (as either
            // initiator or target) would softlock the game waiting on input that can never come.
            let pi = this.gameRulesModel.pendingInteraction;
            if(pi && (pi.from === name || pi.targetName === name)){
                this.gameRulesModel.pendingInteraction = null;
            }

            // Removing the player whose turn it is must hand the turn off,
            // otherwise the game softlocks waiting on a client that no longer exists.
            let hadTurn = client.getTurn() && cr.count() > 1;
            let nextClient = hadTurn ? this.gameRulesModel.getNextClient(client) : false;

            // Orphaned hand cards must go back to the draw pile, not vanish until next shuffleDeck().
            this.gameRulesModel.returnHandToDeck(client);

            cr.removeByName(name);

            if(nextClient && nextClient.getName() !== name){
                nextClient.setTurn(true);
            }

            // Returned cards reshuffle the draw pile — recompute nextMoveValid flags
            // regardless of who holds the turn, or the top-of-deck flag goes stale.
            this.gameRulesModel.validateNextMove();

            if(nextClient && nextClient.getName() !== name){
                this.scheduleAITurn();
            }
        }
    }

    restart(){
        if(this._aiTimer){ clearTimeout(this._aiTimer); this._aiTimer = null; }
        for(let name in this._unoTimers){
            clearTimeout(this._unoTimers[name].t);
            clearTimeout(this._unoTimers[name].ai);
        }
        this._unoTimers = {};

        let cr = this.getClientRepository();
        cr.findAll().forEach(function(c){
            c.setReady(c.isAI ? true : false);
            c.clearCards();
            c.turn = false;
            c.hasWon = false;
            c.takeOrLeave = false;
            c.brEliminated = false;
            c.brRank = 0;
            c.brScore = 0;
        });

        let grm = this.gameRulesModel;
        grm.brEliminated = [];
        grm.brNextRank = 1;
        grm.shuffleDeck();
        grm.discardDeck = [];
        grm.direction = true;
        grm.unoRequired = null;
        grm.unoDeadline = null;
        grm.unoDeadlines = {};
        grm.pendingUnoEvent = null;
        grm.stackPending = null;
        grm.clearEvents();
    }

    scheduleAITurn(){
        if(Object.keys(this._unoTimers).length > 0) return;
        let current = this.gameRulesModel.clientRepository.findByTurn(true);
        if(!current || !current.isAI) return;

        // Don't run AI if no humans remain
        let humans = this.gameRulesModel.clientRepository.findAll().filter(function(c){ return !c.isAI; });
        if(humans.length === 0) return;

        // Don't run AI if someone already won (between rounds)
        if(this.gameRulesModel.clientRepository.findByHasWon(true)) return;

        clearTimeout(this._aiTimer);
        let self = this;

        // After deal: wait for dealing animation to finish before first move
        let baseDelay;
        if(this._justDealt){
            this._justDealt = false;
            baseDelay = 5000;
        } else {
            let topCard = this.gameRulesModel.getDiscardDeck().slice(-1)[0];
            let numb = topCard ? topCard.getNumber() : null;
            let isClassicAction = numb && ['p','n','r','g','c'].indexOf(numb) !== -1;
            let def = numb && CardDefs[numb];
            // Rotate visibly redistributes hands client-side fast — give that
            // animation room to finish before the AI moves again. Matches the
            // client's 1.1s fast center-event display for this card type. Trade
            // Hands used to share this short delay but its label runs at the
            // default (slower) pace now, so it falls into the classic-action
            // bucket below like Redraw All already does.
            let needsHandRedistributeDelay = def && def.rotateAll;
            if(needsHandRedistributeDelay){
                baseDelay = 1600;
            } else if(isClassicAction || def){
                baseDelay = 2000;
            } else {
                baseDelay = 800;
            }
        }
        let delay = baseDelay + Math.floor(Math.random() * 500);

        this._aiTimer = setTimeout(function(){
            self._executeAITurn(current);
        }, delay);
    }

    _executeAITurn(aiClient){
        if(!aiClient.getTurn()) return; // turn changed, abort

        let unoTrigger = false;
        try {
            let move = AIStrategy.getMove(aiClient, this.gameRulesModel);
            if(move.action === 'take'){
                this.gameRulesModel.take(aiClient);
            } else if(move.action === 'place'){
                this.gameRulesModel.place(aiClient, move.card);
                if(aiClient.getCardsCount() === 1) unoTrigger = true;
            } else if(move.action === 'selectTarget'){
                this.gameRulesModel.selectTarget(aiClient, move.targetName);
            } else if(move.action === 'confirmTrade'){
                this.gameRulesModel.confirmTrade(aiClient, move.confirm);
            } else if(move.action === 'stealCards'){
                this.gameRulesModel.stealCards(aiClient, move.cardIds);
            } else if(move.action === 'cancelPending'){
                this.gameRulesModel.cancelPendingInteraction(aiClient);
            }
        } catch(e){
            console.error('AI move error:', e.message);
        }

        if(unoTrigger){
            this.startUnoCheck(aiClient.getName());
            if(this.broadcastFn) this.broadcastFn();
            return; // timer callbacks handle scheduleAITurn
        }

        if(this.broadcastFn) this.broadcastFn();
        this.scheduleAITurn();
    }

    startUnoCheck(playerName){
        // Clear existing check for THIS player only — leave other players' checks intact
        if(this._unoTimers[playerName]){
            clearTimeout(this._unoTimers[playerName].t);
            clearTimeout(this._unoTimers[playerName].ai);
        }
        clearTimeout(this._aiTimer);

        let deadline = Date.now() + 3000;
        this.gameRulesModel.unoRequired = playerName;
        this.gameRulesModel.unoDeadline = deadline;
        this.gameRulesModel.unoDeadlines[playerName] = deadline;
        this.gameRulesModel.pendingUnoEvent = null;

        let self = this;
        let timers = {};

        timers.t = setTimeout(function(){
            if(self.gameRulesModel.unoDeadlines[playerName]){
                self._handleUnoFail(playerName);
                if(self.broadcastFn) self.broadcastFn();
                self.scheduleAITurn();
            }
        }, 3000);

        let client = this.getClientRepository().findByName(playerName);
        if(client && client.isAI){
            let failChances = { easy: 0.4, medium: 0.2, hard: 0.0 };
            let failChance = failChances[client.aiDifficulty] !== undefined ? failChances[client.aiDifficulty] : 0.4;
            if(Math.random() >= failChance){
                let pressDelay = 800 + Math.floor(Math.random() * 1500);
                timers.ai = setTimeout(function(){
                    if(self.gameRulesModel.unoDeadlines[playerName]){
                        clearTimeout(timers.t);
                        self._handleUnoSuccess(playerName);
                        if(self.broadcastFn) self.broadcastFn();
                        self.scheduleAITurn();
                    }
                }, pressDelay);
            }
        }

        this._unoTimers[playerName] = timers;
    }

    _handleUnoSuccess(playerName){
        if(this._unoTimers[playerName]){
            clearTimeout(this._unoTimers[playerName].t);
            clearTimeout(this._unoTimers[playerName].ai);
            delete this._unoTimers[playerName];
        }
        delete this.gameRulesModel.unoDeadlines[playerName];
        let rem = Object.keys(this.gameRulesModel.unoDeadlines);
        this.gameRulesModel.unoRequired = rem.length > 0 ? rem[0] : null;
        this.gameRulesModel.unoDeadline = rem.length > 0 ? this.gameRulesModel.unoDeadlines[rem[0]] : null;
        this.gameRulesModel.clearEvents();
        this.gameRulesModel.pendingUnoEvent = { id: Date.now(), type: 'u', target: playerName, label: 'UNO!' };
    }

    _handleUnoFail(playerName){
        if(this._unoTimers[playerName]){
            clearTimeout(this._unoTimers[playerName].t);
            clearTimeout(this._unoTimers[playerName].ai);
            delete this._unoTimers[playerName];
        }
        delete this.gameRulesModel.unoDeadlines[playerName];
        let rem = Object.keys(this.gameRulesModel.unoDeadlines);
        this.gameRulesModel.unoRequired = rem.length > 0 ? rem[0] : null;
        this.gameRulesModel.unoDeadline = rem.length > 0 ? this.gameRulesModel.unoDeadlines[rem[0]] : null;
        let client = this.getClientRepository().findByName(playerName);
        if(client){
            for(let i = 0; i < 8; i++){
                if(this.gameRulesModel.drawDeck.length === 0) this.gameRulesModel.reShuffleDeck();
                this.gameRulesModel.takeCard(client);
            }
        }
        this.gameRulesModel.clearEvents();
        this.gameRulesModel.pendingUnoEvent = { id: Date.now(), type: 'uf', target: playerName, label: '+8 FAILED' };
        this.gameRulesModel.validateNextMove();
    }

    clearPendingEvent(){
        this.gameRulesModel.pendingUnoEvent = null;
    }

    getClientResponseData(socketId){
        let client = this.getClientRepository().findBySocketId(socketId);
        if(client instanceof UNOClient) {
            return this.clientResponseBuilder.build(client);
        }
        return false;
    }
    getGameRulesModel(){
        return this.gameRulesModel;
    }

    execAfkMove(client) {
        let pi = this.gameRulesModel.pendingInteraction;
        if (pi && pi.from === client.getName()) {
            this.gameRulesModel.cancelPendingInteraction(client);
            return;
        }
        if (!client.cards || client.cards.length === 0) {
            this.gameRulesModel.take(client);
            return;
        }
        let move = AIStrategy.getMove(client, this.gameRulesModel);
        if (move.action === 'place') {
            this.gameRulesModel.place(client, move.card);
        } else {
            this.gameRulesModel.take(client);
            if (client.getTakeOrLeave()) {
                let move2 = AIStrategy.getMove(client, this.gameRulesModel);
                if (move2.action === 'place') {
                    this.gameRulesModel.place(client, move2.card);
                } else {
                    this.gameRulesModel.take(client);
                }
            }
        }
    }
};
