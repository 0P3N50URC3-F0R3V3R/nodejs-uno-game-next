'use strict';
const { ACHIEVEMENTS, CHALLENGE_TEMPLATES } = require('./achievements_data.js');

class AchievementsService {
    constructor(db, io) {
        this.db = db;
        this.io = io;
        this._cache = new Map(); // userId -> Set<achId>
    }

    _ensureCache(userId) {
        if (!this._cache.has(userId)) {
            this._cache.set(userId, new Set(this.db.getUnlockedIds(userId)));
        }
    }

    _isUnlocked(userId, achId) {
        this._ensureCache(userId);
        return this._cache.get(userId).has(achId);
    }

    _emitToUser(userId, event, data) {
        const sockets = this.io.sockets.sockets;
        Object.keys(sockets).forEach(sid => {
            if (sockets[sid].userId === userId) this.io.to(sid).emit(event, data);
        });
    }

    _getStat(userId, col) {
        const row = this.db.db.prepare('SELECT ' + col + ' FROM users WHERE id = ?').get(userId);
        return row ? (row[col] || 0) : 0;
    }

    unlock(userId, socketId, achId, ap) {
        if (!this.db.insertAchievement(userId, achId)) return;
        this._ensureCache(userId);
        this._cache.get(userId).add(achId);
        this.db.bumpApTotal(userId, ap);
        const xpResult = this.db.awardXP(userId, ap);
        const ach = ACHIEVEMENTS.find(a => a.id === achId);
        const payload = {
            id: achId,
            name: ach ? ach.name : achId,
            ap,
            imagePath: '/client/img/achievements/' + (ach ? ach.image : achId + '.png'),
            xpGain: xpResult ? xpResult.gain : 0,
            newApTotal: this._getStat(userId, 'ap_total'),
        };
        if (socketId) this.io.to(socketId).emit('achievementUnlocked', payload);
        else this._emitToUser(userId, 'achievementUnlocked', payload);
        if (xpResult) {
            const xpPay = { gain: xpResult.gain, xp: xpResult.xp, level: xpResult.level, leveledUp: xpResult.leveledUp, isWinner: false, reason: 'achievement' };
            if (socketId) this.io.to(socketId).emit('xpAwarded', xpPay);
            else this._emitToUser(userId, 'xpAwarded', xpPay);
        }
    }

    getStateForUser(userId) {
        const unlockedIds = this.db.getUnlockedIds(userId);
        this._cache.set(userId, new Set(unlockedIds));
        const apTotal = this._getStat(userId, 'ap_total');
        const progress = {};
        ACHIEVEMENTS.forEach(ach => {
            if (unlockedIds.includes(ach.id)) return;
            if (ach.stat) {
                progress[ach.id] = this._getStat(userId, ach.stat);
            } else {
                const p = this.db.getAchievementProgress(userId, ach.id);
                if (p > 0) progress[ach.id] = p;
            }
        });
        return {
            unlockedIds, apTotal, progress,
            daily: this._getChallengeState(userId, 'daily'),
            weekly: this._getChallengeState(userId, 'weekly'),
        };
    }

    _getChallengeState(userId, type) {
        const current = this.db.getChallenges(type);
        if (!current) return { challenges: [], expiresAt: 0, dateKey: '' };
        const challenges = JSON.parse(current.challenges_json);
        this.db.getUserChallengeProgress(userId, type, current.date_key).forEach(up => {
            if (challenges[up.challenge_idx]) {
                challenges[up.challenge_idx].progress = up.progress;
                challenges[up.challenge_idx].completed = up.completed === 1;
            }
        });
        return { challenges, expiresAt: current.expires_at, dateKey: current.date_key };
    }

    _dateKey() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

    _weekKey() {
        const d = new Date();
        d.setHours(0,0,0,0);
        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
        const ys = new Date(d.getFullYear(), 0, 1);
        const wk = Math.ceil((((d - ys) / 86400000) + 1) / 7);
        return d.getFullYear() + '-W' + String(wk).padStart(2,'0');
    }

