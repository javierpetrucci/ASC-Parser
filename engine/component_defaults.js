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
        R90: { 0: { ox: 2, oy: 56, align: 'VBottom' }, 3: { ox: 29, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: 36, oy: 71, align: 'Left' }, 3: { ox: 36, oy: 37, align: 'Left' } },
        R270: { 0: { ox: 30, oy: 56, align: 'VTop' }, 3: { ox: 3, oy: 56, align: 'VBottom' } },
    },

    res2: {
        R0: { 0: { ox: 36, oy: 40, align: 'Left' }, 3: { ox: 36, oy: 76, align: 'Left' } },
        R90: { 0: { ox: 2, oy: 56, align: 'VBottom' }, 3: { ox: 29, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: 36, oy: 71, align: 'Left' }, 3: { ox: 36, oy: 37, align: 'Left' } },
        R270: { 0: { ox: 30, oy: 56, align: 'VTop' }, 3: { ox: 3, oy: 56, align: 'VBottom' } },
    },

    res_spring: {
        R0: { 0: { ox: 36, oy: 40, align: 'Left' }, 3: { ox: 36, oy: 76, align: 'Left' } },
        R90: { 0: { ox: 2, oy: 56, align: 'VBottom' }, 3: { ox: 29, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: 36, oy: 71, align: 'Left' }, 3: { ox: 36, oy: 37, align: 'Left' } },
        R270: { 0: { ox: 30, oy: 56, align: 'VTop' }, 3: { ox: 3, oy: 56, align: 'VBottom' } },
    },

    res_45: {
        R0: { 0: { ox: 63, oy: 0, align: 'Left' }, 3: { ox: 63, oy: 25, align: 'Left' } },
        R90: { 0: { ox: 63, oy: 25, align: 'VLeft' }, 3: { ox: 88, oy: 25, align: 'VLeft' } },
        R180: { 0: { ox: 63, oy: 25, align: 'Left' }, 3: { ox: 63, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 88, oy: 25, align: 'VLeft' }, 3: { ox: 63, oy: 25, align: 'VLeft' } },
    },

    res_45_spring: {
        R0: { 0: { ox: 63, oy: 0, align: 'Left' }, 3: { ox: 63, oy: 25, align: 'Left' } },
        R90: { 0: { ox: 63, oy: 25, align: 'VLeft' }, 3: { ox: 88, oy: 25, align: 'VLeft' } },
        R180: { 0: { ox: 63, oy: 25, align: 'Left' }, 3: { ox: 63, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 88, oy: 25, align: 'VLeft' }, 3: { ox: 63, oy: 25, align: 'VLeft' } },
    },

    res_60: {
        R0: { 0: { ox: 73, oy: 30, align: 'Left' }, 3: { ox: 73, oy: 56, align: 'Left' } },
        R90: { 0: { ox: 63, oy: 39, align: 'VLeft' }, 3: { ox: 88, oy: 39, align: 'VLeft' } },
        R180: { 0: { ox: 73, oy: 56, align: 'Left' }, 3: { ox: 73, oy: 30, align: 'Left' } },
        R270: { 0: { ox: 88, oy: 39, align: 'VLeft' }, 3: { ox: 63, oy: 39, align: 'VLeft' } },
    },

    res_60_spring: {
        R0: { 0: { ox: 73, oy: 30, align: 'Left' }, 3: { ox: 73, oy: 56, align: 'Left' } },
        R90: { 0: { ox: 63, oy: 39, align: 'VLeft' }, 3: { ox: 88, oy: 39, align: 'VLeft' } },
        R180: { 0: { ox: 73, oy: 56, align: 'Left' }, 3: { ox: 73, oy: 30, align: 'Left' } },
        R270: { 0: { ox: 88, oy: 39, align: 'VLeft' }, 3: { ox: 63, oy: 39, align: 'VLeft' } },
    },

    res_pipe: {
        R0: { 0: { ox: 0, oy: 0, align: 'Right' }, 3: { ox: 0, oy: 25, align: 'Right' } },
        R90: { 0: { ox: 0, oy: 0, align: 'VLeft' }, 3: { ox: 25, oy: 0, align: 'VLeft' } },
        R180: { 0: { ox: 0, oy: 25, align: 'Right' }, 3: { ox: 0, oy: 0, align: 'Right' } },
        R270: { 0: { ox: 25, oy: 0, align: 'VLeft' }, 3: { ox: 0, oy: 0, align: 'VLeft' } },
    },

    res_rec: {
        R0: { 0: { ox: 36, oy: 40, align: 'Left' }, 3: { ox: 36, oy: 76, align: 'Left' } },
        R90: { 0: { ox: 2, oy: 56, align: 'VBottom' }, 3: { ox: 29, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: 36, oy: 71, align: 'Left' }, 3: { ox: 36, oy: 37, align: 'Left' } },
        R270: { 0: { ox: 30, oy: 56, align: 'VTop' }, 3: { ox: 3, oy: 56, align: 'VBottom' } },
    },

    cap: {
        R0: { 0: { ox: 33, oy: 5, align: 'Left' }, 3: { ox: 33, oy: 59, align: 'Left' } },
        R90: { 0: { ox: -11, oy: 32, align: 'VBottom' }, 3: { ox: 40, oy: 32, align: 'VTop' } },
        R180: { 0: { ox: 33, oy: 56, align: 'Left' }, 3: { ox: 33, oy: 6, align: 'Left' } },
        R270: { 0: { ox: 43, oy: 32, align: 'VTop' }, 3: { ox: -8, oy: 32, align: 'VBottom' } },
    },

    ind: {
        R0: { 0: { ox: -2, oy: 40, align: 'Right' }, 3: { ox: -2, oy: 72, align: 'Right' } },
        R90: { 0: { ox: -2, oy: 56, align: 'VBottom' }, 3: { ox: 37, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: -2, oy: 72, align: 'Right' }, 3: { ox: -2, oy: 40, align: 'Right' } },
        R270: { 0: { ox: 38, oy: 56, align: 'VTop' }, 3: { ox: 1, oy: 56, align: 'VBottom' } },
    },

    ind2: {
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

    diode_45: {
        R0: { 0: { ox: 43, oy: 49, align: 'Left' }, 3: { ox: 43, oy: 72, align: 'Left' } },
        R90: { 0: { ox: 43, oy: 49, align: 'VRight' }, 3: { ox: 66, oy: 49, align: 'VRight' } },
        R180: { 0: { ox: 43, oy: 49, align: 'Left' }, 3: { ox: 43, oy: 72, align: 'Left' } },
        R270: { 0: { ox: 43, oy: 49, align: 'VRight' }, 3: { ox: 66, oy: 49, align: 'VRight' } },
    },
    schottky: {
        R0: { 0: { ox: 32, oy: 0, align: 'Left' }, 3: { ox: 32, oy: 64, align: 'Left' } },
        R90: { 0: { ox: -10, oy: 32, align: 'VBottom' }, 3: { ox: 39, oy: 32, align: 'VTop' } },
        R180: { 0: { ox: 32, oy: 64, align: 'Left' }, 3: { ox: 32, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 41, oy: 32, align: 'VTop' }, 3: { ox: -8, oy: 32, align: 'VBottom' } },
    },

    // ── Sources ─────────────────────────────────────────────────────────
    voltage: {
        R0: { 0: { ox: 24, oy: 16, align: 'Left' }, 3: { ox: 24, oy: 96, align: 'Left' } },
        R90: { 0: { ox: -32, oy: 56, align: 'VBottom' }, 3: { ox: 30, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: 24, oy: 96, align: 'Left' }, 3: { ox: 24, oy: 16, align: 'Left' } },
        R270: { 0: { ox: 32, oy: 56, align: 'VTop' }, 3: { ox: -30, oy: 56, align: 'VBottom' } },
    },

    voltage2: {
        R0: { 0: { ox: 24, oy: 16, align: 'Left' }, 3: { ox: 24, oy: 96, align: 'Left' } },
        R90: { 0: { ox: -32, oy: 56, align: 'VBottom' }, 3: { ox: 30, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: 24, oy: 96, align: 'Left' }, 3: { ox: 24, oy: 16, align: 'Left' } },
        R270: { 0: { ox: 32, oy: 56, align: 'VTop' }, 3: { ox: -30, oy: 56, align: 'VBottom' } },
    },

    current: {
        R0: { 0: { ox: 26, oy: 0, align: 'Left' }, 3: { ox: 26, oy: 80, align: 'Left' } },
        R90: { 0: { ox: -33, oy: 40, align: 'VBottom' }, 3: { ox: 31, oy: 40, align: 'VTop' } },
        R180: { 0: { ox: 26, oy: 80, align: 'Left' }, 3: { ox: 26, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 31, oy: 40, align: 'VTop' }, 3: { ox: -33, oy: 40, align: 'VBottom' } },
    },

    signal: {
        R0: { 0: { ox: 24, oy: 16, align: 'Left' }, 3: { ox: 24, oy: 104, align: 'Left' } },
        R90: { 0: { ox: -32, oy: 56, align: 'VBottom' }, 3: { ox: 32, oy: 56, align: 'VTop' } },
        R180: { 0: { ox: 24, oy: 104, align: 'Left' }, 3: { ox: 24, oy: 16, align: 'Left' } },
        R270: { 0: { ox: 32, oy: 56, align: 'VTop' }, 3: { ox: -32, oy: 56, align: 'VBottom' } },
    },

    cell: {
        R0: { 0: { ox: 25, oy: 0, align: 'Left' }, 3: { ox: 25, oy: 62, align: 'Left' } },
        R90: { 0: { ox: -44, oy: 30, align: 'VBottom' }, 3: { ox: 40, oy: 30, align: 'VTop' } },
        R180: { 0: { ox: 25, oy: 62, align: 'Left' }, 3: { ox: 25, oy: 0, align: 'Left' } },
        R270: { 0: { ox: -44, oy: 30, align: 'VBottom' }, 3: { ox: 40, oy: 30, align: 'VTop' } },
    },

    bi: {
        R0: { 0: { ox: 26, oy: 0, align: 'Left' }, 3: { ox: 26, oy: 80, align: 'Left' } },
        R90: { 0: { ox: -33, oy: 40, align: 'VBottom' }, 3: { ox: 31, oy: 40, align: 'VTop' } },
        R180: { 0: { ox: 26, oy: 80, align: 'Left' }, 3: { ox: 26, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 31, oy: 40, align: 'VTop' }, 3: { ox: -33, oy: 40, align: 'VBottom' } },
    },

    bi2: {
        R0: { 0: { ox: 26, oy: 0, align: 'Left' }, 3: { ox: 26, oy: 80, align: 'Left' } },
        R90: { 0: { ox: -33, oy: 40, align: 'VBottom' }, 3: { ox: 31, oy: 40, align: 'VTop' } },
        R180: { 0: { ox: 26, oy: 80, align: 'Left' }, 3: { ox: 26, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 31, oy: 40, align: 'VTop' }, 3: { ox: -33, oy: 40, align: 'VBottom' } },
    },
    bv: {
        R0: { 0: { ox: 26, oy: 0, align: 'Left' }, 3: { ox: 26, oy: 80, align: 'Left' } },
        R90: { 0: { ox: -33, oy: 40, align: 'VBottom' }, 3: { ox: 31, oy: 40, align: 'VTop' } },
        R180: { 0: { ox: 26, oy: 80, align: 'Left' }, 3: { ox: 26, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 31, oy: 40, align: 'VTop' }, 3: { ox: -33, oy: 40, align: 'VBottom' } },
    },

    f: {
        R0: { 0: { ox: 26, oy: 0, align: 'Left' }, 3: { ox: 26, oy: 80, align: 'Left' } },
        R90: { 0: { ox: -33, oy: 40, align: 'VBottom' }, 3: { ox: 31, oy: 40, align: 'VTop' } },
        R180: { 0: { ox: 26, oy: 80, align: 'Left' }, 3: { ox: 26, oy: 0, align: 'Left' } },
        R270: { 0: { ox: 31, oy: 40, align: 'VTop' }, 3: { ox: -33, oy: 40, align: 'VBottom' } },
    },

    h: {
        R0: { 0: { ox: 26, oy: 17, align: 'Left' }, 3: { ox: 26, oy: 97, align: 'Left' } },
        R90: { 0: { ox: -35, oy: 55, align: 'VBottom' }, 3: { ox: 34, oy: 55, align: 'VTop' } },
        R180: { 0: { ox: 26, oy: 97, align: 'Left' }, 3: { ox: 26, oy: 17, align: 'Left' } },
        R270: { 0: { ox: 34, oy: 55, align: 'VTop' }, 3: { ox: -35, oy: 55, align: 'VBottom' } },
    },

    // ── Dependent Sources (R0 only → all orientations are derived) ──────
    e: {
        R0: { 0: { ox: 18, oy: 17, align: 'Left' }, 3: { ox: 18, oy: 94, align: 'Left' } },
        R90: { 0: { ox: 24, oy: 90, align: 'VRight' }, 3: { ox: 24, oy: 22, align: 'VLeft' } },
        R180: { 0: { ox: 18, oy: 94, align: 'Left' }, 3: { ox: 18, oy: 17, align: 'Left' } },
        R270: { 0: { ox: 24, oy: 20, align: 'VLeft' }, 3: { ox: 24, oy: 90, align: 'VRight' } },
    },
    e2: {
        R0: { 0: { ox: 18, oy: 17, align: 'Left' }, 3: { ox: 18, oy: 94, align: 'Left' } },
        R90: { 0: { ox: 24, oy: 90, align: 'VRight' }, 3: { ox: 24, oy: 22, align: 'VLeft' } },
        R180: { 0: { ox: 18, oy: 94, align: 'Left' }, 3: { ox: 18, oy: 17, align: 'Left' } },
        R270: { 0: { ox: 24, oy: 20, align: 'VLeft' }, 3: { ox: 24, oy: 90, align: 'VRight' } },
    },
    g: {
        R0: { 0: { ox: 18, oy: 17, align: 'Left' }, 3: { ox: 18, oy: 94, align: 'Left' } },
        R90: { 0: { ox: 24, oy: 90, align: 'VRight' }, 3: { ox: 24, oy: 22, align: 'VLeft' } },
        R180: { 0: { ox: 18, oy: 94, align: 'Left' }, 3: { ox: 18, oy: 17, align: 'Left' } },
        R270: { 0: { ox: 24, oy: 20, align: 'VLeft' }, 3: { ox: 24, oy: 90, align: 'VRight' } },
    },
    g2: {
        R0: { 0: { ox: 18, oy: 17, align: 'Left' }, 3: { ox: 18, oy: 94, align: 'Left' } },
        R90: { 0: { ox: 24, oy: 90, align: 'VRight' }, 3: { ox: 24, oy: 22, align: 'VLeft' } },
        R180: { 0: { ox: 18, oy: 94, align: 'Left' }, 3: { ox: 18, oy: 17, align: 'Left' } },
        R270: { 0: { ox: 24, oy: 20, align: 'VLeft' }, 3: { ox: 24, oy: 90, align: 'VRight' } },
    },

    Amp_Current: {
        R0: { 0: { ox: 18, oy: 17, align: 'Left' }, 3: { ox: 18, oy: 94, align: 'Left' } },
        R90: { 0: { ox: 24, oy: 90, align: 'VRight' }, 3: { ox: 24, oy: 22, align: 'VLeft' } },
        R180: { 0: { ox: 18, oy: 94, align: 'Left' }, 3: { ox: 18, oy: 17, align: 'Left' } },
        R270: { 0: { ox: 24, oy: 20, align: 'VLeft' }, 3: { ox: 24, oy: 90, align: 'VRight' } },
    },

    Amp_Transimpedance: {
        R0: { 0: { ox: 18, oy: 17, align: 'Left' }, 3: { ox: 18, oy: 94, align: 'Left' } },
        R90: { 0: { ox: 24, oy: 90, align: 'VRight' }, 3: { ox: 24, oy: 22, align: 'VLeft' } },
        R180: { 0: { ox: 18, oy: 94, align: 'Left' }, 3: { ox: 18, oy: 17, align: 'Left' } },
        R270: { 0: { ox: 24, oy: 20, align: 'VLeft' }, 3: { ox: 24, oy: 90, align: 'VRight' } },
    },

    Gain_Block: {
        R0: { 3: { ox: -171, oy: 48, align: 'Left' } },
    },

    // ── Transistors (R0 only → all orientations derived) ────────────────
    npn: {
        R0: { 0: { ox: 91, oy: 48, align: 'Right' }, 3: { ox: 74, oy: 101, align: 'Left' } },
        R90: { 0: { ox: 61, oy: 49, align: 'VTop' }, 3: { ox: 96, oy: 49, align: 'VTop' } },
        R180: { 0: { ox: 91, oy: 48, align: 'Right' }, 3: { ox: 74, oy: 101, align: 'Left' } },
        R270: { 0: { ox: 61, oy: 49, align: 'VTop' }, 3: { ox: 96, oy: 49, align: 'VTop' } },
    },
    pnp: {
        R0: { 0: { ox: 91, oy: 48, align: 'Right' }, 3: { ox: 74, oy: 101, align: 'Left' } },
        R90: { 0: { ox: 61, oy: 49, align: 'VTop' }, 3: { ox: 96, oy: 49, align: 'VTop' } },
        R180: { 0: { ox: 91, oy: 48, align: 'Right' }, 3: { ox: 74, oy: 101, align: 'Left' } },
        R270: { 0: { ox: 61, oy: 49, align: 'VTop' }, 3: { ox: 96, oy: 49, align: 'VTop' } },
    },
    njf: {
        R0: { 0: { ox: 75, oy: 48, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R90: { 0: { ox: 50, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
        R180: { 0: { ox: 75, oy: 48, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R270: { 0: { ox: 50, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
    },
    pjf: {
        R0: { 0: { ox: 75, oy: 48, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R90: { 0: { ox: 50, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
        R180: { 0: { ox: 75, oy: 48, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R270: { 0: { ox: 50, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
    },
    nmos: {
        R0: { 0: { ox: 75, oy: 35, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R90: { 0: { ox: 50, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
        R180: { 0: { ox: 75, oy: 34, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R270: { 0: { ox: 53, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
    },
    pmos: {
        R0: { 0: { ox: 75, oy: 35, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R90: { 0: { ox: 50, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
        R180: { 0: { ox: 75, oy: 34, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R270: { 0: { ox: 53, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
    },
    NPN_ideal: {
        R0: { 0: { ox: 0, oy: 0, align: 'Left' }, 3: { ox: 80, oy: -9, align: 'Left' }, 39: { ox: 80, oy: 134, align: 'Left' }, 123: { ox: 80, oy: 106, align: 'Left' } },
        R90: { 0: { ox: 0, oy: 11, align: 'VLeft' }, 3: { ox: 80, oy: -9, align: 'VLeft' }, 39: { ox: 114, oy: 100, align: 'VRight' }, 123: { ox: 87, oy: 100, align: 'VRight' } },
        R180: { 0: { ox: 0, oy: 0, align: 'Left' }, 3: { ox: 80, oy: -9, align: 'Left' }, 39: { ox: 80, oy: 134, align: 'Left' }, 123: { ox: 80, oy: 106, align: 'Left' } },
        R270: { 0: { ox: 0, oy: 11, align: 'VLeft' }, 3: { ox: 80, oy: -9, align: 'VLeft' }, 39: { ox: 114, oy: 100, align: 'VRight' }, 123: { ox: 87, oy: 100, align: 'VRight' } },
    },
    PNP_ideal: {
        R0: { 0: { ox: 0, oy: 0, align: 'Left' }, 3: { ox: 80, oy: -9, align: 'Left' }, 39: { ox: 80, oy: 134, align: 'Left' }, 123: { ox: 80, oy: 106, align: 'Left' } },
        R90: { 0: { ox: 0, oy: 11, align: 'VLeft' }, 3: { ox: 80, oy: -9, align: 'VLeft' }, 39: { ox: 114, oy: 100, align: 'VRight' }, 123: { ox: 87, oy: 100, align: 'VRight' } },
        R180: { 0: { ox: 0, oy: 0, align: 'Left' }, 3: { ox: 80, oy: -9, align: 'Left' }, 39: { ox: 80, oy: 134, align: 'Left' }, 123: { ox: 80, oy: 106, align: 'Left' } },
        R270: { 0: { ox: 0, oy: 11, align: 'VLeft' }, 3: { ox: 80, oy: -9, align: 'VLeft' }, 39: { ox: 114, oy: 100, align: 'VRight' }, 123: { ox: 87, oy: 100, align: 'VRight' } },
    },
    nmos4: {
        R0: { 0: { ox: 75, oy: 35, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R90: { 0: { ox: 50, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
        R180: { 0: { ox: 75, oy: 34, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R270: { 0: { ox: 53, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
    },
    pmos4: {
        R0: { 0: { ox: 75, oy: 35, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R90: { 0: { ox: 50, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
        R180: { 0: { ox: 75, oy: 34, align: 'Right' }, 3: { ox: 56, oy: 101, align: 'Left' } },
        R270: { 0: { ox: 53, oy: 49, align: 'VTop' }, 3: { ox: 81, oy: 49, align: 'VTop' } },
    },


    //OP Amps

    OA_Ideal: {
        R0: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -171, oy: 111, align: 'Left' }, 123: { ox: -171, oy: 136, align: 'Left' } },
        R90: { 0: { ox: -92, oy: 82, align: 'VRight' }, 3: { ox: -119, oy: -12, align: 'VLeft' }, 123: { ox: -92, oy: 9, align: 'VLeft' } },
        R180: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -171, oy: 111, align: 'Left' }, 123: { ox: -171, oy: 136, align: 'Left' } },
        R270: { 0: { ox: -92, oy: 82, align: 'VRight' }, 3: { ox: -119, oy: -12, align: 'VLeft' }, 123: { ox: -92, oy: 9, align: 'VLeft' } },
    },

    OA_param: {
        R0: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -171, oy: 111, align: 'Left' }, 123: { ox: -171, oy: 136, align: 'Left' } },
        R90: { 0: { ox: -92, oy: 82, align: 'VRight' }, 3: { ox: -119, oy: -12, align: 'VLeft' }, 123: { ox: -92, oy: 9, align: 'VLeft' } },
        R180: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -171, oy: 111, align: 'Left' }, 123: { ox: -171, oy: 136, align: 'Left' } },
        R270: { 0: { ox: -92, oy: 82, align: 'VRight' }, 3: { ox: -119, oy: -12, align: 'VLeft' }, 123: { ox: -92, oy: 9, align: 'VLeft' } },
    },

    OA_Signal: {
        R0: { 0: { ox: 221, oy: 39, align: 'Left' }, 3: { ox: 36, oy: -42, align: 'Left' }, 39: { ox: 110, oy: 33, align: 'Left' }, 123: { ox: 148, oy: -11, align: 'Bottom' } },
        R90: { 0: { ox: 237, oy: 35, align: 'VRight' }, 3: { ox: 51, oy: -4, align: 'VLeft' }, 39: { ox: 80, oy: -5, align: 'VLeft' }, 123: { ox: 149, oy: 12, align: 'Top' } },
        R180: { 0: { ox: 221, oy: 39, align: 'Left' }, 3: { ox: 36, oy: -42, align: 'Left' }, 39: { ox: 110, oy: 33, align: 'Left' }, 123: { ox: 148, oy: -11, align: 'Bottom' } },
        R270: { 0: { ox: 237, oy: 35, align: 'VRight' }, 3: { ox: 51, oy: -4, align: 'VLeft' }, 39: { ox: 80, oy: -5, align: 'VLeft' }, 123: { ox: 149, oy: 12, align: 'Top' } },
    },

    OA_Signal2: {
        R0: { 0: { ox: 221, oy: 39, align: 'Left' }, 3: { ox: 36, oy: -42, align: 'Left' }, 39: { ox: 110, oy: 33, align: 'Left' }, 123: { ox: 148, oy: -11, align: 'Bottom' } },
        R90: { 0: { ox: 237, oy: 35, align: 'VRight' }, 3: { ox: 51, oy: -4, align: 'VLeft' }, 39: { ox: 80, oy: -5, align: 'VLeft' }, 123: { ox: 149, oy: 12, align: 'Top' } },
        R180: { 0: { ox: 221, oy: 39, align: 'Left' }, 3: { ox: 36, oy: -42, align: 'Left' }, 39: { ox: 110, oy: 33, align: 'Left' }, 123: { ox: 148, oy: -11, align: 'Bottom' } },
        R270: { 0: { ox: 237, oy: 35, align: 'VRight' }, 3: { ox: 51, oy: -4, align: 'VLeft' }, 39: { ox: 80, oy: -5, align: 'VLeft' }, 123: { ox: 149, oy: 12, align: 'Top' } },
    },

    TL082: {
        R0: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R90: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
        R180: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R270: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
    },

    LM741: {
        R0: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R90: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
        R180: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R270: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
    },

    LF398: {
        R0: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R90: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
        R180: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R270: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
    },
    LM311: {
        R0: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R90: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
        R180: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R270: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
    },
    LM324: {
        R0: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R90: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
        R180: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R270: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
    },
    LM833: {
        R0: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R90: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
        R180: { 0: { ox: -109, oy: 85, align: 'Left' }, 3: { ox: -109, oy: 14, align: 'Left' } },
        R270: { 0: { ox: -92, oy: 74, align: 'VRight' }, 3: { ox: -90, oy: 19, align: 'VLeft' } },
    },

    //TCLib Special
    L_Tap: {
        R0: { 0: { ox: 45, oy: 165, align: 'Left' }, 3: { ox: 45, oy: 68, align: 'Left' }, 123: { ox: 45, oy: 121, align: 'Left' } },
        R90: { 0: { ox: 40, oy: 183, align: 'VRight' }, 3: { ox: 52, oy: 112, align: 'VRight' }, 123: { ox: 52, oy: 83, align: 'VLeft' } },
        R180: { 0: { ox: 45, oy: 165, align: 'Left' }, 3: { ox: 45, oy: 121, align: 'Left' }, 123: { ox: 45, oy: 68, align: 'Left' } },
        R270: { 0: { ox: 40, oy: 183, align: 'VRight' }, 3: { ox: 52, oy: 82, align: 'VLeft' }, 123: { ox: 52, oy: 112, align: 'VRight' } },
    },

    Ideal_Comp: {
        R0: { 0: { ox: -120, oy: 0, align: 'Left' } },
        R90: { 0: { ox: -102, oy: 9, align: 'VLeft' } },
        R180: { 0: { ox: -120, oy: 0, align: 'Left' } },
        R270: { 0: { ox: -102, oy: 9, align: 'Left' } },
    },

    '74HCU04 Not': {
        R0: { 0: { ox: 14, oy: 22, align: 'Left' }, 3: { ox: 14, oy: 106, align: 'Left' } },
        R90: { 0: { ox: 40, oy: 34, align: 'VLeft' }, 3: { ox: 40, oy: 88, align: 'VRight' } },
        R180: { 0: { ox: 14, oy: 22, align: 'Left' }, 3: { ox: 14, oy: 106, align: 'Left' } },
        R270: { 0: { ox: 40, oy: 34, align: 'VLeft' }, 3: { ox: 40, oy: 88, align: 'VRight' } },
    },

    ampmeter: {
        R0: { 0: { ox: 13, oy: 70, align: 'Left' } },
        R90: { 0: { ox: 24, oy: 56, align: 'VRight' } },
        R180: { 0: { ox: 13, oy: 70, align: 'Left' } },
        R270: { 0: { ox: 24, oy: 56, align: 'VRight' } },
    },

    arrow: {
        R0: { 3: { ox: 26, oy: -9, align: 'Bottom' } },
        R90: { 3: { ox: 26, oy: -9, align: 'Bottom' } },
        R180: { 3: { ox: 26, oy: -9, align: 'Bottom' } },
        R270: { 3: { ox: 26, oy: -9, align: 'Bottom' } },
    },

    arrow_Z: {
        R0: { 3: { ox: 32, oy: -14, align: 'Right' } },
        R90: { 3: { ox: 27, oy: -14, align: 'VLeft' } },
        R180: { 3: { ox: 32, oy: -14, align: 'Right' } },
        R270: { 3: { ox: 27, oy: -14, align: 'VLeft' } },
    },

    arrow_Z2: {
        R0: { 3: { ox: -19, oy: 11, align: 'Right' } },
        R90: { 3: { ox: -22, oy: 19, align: 'VLeft' } },
        R180: { 3: { ox: -19, oy: 11, align: 'Right' } },
        R270: { 3: { ox: -22, oy: 19, align: 'VLeft' } },
    },

    arrow_curve: {
        R0: { 3: { ox: 71, oy: 59, align: 'Left' } },
        R90: { 3: { ox: 65, oy: 57, align: 'VTop' } },
        R180: { 3: { ox: 71, oy: 59, align: 'Left' } },
        R270: { 3: { ox: 65, oy: 57, align: 'VTop' } },
    },

}; // end COMPONENT_DEFAULTS