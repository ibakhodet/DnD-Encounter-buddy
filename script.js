// ════════════════════════════════════
//  DnD Encounter Buddy
// ════════════════════════════════════

let combatants = [];   // { id, name, initiative, type, dead, hp, maxHp, conditions, orderRank }
let currentIdx = 0;
let round      = 1;
let nextRank   = 1;
let settings   = { trackHp: false };
let lastScrolledTurnKey = '';

const expanded = new Set();

// ── Conditions (5e SRD + concentration) ───────────────────────────────────
const CONDITIONS = [
    { key: 'concentrating', label: 'Concentrating', icon: '⚡' },
    { key: 'blinded',       label: 'Blinded' },
    { key: 'charmed',       label: 'Charmed' },
    { key: 'deafened',      label: 'Deafened' },
    { key: 'frightened',    label: 'Frightened' },
    { key: 'grappled',      label: 'Grappled' },
    { key: 'incapacitated', label: 'Incapacitated' },
    { key: 'invisible',     label: 'Invisible' },
    { key: 'paralyzed',     label: 'Paralyzed' },
    { key: 'petrified',     label: 'Petrified' },
    { key: 'poisoned',      label: 'Poisoned' },
    { key: 'prone',         label: 'Prone' },
    { key: 'restrained',    label: 'Restrained' },
    { key: 'stunned',       label: 'Stunned' },
    { key: 'unconscious',   label: 'Unconscious' },
];
const CONDITION_MAP = Object.fromEntries(CONDITIONS.map(c => [c.key, c]));

// ── Flavor texts ───────────────────────────────────────────────────────────
const FLAVOR = [
    n => `<strong>${n}</strong> is next — prepare your actions!`,
    n => `The fates turn to <strong>${n}</strong>. Steel yourself!`,
    n => `<strong>${n}</strong> readies for battle!`,
    n => `<strong>${n}</strong> steps forth from the shadows...`,
    n => `Destiny calls upon <strong>${n}</strong>!`,
    n => `The dice roll for <strong>${n}</strong> — act wisely.`,
    n => `<strong>${n}</strong> — your moment has come!`,
];
const randomFlavor = name => FLAVOR[Math.floor(Math.random() * FLAVOR.length)](name);

