let GameActionHandler = require('../GameActionHandler.js');
let UNOClient = require('./UNOClient.js');
let Message = require('../Message.js');

/**
 * Used by GameService to handle user login action
 * @type {module.LoginActionHandler}
 */
module.exports = class LoginActionHandler extends GameActionHandler {
    constructor(gameService){
        super(gameService);
    }
    handleAction(data){

        //TODO: Allow to create new clients only if game has not started yet.
        //  do not limit by number, only by maximum allowed clients [2-4]

        let cr = this.getGameService().getClientRepository();

        let existingClient = cr.findByName(data.client.name);

        // Reconnect: player with same name re-joining
        if(existingClient && existingClient.disconnected){
            existingClient.setSocketId(data.socketId);
            existingClient.disconnected = false;
            if(existingClient._disconnectTimer){
                clearTimeout(existingClient._disconnectTimer);
                existingClient._disconnectTimer = null;
            }
            return;
        }

        // Allow join if game not started or not full (max 5)
        let humans = cr.findAll().filter(function(c){ return !c.isAI; });
        if(cr.findByReady(false) || humans.length < 1 || cr.count() < 5){
            if(!existingClient){
                let cl = new UNOClient(data.client.name);
                cl.setSocketId(data.socketId);
                cr.insert(cl);
                // Auto-start if this human fills the last slot (all others are AI)
                let grm = this.getGameService().getGameRulesModel();
                let humansNow = cr.findAll().filter(function(c){ return !c.isAI; });
                if(!grm.isSeriesStarted() && cr.count() >= 5 && humansNow.length === 1 && humansNow[0] === cl){
                    cl.setReady(true);
                    grm.deal();
                    this.getGameService()._justDealt = true;
                }
            }
        }else{
            this.getGameService().getMessageRepository().insert(new Message('error', 'Game has already started', data.socketId));
        }
    }
};