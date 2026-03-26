/**
 * engine/component_defaults.js
 *
 * Unified COMPONENT_DEFAULTS table for LTSpice Window text placement.
 *
 * Rules for orientation resolution (applied in pdf_renderer.js):
 *   1. Exact key match (e.g. M90) — use it as-is.
 *   2. Rotation-equivalent (M90 → R90) — use it as-is, then apply mirror transform.
 *   3. R0 — fall back, apply full rotate+mirror transform.
 *
 * Components with only R0 defined (e, g, npn, …) are treated as "formula" components:
 *   all orientations are derived by rotating R0 through transformOffset / transformAlignment.
 *
 * Components with R0…R270 defined have M orientations derived from the matching Rxx entry.
 *
 * Components with all 8 keys explicitly defined use exact values with no derivation.
 *
 * To populate / tune values, use the Window Tuner dev tool at:
 *   http://127.0.0.1:8000/web/dev_window_tuner.html
 */

const COMPONENT_DEFAULTS = {

    // ── Passive Components ──────────────────────────────────────────────
    res: {
        R0: { 0: { ox: 36, oy: 40, align: 'Left' }, 3: { ox: 36, oy: 76, align: 'Left' } },
        R90: { 0: { ox: -2, oy: 56, align: 'VBottom' }, 3: { ox: 32, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: 36, oy: 71, align: 'Left' }, 3: { ox: 36, oy: 37, align: 'Left' } },
        R270: { 0: { ox: 34, oy: 56, align: 'VTop' }, 3: { ox: 0, oy: 56, align: 'VBottom' } },
    },

    cap: {
        R0: { 0: { ox: 33, oy: 5, align: 'Left' }, 3: { ox: 33, oy: 59, align: 'Left' } },
        R90: { 0: { ox: -14, oy: 32, align: 'VBottom' }, 3: { ox: 42, oy: 32, align: 'VTop' } },
        R180: { 0: { ox: 33, oy: 56, align: 'Left' }, 3: { ox: 33, oy: 6, align: 'Left' } },
        R270: { 0: { ox: 45, oy: 32, align: 'VTop' }, 3: { ox: -10, oy: 32, align: 'VBottom' } },
    },

    ind: {
        R0: { 0: { ox: -2, oy: 40, align: 'Right' }, 3: { ox: -2, oy: 72, align: 'Right' } },
        R90: { 0: { ox: -2, oy: 56, align: 'VBottom' }, 3: { ox: 37, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: -2, oy: 72, align: 'Right' }, 3: { ox: -2, oy: 40, align: 'Right' } },
        R270: { 0: { ox: 38, oy: 56, align: 'VTop' }, 3: { ox: 1, oy: 56, align: 'VBottom' } },
    },

    // ── Diodes ─────────────────────────────────────────────────────────
    diode: {
        R0: { 0: { ox: 32, oy: 0, align: 'Left' }, 3: { ox: 32, oy: 64, align: 'Left' } },
        R90: { 0: { ox: -10, oy: 32, align: 'VBottom' }, 3: { ox: 39, oy: 32, align: 'VTop' } },
        R180: { 0: { ox: 32, oy: 64, align: 'Left' }, 3: { ox: 32, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 41, oy: 32, align: 'VTop' }, 3: { ox: -8, oy: 32, align: 'VBottom' } },
    },

    zener: {
        R0: { 0: { ox: 32, oy: 0, align: 'Left' }, 3: { ox: 32, oy: 64, align: 'Left' } },
        R90: { 0: { ox: -10, oy: 32, align: 'VBottom' }, 3: { ox: 39, oy: 32, align: 'VTop' } },
        R180: { 0: { ox: 32, oy: 64, align: 'Left' }, 3: { ox: 32, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 41, oy: 32, align: 'VTop' }, 3: { ox: -8, oy: 32, align: 'VBottom' } },
    },

    // ── Sources ─────────────────────────────────────────────────────────
    voltage: {
        R0: { 0: { ox: 24, oy: 16, align: 'Left' }, 3: { ox: 24, oy: 96, align: 'Left' } },
        R90: { 0: { ox: -32, oy: 56, align: 'VBottom' }, 3: { ox: 32, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: 24, oy: 96, align: 'Left' }, 3: { ox: 24, oy: 16, align: 'Left' } },
        R270: { 0: { ox: 32, oy: 56, align: 'VTop' }, 3: { ox: -32, oy: 56, align: 'VBottom' } },
    },

    current: {
        R0: { 0: { ox: 26, oy: 0, align: 'Left' }, 3: { ox: 26, oy: 80, align: 'Left' } },
        R90: { 0: { ox: -30, oy: 40, align: 'VBottom' }, 3: { ox: 34, oy: 40, align: 'VTop' } },
        R180: { 0: { ox: 26, oy: 80, align: 'Left' }, 3: { ox: 26, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 34, oy: 40, align: 'VTop' }, 3: { ox: -30, oy: 40, align: 'VBottom' } },
    },

    signal: {
        R0: { 0: { ox: 24, oy: 16, align: 'Left' }, 3: { ox: 24, oy: 104, align: 'Left' } },
        R90: { 0: { ox: -32, oy: 56, align: 'VBottom' }, 3: { ox: 32, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: 24, oy: 104, align: 'Left' }, 3: { ox: 24, oy: 16, align: 'Left' } },
        R270: { 0: { ox: 32, oy: 56, align: 'VTop' }, 3: { ox: -32, oy: 56, align: 'VBottom' } },
    },

    // ── Dependent Sources (R0 only → all orientations are derived) ──────
    e: {
        R0: { 0: { ox: 26, oy: 16, align: 'Left' }, 3: { ox: 26, oy: 96, align: 'Left' } },
    },
    e2: {
        R0: { 0: { ox: 26, oy: 16, align: 'Left' }, 3: { ox: 26, oy: 96, align: 'Left' } },
    },
    g: {
        R0: { 0: { ox: 26, oy: 16, align: 'Left' }, 3: { ox: 26, oy: 96, align: 'Left' } },
    },
    g2: {
        R0: { 0: { ox: 26, oy: 16, align: 'Left' }, 3: { ox: 26, oy: 96, align: 'Left' } },
    },

    // ── Transistors (R0 only → all orientations derived) ────────────────
    npn: {
        R0: { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 68, align: 'Left' } },
    },
    pnp: {
        R0: { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 68, align: 'Left' } },
    },
    njf: {
        R0: { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 72, align: 'Left' } },
    },
    pjf: {
        R0: { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 72, align: 'Left' } },
    },
    nmos: {
        R0: { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 72, align: 'Left' } },
    },
    pmos: {
        R0: { 0: { ox: 58, oy: 32, align: 'Left' }, 3: { ox: 58, oy: 72, align: 'Left' } },
    },

}; // end COMPONENT_DEFAULTS