// ── Utilities ──────────────────────────────────────────────────────────────
function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function flash(el) {
    if (!el) return;
    el.classList.add('error');
    setTimeout(() => el.classList.remove('error'), 900);
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function newId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getNextMonsterNum(baseName) {
    const re = new RegExp(`^${escapeRegex(baseName)}\\s+(\\d+)$`, 'i');
    let max = 0;
    combatants.forEach(c => {
        const m = c.name.match(re);
        if (m) max = Math.max(max, parseInt(m[1]));
    });
    return max + 1;
}

function getNextAliveIdx(fromIdx) {
    const total = combatants.length;
    if (!total) return null;
    let idx     = (fromIdx + 1) % total;
    let wrapped = (idx === 0);
    let steps   = 0;
    while (steps < total) {
        if (!combatants[idx].dead) return { idx, wrapped };
        steps++;
        idx = (idx + 1) % total;
        if (idx === 0) wrapped = true;
    }
    return null;
}

function sortCombatants() {
    combatants.sort((a, b) => {
        if (b.initiative !== a.initiative) return b.initiative - a.initiative;
        return a.orderRank - b.orderRank;
    });
}

function updateCountWrap(radioName, wrapId, hintId) {
    const type = document.querySelector(`input[name="${radioName}"]:checked`).value;
    const show = type === 'monster' || type === 'npc';
    document.getElementById(wrapId).style.display = show ? 'flex' : 'none';
    document.getElementById(hintId).style.display = show ? 'block' : 'none';
}

function parseNameCount(raw) {
    const match = raw.match(/^(.+?)\s+x(\d+)$/i);
    if (match) return { baseName: match[1].trim(), count: Math.min(parseInt(match[2]), 20) };
    return { baseName: raw, count: null };
}

function makeCombatant(name, init, type, hp) {
    const c = {
        id: newId(),
        name,
        initiative: init,
        type,
        dead: false,
        hp: null,
        maxHp: null,
        conditions: [],
        orderRank: nextRank++,
    };
    if (hp != null) { c.maxHp = hp; c.hp = hp; }
    return c;
}

// ── Setup: Add Combatant ──────────────────────────────────────────────────
function addCombatant() {
    const nameEl = document.getElementById('name-input');
    const initEl = document.getElementById('initiative-input');
    const hpEl   = document.getElementById('hp-input');
    const name   = nameEl.value.trim();
    const init   = parseInt(initEl.value, 10);
    const type   = document.querySelector('input[name="type"]:checked').value;
    const rawHp  = hpEl ? hpEl.value.trim() : '';
    const hp     = rawHp ? parseInt(rawHp, 10) : null;

    let valid = true;
    if (!name) { flash(nameEl); valid = false; }
    if (isNaN(init)) { flash(initEl); valid = false; }
    if (settings.trackHp && rawHp && (isNaN(hp) || hp <= 0)) { flash(hpEl); valid = false; }
    if (!valid) return;

    if (type === 'monster' || type === 'npc') {
        const parsed = parseNameCount(name);
        const baseName = parsed.baseName;
        const count = parsed.count ?? (parseInt(document.getElementById('monster-count').value, 10) || 1);
        for (let i = 0; i < count; i++) {
            const num = getNextMonsterNum(baseName);
            combatants.push(makeCombatant(`${baseName} ${num}`, init, type, hp));
        }
    } else {
        combatants.push(makeCombatant(name, init, type, hp));
    }

    sortCombatants();

    initEl.value = '';
    if (hpEl) hpEl.value = '';
    initEl.focus();

    renderList();
    updateStartBtn();
}

function removeCombatant(id) {
    combatants = combatants.filter(c => c.id !== id);
    expanded.delete(id);
    renderList();
    renderEncounter();
    updateStartBtn();
}

function renderList() {
    const container = document.getElementById('list-items');
    const countEl   = document.getElementById('combatant-count');
    countEl.textContent = combatants.length ? `(${combatants.length})` : '';

    if (!combatants.length) {
        container.innerHTML = '<p class="empty-state">No combatants yet — add some above.</p>';
        return;
    }
    container.innerHTML = combatants.map((c, i) => renderSetupRow(c, i)).join('');
}

function renderSetupRow(c, i) {
    const sameInitAbove = i > 0 && combatants[i-1].initiative === c.initiative;
    const sameInitBelow = i < combatants.length - 1 && combatants[i+1].initiative === c.initiative;

    let hpBit = '';
    if (settings.trackHp) {
        if (c.maxHp == null) {
            hpBit = `<span class="c-hp placeholder" onclick="startEditHp('${c.id}', this)">— HP</span>`;
        } else {
            const cur = c.hp ?? c.maxHp;
            hpBit = `<span class="c-hp" onclick="startEditHp('${c.id}', this)">${cur}/${c.maxHp}</span>`;
        }
    }

    return `
        <div class="combatant-item" data-id="${c.id}">
            <span class="c-init">${c.initiative}</span>
            <span class="c-name editable" onclick="startEditName('${c.id}', this)">${esc(c.name)}</span>
            <span class="type-badge ${c.type}">${c.type}</span>
            ${hpBit}
            <button class="reorder-btn" tabindex="-1" onclick="moveCombatant('${c.id}', -1)" ${!sameInitAbove ? 'disabled' : ''} aria-label="Move up (only among same initiative)">▲</button>
            <button class="reorder-btn" tabindex="-1" onclick="moveCombatant('${c.id}', 1)" ${!sameInitBelow ? 'disabled' : ''} aria-label="Move down (only among same initiative)">▼</button>
            <button class="remove-btn" onclick="removeCombatant('${c.id}')" aria-label="Remove">✕</button>
        </div>
    `;
}

function updateStartBtn() {
    document.getElementById('start-btn').disabled = combatants.length < 2;
}

// ── Inline edit: name ─────────────────────────────────────────────────────
function startEditName(id, el) {
    const c = combatants.find(c => c.id === id);
    if (!c) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-name-input';
    input.value = c.name;
    input.maxLength = 30;
    el.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
        if (done) return;
        done = true;
        const v = input.value.trim();
        if (commit && v) c.name = v;
        renderList();
        renderEncounter();
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
}

// ── Inline edit: max HP (setup screen) ────────────────────────────────────
function startEditHp(id, el) {
    const c = combatants.find(c => c.id === id);
    if (!c) return;
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.className = 'edit-hp-input';
    input.value = c.maxHp != null ? c.maxHp : '';
    input.placeholder = 'Max';
    input.min = '1';
    el.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
        if (done) return;
        done = true;
        const v = parseInt(input.value, 10);
        if (commit && !isNaN(v) && v > 0) {
            c.maxHp = v;
            if (c.hp == null || c.hp > v) c.hp = v;
        }
        renderList();
        renderEncounter();
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
}

// ── Reorder within same initiative ────────────────────────────────────────
function moveCombatant(id, direction) {
    const idx = combatants.findIndex(c => c.id === id);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= combatants.length) return;
    if (combatants[idx].initiative !== combatants[swapIdx].initiative) return;

    const a = combatants[idx], b = combatants[swapIdx];
    [a.orderRank, b.orderRank] = [b.orderRank, a.orderRank];
    [combatants[idx], combatants[swapIdx]] = [b, a];

    if (currentIdx === idx) currentIdx = swapIdx;
    else if (currentIdx === swapIdx) currentIdx = idx;

    renderList();
    renderEncounter();
}

