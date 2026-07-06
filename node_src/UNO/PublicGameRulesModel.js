let GameRulesModel = require('./GameRulesModel.js');
let UNOClient = require('./UNOClient.js');
let PublicCard = require('./PublicCard.js');
/**
 * Layer over GameRulesModel to serve data back to clients.
 * @type {module.PublicGameRulesModel}
 */
module.exports = class PublicGameRulesModel {
    constructor(client, gameRulesModel) {

        this.winner = false;
        this.ready = true;

        let hasWinner = gameRulesModel.clientRepository.findByHasWon(true);
        let nonReady = gameRulesModel.clientRepository.findByReady(false);

        if(hasWinner){
            this.winner = hasWinner.getName();
        }
        if(nonReady){        
            this.ready = false;
        }

        this.direction = gameRulesModel.getDirection();
        this.events = gameRulesModel.getEvents();
        this.roundsPlayed = gameRulesModel.getRoundsPlayed();
        this.maxRounds = gameRulesModel.getMaxRounds();
        this.seriesWinner = gameRulesModel.getSeriesWinner();
        let clientDeadline = gameRulesModel.unoDeadlines && gameRulesModel.unoDeadlines[client.getName()];
        this.unoRequired = clientDeadline ? client.getName() : null;
        this.unoTtl = clientDeadline ? Math.max(0, Math.round(clientDeadline - Date.now())) : null;
        this.unoEvent = gameRulesModel.pendingUnoEvent || null;
        this.stackPending = gameRulesModel.stackPending || null;
        this.pendingInteraction = gameRulesModel.pendingInteraction || null;
        this.nextgenMode = !!gameRulesModel.nextgenMode;
        this.ruleset = gameRulesModel.ruleset || 'original';
        this.hardcoreMode = !!gameRulesModel.hardcoreMode;
        // A Nextgen round with a hoarder elimination gets the same ranked
        // podium as a Battle Royale round, even though battleRoyale is off —
        // a round with zero eliminations still ends the classic way.
        this.brMode = !!gameRulesModel.battleRoyale
            || (Array.isArray(gameRulesModel.brEliminated) && gameRulesModel.brEliminated.length > 0);
        this.brEliminated = gameRulesModel.brEliminated ? gameRulesModel.brEliminated.slice() : [];

        this.cards = [];
        this.getPublicCards(client, gameRulesModel);
    }
    getPublicCards(client, gameRulesModel){     
        let cards = gameRulesModel.getCardRepository().findAll();
        for(let i=0; i<cards.length; i++){
            this.cards.push(new PublicCard(client, cards[i]));
        }       
    }
};