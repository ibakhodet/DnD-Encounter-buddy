// ════════════════════════════════════
//  D&D Encounter Tracker
// ════════════════════════════════════

let combatants = [];   // { id, name, initiative, type, dead }
let currentIdx = 0;
let round      = 1;

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
    el.classList.add('error');
    setTimeout(() => el.classList.remove('error'), 900);
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns the next available number for a monster base name
function getNextMonsterNum(baseName) {
    const re = new RegExp(`^${escapeRegex(baseName)}\\s+(\\d+)$`, 'i');
    let max = 0;
    combatants.forEach(c => {
        const m = c.name.match(re);
        if (m) max = Math.max(max, parseInt(m[1]));
    });
    return max + 1;
}

// Returns { idx, wrapped } for next alive combatant after fromIdx, or null if all dead
function getNextAliveIdx(fromIdx) {
    const total = combatants.length;
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

// Show/hide count wrap and hint when type changes
function updateCountWrap(radioName, wrapId, hintId) {
    const type = document.querySelector(`input[name="${radioName}"]:checked`).value;
    const show = type === 'monster' || type === 'npc';
    document.getElementById(wrapId).style.display = show ? 'flex' : 'none';
    document.getElementById(hintId).style.display = show ? 'block' : 'none';
}

// Parse "Goblin x5" → { baseName: "Goblin", count: 5 }
function parseNameCount(raw) {
    const match = raw.match(/^(.+?)\s+x(\d+)$/i);
    if (match) return { baseName: match[1].trim(), count: Math.min(parseInt(match[2]), 20) };
    return { baseName: raw, count: null };
}

// ── Setup: Add Combatant ────────────────────────────────────────────────────
function addCombatant() {
    const nameEl = document.getElementById('name-input');
    const initEl = document.getElementById('initiative-input');
    const name   = nameEl.value.trim();
    const init   = parseInt(initEl.value, 10);
    const type   = document.querySelector('input[name="type"]:checked').value;

    let valid = true;
    if (!name) { flash(nameEl); valid = false; }
    if (isNaN(init)) { flash(initEl); valid = false; }
    if (!valid) return;

    if (type === 'monster' || type === 'npc') {
        const parsed = parseNameCount(name);
        const baseName = parsed.baseName;
        const count = parsed.count ?? (parseInt(document.getElementById('monster-count').value, 10) || 1);
        for (let i = 0; i < count; i++) {
            const num = getNextMonsterNum(baseName);
            combatants.push({ id: Date.now() + i, name: `${baseName} ${num}`, initiative: init, type, dead: false });
        }
    } else {
        combatants.push({ id: Date.now(), name, initiative: init, type, dead: false });
    }

    combatants.sort((a, b) => b.initiative - a.initiative);

    // Keep name in field — clear only initiative so the user can add more of the same
    initEl.value = '';
    initEl.focus();

    renderList();
    updateStartBtn();
}

function removeCombatant(id) {
    combatants = combatants.filter(c => c.id !== id);
    renderList();
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
    container.innerHTML = combatants.map(c => `
        <div class="combatant-item">
            <span class="c-init">${c.initiative}</span>
            <span class="c-name">${esc(c.name)}</span>
            <span class="type-badge ${c.type}">${c.type}</span>
            <button class="remove-btn" onclick="removeCombatant(${c.id})" title="Remove">✕</button>
        </div>
    `).join('');
}

function updateStartBtn() {
    document.getElementById('start-btn').disabled = combatants.length < 2;
}

// ── Encounter ──────────────────────────────────────────────────────────────
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
    renderEncounter();
}

function toggleDead(id) {
    const c = combatants.find(c => c.id === id);
    if (!c) return;
    c.dead = !c.dead;

    // If the active combatant was just killed, auto-advance
    if (c.dead && combatants[currentIdx].id === id) {
        const result = getNextAliveIdx(currentIdx);
        if (result) {
            if (result.wrapped) round++;
            currentIdx = result.idx;
        }
    }
    renderEncounter();
}