// ── Encounter flow ────────────────────────────────────────────────────────
function startEncounter() {
    if (combatants.length < 2) return;
    currentIdx = 0;
    round      = 1;
    showScreen('encounter-screen');
    renderEncounter();
}

function nextTurn() {
    const result = getNextAliveIdx(currentIdx);
    if (!result) return;
    if (result.wrapped) round++;
    currentIdx = result.idx;
    expanded.clear();
    renderEncounter();
}

function toggleDead(id) {
    const c = combatants.find(c => c.id === id);
    if (!c) return;
    c.dead = !c.dead;
    if (c.dead && combatants[currentIdx].id === id) {
        const result = getNextAliveIdx(currentIdx);
        if (result) {
            if (result.wrapped) round++;
            currentIdx = result.idx;
            expanded.clear();
        }
    }
    renderEncounter();
}

// ── HP ops ────────────────────────────────────────────────────────────────
function applyHp(id, inputEl, kind) {
    const amount = parseInt(inputEl.value, 10);
    if (isNaN(amount) || amount <= 0) { flash(inputEl); return; }
    const c = combatants.find(c => c.id === id);
    if (!c) return;
    if (c.hp == null) c.hp = c.maxHp ?? amount;
    if (kind === 'damage') {
        c.hp = Math.max(0, c.hp - amount);
    } else {
        c.hp = c.maxHp != null ? Math.min(c.maxHp, c.hp + amount) : c.hp + amount;
    }
    inputEl.value = '';
    renderEncounter();
    renderList();
}

function setMaxHpFromInput(id, inputEl) {
    const v = parseInt(inputEl.value, 10);
    if (isNaN(v) || v <= 0) return;
    const c = combatants.find(c => c.id === id);
    if (!c) return;
    c.maxHp = v;
    if (c.hp == null || c.hp > v) c.hp = v;
    renderEncounter();
    renderList();
}

function setCurrentHp(id, inputEl) {
    const v = parseInt(inputEl.value, 10);
    if (isNaN(v)) return;
    const c = combatants.find(c => c.id === id);
    if (!c) return;
    c.hp = Math.max(0, c.maxHp != null ? Math.min(c.maxHp, v) : v);
    renderEncounter();
    renderList();
}

// ── Conditions ────────────────────────────────────────────────────────────
function toggleCondition(id, key) {
    const c = combatants.find(c => c.id === id);
    if (!c) return;
    const idx = c.conditions.indexOf(key);
    if (idx >= 0) c.conditions.splice(idx, 1);
    else c.conditions.push(key);
    renderEncounter();
    renderList();
}

// ── Expand drawer per combatant ───────────────────────────────────────────
function toggleExpand(id) {
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    renderEncounter();
}

function expandFor(id) {
    expanded.add(id);
    renderEncounter();
    requestAnimationFrame(() => {
        const drawers = document.querySelectorAll('.order-item.expanded .dmg-amount');
        if (drawers.length) drawers[drawers.length - 1].focus();
    });
}

