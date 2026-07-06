const MIN_FONT = 6.5;
const _cache = new WeakMap();

function fit(el) {
    if (!el || !el.clientWidth) return;
    const key = el.textContent + '|' + el.clientWidth;
    if (_cache.get(el) === key) return;
    _cache.set(el, key);
    el.style.fontSize = '';
    const base = parseFloat(window.getComputedStyle(el).fontSize);
    let size = base;
    while (el.scrollWidth > el.clientWidth + 1 && size > MIN_FONT) {
        size -= 0.5;
        el.style.fontSize = size + 'px';
    }
}

const SEL = [
    '.fp-btn', '.pp-action-btn', '.psearch-action-btn',
    '.ppm-action-btn', '.store-btn', '.store-action-btn',
    '.panel-tab-btn', '.game-action-btn',
].join(',');

function fitAll(el) {
    if (!el || !el.querySelectorAll) return;
    el.querySelectorAll(SEL).forEach(fit);
}

export default {
    install(Vue) {
        Vue.directive('fit-text', {
            inserted: fit,
            componentUpdated(el) { Vue.nextTick(() => fit(el)); }
        });
        Vue.mixin({
            mounted() { this.$nextTick(() => fitAll(this.$el)); },
            updated() { this.$nextTick(() => fitAll(this.$el)); }
        });
    }
};
