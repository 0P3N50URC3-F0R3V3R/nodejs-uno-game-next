import en from './en.json';
import hu from './hu.json';
import de from './de.json';
import fr from './fr.json';
import es from './es.json';
import it from './it.json';
import pt from './pt.json';
import pt_pt from './pt_pt.json';
import nl from './nl.json';
import pl from './pl.json';
import sv from './sv.json';
import da from './da.json';
import no from './no.json';
import fi from './fi.json';
import cs from './cs.json';
import ro from './ro.json';
import id from './id.json';
import tr from './tr.json';
import vi from './vi.json';
import ru from './ru.json';
import uk from './uk.json';
import bg from './bg.json';
import el from './el.json';
import ja from './ja.json';
import zh from './zh.json';

const LANGS = { en, hu, de, fr, es, it, pt, pt_pt, nl, pl, sv, da, no, fi, cs, ro, id, tr, vi, ru, uk, bg, el, ja, zh };
const LS_KEY = 'unoLang';

let _current = LANGS[localStorage.getItem(LS_KEY)] ? localStorage.getItem(LS_KEY) : 'en';

export const lang = {
    get current() { return _current; },
    set current(code) {
        if(LANGS[code]){ _current = code; localStorage.setItem(LS_KEY, code); }
    },
    t(key, vars) {
        let str = (LANGS[_current] || LANGS.en)[key] || (LANGS.en[key]) || key;
        if(vars) Object.keys(vars).forEach(function(k){ str = str.replace('{' + k + '}', vars[k]); });
        return str;
    },
    available: [
        { code: 'en',    label: 'English' },
        { code: 'hu',    label: 'Magyar' },
        { code: 'de',    label: 'Deutsch' },
        { code: 'fr',    label: 'Français' },
        { code: 'es',    label: 'Español' },
        { code: 'it',    label: 'Italiano' },
        { code: 'pt',    label: 'Português (BR)' },
        { code: 'pt_pt', label: 'Português (PT)' },
        { code: 'nl',    label: 'Nederlands' },
        { code: 'pl',    label: 'Polski' },
        { code: 'sv',    label: 'Svenska' },
        { code: 'da',    label: 'Dansk' },
        { code: 'no',    label: 'Norsk' },
        { code: 'fi',    label: 'Suomi' },
        { code: 'cs',    label: 'Čeština' },
        { code: 'ro',    label: 'Română' },
        { code: 'id',    label: 'Bahasa Indonesia' },
        { code: 'tr',    label: 'Türkçe' },
        { code: 'vi',    label: 'Tiếng Việt' },
        { code: 'ru',    label: 'Русский' },
        { code: 'uk',    label: 'Українська' },
        { code: 'bg',    label: 'Български' },
        { code: 'el',    label: 'Ελληνικά' },
        { code: 'ja',    label: '日本語' },
        { code: 'zh',    label: '简体中文' }
    ]
};