// ── Encounter render ──────────────────────────────────────────────────────
function renderEncounter() {
    const screen = document.getElementById('encounter-screen');
    if (!screen.classList.contains('active')) return;
    if (!combatants.length) return;

    if (currentIdx >= combatants.length) currentIdx = 0;

    document.getElementById('round-number').textContent = round;

    const current    = combatants[currentIdx];
    const nextResult = getNextAliveIdx(currentIdx);
    const next       = nextResult ? combatants[nextResult.idx] : null;

    if (current) {
        document.getElementById('current-name').textContent       = current.name;
        document.getElementById('current-initiative').textContent = current.initiative;
        const typeBadge = document.getElementById('current-type');
        typeBadge.textContent = current.type.toUpperCase();
        typeBadge.className   = `current-type-badge ${current.type}`;

        const card = document.querySelector('.current-card');
        card.style.animation = 'none';
        void card.offsetWidth;
        card.style.animation = '';
    }

    const nextMsg = document.getElementById('next-message');
    if (!next) {
        nextMsg.innerHTML = 'All foes have fallen...';
    } else if (nextResult.wrapped) {
        nextMsg.innerHTML = `End of round ${round} — <strong>${esc(next.name)}</strong> opens the next!`;
    } else {
        nextMsg.innerHTML = randomFlavor(esc(next.name));
    }

    const orderList = document.getElementById('order-list');
    orderList.innerHTML = combatants.map((c, i) =>
        renderOrderRow(c, i, next, nextResult)
    ).join('');

    const turnKey = `${round}-${currentIdx}`;
    if (turnKey !== lastScrolledTurnKey) {
        lastScrolledTurnKey = turnKey;
        const activeEl = orderList.querySelector('.order-item.active');
        if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function renderOrderRow(c, i, next, nextResult) {
    let stateCls = '';
    if (c.dead)                stateCls = 'dead';
    else if (i === currentIdx) stateCls = 'active';
    else if (i < currentIdx)   stateCls = 'spent';

    const isActive = (i === currentIdx);
    const isNext   = next && !isActive && combatants[nextResult.idx] === c;

    const skullBtn = (c.type === 'monster' || c.type === 'npc')
        ? `<button class="skull-btn ${c.dead ? 'is-dead' : ''}" onclick="toggleDead('${c.id}')" aria-label="${c.dead ? 'Revive' : 'Mark as dead'}">☠</button>`
        : '';
    const pip = isActive
        ? '<span class="active-pip">▶ ACTIVE</span>'
        : (isNext ? '<span class="next-pip">NEXT</span>' : '');

    const sameInitAbove = i > 0 && combatants[i-1].initiative === c.initiative;
    const sameInitBelow = i < combatants.length - 1 && combatants[i+1].initiative === c.initiative;

    const hpInline = settings.trackHp ? renderHpInline(c) : '';
    const conditionsInline = renderConditionsInline(c);
    const isExpanded = expanded.has(c.id);
    const drawer = isExpanded ? renderDrawer(c, sameInitAbove, sameInitBelow) : '';

    return `
        <div class="order-item ${stateCls} ${isExpanded ? 'expanded' : ''}">
            <div class="oi-main">
                <span class="o-pos">${i + 1}.</span>
                <span class="o-init">${c.initiative}</span>
                <span class="o-name editable" onclick="startEditName('${c.id}', this)">${esc(c.name)}</span>
                <span class="type-badge ${c.type}">${c.type}</span>
                ${hpInline}
                ${skullBtn}
                ${pip}
                <button class="expand-btn ${isExpanded ? 'active' : ''}" onclick="toggleExpand('${c.id}')" aria-label="More options" aria-expanded="${isExpanded}">⋯</button>
            </div>
            ${conditionsInline}
            ${drawer}
        </div>
    `;
}

function renderHpInline(c) {
    if (c.maxHp == null) {
        return `<button class="hp-set-btn" onclick="expandFor('${c.id}')">+ HP</button>`;
    }
    const hp = c.hp ?? c.maxHp;
    const pct = c.maxHp > 0 ? Math.max(0, Math.min(100, (hp / c.maxHp) * 100)) : 0;
    let hpCls = 'hp-ok';
    if (hp <= 0) hpCls = 'hp-crit';
    else if (pct <= 25) hpCls = 'hp-crit';
    else if (pct <= 50) hpCls = 'hp-low';
    return `
        <span class="o-hp ${hpCls}" onclick="expandFor('${c.id}')" role="button" aria-label="HP ${hp} of ${c.maxHp}">
            <span class="hp-num">${hp}<span class="hp-sep">/</span>${c.maxHp}</span>
            <span class="hp-bar"><span class="hp-bar-fill" style="width:${pct}%"></span></span>
        </span>
    `;
}

function renderConditionsInline(c) {
    if (!c.conditions.length) return '';
    return `
        <div class="oi-conditions">
            ${c.conditions.map(k => {
                const cond = CONDITION_MAP[k];
                if (!cond) return '';
                const icon = cond.icon ? cond.icon + ' ' : '';
                return `<button class="cond-pill active" onclick="toggleCondition('${c.id}', '${k}')" aria-label="Remove ${cond.label}">${icon}${cond.label} <span class="cond-x">✕</span></button>`;
            }).join('')}
        </div>
    `;
}

function renderDrawer(c, sameInitAbove, sameInitBelow) {
    const hpSection = settings.trackHp ? `
        <div class="drawer-section">
            <span class="drawer-label">HP</span>
            <div class="hp-controls">
                <label class="mini-label">Max</label>
                <input type="number" class="hp-max-input" value="${c.maxHp != null ? c.maxHp : ''}" placeholder="—" inputmode="numeric" min="1"
                       onchange="setMaxHpFromInput('${c.id}', this)"
                       onkeydown="if(event.key==='Enter'){event.preventDefault();setMaxHpFromInput('${c.id}', this);this.blur();}">
                ${c.maxHp != null ? `<label class="mini-label">Cur</label>
                <input type="number" class="hp-cur-input" value="${c.hp ?? c.maxHp}" inputmode="numeric"
                       onchange="setCurrentHp('${c.id}', this)"
                       onkeydown="if(event.key==='Enter'){event.preventDefault();setCurrentHp('${c.id}', this);this.blur();}">` : ''}
            </div>
            <div class="hp-controls">
                <button class="hp-btn dmg" onclick="applyHp('${c.id}', this.parentElement.querySelector('.dmg-amount'), 'damage')">− Damage</button>
                <input type="number" class="dmg-amount" placeholder="amount" inputmode="numeric" min="1"
                       onkeydown="if(event.key==='Enter'){event.preventDefault();applyHp('${c.id}', this, 'damage');}">
                <button class="hp-btn heal" onclick="applyHp('${c.id}', this.parentElement.querySelector('.dmg-amount'), 'heal')">+ Heal</button>
            </div>
        </div>
    ` : '';

    const condSection = `
        <div class="drawer-section">
            <span class="drawer-label">Conditions</span>
            <div class="cond-picker">
                ${CONDITIONS.map(cond => {
                    const on = c.conditions.includes(cond.key);
                    const icon = cond.icon ? cond.icon + ' ' : '';
                    return `<button class="cond-pill ${on ? 'active' : ''}" onclick="toggleCondition('${c.id}', '${cond.key}')">${icon}${cond.label}</button>`;
                }).join('')}
            </div>
        </div>
    `;

    const reorderSection = `
        <div class="drawer-section reorder-section">
            <span class="drawer-label">Order</span>
            <button class="reorder-btn wide" tabindex="-1" onclick="moveCombatant('${c.id}', -1)" ${!sameInitAbove ? 'disabled' : ''}>▲ Up</button>
            <button class="reorder-btn wide" tabindex="-1" onclick="moveCombatant('${c.id}', 1)" ${!sameInitBelow ? 'disabled' : ''}>▼ Down</button>
            ${(!sameInitAbove && !sameInitBelow) ? '<span class="drawer-hint">Only moves among same initiative.</span>' : ''}
        </div>
    `;

    return `
        <div class="oi-drawer">
            ${hpSection}
            ${condSection}
            ${reorderSection}
        </div>
    `;
}

// ── Settings: Track HP ────────────────────────────────────────────────────
function toggleTrackHp(on) {
    settings.trackHp = on;
    document.body.classList.toggle('track-hp', on);
    document.querySelectorAll('.hp-toggle').forEach(btn => {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('is-on', on);
    });
    renderList();
    renderEncounter();
}

// ── Mid-combat: Add Combatant ─────────────────────────────────────────────
function toggleMidCombat() {
    const panel = document.getElementById('mid-combat-panel');
    const btn   = document.getElementById('add-mid-btn');
    const open  = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = open ? 'block' : 'none';
    btn.classList.toggle('active', open);
    if (open) document.getElementById('mc-name').focus();
}

function submitMidCombat() {
    const nameEl = document.getElementById('mc-name');
    const initEl = document.getElementById('mc-initiative');
    const hpEl   = document.getElementById('mc-hp');
    const name   = nameEl.value.trim();
    const init   = parseInt(initEl.value, 10);
    const type   = document.querySelector('input[name="mc-type"]:checked').value;
    const rawHp  = hpEl ? hpEl.value.trim() : '';
    const hp     = rawHp ? parseInt(rawHp, 10) : null;

    let valid = true;
    if (!name) { flash(nameEl); valid = false; }
    if (isNaN(init)) { flash(initEl); valid = false; }
    if (settings.trackHp && rawHp && (isNaN(hp) || hp <= 0)) { flash(hpEl); valid = false; }
    if (!valid) return;

    const newOnes = [];
    if (type === 'monster' || type === 'npc') {
        const parsed = parseNameCount(name);
        const baseName = parsed.baseName;
        const count = parsed.count ?? (parseInt(document.getElementById('mc-monster-count').value, 10) || 1);
        for (let i = 0; i < count; i++) {
            const num = getNextMonsterNum(baseName);
            newOnes.push(makeCombatant(`${baseName} ${num}`, init, type, hp));
        }
    } else {
        newOnes.push(makeCombatant(name, init, type, hp));
    }

    const currentId = combatants[currentIdx]?.id;
    newOnes.forEach(n => combatants.push(n));
    sortCombatants();
    if (currentId) currentIdx = combatants.findIndex(c => c.id === currentId);

    initEl.value = '';
    if (hpEl) hpEl.value = '';
    initEl.focus();

    renderEncounter();
}

// ── End Encounter ─────────────────────────────────────────────────────────
function endEncounter() {
    if (!confirm('End this encounter and return to setup?')) return;
    combatants = [];
    currentIdx = 0;
    round      = 1;
    nextRank   = 1;
    lastScrolledTurnKey = '';
    expanded.clear();
    document.getElementById('mid-combat-panel').style.display = 'none';
    document.getElementById('add-mid-btn').classList.remove('active');
    showScreen('setup-screen');
    renderList();
    updateStartBtn();
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ── Warn on refresh/close if data exists ─────────────────────────────────
window.addEventListener('beforeunload', e => {
    if (combatants.length > 0) {
        e.preventDefault();
        e.returnValue = 'You have an active encounter — refreshing will lose all your data. Are you sure?';
    }
});

// ── Spacebar: next turn (encounter screen, not while typing) ─────────────
document.addEventListener('keydown', e => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) return;
    // Let buttons handle their own space-to-click
    if (active && active.tagName === 'BUTTON') return;
    const encounterScreen = document.getElementById('encounter-screen');
    if (!encounterScreen.classList.contains('active')) return;
    e.preventDefault();
    nextTurn();
});

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    ['monster-count', 'mc-monster-count'].forEach(id => {
        const sel = document.getElementById(id);
        for (let i = 1; i <= 20; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `× ${i}`;
            sel.appendChild(opt);
        }
    });

    document.querySelectorAll('input[name="type"]').forEach(r =>
        r.addEventListener('change', () => updateCountWrap('type', 'count-wrap', 'name-hint'))
    );
    document.querySelectorAll('input[name="mc-type"]').forEach(r =>
        r.addEventListener('change', () => updateCountWrap('mc-type', 'mc-count-wrap', 'mc-name-hint'))
    );

    ['name-input', 'initiative-input', 'hp-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCombatant(); } });
    });
    ['mc-name', 'mc-initiative', 'mc-hp'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitMidCombat(); } });
    });

    document.querySelectorAll('.hp-toggle').forEach(btn => {
        btn.addEventListener('click', () => toggleTrackHp(!settings.trackHp));
    });

    initMusicPlayer();
});

