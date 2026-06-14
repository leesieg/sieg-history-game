# Demo2 Full Mechanism Migration Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Migrate every playable Demo2 mechanism into the modular high-fidelity version while keeping Demo2 frozen.

**Architecture:** `prototype/hifi` remains the only maintained runtime and owns one world state. Demo2 behavior is separated into data, engine and UI modules; engine modules never touch the DOM, and UI modules only dispatch engine commands through the store.

**Tech Stack:** Native HTML, CSS, JavaScript, SVG and Node.js behavior tests.

**Status:** Completed on 2026-06-14.

---

### Task 1: Freeze the complete migration contract

**Files:**
- Create: `tests/hifi-demo2-parity.test.cjs`
- Modify: `docs/plans/2026-06-13-hifi-demo2-integration-design.md`

**Steps:**
1. Add failing assertions for trade routes, tariffs, pressure meters and trade map mode.
2. Add failing assertions for laws, parliament, decisions and government transitions.
3. Add failing assertions for mobilization, mercenaries, army management and generals.
4. Add failing assertions for technology diffusion, religion, exploration and all eras.
5. Add failing assertions for AI strategy, missions, tutorial, forecast and decision echoes.
6. Run the parity test and confirm it fails because the modules do not exist.

### Task 2: Migrate trade and pressure systems

**Files:**
- Create: `prototype/hifi/scripts/data/trade.js`
- Create: `prototype/hifi/scripts/engine/trade.js`
- Modify: `prototype/hifi/scripts/engine/turn.js`
- Modify: `prototype/hifi/scripts/ui/map.js`
- Modify: `prototype/hifi/scripts/ui/drawers.js`
- Test: `tests/hifi-trade.test.cjs`

**Steps:**
1. Port Demo2 route, pool and node data.
2. Implement route cost, flow redistribution, node income, tariffs and capital accumulation.
3. Compute trade, military, fiscal, exploration, faith and ideas pressures.
4. Add trade map rendering and pressure display.
5. Verify Constantinople occupation changes route cost and Atlantic pressure.

### Task 3: Migrate domestic political depth

**Files:**
- Expand: `prototype/hifi/scripts/data/countries.js`
- Expand: `prototype/hifi/scripts/engine/politics.js`
- Modify: `prototype/hifi/scripts/ui/drawers.js`
- Test: `tests/hifi-domestic-depth.test.cjs`

**Steps:**
1. Add law categories and government-specific defaults.
2. Add parliament agendas, support calculation and concessions.
3. Add conditional decisions for assemblies, fiscal paths, religion and government transitions.
4. Record every structural choice in the decision ledger.
5. Verify locked conditions, costs and resulting government/law changes.

### Task 4: Migrate complete army management

**Files:**
- Expand: `prototype/hifi/scripts/engine/warfare.js`
- Expand: `prototype/hifi/scripts/ui/dialogs.js`
- Modify: `prototype/hifi/scripts/ui/drawers.js`
- Test: `tests/hifi-army-management.test.cjs`

**Steps:**
1. Add mobilization and POP source tracking.
2. Add mercenary contracts, wages and loyalty.
3. Add split, merge, reinforce, train and demobilize commands.
4. Add ruler generals and assignment rules.
5. Expose every command in the independent army drawer.

### Task 5: Migrate historical progression and AI

**Files:**
- Expand: `prototype/hifi/scripts/data/rules.js`
- Expand: `prototype/hifi/scripts/engine/history.js`
- Create: `prototype/hifi/scripts/engine/strategy.js`
- Modify: `prototype/hifi/scripts/engine/turn.js`
- Modify: `prototype/hifi/scripts/ui/dialogs.js`
- Test: `tests/hifi-progression.test.cjs`

**Steps:**
1. Add feudal, discovery, faith, absolutism, revolution and industrial eras.
2. Add technology awareness, diffusion and adoption conditions.
3. Add Reformation, conversion, exploration and industrial milestones.
4. Add country missions, tutorial tasks, quarterly forecast and decision echoes.
5. Add pressure-driven AI choices for trade, technology, diplomacy, politics and war.

### Task 6: Complete high-fidelity UI command coverage

**Files:**
- Modify: `prototype/hifi/index.html`
- Modify: `prototype/hifi/scripts/main.js`
- Modify: `prototype/hifi/scripts/ui/drawers.js`
- Modify: `prototype/hifi/scripts/ui/dialogs.js`
- Modify: `prototype/hifi/styles/components.css`
- Test: `tests/hifi-ui-smoke.test.cjs`

**Steps:**
1. Replace every navigation-only command with an executable contextual action or a focused action chooser.
2. Add political, terrain, population, goods, trade, religion, dynasty, government, estates and military map modes.
3. Add forecast and trend values to the HUD and quarterly confirmation.
4. Keep all panels mutually exclusive and scrollable on landscape mobile.

### Task 7: Full acceptance

**Files:**
- Modify: `README.md`
- Modify: `tests/hifi-demo2-parity.test.cjs`

**Steps:**
1. Run every repository test.
2. Run long simulations through industrialization.
3. Verify Demo2 SHA-1 remains `7a3fc0692ae10cca4dad440e6ffd82d7031ddfed`.
4. Verify desktop and landscape-mobile UI behavior.
5. Commit each completed mechanism layer and push `main`.