    _seededRandom(seed) {
        let s = seed | 0;
        return () => {
            s = Math.imul(s ^ (s >>> 15), s | 1);
            s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
            return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
        };
    }

    _seedFromKey(key) {
        return key.split('').reduce((acc, c, i) => (acc + c.charCodeAt(0) * (i + 1)) | 0, 0);
    }

    _nextMidnightMs() {
        const d = new Date(); d.setDate(d.getDate()+1); d.setHours(0,0,0,0); return d.getTime();
    }

    _nextWeekMs() {
        const d = new Date(); d.setHours(0,0,0,0);
        const days = (8 - (d.getDay() || 7)) % 7 || 7;
        d.setDate(d.getDate() + days);
        return d.getTime();
    }

    ensureFreshChallenges() {
        ['daily','weekly'].forEach(type => {
            const expected = type === 'daily' ? this._dateKey() : this._weekKey();
            const year = parseInt(expected.slice(0,4), 10);
            if (Math.abs(year - new Date().getFullYear()) > 1) {
                console.error('[AchievementsService] Suspect system date ' + expected + ', skipping ' + type + ' regen.');
                return;
            }
            const current = this.db.getChallenges(type);
            if (!current || !current.date_key.startsWith(expected)) { this.generateChallenges(type); return; }
            // For weekly only: also regenerate if expires_at is suspiciously soon (wrong entry from old session)
            if (type === 'weekly' && current.expires_at <= Date.now() + 23 * 3600000) this.generateChallenges(type);
        });
    }

    generateChallenges(type, forcedKey, randFn) {
        const key = forcedKey || (type === 'daily' ? this._dateKey() : this._weekKey());
        const rand = randFn || this._seededRandom(this._seedFromKey(key + type));
        const xMult = type === 'weekly' ? 5 : 1;
        const avail = [...CHALLENGE_TEMPLATES];
        const picked = [];
        while (picked.length < 5 && avail.length > 0) {
            picked.push(avail.splice(Math.floor(rand() * avail.length), 1)[0]);
        }
        const challenges = picked.map(t => {
            let x;
            if (type === 'weekly' && t.weeklyMinX != null && t.weeklyMaxX != null) {
                x = t.weeklyMinX + Math.floor(rand() * (t.weeklyMaxX - t.weeklyMinX + 1));
            } else {
                x = (t.minX + Math.floor(rand() * (t.maxX - t.minX + 1))) * xMult;
            }
            const rawXp = x * (5 + Math.floor(rand() * 6));
            return { type: t.type, label: t.label.replace('{x}', x), x, xp: Math.min(rawXp, type === 'weekly' ? 1200 : 500), progress: 0, completed: false };
        });
        const now = Date.now();
        const expiresAt = type === 'daily' ? this._nextMidnightMs() : this._nextWeekMs();
        this.db.setChallenges(type, key, JSON.stringify(challenges), now, expiresAt);
        console.log('[AchievementsService] Generated ' + type + ' challenges for ' + key);
        this.io.emit('challengesReset', { type, challenges, expiresAt, dateKey: key });
        return { dateKey: key, challenges, expiresAt };
    }

    forceReroll(type) {
        const baseKey = type === 'daily' ? this._dateKey() : this._weekKey();
        return this.generateChallenges(type, baseKey + '_r' + Date.now(), Math.random.bind(Math));
    }