// ════════════════════════════════════
//  Music Player
// ════════════════════════════════════

const DEFAULT_TRACKS = {
    kamp: [
        { id: 'Anq8t-YRrjQ', title: 'Epic Music Battle — Adrian von Ziegler vs BrunuhVille' },
        { id: 'HEf_xrgmuRI', title: 'The Wolf And The Moon — BrunuhVille' },
        { id: 'sGN2MyAbmBE', title: 'The Prince of Skyguard — BrunuhVille' },
        { id: 'Vq7fQa2q1Sc', title: 'Falls Of Glory — BrunuhVille' },
        { id: '5pSnPBv8LMY', title: 'CATACLYSM — Michael Ghelfi' },
    ],
    eventyr: [
        { id: 'lI_pJSOlhWE', title: 'Adventure Awaits — Adrian von Ziegler' },
        { id: 'jg88D9IAMVA', title: 'The Force Of Nature — Adrian von Ziegler' },
        { id: 'ddZKwg63bRg', title: 'Forest Sanctum — Adrian von Ziegler' },
        { id: '8KsPfymSbdk', title: 'Medieval Tavern — Derek & Brandon Fiechter' },
        { id: 'klyXNlRQPSE', title: 'Burning Hearth Inn — Derek & Brandon Fiechter' },
        { id: '40xp5PSo45o', title: 'Night at the Inn — Derek & Brandon Fiechter' },
    ],
    spenning: [
        { id: 'B4MOVJg6WbI', title: 'Necromancy — Adrian von Ziegler' },
        { id: 'FlcVpVX29lY', title: 'Harbinger of Death — Adrian von Ziegler' },
        { id: 'qN4Gio4Felo', title: 'White-robed Guardian — Derek & Brandon Fiechter' },
        { id: 'FSD1yTF4_Kk', title: 'The Skeleton King — Derek & Brandon Fiechter' },
        { id: 'W2NAblVD70Q', title: 'Dungeon of the Dark Pyramid — Peter Crowley' },
    ],
};

