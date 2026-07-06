
module.exports = class GameServiceRepository{
    constructor(){
        this.sevices = [];
    }
    insert(gameService){
        this.sevices.push(gameService);
        return gameService;
    }
    findAll(){
        return this.sevices;
    }
    findById(id){
        return this.sevices.find(function(elem){return elem.id === id;});
    }
    remove(id){
        this.sevices = this.sevices.filter(function(s){ return s.id !== id; });
    }
};