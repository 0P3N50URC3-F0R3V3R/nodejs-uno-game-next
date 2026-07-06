let ClientRepository = require('./UNO/UNOClientRepository.js');
let Client = require('./Client.js');
let UNOClient = require('./UNO/UNOClient.js');
let GameRulesModel = require('./UNO/GameRulesModel.js');

const assert = require('assert');

module.exports = class UnitTest{
    constructor(){

        this.clientRepo();
        this.unoClient();
        this.gameRulesModel();
        this.seriesLogic();
        this.cardDefs();
        this.cardNumberParsing();
        this.nextgenDeckComposition();
        this.nextgenWildReset();
        this.nextgenPunishmentGeneralization();
        this.nextgen2xMiss();
        this.nextgenRotate();
        this.nextgenRainbow();
        this.nextgenPendingInteractionCore();
        this.nextgenTradeHands();
        this.nextgenTargetSteal();
        this.nextgenCancelAndDisconnectSafety();
        this.nextgenScoring();
        this.nextgenActionHandlers();
        this.nextgenPublicExposure();
        this.nextgenAIHeuristics();
        this.nextgenAITradeTargeting();
        this.nextgenHoarderElimination();

    }
    clientRepo(){

        let repo = new ClientRepository();
        
        repo.insert(new UNOClient("Janis"));
        repo.insert(new UNOClient("Rainis"));
        repo.insert(new UNOClient("Dace"));

        assert.strictEqual(repo.count(), 3);

        let cl = repo.get(0);
        assert.strictEqual(cl.getName(), "Janis");

        let cl2 = repo.findNext(cl);
        assert.strictEqual(cl2.getName(), "Rainis");

        let cl3 = repo.findPrevious(cl);
        assert.strictEqual(cl3.getName(), "Dace");
    }
    unoClient(){

        let repo = new ClientRepository();
        
        repo.insert(new UNOClient("Janis"));
        repo.insert(new UNOClient("Rainis"));
        repo.insert(new UNOClient("Dace"));

        let cl = repo.get(0);

        assert.strictEqual(cl.getTurn(), false);

        UNOClient.setArrayTurn(repo.findAll(), true);

        assert.strictEqual(cl.getTurn(), true);

    }
    gameRulesModel(){

        let repo = new ClientRepository();
        
        repo.insert(new UNOClient("Janis"));
        repo.insert(new UNOClient("Rainis"));
        repo.insert(new UNOClient("Dace"));

        let gm = new GameRulesModel(repo);

        gm.init();

        assert.strictEqual((gm.cardRepository.findAll().length > 0), true);
        assert.strictEqual((gm.drawDeck.length > 0), true);

        gm.deal();

        assert.strictEqual((gm.discardDeck.length > 0), true);

        let cl = repo.get(0);

        assert.strictEqual((cl.getCardsCount() == 7), true);
    }
    seriesLogic(){
        let repo = new ClientRepository();
        repo.insert(new UNOClient("Janis"));
        repo.insert(new UNOClient("Rainis"));
        let gm = new GameRulesModel(repo);

        assert.strictEqual(gm.isSeriesStarted(), false);
        assert.strictEqual(gm.getRoundsPlayed(), 0);
        assert.strictEqual(gm.getMaxRounds(), 5);
        assert.strictEqual(gm.getSeriesWinner(), null);

        gm.deal();
        assert.strictEqual(gm.isSeriesStarted(), true, 'deal() must set seriesStarted');

        // Test: clear leader after 5 rounds (Janis 3 wins, Rainis 2 wins)
        let repo2 = new ClientRepository();
        let j2 = new UNOClient("Janis");
        let r2 = new UNOClient("Rainis");
        repo2.insert(j2); repo2.insert(r2);
        let gm2 = new GameRulesModel(repo2);
        gm2.deal();

        j2.insertScore('-'); j2.insertScore('-'); j2.insertScore('-');
        r2.insertScore(20); r2.insertScore(15);
        j2.insertScore(10); r2.insertScore('-');
        j2.insertScore(5);  r2.insertScore('-');
        gm2.roundsPlayed = 5;
        gm2._checkSeriesEnd();
        assert.strictEqual(gm2.getSeriesWinner(), 'Janis', 'Janis should win series 3-2');
        assert.strictEqual(gm2.getMaxRounds(), 5, 'maxRounds unchanged when clear winner');

        // Test: tiebreaker — maxRounds extends when tied
        let repo3 = new ClientRepository();
        let j3 = new UNOClient("Janis");
        let r3 = new UNOClient("Rainis");
        repo3.insert(j3); repo3.insert(r3);
        let gm3 = new GameRulesModel(repo3);
        gm3.deal();

        j3.insertScore('-'); j3.insertScore(20); j3.insertScore('-');
        r3.insertScore(15); r3.insertScore('-'); r3.insertScore(10);
        gm3.roundsPlayed = 3; gm3.maxRounds = 3;
        j3.score = []; r3.score = [];
        j3.insertScore('-'); j3.insertScore(10);
        r3.insertScore(20); r3.insertScore('-');
        gm3.roundsPlayed = 2; gm3.maxRounds = 2;
        gm3._checkSeriesEnd();
        assert.strictEqual(gm3.getSeriesWinner(), null, 'tied series has no winner yet');
        assert.strictEqual(gm3.getMaxRounds(), 3, 'maxRounds incremented to 3 on tie');

        // Test: deal() with seriesWinner set resets series state
        let repo4 = new ClientRepository();
        let j4 = new UNOClient("Janis");
        let r4 = new UNOClient("Rainis");
        repo4.insert(j4); repo4.insert(r4);
        let gm4 = new GameRulesModel(repo4);
        gm4.deal();

        // Simulate series end
        gm4.seriesWinner = 'Janis';
        gm4.roundsPlayed = 5;
        gm4.maxRounds = 5;
        j4.insertScore('-'); j4.insertScore('-'); j4.insertScore('-');
        r4.insertScore(20); r4.insertScore(10);

        // New game triggered
        gm4.deal();
        assert.strictEqual(gm4.getSeriesWinner(), null, 'seriesWinner reset after new series');
        assert.strictEqual(gm4.getRoundsPlayed(), 0, 'roundsPlayed reset');
        assert.strictEqual(gm4.getMaxRounds(), 5, 'maxRounds reset to 5');
        assert.strictEqual(j4.getScore().length, 0, 'scores cleared for Janis');
        assert.strictEqual(r4.getScore().length, 0, 'scores cleared for Rainis');
    }
    cardDefs(){
        let CardDefs = require('./UNO/CardDefs.js');

        assert.strictEqual(CardDefs.p6.punishAmount, 6);
        assert.strictEqual(CardDefs.p6.isWild, false);
        assert.strictEqual(CardDefs.p6.scoreValue, 20);

        assert.strictEqual(CardDefs.p10.punishAmount, 10);
        assert.strictEqual(CardDefs.p10.isWild, true);
        assert.strictEqual(CardDefs.p10.scoreValue, 50);

        assert.strictEqual(CardDefs.m2.skipCount, 2);
        assert.strictEqual(CardDefs.th.requiresTarget, 'trade');
        assert.strictEqual(CardDefs.rda.redrawAll, true);
        assert.strictEqual(CardDefs.tg1.requiresTarget, 'steal1');
        assert.strictEqual(CardDefs.tg1.stealCount, 1);
        assert.strictEqual(CardDefs.tg1.targetMin, 2);
        assert.strictEqual(CardDefs.tg2.requiresTarget, 'steal2');
        assert.strictEqual(CardDefs.tg2.stealCount, 2);
        assert.strictEqual(CardDefs.tg2.targetMin, 3);
        assert.strictEqual(CardDefs.rot.rotateAll, true);
        assert.strictEqual(CardDefs.rbw.colorless, true);

        assert.strictEqual(CardDefs.p, undefined, 'CardDefs must not define classic codes');
        assert.strictEqual(CardDefs.g, undefined, 'CardDefs must not define classic codes');
    }
    cardNumberParsing(){
        let Card = require('./UNO/Card.js');

        let classic = new Card(1, 'rp');
        assert.strictEqual(classic.getNumber(), 'p', 'classic 1-char codes must still parse correctly');
        assert.strictEqual(classic.getColor(), 'r');

        let nextgen = new Card(2, 'rp6');
        assert.strictEqual(nextgen.getNumber(), 'p6', 'multi-char codes must parse in full');
        assert.strictEqual(nextgen.getColor(), 'r');

        let wild = new Card(3, 'ktg1');
        assert.strictEqual(wild.getNumber(), 'tg1');
        assert.strictEqual(wild.getColor(), 'k');
    }
    nextgenDeckComposition(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');

        let repo = new ClientRepository();
        repo.insert(new UNOClient("Janis"));
        repo.insert(new UNOClient("Rainis"));

        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        assert.strictEqual(gm.nextgenMode, true);
        assert.strictEqual(gm.drawDeck.length, 158, 'nextgen deck must be 158 cards (2x classic + 46 extra)');

        let extra = gm._buildNextgenExtraTypes();
        assert.strictEqual(extra.length, 46, 'nextgen adds exactly 46 new cards');
        assert.strictEqual(extra.filter(t => t === 'rp6').length, 2);
        assert.strictEqual(extra.filter(t => t.slice(1) === 'p6').length, 8, '+6 is 2 per color = 8');
        assert.strictEqual(extra.filter(t => t.slice(1) === 'p8').length, 8, '+8 is 2 per color = 8');
        assert.strictEqual(extra.filter(t => t.slice(1) === 'p12').length, 0, '+12 was removed');
        assert.strictEqual(extra.filter(t => t === 'kp10').length, 2);
        assert.strictEqual(extra.filter(t => t === 'ktg1').length, 4);
        assert.strictEqual(extra.filter(t => t === 'krot').length, 2, 'rot reduced to 2 copies');
        assert.strictEqual(extra.filter(t => t === 'krbw').length, 4);

        let gmClassic = new GameRulesModel(repo, 5, 'original', false, {});
        assert.strictEqual(gmClassic.nextgenMode, false);
        assert.strictEqual(gmClassic.drawDeck.length, 56, 'classic deck size unaffected');
    }
    nextgenWildReset(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');

        let repo = new ClientRepository();
        repo.insert(new UNOClient("Janis"));
        repo.insert(new UNOClient("Rainis"));
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();

        // Simulate a colored wild sitting in the discard pile, about to be reshuffled back
        let playedWild = new Card(9001, 'rtg1');
        gm.discardDeck.push(playedWild); // will become the "returned" card, topCard stays separate
        let topCard = new Card(9002, 'b3');
        gm.discardDeck.push(topCard);

        gm.reShuffleDeck();

        let resetCard = gm.drawDeck.find(c => c.getId() === 9001);
        assert.ok(resetCard, 'card must be back in the draw pile');
        assert.strictEqual(resetCard.getType(), 'ktg1', 'nextgen wild must reset to neutral k-prefixed form');
    }
    nextgenPunishmentGeneralization(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');

        // Immediate mode: +6 draws 6 and skips
        let repo = new ClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B"); let c = new UNOClient("C");
        repo.insert(a); repo.insert(b); repo.insert(c);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        a.setTurn(true); b.setTurn(false); c.setTurn(false);
        let before = b.getCardsCount();
        let p6 = new Card(9101, 'rp6');
        gm.cardRepository.insert(p6);
        gm.placeCard(p6);
        gm.finishTurn(a, p6);
        assert.strictEqual(b.getCardsCount(), before + 6, '+6 must make next player draw 6');
        assert.strictEqual(c.getTurn(), true, 'drawer must be skipped, turn passes to the one after');

        // Stacking mode: +6 then +8 accumulate to 14, cap not yet hit
        let repo2 = new ClientRepository();
        let a2 = new UNOClient("A"); let b2 = new UNOClient("B");
        repo2.insert(a2); repo2.insert(b2);
        let gm2 = new GameRulesModel(repo2, 5, 'stacking', false, { nextgenMode: true });
        gm2.deal();
        a2.setTurn(true);
        let p6b = new Card(9102, 'rp6');
        gm2.cardRepository.insert(p6b);
        gm2.placeCard(p6b);
        gm2.finishTurn(a2, p6b);
        assert.strictEqual(gm2.stackPending.count, 6);
        assert.strictEqual(b2.getTurn(), true, 'stacking must NOT skip — victim must respond');

        let p8 = new Card(9103, 'gp8');
        gm2.cardRepository.insert(p8);
        gm2.placeCard(p8);
        gm2.finishTurn(b2, p8);
        assert.strictEqual(gm2.stackPending.count, 14, '6 + 8 = 14');

        // Cap: cardCanBePlaced must refuse further punishment once count >= 20
        gm2.stackPending.count = 18;
        let p8c = new Card(9104, 'yp8');
        gm2.cardRepository.insert(p8c);
        assert.strictEqual(gm2.cardCanBePlaced(p8c), true, 'still under cap, stacking allowed');
        gm2.stackPending.count = 20;
        assert.strictEqual(gm2.cardCanBePlaced(p8c), false, 'cap reached, no further stacking allowed');
    }
    nextgen2xMiss(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');

        // 3 players: A plays m2, B and C are skipped, turn returns to A? No — skip 2 from A lands on A itself
        // only if there are exactly 2 OTHER players; with 3 total players (A,B,C), skipping B and C lands back on A.
        let repo = new ClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B"); let c = new UNOClient("C");
        repo.insert(a); repo.insert(b); repo.insert(c);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        a.setTurn(true);
        let m2 = new Card(9201, 'rm2');
        gm.cardRepository.insert(m2);
        gm.placeCard(m2);
        gm.finishTurn(a, m2);
        assert.strictEqual(a.getTurn(), true, 'in a 3-player game, skipping 2 wraps back to the player who played it');

        // Exactly 2 players: must cap to a single skip. This wraps back to the
        // player who played it, same as this codebase's existing classic Skip
        // card already does in 2-player games (opponent's turn is skipped, so
        // it becomes the player's turn again) — not a "no wraparound" behavior.
        let repo2 = new ClientRepository();
        let a2 = new UNOClient("A"); let b2 = new UNOClient("B");
        repo2.insert(a2); repo2.insert(b2);
        let gm2 = new GameRulesModel(repo2, 5, 'original', false, { nextgenMode: true });
        gm2.deal();
        a2.setTurn(true);
        let m2b = new Card(9202, 'rm2');
        gm2.cardRepository.insert(m2b);
        gm2.placeCard(m2b);
        gm2.finishTurn(a2, m2b);
        assert.strictEqual(a2.getTurn(), true, '2-player game: 2x Miss caps to a single skip, wrapping back to the player who played it (matches classic Skip\'s existing 2-player behavior)');
    }
    nextgenRotate(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');

        let repo = new ClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B"); let c = new UNOClient("C");
        repo.insert(a); repo.insert(b); repo.insert(c);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();

        let aHandIds = a.getCards().map(c2 => c2.getId());
        let bHandIds = b.getCards().map(c2 => c2.getId());
        let cHandIds = c.getCards().map(c2 => c2.getId());

        a.setTurn(true);
        let rot = new Card(9301, 'krot');
        gm.cardRepository.insert(rot);
        gm.placeCard(rot);
        gm.finishTurn(a, rot);

        assert.deepStrictEqual(b.getCards().map(c2 => c2.getId()).sort(), aHandIds.sort(), 'B must now hold A\'s original hand');
        assert.deepStrictEqual(c.getCards().map(c2 => c2.getId()).sort(), bHandIds.sort(), 'C must now hold B\'s original hand');
        assert.deepStrictEqual(a.getCards().map(c2 => c2.getId()).sort(), cHandIds.sort(), 'A must now hold C\'s original hand');
        assert.strictEqual(b.getCards()[0].getOwner(), 'B', 'moved cards must have their owner field updated');
    }
    nextgenRainbow(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');

        let repo = new ClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B");
        repo.insert(a); repo.insert(b);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        a.setTurn(true);

        let rbw = new Card(9401, 'krbw');
        gm.cardRepository.insert(rbw);
        gm.placeCard(rbw);
        gm.finishTurn(a, rbw);
        assert.strictEqual(gm.colorless, true, 'Rainbow must set the colorless flag');

        // B can now play ANYTHING regardless of color/number
        let anyCard = new Card(9402, 'y7');
        assert.strictEqual(gm.cardCanBePlaced(anyCard), true, 'colorless flag must allow any card');

        // Route through the real place() API (not a direct placeCard/finishTurn call) —
        // the one-shot consumption logic lives in place(), so the test must exercise it.
        gm.cardRepository.insert(anyCard);
        b.addCard(anyCard);
        gm.place(b, { id: anyCard.getId(), type: anyCard.getType() });
        assert.strictEqual(gm.colorless, false, 'colorless flag must be consumed after the next placement');
        assert.strictEqual(a.getTurn(), true, 'turn passes back to A after B\'s ordinary placement');

        // Chaining: the free-play card itself can be another Rainbow. The flag must
        // re-set to true for the following player, not get stuck false.
        let rbw2 = new Card(9403, 'krbw');
        gm.cardRepository.insert(rbw2);
        a.addCard(rbw2);
        gm.place(a, { id: rbw2.getId(), type: rbw2.getType() });
        assert.strictEqual(gm.colorless, true, 'chained Rainbow must re-set the colorless flag for the next player');

        let anyCard2 = new Card(9404, 'g3');
        assert.strictEqual(gm.cardCanBePlaced(anyCard2), true, 'chained colorless flag must still allow any card');
        gm.cardRepository.insert(anyCard2);
        b.addCard(anyCard2);
        gm.place(b, { id: anyCard2.getId(), type: anyCard2.getType() });
        assert.strictEqual(gm.colorless, false, 'chained Rainbow free play must also be consumed exactly once');
    }
    nextgenPendingInteractionCore(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');

        let repo = new ClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B");
        repo.insert(a); repo.insert(b);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        a.setTurn(true);

        // Force colorless so cardCanBePlaced() doesn't depend on deal()'s random top card —
        // this test targets pendingInteraction gating, not color-matching legality.
        gm.colorless = true;

        let th = new Card(9501, 'rth');
        a.addCard(th);
        gm.cardRepository.insert(th);
        gm.place(a, { id: 9501, type: 'rth' });

        assert.ok(gm.pendingInteraction, 'place() must open a pendingInteraction for requiresTarget cards');
        assert.strictEqual(gm.pendingInteraction.kind, 'trade');
        assert.strictEqual(gm.pendingInteraction.from, 'A');
        assert.strictEqual(gm.pendingInteraction.awaiting, 'target');
        assert.strictEqual(a.getTurn(), true, 'initiator keeps the turn while interaction is open');

        // place() and take() must no-op while an interaction is open
        let dummy = new Card(9502, 'y3');
        a.addCard(dummy);
        gm.cardRepository.insert(dummy);
        gm.place(a, { id: 9502, type: 'y3' });
        assert.strictEqual(a.getCards().indexOf(dummy) !== -1, true, 'place() must refuse while pendingInteraction is open');

        gm.take(a);
        assert.strictEqual(gm.pendingInteraction.awaiting, 'target', 'take() must refuse while pendingInteraction is open');

        gm.validateNextMove();
        let anyValid = gm.cardRepository.findAll().some(c => c.getNextMoveValid());
        assert.strictEqual(anyValid, false, 'no card should be marked playable while pendingInteraction is open');
    }
    nextgenTradeHands(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');

        let repo = new ClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B"); let c = new UNOClient("C");
        repo.insert(a); repo.insert(b); repo.insert(c);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        a.setTurn(true);
        // th is a colored (non-wild) card — deal()'s randomly-shuffled discard top
        // would make color/number matching flaky here, so bypass matching entirely
        // (same mechanism nextgenRainbow already relies on) to isolate this test's
        // actual concern: pendingInteraction resolution, not color-matching legality.
        gm.colorless = true;

        let aHandBefore = a.getCards().slice();
        let bHandBefore = b.getCards().slice();

        let th = new Card(9601, 'rth');
        a.addCard(th);
        gm.cardRepository.insert(th);
        gm.place(a, { id: 9601, type: 'rth' });

        // Invalid target (self) must be rejected
        gm.selectTarget(a, 'A');
        assert.strictEqual(gm.pendingInteraction.awaiting, 'target', 'cannot target self');

        gm.selectTarget(a, 'B');
        assert.strictEqual(gm.pendingInteraction.targetName, 'B');
        assert.strictEqual(gm.pendingInteraction.awaiting, 'confirm');

        gm.confirmTrade(a, true);
        assert.strictEqual(gm.pendingInteraction, null, 'interaction must clear after confirm');
        // Trade Hands has no skip semantics ("turn proceeds normally" per the design spec) —
        // getNextClient(a) is the immediate next seat (B), not C. Verified deterministic
        // (not a discard-pile-color-style flake): 5/5 repeated runs land on B, 0/5 on C,
        // because finishTurn's no-card branch always resets the whole array via
        // setArrayTurn(false) before setting exactly one client (the immediate next) true.
        assert.strictEqual(b.getTurn(), true, 'turn must pass to the next player after resolution (no skip for Trade Hands)');

        let aIds = a.getCards().filter(c2 => c2.getId() !== 9601).map(c2 => c2.getId()).sort();
        let bIdsBefore = bHandBefore.map(c2 => c2.getId()).sort();
        assert.deepStrictEqual(aIds, bIdsBefore, 'A must now hold B\'s original hand');

        // Brief's test stops here, checking only one direction. Swap must be
        // bidirectional (B must hold A's original hand too) and update owner on both sides.
        let bIds = b.getCards().map(c2 => c2.getId()).sort();
        let aIdsBefore = aHandBefore.map(c2 => c2.getId()).sort();
        assert.deepStrictEqual(bIds, aIdsBefore, 'B must now hold A\'s original hand (bidirectional swap)');
        assert.strictEqual(a.getCards()[0].getOwner(), 'A', 'cards swapped into A must have owner updated to A');
        assert.strictEqual(b.getCards()[0].getOwner(), 'B', 'cards swapped into B must have owner updated to B');

        // Decline path: card stays played, no swap
        let repo2 = new ClientRepository();
        let a2 = new UNOClient("A"); let b2 = new UNOClient("B"); let c2 = new UNOClient("C");
        repo2.insert(a2); repo2.insert(b2); repo2.insert(c2);
        let gm2 = new GameRulesModel(repo2, 5, 'original', false, { nextgenMode: true });
        gm2.deal();
        a2.setTurn(true);
        gm2.colorless = true; // see note above — isolates this from discard-pile color luck
        let a2HandBefore = a2.getCards().slice();
        let b2HandBefore = b2.getCards().slice();
        let th2 = new Card(9602, 'rth');
        a2.addCard(th2);
        gm2.cardRepository.insert(th2);
        gm2.place(a2, { id: 9602, type: 'rth' });
        gm2.selectTarget(a2, 'B');
        gm2.confirmTrade(a2, false);
        assert.strictEqual(gm2.pendingInteraction, null);
        assert.strictEqual(b2.getTurn(), true, 'turn must also pass to the next player on decline (no skip either way)');
        let a2IdsAfter = a2.getCards().map(c3 => c3.getId()).sort();
        let a2IdsBefore = a2HandBefore.filter(c3 => c3.getId() !== 9602).map(c3 => c3.getId()).sort();
        assert.deepStrictEqual(a2IdsAfter, a2IdsBefore, 'declined trade must leave A\'s hand unchanged (minus the played card)');
        let b2IdsAfter = b2.getCards().map(c3 => c3.getId()).sort();
        let b2IdsBefore = b2HandBefore.map(c3 => c3.getId()).sort();
        assert.deepStrictEqual(b2IdsAfter, b2IdsBefore, 'declined trade must leave B\'s hand unchanged too');
    }
    nextgenTargetSteal(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');

        let repo = new ClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B"); let c = new UNOClient("C");
        repo.insert(a); repo.insert(b); repo.insert(c);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        a.setTurn(true);

        let tg2 = new Card(9701, 'ktg2');
        a.addCard(tg2);
        gm.cardRepository.insert(tg2);
        gm.place(a, { id: 9701, type: 'rtg2' });

        assert.strictEqual(gm.pendingInteraction.kind, 'steal2');
        assert.strictEqual(gm.pendingInteraction.targetMin, 3);

        gm.selectTarget(a, 'B');
        assert.strictEqual(gm.pendingInteraction.awaiting, 'steal', 'steal cards must move to the steal stage, not confirm');

        let bIds = b.getCards().map(c2 => c2.getId());
        let stolen = bIds.slice(0, 2);
        let aCountBefore = a.getCardsCount();

        gm.stealCards(a, stolen);
        assert.strictEqual(gm.pendingInteraction, null);
        assert.strictEqual(a.getCardsCount(), aCountBefore + 2, 'A must gain exactly 2 stolen cards');
        assert.strictEqual(b.getCards().find(c2 => c2.getId() === stolen[0]), undefined, 'stolen card must leave B\'s hand');
        assert.strictEqual(a.getCards().find(c2 => c2.getId() === stolen[0]).getOwner(), 'A', 'stolen card owner must update');

        // Wrong count must be rejected
        let repo2 = new ClientRepository();
        let a2 = new UNOClient("A"); let b2 = new UNOClient("B"); let c2 = new UNOClient("C");
        repo2.insert(a2); repo2.insert(b2); repo2.insert(c2);
        let gm2 = new GameRulesModel(repo2, 5, 'original', false, { nextgenMode: true });
        gm2.deal();
        a2.setTurn(true);
        let tg1 = new Card(9702, 'ktg1');
        a2.addCard(tg1);
        gm2.cardRepository.insert(tg1);
        gm2.place(a2, { id: 9702, type: 'rtg1' });
        gm2.selectTarget(a2, 'B');
        let wrongCount = b2.getCards().map(c3 => c3.getId()).slice(0, 2);
        gm2.stealCards(a2, wrongCount);
        assert.strictEqual(gm2.pendingInteraction.awaiting, 'steal', 'wrong card count must be rejected, interaction stays open');
    }
    nextgenCancelAndDisconnectSafety(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');
        let UNOGameService = require('./UNO/UNOGameService.js');

        // cancelPendingInteraction: not-mandatory cards can always bail out
        let repo = new ClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B"); let c = new UNOClient("C");
        repo.insert(a); repo.insert(b); repo.insert(c);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        a.setTurn(true);
        // th is colored (non-wild) — bypass color/number matching so placement is
        // deterministic regardless of deal()'s randomly-shuffled discard top (same
        // mechanism nextgenTradeHands/nextgenRainbow rely on).
        gm.colorless = true;
        let th = new Card(9801, 'rth');
        a.addCard(th);
        gm.cardRepository.insert(th);
        gm.place(a, { id: 9801, type: 'rth' });
        gm.cancelPendingInteraction(a);
        assert.strictEqual(gm.pendingInteraction, null);
        // finishTurn's no-card branch passes to the immediate next seat (B), not a skip
        // to C — consistent with confirmTrade/stealCards resolution (see nextgenTradeHands).
        assert.strictEqual(b.getTurn(), true, 'cancel must still advance the turn to the next player');

        // Disconnect safety: initiator leaving mid-interaction must not softlock the game
        let svc = new UNOGameService('room1', { aiCount: 0 });
        let cr = svc.getClientRepository();
        let x = new UNOClient("X"); x.socketId = 's1';
        let y = new UNOClient("Y"); y.socketId = 's2';
        let z = new UNOClient("Z"); z.socketId = 's3';
        cr.insert(x); cr.insert(y); cr.insert(z);
        svc.getGameRulesModel().nextgenMode = true;
        svc.getGameRulesModel().deal();
        svc.getGameRulesModel().colorless = true;
        x.setTurn(true);
        let thCard = new Card(9802, 'rth');
        x.addCard(thCard);
        svc.getGameRulesModel().cardRepository.insert(thCard);
        svc.getGameRulesModel().place(x, { id: 9802, type: 'rth' });
        assert.ok(svc.getGameRulesModel().pendingInteraction, 'interaction must be open before disconnect');

        svc.removePlayer('s1');
        assert.strictEqual(svc.getGameRulesModel().pendingInteraction, null, 'removing the initiator must clear the dangling interaction');

        // Disconnect safety: the TARGET leaving mid-interaction must also clear it,
        // even though the initiator is still connected and would otherwise be stuck
        // waiting on a confirm/steal choice from someone who no longer exists.
        let svc2 = new UNOGameService('room2', { aiCount: 0 });
        let cr2 = svc2.getClientRepository();
        let x2 = new UNOClient("X"); x2.socketId = 't1';
        let y2 = new UNOClient("Y"); y2.socketId = 't2';
        let z2 = new UNOClient("Z"); z2.socketId = 't3';
        cr2.insert(x2); cr2.insert(y2); cr2.insert(z2);
        let grm2 = svc2.getGameRulesModel();
        grm2.nextgenMode = true;
        grm2.deal();
        grm2.colorless = true;
        UNOClient.setArrayTurn(cr2.findAll(), false);
        x2.setTurn(true);
        let thCard2 = new Card(9803, 'rth');
        x2.addCard(thCard2);
        grm2.cardRepository.insert(thCard2);
        grm2.place(x2, { id: 9803, type: 'rth' });
        grm2.selectTarget(x2, 'Y');
        assert.strictEqual(grm2.pendingInteraction.awaiting, 'confirm', 'interaction must be awaiting confirm before target disconnects');

        svc2.removePlayer('t2');
        assert.strictEqual(grm2.pendingInteraction, null, 'removing the target must clear the dangling interaction too');
        assert.strictEqual(x2.getTurn(), true, 'initiator (non-turn-holding target left) must keep the turn, not be stripped of it');

        // cancelPendingInteraction must reject a caller who isn't the interaction's initiator
        let repo3 = new ClientRepository();
        let a3 = new UNOClient("A"); let b3 = new UNOClient("B"); let c3 = new UNOClient("C");
        repo3.insert(a3); repo3.insert(b3); repo3.insert(c3);
        let gm3 = new GameRulesModel(repo3, 5, 'original', false, { nextgenMode: true });
        gm3.deal();
        gm3.colorless = true;
        UNOClient.setArrayTurn(repo3.findAll(), false);
        a3.setTurn(true);
        let th3 = new Card(9804, 'rth');
        a3.addCard(th3);
        gm3.cardRepository.insert(th3);
        gm3.place(a3, { id: 9804, type: 'rth' });
        gm3.cancelPendingInteraction(c3);
        assert.ok(gm3.pendingInteraction, 'a non-initiator cancel attempt must be rejected, interaction stays open');
        assert.strictEqual(gm3.pendingInteraction.from, 'A');
        assert.strictEqual(a3.getTurn(), true, 'rejected cancel must not affect the turn');
    }
    nextgenScoring(){
        let UNOClient = require('./UNO/UNOClient.js');
        let Card = require('./UNO/Card.js');

        let c = new UNOClient("Test");
        c.addCard(new Card(1, 'rp6'));
        c.addCard(new Card(2, 'kp10'));
        c.addCard(new Card(3, 'y3'));
        c.addCard(new Card(4, 'kg'));

        assert.strictEqual(c.calculateScore(), 20 + 50 + 3 + 50, 'nextgen cards must score 20 (colored) / 50 (wild) alongside classic scoring');
    }
    nextgenActionHandlers(){
        let UNOGameService = require('./UNO/UNOGameService.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let Card = require('./UNO/Card.js');

        let svc = new UNOGameService('room2', { aiCount: 0 });
        assert.ok(svc.actionHandlers.selectTarget, 'selectTarget handler must be registered');
        assert.ok(svc.actionHandlers.confirmTrade, 'confirmTrade handler must be registered');
        assert.ok(svc.actionHandlers.stealCards, 'stealCards handler must be registered');
        assert.ok(svc.actionHandlers.cancelPending, 'cancelPending handler must be registered');

        let cr = svc.getClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B"); let c = new UNOClient("C");
        cr.insert(a); cr.insert(b); cr.insert(c);
        svc.getGameRulesModel().nextgenMode = true;
        svc.getGameRulesModel().deal();
        a.setTurn(true);
        // Force colorless so cardCanBePlaced() doesn't depend on deal()'s random top card —
        // this test targets action-handler wiring, not color-matching legality (see
        // nextgenPendingInteractionCore/nextgenTradeHands for the same convention).
        svc.getGameRulesModel().colorless = true;
        let th = new Card(9901, 'rth');
        a.addCard(th);
        svc.getGameRulesModel().cardRepository.insert(th);
        svc.getGameRulesModel().place(a, { id: 9901, type: 'rth' });

        svc.actionHandlers.selectTarget.handleAction({ client: { name: 'A' }, targetName: 'B' });
        assert.strictEqual(svc.getGameRulesModel().pendingInteraction.awaiting, 'confirm');

        svc.actionHandlers.confirmTrade.handleAction({ client: { name: 'A' }, confirm: false });
        assert.strictEqual(svc.getGameRulesModel().pendingInteraction, null);
    }
    nextgenPublicExposure(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let PublicGameRulesModel = require('./UNO/PublicGameRulesModel.js');
        let Card = require('./UNO/Card.js');

        let repo = new ClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B");
        repo.insert(a); repo.insert(b);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        a.setTurn(true);
        // th is a colored (non-wild) card — bypass color-matching so this test
        // isn't flaky against deal()'s randomly-shuffled discard top.
        gm.colorless = true;
        let th = new Card(10001, 'rth');
        a.addCard(th);
        gm.cardRepository.insert(th);
        gm.place(a, { id: 10001, type: 'rth' });

        let pub = new PublicGameRulesModel(a, gm);
        assert.strictEqual(pub.nextgenMode, true);
        assert.ok(pub.pendingInteraction, 'pendingInteraction must be exposed to clients');
        assert.strictEqual(pub.pendingInteraction.kind, 'trade');
    }
    nextgenAIHeuristics(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');
        let AIStrategy = require('./UNO/AIStrategy.js');

        // Wild color-pick generalization: new wild codes must get a color, Rainbow must not
        let repo = new ClientRepository();
        let ai = new UNOClient("AI"); ai.isAI = true; ai.aiDifficulty = 'hard';
        repo.insert(ai);
        ai.addCard(new Card(1, 'y5'));
        let wildCard = new Card(2, 'ktg1');
        let built = AIStrategy._buildCardData(wildCard, ai, 'hard');
        assert.strictEqual(built.type.length, 4, 'new wild codes must receive a real color prefix');
        assert.notStrictEqual(built.type.charAt(0), 'k', 'color must be resolved, not left neutral');

        let rainbowCard = new Card(3, 'krbw');
        let builtRbw = AIStrategy._buildCardData(rainbowCard, ai, 'hard');
        assert.strictEqual(builtRbw.type, 'krbw', 'Rainbow must never receive a color');

        // pendingInteraction resolution (steal): AI must target the player with the most cards
        let repo2 = new ClientRepository();
        let a = new UNOClient("A"); a.isAI = true; a.aiDifficulty = 'hard';
        let b = new UNOClient("B");
        let c = new UNOClient("C");
        repo2.insert(a); repo2.insert(b); repo2.insert(c);
        let gm = new GameRulesModel(repo2, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        while(b.getCardsCount() < 8){ gm.takeCard(b); } // make B the biggest hand
        a.setTurn(true);
        // tg1 is wild — always placeable regardless of the discard top, so no
        // need to bypass color-matching here.
        let tg1 = new Card(10101, 'ktg1');
        a.addCard(tg1);
        gm.cardRepository.insert(tg1);
        gm.place(a, { id: 10101, type: 'rtg1' });

        let move = AIStrategy.getMove(a, gm);
        assert.strictEqual(move.action, 'selectTarget');
        assert.strictEqual(move.targetName, 'B', 'AI must target the player with the most cards for a steal');
    }
    nextgenAITradeTargeting(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');
        let AIStrategy = require('./UNO/AIStrategy.js');

        // Trade Hands targeting: AI must pick the SMALLEST eligible hand, not the
        // biggest, since the confirm stage only accepts trades that shrink its own
        // hand — targeting the biggest hand would make the AI decline its own trade.
        let repo = new ClientRepository();
        let a = new UNOClient("A"); a.isAI = true; a.aiDifficulty = 'hard';
        let b = new UNOClient("B");
        let c = new UNOClient("C");
        repo.insert(a); repo.insert(b); repo.insert(c);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        a.setTurn(true);
        // th is a colored (non-wild) card — bypass color-matching so this test
        // isn't flaky against deal()'s randomly-shuffled discard top.
        gm.colorless = true;

        while(b.getCardsCount() > 3){ b.removeCard(b.getCards()[0]); } // B: smallest hand
        while(c.getCardsCount() < 9){ gm.takeCard(c); } // C: biggest hand

        let th = new Card(20101, 'rth');
        a.addCard(th);
        gm.cardRepository.insert(th);
        gm.place(a, { id: 20101, type: 'rth' });

        let move = AIStrategy.getMove(a, gm);
        assert.strictEqual(move.action, 'selectTarget');
        assert.strictEqual(move.targetName, 'B', 'AI must target the SMALLEST hand for a trade, not the biggest');

        // No eligible opponent has a hand smaller than the AI's own -> cancel
        // instead of opening a trade it already knows it will decline.
        let repo2 = new ClientRepository();
        let a2 = new UNOClient("A"); a2.isAI = true; a2.aiDifficulty = 'hard';
        let b2 = new UNOClient("B");
        let c2 = new UNOClient("C");
        repo2.insert(a2); repo2.insert(b2); repo2.insert(c2);
        let gm2 = new GameRulesModel(repo2, 5, 'original', false, { nextgenMode: true });
        gm2.deal();
        a2.setTurn(true);
        gm2.colorless = true;

        while(b2.getCardsCount() < 9){ gm2.takeCard(b2); }
        while(c2.getCardsCount() < 9){ gm2.takeCard(c2); }

        let th2 = new Card(20102, 'rth');
        a2.addCard(th2);
        gm2.cardRepository.insert(th2);
        gm2.place(a2, { id: 20102, type: 'rth' });

        let move2 = AIStrategy.getMove(a2, gm2);
        assert.strictEqual(move2.action, 'cancelPending', 'AI must cancel a trade it would only decline anyway');
    }
    nextgenHoarderElimination(){
        let ClientRepository = require('./UNO/UNOClientRepository.js');
        let UNOClient = require('./UNO/UNOClient.js');
        let GameRulesModel = require('./UNO/GameRulesModel.js');
        let Card = require('./UNO/Card.js');

        // Non-BR nextgen game: a victim (not the current turn-holder) crosses
        // 30 cards and must be eliminated without stealing the turn from
        // whoever legitimately holds it.
        let repo = new ClientRepository();
        let a = new UNOClient("A"); let b = new UNOClient("B"); let c = new UNOClient("C");
        repo.insert(a); repo.insert(b); repo.insert(c);
        let gm = new GameRulesModel(repo, 5, 'original', false, { nextgenMode: true });
        gm.deal();
        c.setTurn(true); a.setTurn(false); b.setTurn(false);
        while(b.getCardsCount() < 40){ gm.takeCard(b); }

        gm.validateNextMove();
        assert.strictEqual(b.brEliminated, true, 'hoarder must be eliminated at 30 cards');
        assert.ok(b.brRank > 0, 'hoarder must receive a rank');
        assert.strictEqual(c.getTurn(), true, 'turn must NOT be stolen from the legitimate turn-holder');
        let record = gm.brEliminated.find(r => r.name === 'B');
        assert.ok(record, 'elimination record must exist');
        assert.strictEqual(record.reason, 'hoarder', 'elimination reason must be tagged hoarder, not br');

        // Eliminated players must be skipped by turn order and hand-size counts.
        assert.strictEqual(gm._activePlayerCount(), 2, 'eliminated hoarder must not count as active');
        let next = gm.getNextClient(a);
        assert.notStrictEqual(next.getName(), 'B', 'getNextClient must skip the eliminated hoarder');

        // A hoarder who reaches 30 while THEY hold the turn must correctly hand
        // the turn off to the next active player.
        let repo2 = new ClientRepository();
        let a2 = new UNOClient("A"); let b2 = new UNOClient("B"); let c2 = new UNOClient("C");
        repo2.insert(a2); repo2.insert(b2); repo2.insert(c2);
        let gm2 = new GameRulesModel(repo2, 5, 'original', false, { nextgenMode: true });
        gm2.deal();
        b2.setTurn(true); a2.setTurn(false); c2.setTurn(false);
        while(b2.getCardsCount() < 40){ gm2.takeCard(b2); }
        gm2.validateNextMove();
        assert.strictEqual(b2.brEliminated, true);
        assert.strictEqual(b2.getTurn(), false, 'eliminated hoarder must lose the turn');
        assert.strictEqual(c2.getTurn(), true, 'turn must pass to the next active player after the hoarder');

        // Exactly 2 players: the hoarder's elimination immediately ends the round,
        // and the survivor is marked as having won.
        let repo3 = new ClientRepository();
        let a3 = new UNOClient("A"); let b3 = new UNOClient("B");
        repo3.insert(a3); repo3.insert(b3);
        let gm3 = new GameRulesModel(repo3, 5, 'original', false, { nextgenMode: true });
        gm3.deal();
        a3.setTurn(true);
        while(b3.getCardsCount() < 40){ gm3.takeCard(b3); }
        gm3.validateNextMove();
        assert.strictEqual(b3.brEliminated, true);
        assert.strictEqual(a3.brEliminated, true, 'the sole survivor must also be marked eliminated (ranked #1)');
        assert.strictEqual(a3.hasWon, true, 'the survivor must be marked as the round winner');

        // Classic (non-nextgen) games must never trigger hoarder elimination,
        // even if a hand somehow grew huge.
        let repo4 = new ClientRepository();
        let a4 = new UNOClient("A"); let b4 = new UNOClient("B");
        repo4.insert(a4); repo4.insert(b4);
        let gm4 = new GameRulesModel(repo4, 5, 'original', false, {});
        gm4.deal();
        a4.setTurn(true);
        while(b4.getCardsCount() < 40){ gm4.takeCard(b4); }
        gm4.validateNextMove();
        assert.strictEqual(b4.brEliminated, false, 'classic (non-nextgen) games must never eliminate a hoarder');

        // selectTarget must reject an already hoarder-eliminated target, same as
        // it already rejects a Battle-Royale-eliminated target.
        let repo5 = new ClientRepository();
        let a5 = new UNOClient("A"); let b5 = new UNOClient("B"); let c5 = new UNOClient("C");
        repo5.insert(a5); repo5.insert(b5); repo5.insert(c5);
        let gm5 = new GameRulesModel(repo5, 5, 'original', false, { nextgenMode: true });
        gm5.deal();
        a5.setTurn(false); b5.setTurn(false); c5.setTurn(true);
        while(b5.getCardsCount() < 40){ gm5.takeCard(b5); }
        gm5.validateNextMove();
        assert.strictEqual(b5.brEliminated, true);
        c5.setTurn(true);
        gm5.colorless = true;
        let th5 = new Card(20201, 'rth');
        c5.addCard(th5);
        gm5.cardRepository.insert(th5);
        gm5.place(c5, { id: 20201, type: 'rth' });
        gm5.selectTarget(c5, 'B');
        assert.strictEqual(gm5.pendingInteraction.awaiting, 'target', 'a hoarder-eliminated player must be rejected as a target');

        // A pendingInteraction referencing a player who becomes hoarder-eliminated
        // mid-interaction (as the target) must be cleared, not left dangling.
        let repo6 = new ClientRepository();
        let a6 = new UNOClient("A"); let b6 = new UNOClient("B"); let c6 = new UNOClient("C");
        repo6.insert(a6); repo6.insert(b6); repo6.insert(c6);
        let gm6 = new GameRulesModel(repo6, 5, 'original', false, { nextgenMode: true });
        gm6.deal();
        a6.setTurn(true);
        gm6.colorless = true;
        let th6 = new Card(20202, 'rth');
        a6.addCard(th6);
        gm6.cardRepository.insert(th6);
        gm6.place(a6, { id: 20202, type: 'rth' });
        gm6.selectTarget(a6, 'B');
        assert.strictEqual(gm6.pendingInteraction.awaiting, 'confirm');
        while(b6.getCardsCount() < 40){ gm6.takeCard(b6); }
        gm6.validateNextMove();
        assert.strictEqual(gm6.pendingInteraction, null, 'dangling pendingInteraction must clear when its target gets hoarder-eliminated');

        // calculateScores must not double-score an already hoarder-eliminated
        // player once the round later ends normally (someone empties their hand).
        let repo7 = new ClientRepository();
        let a7 = new UNOClient("A"); let b7 = new UNOClient("B"); let c7 = new UNOClient("C");
        repo7.insert(a7); repo7.insert(b7); repo7.insert(c7);
        let gm7 = new GameRulesModel(repo7, 5, 'original', false, { nextgenMode: true });
        gm7.deal();
        c7.setTurn(true);
        while(b7.getCardsCount() < 40){ gm7.takeCard(b7); }
        gm7.validateNextMove();
        assert.strictEqual(b7.brEliminated, true);
        let scoreLenAfterElimination = b7.getScore().length;
        UNOClient.calculateScores(gm7.clientRepository.findAll());
        assert.strictEqual(b7.getScore().length, scoreLenAfterElimination, 'an eliminated player must not receive a second score entry');

        // Continuation semantics: once a hoarder-loss has occurred this round,
        // a later classic win-by-emptying-hand must route through ranked
        // elimination (good rank, round continues) rather than instantly ending
        // the round the classic way — matching real Battle Royale behavior.
        let repo8 = new ClientRepository();
        let a8 = new UNOClient("A"); let b8 = new UNOClient("B");
        let c8 = new UNOClient("C"); let d8 = new UNOClient("D");
        repo8.insert(a8); repo8.insert(b8); repo8.insert(c8); repo8.insert(d8);
        let gm8 = new GameRulesModel(repo8, 5, 'original', false, { nextgenMode: true });
        gm8.deal();
        d8.setTurn(true);
        while(a8.getCardsCount() < 40){ gm8.takeCard(a8); }
        gm8.validateNextMove();
        assert.strictEqual(a8.brEliminated, true, 'A must be hoarder-eliminated first');
        assert.ok(a8.brRank > repo8.count(), 'hoarder rank must be far worse than any real finish rank');

        // B now empties their hand — must go through the 'br' ranked path, not the
        // classic instant-win path, since a hoarder-loss already happened.
        while(b8.getCardsCount() > 0){ b8.removeCard(b8.getCards()[0]); }
        let lastCard = new Card(20301, 'y5');
        b8.addCard(lastCard);
        gm8.cardRepository.insert(lastCard);
        b8.setTurn(true);
        gm8.colorless = true;
        gm8.place(b8, { id: 20301, type: 'y5' });

        assert.strictEqual(b8.brEliminated, true, 'B\'s win must also route through ranked elimination');
        let bRecord = gm8.brEliminated.find(r => r.name === 'B');
        assert.strictEqual(bRecord.reason, 'br', 'B\'s elimination reason must be the genuine-finish kind, not hoarder');
        assert.strictEqual(b8.brRank, 1, 'first genuine finisher must get rank 1, unaffected by the hoarder\'s separate rank band');
        assert.strictEqual(b8.hasWon, false, 'round must NOT end yet — C and D are both still active');
        assert.strictEqual(c8.brEliminated, false, 'C must still be in play');
        assert.strictEqual(d8.brEliminated, false, 'D must still be in play');
    }

};