    checkDailies(userId, socketId, eventType, ctx) {
        ['daily','weekly'].forEach(type => {
            const current = this.db.getChallenges(type);
            if (!current) return;
            const challenges = JSON.parse(current.challenges_json);
            const done = new Set(
                this.db.getUserChallengeProgress(userId, type, current.date_key)
                    .filter(r => r.completed).map(r => r.challenge_idx)
            );
            challenges.forEach((ch, idx) => {
                if (done.has(idx)) return;
                const delta = this._challengeDelta(ch, eventType, ctx);
                if (delta <= 0) return;
                const newProg = this.db.incrementChallengeProgress(userId, type, current.date_key, idx, delta);
                const completed = newProg >= ch.x;
                if (completed) {
                    this.db.markChallengeCompleted(userId, type, current.date_key, idx);
                    const xr = this.db.awardXP(userId, ch.xp);
                    if (xr) {
                        const xpPay = { gain: xr.gain, xp: xr.xp, level: xr.level, leveledUp: xr.leveledUp, isWinner: false, reason: 'challenge' };
                        if (socketId) this.io.to(socketId).emit('xpAwarded', xpPay);
                        else this._emitToUser(userId, 'xpAwarded', xpPay);
                    }
                    const _gMin = type === 'weekly' ? this.db.goldGetEffective('gold_weekly_min') : this.db.goldGetEffective('gold_daily_min');
                    const _gMax = type === 'weekly' ? this.db.goldGetEffective('gold_weekly_max') : this.db.goldGetEffective('gold_daily_max');
                    const goldAmount = _gMin + Math.floor(Math.random() * (_gMax - _gMin + 1));
                    const gr = this.db.awardGold(userId, goldAmount);
                    if (gr) {
                        const goldPay = { amount: goldAmount, newTotal: gr.gold, reason: type === 'weekly' ? 'weekly_challenge' : 'daily_challenge' };
                        if (socketId) this.io.to(socketId).emit('goldAwarded', goldPay);
                        else this._emitToUser(userId, 'goldAwarded', goldPay);
                    }
                }
                const pay = { type, idx, progress: newProg, target: ch.x, completed, label: ch.label, xpGain: completed ? ch.xp : 0 };
                if (socketId) this.io.to(socketId).emit('challengeProgress', pay);
                else this._emitToUser(userId, 'challengeProgress', pay);
            });
        });
    }

    _challengeDelta(ch, eventType, ctx) {
        const t = ch.type;
        if (eventType === 'card_placed') {
            if (t === 'play_normal' && ctx.isNormal) return 1;
            if (t === 'change_colors' && ctx.isWild) return 1;
            if (t === 'play_plus2' && ctx.cardChar === 'p') return 1;
            if (t === 'play_plus4' && ctx.cardChar === 'g') return 1;
            if (t === 'play_skip' && ctx.cardChar === 'n') return 1;
            if (t === 'play_reverse' && ctx.cardChar === 'r') return 1;
            if (t === 'play_action' && ctx.isActionCard) return 1;
            if (t === 'play_wild' && ctx.isWild) return 1;
            if (t === 'play_red' && ctx.color === 'r') return 1;
            if (t === 'play_green' && ctx.color === 'g') return 1;
            if (t === 'play_blue' && ctx.color === 'b') return 1;
            if (t === 'play_yellow' && ctx.color === 'y') return 1;
            if (t === 'play_0s' && ctx.number === '0') return 1;
            if (t === 'play_1s' && ctx.number === '1') return 1;
            if (t === 'play_2s' && ctx.number === '2') return 1;
            if (t === 'play_3s' && ctx.number === '3') return 1;
            if (t === 'play_4s' && ctx.number === '4') return 1;
            if (t === 'play_5s' && ctx.number === '5') return 1;
            if (t === 'play_6s' && ctx.number === '6') return 1;
            if (t === 'play_7s' && ctx.number === '7') return 1;
            if (t === 'play_8s' && ctx.number === '8') return 1;
            if (t === 'play_9s' && ctx.number === '9') return 1;
            if (t === 'stack_plus2' && ctx.cardChar === 'p' && ctx.isStack) return 1;
            if (t === 'stack_plus4' && ctx.cardChar === 'g' && ctx.isStack) return 1;
            if (t === 'stack_punishment' && ctx.isStack) return 1;
        }
        if (eventType === 'round_end') {
            if (t === 'win_rounds' && ctx.isRoundWinner) return 1;
            if (t === 'lose_rounds' && !ctx.isRoundWinner) return 1;
        }
        if (eventType === 'series_end') {
            if (t === 'win_matches' && ctx.isSeriesWinner) return 1;
            if (t === 'lose_matches' && !ctx.isSeriesWinner) return 1;
            if (t === 'win_ai_only' && ctx.isSeriesWinner && ctx.aiOnly) return 1;
            if (t === 'win_hardcore_games' && ctx.isSeriesWinner && ctx.hardcoreMode) return 1;
            if (t === 'play_hardcore_games' && ctx.hardcoreMode) return 1;
        }
        if (eventType === 'uno_missed_penalty' && t === 'skip_uno') return 1;
        if (eventType === 'uno_called' && t === 'press_uno') return 1;
        if (eventType === 'series_end' && t === 'press_uno_streak') return (ctx.unoGameCalls || 0) >= ch.x ? ch.x : 0;
        if ((eventType === 'card_taken' || eventType === 'stack_taken' || eventType === 'punishment_received' || eventType === 'uno_missed_penalty') && t === 'take_punishment') return 1;
        if (eventType === 'game_created' && t === 'host_games') return 1;
        if (eventType === 'game_joined' && t === 'join_games') return 1;
        if (eventType === 'punish_applied' && t === 'punish_players') return 1;
        return 0;
    }

