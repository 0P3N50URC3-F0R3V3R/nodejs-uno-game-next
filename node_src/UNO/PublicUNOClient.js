let UNOClient = require('./UNOClient.js');

/**
 * Layer over UNOClient to serve data back to clients.
 * @type {module.PublicUNOClient}
 */
module.exports = class PublicUNOClient {
    constructor(unoClient) {
        this.name = unoClient.getName();
        this.ready = unoClient.getReady();
        this.turn = unoClient.getTurn();
        this.cardsCount = unoClient.getCardsCount();
        this.hasWon = unoClient.getHasWon();
        this.score = unoClient.getScore();
        this.takeOrLeave = unoClient.getTakeOrLeave();
        this.isAI = unoClient.isAI || false;
        this.aiDifficulty = unoClient.aiDifficulty || null;
        this.disconnected = unoClient.disconnected || false;
        this.brEliminated = unoClient.brEliminated || false;
        this.brRank = unoClient.brRank || 0;
        this.brScore = unoClient.brScore || 0;
    }
};