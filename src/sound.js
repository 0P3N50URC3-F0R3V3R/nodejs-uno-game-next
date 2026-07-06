import Vue from 'vue';

function track(name) {
    return encodeURI('/snd/music/' + name);
}

let MUSIC_TRACKS = [
    track('Across The Void.mp3'),
    track('Straplocked - You Should Be.mp3'),
    track('Swimware - Confessions in the Dark.mp3'),
    track('The G - Lights.mp3'),
    track('The Neon Droid - Planet Neon.mp3'),
    track('The Outrider - Ragnarok.mp3'),
    track("Time Travel - Crystalis.mp3"),
    track("Time Travel - Malibu Club.mp3"),
    track('TOKYO ROSE - All Night (feat. LeBrock & Ultraboss).mp3'),
    track('Tommy -86 - Starlight.mp3'),
    track('Tommy Von Voigt - All I Can Do.mp3'),
    track("Turbo Knight - Rasengan.mp3"),
    track('TV Players - Today Tomorrow Forever.mp3'),
    track('Ultraboss - Lord of the Deep (feat. TOKYO ROSE).mp3'),
    track('Vanir’s Legacy.mp3'),
];

function _buildTrackNames() {
    return MUSIC_TRACKS.map(function(url) {
        return decodeURIComponent(url.split('/').pop().replace(/\.[^.]+$/, ''));
    });
}

export const TRACK_NAMES = _buildTrackNames();

const SFX = {
    deal:        '/snd/card_deal.mp3',
    play:        '/snd/card_play.mp3',
    draw:        '/snd/card_deal.mp3',
    plus2:       '/snd/plus_2.mp3',
    plus4:       '/snd/plus_4.mp3',
    draw2:       '/snd/draw_two.wav',
    draw4:       '/snd/draw_four.wav',
    draw6:       '/snd/draw_six.wav',
    draw8:       '/snd/draw_eight.wav',
    draw10:      '/snd/draw_ten.wav',
    draw_twelve: '/snd/draw_twelve.wav',
    draw14:      '/snd/draw_fourteen.wav',
    draw16:      '/snd/draw_sixteen.wav',
    draw18:      '/snd/draw_eighteen.wav',
    player_out:  '/snd/player_out.mp3',
    skip:        '/snd/Skip-or-miss.wav',
    missTurn:    '/snd/miss_turn.mp3',
    reverse:     '/snd/reverse_order.mp3',
    reverseWav:  '/snd/Reverse.wav',
    arrowSwitch: '/snd/ArrowSwitch_order.wav',
    uno:             '/snd/UNO_pressed.mp3',
    yellUno:         '/snd/yell_uno.wav',
    unoFail:         '/snd/missed_UNO_Button.mp3',
    unoMissedNo:     '/snd/uno_missed_No.wav',
    unoMissedOops:   '/snd/uno_missed_Oops.wav',
    unoMissedSuffer: '/snd/uno_missed_Suffer.wav',
    yourTurn:    '/snd/yourturn_notify.mp3',
    win:         '/snd/you_win.wav',
    lose:        '/snd/you_lose.wav',
    start:       '/snd/Gamestart.wav',
    shuffle:     '/snd/shuffle_deck.mp3',
    reshuffle:   '/snd/reshuffle_deck.mp3',
    countdown:   '/snd/UNO_CountDown.wav',
    chat:        '/snd/chat_notification_sound.mp3',
    colorRed:    '/snd/Red.wav',
    colorGreen:  '/snd/Green.wav',
    colorBlue:   '/snd/Blue.wav',
    colorYellow: '/snd/Yellow.wav',
    tradeHands:  '/snd/ArrowSwitch_order.wav',
    redrawAll:   '/snd/reshuffle_deck.mp3',
    targetSteal: '/snd/card_deal.mp3',
    rotateHands: '/snd/shuffle_deck.mp3',
    rainbow:     '/snd/UNO_CountDown.wav',
};

export const soundState = Vue.observable({
    sfxVolume: 0.7,
    musicVolume: 0.4,
    unlocked: false,
    musicPaused: false,
    sfxMuted: false,
    currentTrack: '',
    currentTrackIndex: -1,
    nowPlayingEnabled: localStorage.getItem('unoNowPlaying') !== 'false',
    yourTurnEnabled: localStorage.getItem('unoYourTurn') !== 'false',
    trackNames: _buildTrackNames(),
});