    trigger(userId, socketId, eventType, ctx) {
        if (!userId) return;
        if (eventType === 'round_end') this.ensureFreshChallenges();
        this._handleStatBump(userId, eventType, ctx);
        ACHIEVEMENTS.filter(a => a.triggerTypes.includes(eventType)).forEach(ach => {
            if (this._isUnlocked(userId, ach.id)) return;
            if (this._check(userId, ach, ctx)) this.unlock(userId, socketId, ach.id, ach.ap);
        });
        this.checkDailies(userId, socketId, eventType, ctx);
    }

    _handleStatBump(userId, eventType, ctx) {
        if (eventType === 'uno_called' && ctx.success) this.db.bumpStat(userId, 'uno_calls_success', 1);
        if (eventType === 'uno_missed_penalty') this.db.bumpStat(userId, 'uno_missed_penalty', 1);
        if (eventType === 'round_end') this.db.bumpStat(userId, 'rounds_played', 1);
        if (eventType === 'round_end' && ctx.isRoundWinner) this.db.bumpStat(userId, 'rounds_won', 1);
        if (eventType === 'card_placed' && ctx.isWild) this.db.bumpStat(userId, 'color_changes', 1);
        if (eventType === 'card_placed' && ctx.isActionCard) this.db.bumpStat(userId, 'action_cards_played', 1);
        if (eventType === 'game_created') this.db.bumpStat(userId, 'games_hosted', 1);
        if (eventType === 'game_joined') this.db.bumpStat(userId, 'games_joined', 1);
    }

    _check(userId, ach, ctx) {
        if (ach.stat && ach.threshold !== null) return this._getStat(userId, ach.stat) >= ach.threshold;
        const fn = this['_check_' + ach.id];
        return typeof fn === 'function' ? fn.call(this, userId, ctx) : false;
    }