const FADE_MS = 2000;
const CROSSFADE_LEAD = 2.2;

let mp = {
    tracks: null,
    theme: null,
    queue: [],
    queueIdx: 0,
    players: { A: null, B: null },
    ready: { A: false, B: false },
    activeKey: 'A',
    ytReady: false,
    playing: false,
    volume: 50,
    crossfading: false,
    pendingFadeIn: null,
    pendingCrossfade: null,
    monitor: null,
    fades: { A: null, B: null },
};

function initMusicPlayer() {
    loadMpState();
    const volEl = document.getElementById('mp-volume');
    if (volEl) {
        volEl.value = mp.volume;
        volEl.addEventListener('input', e => setMpVolume(parseInt(e.target.value, 10)));
    }
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('mp-edit-modal');
            if (modal && !modal.hidden) closeMpEdit();
        }
    });
}

function loadMpState() {
    try {
        const saved = localStorage.getItem('mp-tracks');
        mp.tracks = saved ? JSON.parse(saved) : deepCopy(DEFAULT_TRACKS);
    } catch (e) {
        mp.tracks = deepCopy(DEFAULT_TRACKS);
    }
    // Ensure all theme keys exist
    ['kamp', 'eventyr', 'spenning'].forEach(k => {
        if (!Array.isArray(mp.tracks[k])) mp.tracks[k] = [];
    });
    try {
        const v = parseInt(localStorage.getItem('mp-volume'), 10);
        if (!isNaN(v) && v >= 0 && v <= 100) mp.volume = v;
    } catch (e) {}
}

