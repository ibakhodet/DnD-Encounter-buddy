// ════════════════════════════════════
//  D&D Encounter Tracker
// ════════════════════════════════════

let combatants  = [];   // { id, name, initiative, type }
let currentIdx  = 0;
let round       = 1;

// ── Flavor texts for the "next up" banner ──────────────────────────────────
const FLAVOR = [
    (name) => `<strong>${name}</strong> is next — prepare your actions!`,
    (name) => `The fates turn to <strong>${name}</strong>. Steel yourself!`,
    (name) => `<strong>${name}</strong> readies for battle!`,
    (name) => `<strong>${name}</strong> steps forth from the shadows...`,
    (name) => `Destiny calls upon <strong>${name}</strong>!`,
    (name) => `The dice roll for <strong>${name}</strong> — act wisely.`,
];

function randomFlavor(name) {
    return FLAVOR[Math.floor(Math.random() * FLAVOR.length)](name);
}

// ── Add Combatant ──────────────────────────────────────────────────────────
function addCombatant() {
    const nameEl = document.getElementById('name-input');
    const initEl = document.getElementById('initiative-input');
    const name   = nameEl.value.trim();
    const init   = parseInt(initEl.value, 10);
    const type   = document.querySelector('input[name="type"]:checked').value;

    // Validation
    let valid = true;
    if (!name) { flash(nameEl); valid = false; }
    if (isNaN(init)) { flash(initEl); valid = false; }
    if (!valid) return;

    combatants.push({ id: Date.now(), name, initiative: init, type });
    combatants.sort((a, b) => b.initiative - a.initiative);

    nameEl.value = '';
    initEl.value = '';
    nameEl.focus();

    renderList();
    updateStartBtn();
}

function flash(el) {
    el.classList.add('error');
    setTimeout(() => el.classList.remove('error'), 900);
}

// ── Remove Combatant ───────────────────────────────────────────────────────
function removeCombatant(id) {
    combatants = combatants.filter(c => c.id !== id);
    renderList();
    updateStartBtn();
}

// ── Render Setup List ──────────────────────────────────────────────────────
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

// ── Start Encounter ────────────────────────────────────────────────────────
function startEncounter() {
    if (combatants.length < 2) return;
    currentIdx = 0;
    round      = 1;
    showScreen('encounter-screen');
    renderEncounter();
}

// ── Next Turn ──────────────────────────────────────────────────────────────
function nextTurn() {
    currentIdx++;
    if (currentIdx >= combatants.length) {
        currentIdx = 0;
        round++;
    }
    renderEncounter();
}

// ── Render Encounter ───────────────────────────────────────────────────────
function renderEncounter() {
    const current = combatants[currentIdx];
    const nextIdx = (currentIdx + 1) % combatants.length;
    const next    = combatants[nextIdx];

    // Round counter
    document.getElementById('round-number').textContent = round;

    // Current turn card
    document.getElementById('current-name').textContent       = current.name;
    document.getElementById('current-initiative').textContent = current.initiative;

    const typeBadge = document.getElementById('current-type');
    typeBadge.textContent = current.type.toUpperCase();
    typeBadge.className   = `current-type-badge ${current.type}`;

    // Trigger re-animation on the card
    const card = document.querySelector('.current-card');
    card.style.animation = 'none';
    void card.offsetWidth; // reflow
    card.style.animation = '';

    // Next-up banner
    const nextMsg = document.getElementById('next-message');
    if (nextIdx === 0 && currentIdx !== 0) {
        // Last person in round — next is start of new round
        nextMsg.innerHTML = `End of round ${round} — <strong>${esc(next.name)}</strong> opens the next!`;
    } else {
        nextMsg.innerHTML = randomFlavor(esc(next.name));
    }

    // Order list
    const orderList = document.getElementById('order-list');
    orderList.innerHTML = combatants.map((c, i) => {
        let cls = '';
        if      (i === currentIdx) cls = 'active';
        else if (i < currentIdx)   cls = 'spent';

        const pip = i === currentIdx
            ? '<span class="active-pip">▶ ACTIVE</span>'
            : (i === nextIdx ? '<span class="next-pip">NEXT</span>' : '');

        return `
            <div class="order-item ${cls}">
                <span class="o-pos">${i + 1}.</span>
                <span class="o-init">${c.initiative}</span>
                <span class="o-name">${esc(c.name)}</span>
                <span class="type-badge ${c.type}">${c.type}</span>
                ${pip}
            </div>
        `;
    }).join('');

    // Scroll active item into view
    const activeEl = orderList.querySelector('.order-item.active');
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── End Encounter ──────────────────────────────────────────────────────────
function endEncounter() {
    if (!confirm('End this encounter and return to setup?')) return;
    combatants = [];
    currentIdx = 0;
    round      = 1;
    showScreen('setup-screen');
    renderList();
    updateStartBtn();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ── Keyboard: Enter to add ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    ['name-input', 'initiative-input'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') addCombatant();
        });
    });
});
