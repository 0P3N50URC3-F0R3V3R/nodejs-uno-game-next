import Vue from 'vue';

export const panelState = Vue.observable({ zBase: 300 });
export const panels = Vue.observable({});

export function registerPanel(id, vm) { Vue.set(panels, id, vm); }
export function unregisterPanel(id) { Vue.delete(panels, id); }
export function bringToFront() { panelState.zBase++; return panelState.zBase; }
export function togglePanel(id) { if (panels[id]) panels[id].onTabClick(); }

document.addEventListener('mousedown', function(e) {
    Object.keys(panels).forEach(function(id) {
        let p = panels[id];
        if (!p || !p.open) return;
        if (p.$el && p.$el.contains(e.target)) {
            p.panelZ = bringToFront();
        } else if (!p.pinned) {
            p.open = false;
        }
    });
}, true);