function renderEncounter() {
    document.getElementById('round-number').textContent = round;

    const current    = combatants[currentIdx];
    const nextResult = getNextAliveIdx(currentIdx);
    const next       = nextResult ? combatants[nextResult.idx] : null;

    // Current card
    document.getElementById('current-name').textContent       = current.name;
    document.getElementById('current-initiative').textContent = current.initiative;
    const typeBadge = document.getElementById('current-type');
    typeBadge.textContent = current.type.toUpperCase();
    typeBadge.className   = `current-type-badge ${current.type}`;

    // Re-trigger fade-in animation
    const card = document.querySelector('.current-card');
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';

    // Next banner
    const nextMsg = document.getElementById('next-message');
    if (!next) {
        nextMsg.innerHTML = 'All foes have fallen...';
    } else if (nextResult.wrapped) {
        nextMsg.innerHTML = `End of round ${round} — <strong>${esc(next.name)}</strong> opens the next!`;
    } else {
        nextMsg.innerHTML = randomFlavor(esc(next.name));
    }

    // Order list
    const orderList = document.getElementById('order-list');
    orderList.innerHTML = combatants.map((c, i) => {
        let cls = '';
        if (c.dead)          cls = 'dead';
        else if (i === currentIdx) cls = 'active';
        else if (i < currentIdx)   cls = 'spent';

        const isActive = (i === currentIdx);
        const isNext   = next && !isActive && combatants[nextResult.idx] === c;

        const skullBtn = (c.type === 'monster' || c.type === 'npc')
            ? `<button class="skull-btn ${c.dead ? 'is-dead' : ''}" onclick="toggleDead(${c.id})" title="${c.dead ? 'Revive' : 'Mark as dead'}">☠</button>`
            : '';
        const pip = isActive
            ? '<span class="active-pip">▶ ACTIVE</span>'
            : (isNext ? '<span class="next-pip">NEXT</span>' : '');

        return `
            <div class="order-item ${cls}">
                <span class="o-pos">${i + 1}.</span>
                <span class="o-init">${c.initiative}</span>
                <span class="o-name">${esc(c.name)}</span>
                <span class="type-badge ${c.type}">${c.type}</span>
                ${skullBtn}
                ${pip}
            </div>
        `;
    }).join('');

    const activeEl = orderList.querySelector('.order-item.active');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Mid-combat: Add Combatant ──────────────────────────────────────────────
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
    const name   = nameEl.value.trim();
    const init   = parseInt(initEl.value, 10);
    const type   = document.querySelector('input[name="mc-type"]:checked').value;

    let valid = true;
    if (!name) { flash(nameEl); valid = false; }
    if (isNaN(init)) { flash(initEl); valid = false; }
    if (!valid) return;

    const newOnes = [];
    if (type === 'monster' || type === 'npc') {
        const parsed = parseNameCount(name);
        const baseName = parsed.baseName;
        const count = parsed.count ?? (parseInt(document.getElementById('mc-monster-count').value, 10) || 1);
        for (let i = 0; i < count; i++) {
            const num = getNextMonsterNum(baseName);
            newOnes.push({ id: Date.now() + i, name: `${baseName} ${num}`, initiative: init, type, dead: false });
        }
    } else {
        newOnes.push({ id: Date.now(), name, initiative: init, type, dead: false });
    }

    for (const newcomer of newOnes) {
        let pos = combatants.findIndex(c => c.initiative < newcomer.initiative);
        if (pos === -1) pos = combatants.length;
        combatants.splice(pos, 0, newcomer);
        if (pos <= currentIdx) currentIdx++;
    }

    // Keep name, clear initiative
    initEl.value = '';
    initEl.focus();

    renderEncounter();
}

// ── End Encounter ──────────────────────────────────────────────────────────
function endEncounter() {
    if (!confirm('End this encounter and return to setup?')) return;
    combatants = [];
    currentIdx = 0;
    round      = 1;
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

// ── Warn on refresh/close if data exists ──────────────────────────────────
window.addEventListener('beforeunload', e => {
    if (combatants.length > 0) {
        e.preventDefault();
        // Most browsers show their own generic message; this text is a fallback
        e.returnValue = 'You have an active encounter — refreshing will lose all your data. Are you sure?';
    }
});

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Populate count dropdowns
    ['monster-count', 'mc-monster-count'].forEach(id => {
        const sel = document.getElementById(id);
        for (let i = 1; i <= 20; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `× ${i}`;
            sel.appendChild(opt);
        }
    });

    // Show/hide count wrap on type change
    document.querySelectorAll('input[name="type"]').forEach(r =>
        r.addEventListener('change', () => updateCountWrap('type', 'count-wrap', 'name-hint'))
    );
    document.querySelectorAll('input[name="mc-type"]').forEach(r =>
        r.addEventListener('change', () => updateCountWrap('mc-type', 'mc-count-wrap', 'mc-name-hint'))
    );

    // Enter key to submit
    ['name-input', 'initiative-input'].forEach(id =>
        document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') addCombatant(); })
    );
    ['mc-name', 'mc-initiative'].forEach(id =>
        document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') submitMidCombat(); })
    );
});