    _check_welcome(u, ctx)           { return true; }
    _check_good_start(u, ctx)        { return !!ctx.isSeriesWinner; }
    _check_the_last_one(u, ctx)      { return !!ctx.success; }
    _check_joker(u, ctx)             { return ctx.cardChar === 'g'; }
    _check_our_house(u, ctx) {
        if (ctx.ruleset === 'original') return false;
        return this.db.incrementAchievementProgress(u, 'our_house', 1) >= 5;
    }
    _check_good_eye(u, ctx) {
        return this.db.incrementAchievementProgress(u, 'good_eye', 1) >= 15;
    }
    _check_wow_signal(u, ctx)        { return true; }
    _check_ping(u, ctx)              { return true; }
    _check_pong(u, ctx)              { return true; }
    _check_identity(u, ctx)          { return true; }
    _check_identity_crisis(u, ctx)   { return true; }
    _check_forget_it(u, ctx)         { return true; }
    _check_jukebox(u, ctx)           { return true; }
    _check_quitter(u, ctx)           { return true; }
    _check_sam_the_swift(u, ctx) {
        return ctx.isSeriesWinner && ctx.seriesRounds >= 5 && ctx.matchDuration > 0 && ctx.matchDuration < 900;
    }
    _check_quicksilver(u, ctx)       { return ctx.isRoundWinner && ctx.roundDuration > 0 && ctx.roundDuration < 300; }
    _check_passive_aggressive(u, ctx){ return ctx.isRoundWinner && !!ctx.roundNoPunishmentPlayed; }
    _check_colorblind(u, ctx)        { return !!ctx.roundNoColorChange; }
    _check_hexa(u, ctx)              { return ctx.stackCount === 6; }
    _check_stacked(u, ctx)           { return ctx.stackCount >= 8; }
    _check_socializer(u, ctx) {
        if (!ctx.isSeriesWinner || ctx.humanCount < 2) return false;
        return this.db.incrementAchievementProgress(u, 'socializer', 1) >= 10;
    }
    _check_only_human(u, ctx)        { return ctx.humanCount >= 5 && ctx.aiCount === 0; }
    _check_quadro(u, ctx)            { return ctx.humanCount === 4 && ctx.aiCount === 0; }
    _check_trinity(u, ctx)           { return ctx.humanCount === 3 && ctx.aiCount === 0; }
    _check_duel(u, ctx)              { return ctx.humanCount === 2 && ctx.aiCount === 0; }
    _check_the_last_stand(u, ctx)    { return ctx.isSeriesWinner && ctx.humanCount >= 5 && ctx.aiCount === 0; }
    _check_housekeeper(u, ctx)       { return true; }
    _check_be_my_guest(u, ctx)       { return !!ctx.hasHumans; }
    _check_pariah(u, ctx)            { return ctx.aiCount >= 4 && !ctx.humanCount; }
    _check_no_segregation(u, ctx) {
        if (!ctx.isSeriesWinner || ctx.humanCount < 2 || ctx.aiCount < 1) return false;
        return this.db.incrementAchievementProgress(u, 'no_segregation', 1) >= 10;
    }
    _checkAiWins(u, id, ctx, n, diff) {
        if (!ctx.isSeriesWinner || ctx.humanCount !== 1 || ctx.aiCount !== n) return false;
        if (!ctx.aiDifficulties || !ctx.aiDifficulties.every(d => d === diff)) return false;
        return this.db.incrementAchievementProgress(u, id, 1) >= 5;
    }
    _check_lets_play_alone(u,ctx)    { return this._checkAiWins(u,'lets_play_alone',ctx,1,'easy'); }
    _check_i_want_more(u,ctx)        { return this._checkAiWins(u,'i_want_more',ctx,2,'easy'); }
    _check_push_the_pedal(u,ctx)     { return this._checkAiWins(u,'push_the_pedal',ctx,3,'easy'); }
    _check_dont_mess_around(u,ctx)   { return this._checkAiWins(u,'dont_mess_around',ctx,4,'easy'); }
    _check_robotics(u,ctx)           { return this._checkAiWins(u,'robotics',ctx,1,'medium'); }
    _check_still_just_a_machine(u,ctx){ return this._checkAiWins(u,'still_just_a_machine',ctx,2,'medium'); }
    _check_raise_stake(u,ctx)        { return this._checkAiWins(u,'raise_stake',ctx,3,'medium'); }
    _check_asimov(u,ctx)             { return this._checkAiWins(u,'asimov',ctx,4,'medium'); }
    _check_just_a_machine(u,ctx)     { return this._checkAiWins(u,'just_a_machine',ctx,1,'hard'); }
    _check_still_just_metal(u,ctx)   { return this._checkAiWins(u,'still_just_metal',ctx,2,'hard'); }
    _check_machinehead(u,ctx)        { return this._checkAiWins(u,'machinehead',ctx,3,'hard'); }
    _check_terminator(u,ctx)         { return this._checkAiWins(u,'terminator',ctx,4,'hard'); }
    _check_the_horde(u, ctx) {
        if (!ctx.isSeriesWinner || ctx.aiCount < 4 || ctx.humanCount !== 1) return false;
        const diffs = new Set(ctx.aiDifficulties || []);
        if (!['easy','medium','hard'].every(d => diffs.has(d))) return false;
        return this.db.incrementAchievementProgress(u, 'the_horde', 1) >= 50;
    }
    _check_practice_makes_perfect(u, ctx) {
        if (ctx.humanCount !== 1 || ctx.aiCount < 1) return false;
        return this.db.incrementAchievementProgress(u, 'practice_makes_perfect', 1) >= 100;
    }
    _check_flying_higher(u, ctx) {
        if (!ctx.isSeriesWinner || (ctx.seriesPoints || 0) < 400) return false;
        return this.db.incrementAchievementProgress(u, 'flying_higher', 1) >= 50;
    }
    _check_high_stakes(u, ctx) {
        if (!ctx.isSeriesWinner || (ctx.seriesPoints || 0) < 200) return false;
        return this.db.incrementAchievementProgress(u, 'high_stakes', 1) >= 50;
    }
    _check_determination(u, ctx) {
        if (!ctx.seriesEnded || (ctx.seriesRounds || 0) < 5) return false;
        return this.db.incrementAchievementProgress(u, 'determination', 1) >= 1000;
    }
    _check_hardcore_master(u, ctx) {
        if (!ctx.isSeriesWinner || !ctx.hardcoreMode) return false;
        return this.db.incrementAchievementProgress(u, 'hardcore_master', 1) >= 50;
    }
    _check_suffering(u, ctx) {
        return this.db.incrementAchievementProgress(u, 'suffering', 1) >= 500;
    }
    _check_deluge(u, ctx) {
        if (this.db.getAchievementProgress(u, 'deluge') === 0) {
            const existing = ['cards_normal','cards_plus2','cards_plus4','cards_reverse','cards_wildcolor','cards_missed']
                .reduce((s, c) => s + this._getStat(u, c), 0);
            if (existing > 0) {
                this.db.db.prepare('INSERT OR IGNORE INTO user_achievement_progress (user_id, ach_id, progress) VALUES (?, ?, ?)').run(u, 'deluge', existing);
            }
        }
        const cards = ctx.cardsPlayedThisRound || 0;
        if (cards > 0) this.db.incrementAchievementProgress(u, 'deluge', cards);
        return this.db.getAchievementProgress(u, 'deluge') >= 5000;
    }
    _check_player(u, ctx) {
        if (this.db.getAchievementProgress(u, 'player') === 0) {
            const existing = ['cards_normal','cards_plus2','cards_plus4','cards_reverse','cards_wildcolor','cards_missed']
                .reduce((s, c) => s + this._getStat(u, c), 0);
            if (existing > 0) {
                this.db.db.prepare('INSERT OR IGNORE INTO user_achievement_progress (user_id, ach_id, progress) VALUES (?, ?, ?)').run(u, 'player', existing);
            }
        }
        const cards = ctx.cardsPlayedThisRound || 0;
        if (cards > 0) this.db.incrementAchievementProgress(u, 'player', cards);
        return this.db.getAchievementProgress(u, 'player') >= 2000;
    }
    _check_something_good(u, ctx) {
        const boards = this.db.getLeaderboardAll(1);
        return Object.values(boards).some(b => b.length > 0 && b[0].id === u);
    }
    _check_hoarder(u, ctx)           { return (ctx.handSize || 0) >= 25; }
}

module.exports = AchievementsService;
