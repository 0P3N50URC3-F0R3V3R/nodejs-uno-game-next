let GameActionHandler = require('../GameActionHandler.js');
let UNOClient = require('./UNOClient.js');

/**
 * Used by GameService to handle user ready state action
 * @type {module.BeginActionHandler}
 */
module.exports = class BeginActionHandler extends GameActionHandler{
    constructor(gameService){
        super(gameService);
    }
    handleAction(data){
        let cr = this.getGameService().getClientRepository();
        let client = cr.findByName(data.client.name);
        if(client instanceof UNOClient && !client.isAI && !client.getReady()){
            client.setReady(true);
        }
        // Only require human players to be ready
        let humans = cr.findAll().filter(function(c){ return !c.isAI; });
        let allHumansReady = humans.length > 0 && !humans.find(function(c){ return !c.getReady(); });
        if(allHumansReady && cr.count() > 1){
            // Ensure AI are ready before dealing
            cr.findAll().filter(function(c){ return c.isAI; }).forEach(function(c){ c.setReady(true); });
            this.getGameService().getGameRulesModel().deal();
            this.getGameService()._justDealt = true;
        }
        return true;
    }
};