function saveMpTracks() {
    try { localStorage.setItem('mp-tracks', JSON.stringify(mp.tracks)); } catch (e) {}
}

function saveMpVolume() {
    try { localStorage.setItem('mp-volume', String(mp.volume)); } catch (e) {}
}

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

window.onYouTubeIframeAPIReady = function() {
    const mkPlayer = (elId, key) => new YT.Player(elId, {
        height: '120', width: '200',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, rel: 0, fs: 0 },
        events: {
            onReady: () => { mp.ready[key] = true; onMpReady(); },
            onStateChange: e => onMpStateChange(key, e),
            onError: e => onMpError(key, e),
        },
    });
    mp.players.A = mkPlayer('yt-player-a', 'A');
    mp.players.B = mkPlayer('yt-player-b', 'B');
    mp.ytReady = true;
};

function onMpReady() {
    if (mp.ready.A && mp.ready.B) {
        const playBtn = document.getElementById('mp-play');
        const nextBtn = document.getElementById('mp-next');
        if (playBtn) playBtn.disabled = false;
        if (nextBtn) nextBtn.disabled = false;
    }
}

function shuffleArr(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function playTheme(theme) {
    if (!mp.ytReady || !mp.ready.A || !mp.ready.B) return;
    const list = mp.tracks[theme];
    if (!list || !list.length) {
        alert('Ingen spor i denne kategorien. Klikk tannhjulet for å legge til.');
        return;
    }
    if (mp.theme === theme && mp.playing) {
        togglePlayPause();
        return;
    }
    if (mp.theme === theme && !mp.playing && mp.queue.length) {
        // Resume
        togglePlayPause();
        return;
    }
    mp.theme = theme;
    mp.queue = shuffleArr(list);
    mp.queueIdx = 0;
    mp.playing = true;
    mp.crossfading = false;
    const p = mp.players[mp.activeKey];
    try { p.unMute(); } catch (e) {}
    try { p.setVolume(mp.volume); } catch (e) {}
    mp.pendingFadeIn = null; // first track plays at full volume, no fade-in
    try { p.loadVideoById(mp.queue[0].id); } catch (e) {}
    startMonitor();
    updateMpUi();
}

function nextTrack() {
    if (!mp.theme || !mp.playing) return;
    startCrossfade(true);
}

function startCrossfade(force = false) {
    if (mp.crossfading && !force) return;
    if (!mp.queue.length) return;
    mp.crossfading = true;
    mp.queueIdx++;
    if (mp.queueIdx >= mp.queue.length) {
        mp.queue = shuffleArr(mp.tracks[mp.theme]);
        mp.queueIdx = 0;
    }
    const next = mp.queue[mp.queueIdx];
    const inactiveKey = mp.activeKey === 'A' ? 'B' : 'A';
    const inactive = mp.players[inactiveKey];
    try { inactive.setVolume(0); } catch (e) {}
    mp.pendingCrossfade = inactiveKey;
    try { inactive.loadVideoById(next.id); } catch (e) {}
}

function onMpStateChange(key, event) {
    if (event.data === YT.PlayerState.PLAYING) {
        // Defensive unmute in case autoplay policy started us muted
        try { mp.players[key].unMute(); } catch (e) {}
        if (mp.pendingCrossfade === key) {
            mp.pendingCrossfade = null;
            const outgoingKey = mp.activeKey;
            const outgoing = mp.players[outgoingKey];
            let curVol = mp.volume;
            try { curVol = outgoing.getVolume(); } catch (e) {}
            fadeVolume(outgoingKey, curVol, 0, FADE_MS, () => {
                try { outgoing.stopVideo(); } catch (e) {}
            });
            fadeVolume(key, 0, mp.volume, FADE_MS);
            mp.activeKey = key;
            mp.crossfading = false;
            updateMpTitle();
        } else if (key === mp.activeKey) {
            // First track or resume — make sure target volume is applied
            try { mp.players[key].setVolume(mp.volume); } catch (e) {}
            updateMpTitle();
        }
    } else if (event.data === YT.PlayerState.ENDED) {
        if (key === mp.activeKey && !mp.crossfading && mp.playing) {
            startCrossfade();
        }
    }
}

function onMpError(key, event) {
    if (key === mp.activeKey) {
        startCrossfade(true);
    }
}

function fadeVolume(key, from, to, duration, onDone) {
    const p = mp.players[key];
    if (!p || !p.setVolume) return;
    if (mp.fades[key]) clearInterval(mp.fades[key]);
    const steps = 30;
    const dt = duration / steps;
    let i = 0;
    try { p.setVolume(from); } catch (e) {}
    mp.fades[key] = setInterval(() => {
        i++;
        const t = i / steps;
        const v = from + (to - from) * t;
        try { p.setVolume(Math.max(0, Math.min(100, Math.round(v)))); } catch (e) {}
        if (i >= steps) {
            clearInterval(mp.fades[key]);
            mp.fades[key] = null;
            if (onDone) onDone();
        }
    }, dt);
}

function togglePlayPause() {
    if (!mp.theme || !mp.ytReady) return;
    const p = mp.players[mp.activeKey];
    if (!p) return;
    if (mp.playing) {
        mp.playing = false;
        try { p.pauseVideo(); } catch (e) {}
        if (mp.monitor) { clearInterval(mp.monitor); mp.monitor = null; }
    } else {
        mp.playing = true;
        try { p.playVideo(); } catch (e) {}
        startMonitor();
    }
    updateMpUi();
}

function startMonitor() {
    if (mp.monitor) clearInterval(mp.monitor);
    mp.monitor = setInterval(() => {
        const p = mp.players[mp.activeKey];
        if (!p || !mp.playing || mp.crossfading) return;
        try {
            const dur = p.getDuration();
            const cur = p.getCurrentTime();
            if (dur > 0 && dur - cur < CROSSFADE_LEAD) {
                startCrossfade();
            }
        } catch (e) {}
    }, 500);
}

function updateMpUi() {
    document.querySelectorAll('.mp-theme').forEach(b => {
        const isActive = b.dataset.theme === mp.theme;
        b.classList.toggle('active', isActive && mp.playing);
        b.classList.toggle('paused', isActive && !mp.playing);
    });
    const playBtn = document.getElementById('mp-play');
    if (playBtn) playBtn.textContent = mp.playing ? '⏸' : '▶';
    updateMpTitle();
}

function updateMpTitle() {
    const el = document.getElementById('mp-title');
    if (!el) return;
    const cur = mp.queue[mp.queueIdx];
    el.textContent = cur ? cur.title : '—';
}

function setMpVolume(v) {
    mp.volume = v;
    saveMpVolume();
    const activeK = mp.activeKey;
    if (mp.playing && !mp.fades[activeK]) {
        const p = mp.players[activeK];
        try { p.setVolume(v); } catch (e) {}
    }
}

// ── Edit modal ────────────────────────────────────────────────────────────
function openMpEdit() {
    const modal = document.getElementById('mp-edit-modal');
    if (!modal) return;
    ['kamp', 'eventyr', 'spenning'].forEach(k => {
        const ta = document.getElementById(`mp-edit-${k}`);
        if (!ta) return;
        ta.value = mp.tracks[k].map(t => `https://youtu.be/${t.id}  ${t.title ? '# ' + t.title : ''}`.trim()).join('\n');
    });
    modal.hidden = false;
}

function closeMpEdit() {
    const modal = document.getElementById('mp-edit-modal');
    if (modal) modal.hidden = true;
}

function resetMpTracks() {
    if (!confirm('Tilbakestille til standardsporene?')) return;
    mp.tracks = deepCopy(DEFAULT_TRACKS);
    saveMpTracks();
    openMpEdit();
}

function extractVideoId(input) {
    const s = input.trim();
    if (!s) return null;
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtube\.com\/(?:.*[?&]v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}

async function fetchYtTitle(id) {
    try {
        const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.title || null;
    } catch (e) {
        return null;
    }
}

async function saveMpEdit() {
    const btn = document.querySelector('.mp-modal .mp-btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const result = { kamp: [], eventyr: [], spenning: [] };
    for (const theme of ['kamp', 'eventyr', 'spenning']) {
        const ta = document.getElementById(`mp-edit-${theme}`);
        if (!ta) continue;
        const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
            // Support "url # title" or just url/id
            const [beforeHash, ...rest] = line.split('#');
            const manualTitle = rest.join('#').trim();
            const id = extractVideoId(beforeHash.trim());
            if (!id) continue;
            // Reuse existing title if known
            const existing = (mp.tracks[theme] || []).find(t => t.id === id);
            let title = manualTitle || (existing && existing.title) || null;
            if (!title) {
                title = await fetchYtTitle(id);
            }
            result[theme].push({ id, title: title || `Track ${id}` });
        }
    }
    mp.tracks = result;
    saveMpTracks();
    closeMpEdit();
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    // If currently playing a theme whose track list changed, refresh queue (keeps playing current track, shuffles next pool)
    if (mp.theme && mp.tracks[mp.theme].length) {
        const currentId = mp.queue[mp.queueIdx]?.id;
        mp.queue = shuffleArr(mp.tracks[mp.theme]);
        mp.queueIdx = Math.max(0, mp.queue.findIndex(t => t.id === currentId));
    }
    updateMpTitle();
}