let _musicAudio = null;
let _musicShuffled = [];
let _musicIndex = 0;

function _shuffled(arr) {
    let a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

function _playUrl(url) {
    let idx = MUSIC_TRACKS.indexOf(url);
    soundState.currentTrack = decodeURIComponent(url.split('/').pop().replace(/\.[^.]+$/, ''));
    soundState.currentTrackIndex = idx;
    if (_musicAudio) {
        _musicAudio.removeEventListener('ended', _nextTrack);
        _musicAudio.pause();
    }
    _musicAudio = new Audio(url);
    _musicAudio.volume = soundState.musicVolume;
    _musicAudio.addEventListener('ended', _nextTrack);
    _musicAudio.play().catch(function () {});
}

function _nextTrack() {
    if (!soundState.unlocked || soundState.musicPaused) return;
    if (_musicIndex >= _musicShuffled.length) {
        _musicShuffled = _shuffled(MUSIC_TRACKS);
        _musicIndex = 0;
    }
    _playUrl(_musicShuffled[_musicIndex++]);
}

export const sound = {
    init: function () {
        let sv = parseFloat(localStorage.getItem('unoSfxVolume'));
        let mv = parseFloat(localStorage.getItem('unoMusicVolume'));
        if (!isNaN(sv)) soundState.sfxVolume = Math.max(0, Math.min(1, sv));
        if (!isNaN(mv)) soundState.musicVolume = Math.max(0, Math.min(1, mv));
        sound.loadTracks();
    },
    loadTracks: function () {
        fetch('/api/music-tracks').then(function(r) { return r.json(); }).then(function(data) {
            if (!data || !data.tracks || !data.tracks.length) return;
            MUSIC_TRACKS.splice(0, MUSIC_TRACKS.length);
            data.tracks.forEach(function(f) { MUSIC_TRACKS.push(encodeURI('/snd/music/' + f)); });
            soundState.trackNames = _buildTrackNames();
        }).catch(function() {});
    },
    unlock: function () {
        if (soundState.unlocked) return;
        soundState.unlocked = true;
        _musicShuffled = _shuffled(MUSIC_TRACKS);
        _musicIndex = 0;
        _nextTrack();
    },
    play: function (name, onEnded) {
        if (!soundState.unlocked || soundState.sfxMuted) return;
        let src = SFX[name];
        if (!src) return;
        try {
            let a = new Audio(src);
            a.volume = soundState.sfxVolume;
            if (onEnded) a.addEventListener('ended', onEnded);
            a.play().catch(function () {});
        } catch (e) {}
    },
    setMusicVolume: function (v) {
        soundState.musicVolume = v;
        localStorage.setItem('unoMusicVolume', String(v));
        if (_musicAudio) _musicAudio.volume = v;
    },
    setSfxVolume: function (v) {
        soundState.sfxVolume = v;
        localStorage.setItem('unoSfxVolume', String(v));
    },
    toggleMusic: function () {
        if (soundState.musicPaused) {
            soundState.musicPaused = false;
            if (_musicAudio) _musicAudio.play().catch(function () {});
            else _nextTrack();
        } else {
            soundState.musicPaused = true;
            if (_musicAudio) _musicAudio.pause();
        }
    },
    toggleSfx: function () {
        soundState.sfxMuted = !soundState.sfxMuted;
    },
    playTrackByIndex: function (i) {
        if (!soundState.unlocked) return;
        soundState.musicPaused = false;
        _playUrl(MUSIC_TRACKS[i]);
    },
    toggleNowPlaying: function () {
        soundState.nowPlayingEnabled = !soundState.nowPlayingEnabled;
        localStorage.setItem('unoNowPlaying', String(soundState.nowPlayingEnabled));
    },
    toggleYourTurn: function () {
        soundState.yourTurnEnabled = !soundState.yourTurnEnabled;
        localStorage.setItem('unoYourTurn', String(soundState.yourTurnEnabled));
    },
};
