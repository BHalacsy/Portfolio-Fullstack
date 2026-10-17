// ─── Tunables ────────────────────────────────────────────────────────────────
const ICE_FRICTION          = 0.988;   // per-frame linear velocity multiplier
const ROT_FRICTION          = 0.990;   // per-frame angular velocity multiplier (low spin friction)
const WALL_RESTITUTION      = 0.82;    // bounce elasticity off arena/screen walls
const PUCK_RESTITUTION      = 0.78;    // bounce elasticity between pucks
const MAX_SPEED             = 36;      // max linear speed in px/frame (~2100px/s)
const MAX_ROT_SPEED         = 3;      // max angular speed in deg/frame (~1440 deg/s)
const THROW_SCALE           = 1.2;     // release linear velocity multiplier
const DRAG_SPIN_FACTOR      = 0.0002;   // torque-to-spin multiplier during active drag
const THROW_SPIN_FACTOR     = 0.00002;   // torque-to-spin multiplier on release
const WALL_SPIN_FACTOR      = 0.22;    // wall friction torque factor on rebound
const COLLISION_SPIN_FACTOR = 0.18;    // glancing collision spin transfer
const RETURN_LERP           = 0.14;    // speed of return when leaving settled snap
const DRAG_THRESHOLD        = 5;       // px movement required before engaging drag
const VELOCITY_SAMPLES      = 5;       // pointer samples for release velocity

// ─── Types ───────────────────────────────────────────────────────────────────
interface Vec2 { x: number; y: number }

interface Puck {
    id: number;
    el: HTMLElement;
    // Current offset from layout home (0, 0 = resting grid position)
    pos: Vec2;
    vel: Vec2;
    // Full 360° continuous rotation state
    rot: number;       // degrees (unbounded: 0, 360, 720, etc.)
    rotVel: number;    // degrees per frame
    // Layout geometry relative to arena (unaffected by CSS transforms)
    homeX: number;
    homeY: number;
    width: number;
    height: number;
    // Pointer drag state
    dragging: boolean;
    dragCandidate: boolean;
    activePointerId: number | null;
    startPointer: Vec2;
    dragOffset: Vec2;
    pointerHistory: { x: number; y: number; t: number }[];
    suppressNextClick: boolean;
}

interface Arena {
    el: HTMLElement;
    width: number;
    height: number;
    pucks: Puck[];
    settled: boolean;
}

// ─── State ───────────────────────────────────────────────────────────────────
const arenas: Arena[] = [];
let animFrameId: number | null = null;
let globalPuckCounter = 0;

// ─── Bootstrap ───────────────────────────────────────────────────────────────
export function initPuckPhysics(): void {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.innerWidth < 1050) return;

    const containers = document.querySelectorAll<HTMLElement>("[data-puck-arena]");
    for (const container of containers) {
        const tiles = container.querySelectorAll<HTMLElement>(".puck-tile");
        if (!tiles.length) continue;

        const arena: Arena = {
            el: container,
            width: container.clientWidth,
            height: container.clientHeight,
            pucks: [],
            settled: container.classList.contains("settled"),
        };

        for (const tile of tiles) {
            const puck: Puck = {
                id: globalPuckCounter++,
                el: tile,
                pos: { x: 0, y: 0 },
                vel: { x: 0, y: 0 },
                rot: 0,
                rotVel: 0,
                homeX: 0,
                homeY: 0,
                width: 0,
                height: 0,
                dragging: false,
                dragCandidate: false,
                activePointerId: null,
                startPointer: { x: 0, y: 0 },
                dragOffset: { x: 0, y: 0 },
                pointerHistory: [],
                suppressNextClick: false,
            };

            arena.pucks.push(puck);
            bindPuckEvents(puck, arena);
            tile.style.willChange = "transform";
        }

        arenas.push(arena);
    }

    measureAll();
    window.addEventListener("resize", measureAll);
    window.addEventListener("load", measureAll);

    if (arenas.length && animFrameId === null) {
        animFrameId = requestAnimationFrame(tick);
    }
}

// ─── Layout Geometry ─────────────────────────────────────────────────────────
function getOffsetRelativeToArena(child: HTMLElement, arenaEl: HTMLElement): Vec2 {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = child;
    while (node && node !== arenaEl) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
    }
    return { x, y };
}

function measureAll(): void {
    for (const arena of arenas) {
        arena.width = arena.el.clientWidth;
        arena.height = arena.el.clientHeight;

        for (const puck of arena.pucks) {
            const offset = getOffsetRelativeToArena(puck.el, arena.el);
            puck.homeX = offset.x;
            puck.homeY = offset.y;
            puck.width = puck.el.offsetWidth;
            puck.height = puck.el.offsetHeight;
        }
    }
}

// ─── Pointer & Drag Handling ─────────────────────────────────────────────────
function bindPuckEvents(puck: Puck, arena: Arena): void {
    const el = puck.el;

    // Intercept clicks if this was a drag release
    el.addEventListener("click", (e: MouseEvent) => {
        if (puck.suppressNextClick) {
            e.preventDefault();
            e.stopPropagation();
            puck.suppressNextClick = false;
        }
    }, true);

    el.addEventListener("pointerdown", (e: PointerEvent) => {
        // Only allow interactions when the section is settled in its snap
        if (!arena.el.classList.contains("settled")) return;
        // Don't hijack clicks on buttons/inputs/etc.
        if ((e.target as HTMLElement).closest("input, textarea, select, button")) return;
        // Don't drag when clicking the scrollbar area of scrollable tiles
        const rect = el.getBoundingClientRect();
        if (e.clientX > rect.right - 14) return;

        puck.dragCandidate = true;
        puck.activePointerId = e.pointerId;
        puck.startPointer = { x: e.clientX, y: e.clientY };
        puck.suppressNextClick = false;

        // Relative offset within tile
        puck.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        puck.pointerHistory = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    });

    el.addEventListener("pointermove", (e: PointerEvent) => {
        if (!puck.dragCandidate || puck.activePointerId !== e.pointerId) return;

        // Check if movement exceeded threshold to begin dragging
        if (!puck.dragging) {
            const dist = Math.hypot(e.clientX - puck.startPointer.x, e.clientY - puck.startPointer.y);
            if (dist > DRAG_THRESHOLD) {
                puck.dragging = true;
                puck.suppressNextClick = true;
                el.setPointerCapture(e.pointerId);
                el.classList.add("puck-dragging");
            } else {
                return;
            }
        }

        // Pointer is actively dragging the puck
        const arenaRect = arena.el.getBoundingClientRect();
        const targetArenaX = e.clientX - arenaRect.left - puck.dragOffset.x;
        const targetArenaY = e.clientY - arenaRect.top - puck.dragOffset.y;

        // Desired puck offset from its home
        const nextX = targetArenaX - puck.homeX;
        const nextY = targetArenaY - puck.homeY;

        // Linear velocity tracking
        puck.vel.x = nextX - puck.pos.x;
        puck.vel.y = nextY - puck.pos.y;

        puck.pos.x = nextX;
        puck.pos.y = nextY;

        // Off-center drag torque generates 360° spin while moving
        const rx = puck.dragOffset.x - puck.width * 0.5;
        const ry = puck.dragOffset.y - puck.height * 0.5;
        const torque = (rx * puck.vel.y - ry * puck.vel.x);
        puck.rotVel = torque * DRAG_SPIN_FACTOR;
        puck.rot += puck.rotVel;

        // Clamp within expanded arena walls
        clampPuckToArena(puck, arena);

        // Record history for fling velocity
        const now = performance.now();
        puck.pointerHistory.push({ x: e.clientX, y: e.clientY, t: now });
        if (puck.pointerHistory.length > VELOCITY_SAMPLES) {
            puck.pointerHistory.shift();
        }
    });

    const endDrag = (e: PointerEvent) => {
        if (puck.activePointerId !== e.pointerId) return;

        if (puck.dragging) {
            puck.dragging = false;
            el.classList.remove("puck-dragging");
            try {
                el.releasePointerCapture(e.pointerId);
            } catch {
                // Ignore if pointer capture was already lost
            }

            // Calculate release velocity vector
            const h = puck.pointerHistory;
            if (h.length >= 2) {
                const first = h[0];
                const last = h[h.length - 1];
                const dt = (last.t - first.t) || 16;
                puck.vel.x = ((last.x - first.x) / dt) * 16 * THROW_SCALE;
                puck.vel.y = ((last.y - first.y) / dt) * 16 * THROW_SCALE;
            }

            // Cap maximum throw speed
            const speed = Math.hypot(puck.vel.x, puck.vel.y);
            if (speed > MAX_SPEED) {
                puck.vel.x = (puck.vel.x / speed) * MAX_SPEED;
                puck.vel.y = (puck.vel.y / speed) * MAX_SPEED;
            }

            // Compute release angular velocity (spin) from throw torque
            const rx = puck.dragOffset.x - puck.width * 0.5;
            const ry = puck.dragOffset.y - puck.height * 0.5;
            const throwTorque = (rx * puck.vel.y - ry * puck.vel.x);
            puck.rotVel = throwTorque * THROW_SPIN_FACTOR;
            puck.rotVel = Math.max(-MAX_ROT_SPEED, Math.min(MAX_ROT_SPEED, puck.rotVel));
        }

        puck.dragCandidate = false;
        puck.activePointerId = null;
    };

    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
}

// ─── Main Physics Loop ───────────────────────────────────────────────────────
function tick(): void {
    for (const arena of arenas) {
        const isSettled = arena.el.classList.contains("settled");
        arena.settled = isSettled;

        if (!isSettled) {
            // Not in snap: air is OFF, smoothly return tiles to exact home and 0°
            for (const puck of arena.pucks) {
                if (puck.dragging) {
                    puck.dragging = false;
                    puck.dragCandidate = false;
                    puck.el.classList.remove("puck-dragging");
                }
                puck.vel.x = 0;
                puck.vel.y = 0;
                puck.rotVel = 0;

                puck.rot += (0 - puck.rot) * RETURN_LERP;
                puck.pos.x += (0 - puck.pos.x) * RETURN_LERP;
                puck.pos.y += (0 - puck.pos.y) * RETURN_LERP;

                if (Math.abs(puck.pos.x) < 0.1 && Math.abs(puck.pos.y) < 0.1 && Math.abs(puck.rot) < 0.1) {
                    puck.pos.x = 0;
                    puck.pos.y = 0;
                    puck.rot = 0;
                    puck.el.style.transform = "";
                } else {
                    renderPuck(puck);
                }
            }
            continue;
        }

        // Section IS in snap: air is ON!
        const { pucks } = arena;
        const n = pucks.length;

        // 1. Integration (No random variance)
        for (const puck of pucks) {
            if (puck.dragging) continue;

            // Low ice friction
            puck.vel.x *= ICE_FRICTION;
            puck.vel.y *= ICE_FRICTION;

            // Integrate linear position
            puck.pos.x += puck.vel.x;
            puck.pos.y += puck.vel.y;

            // Integrate 360° rotation
            puck.rot += puck.rotVel;
            puck.rotVel *= ROT_FRICTION;
        }

        // 2. Tile-to-tile elastic collisions (Deterministic, zero random variance)
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                resolvePuckCollision(pucks[i], pucks[j]);
            }
        }

        // 3. Render updates
        for (const puck of pucks) {
            renderPuck(puck);
        }
    }

    animFrameId = requestAnimationFrame(tick);
}

// ─── Wall Collision (Cushion Rebounds & Friction Spin) ───────────────────────
function clampPuckToArena(puck: Puck, arena: Arena): void {
    const curX = puck.homeX + puck.pos.x;
    const curY = puck.homeY + puck.pos.y;

    const arenaRect = arena.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Allow tiles to roam across the full screen width and partially off-screen
    const offscreenX = Math.round(puck.width * 0.5);
    const offscreenY = Math.round(puck.height * 0.25);

    // Arena-relative coordinates for the viewport edges + offscreen leeway
    const minX = -arenaRect.left - offscreenX;
    const maxX = (vw - arenaRect.left) - puck.width + offscreenX;
    const minY = -arenaRect.top - offscreenY;
    const maxY = (vh - arenaRect.top) - puck.height + offscreenY;

    // Left wall / screen edge
    if (curX < minX) {
        puck.pos.x = minX - puck.homeX;
        puck.vel.x = Math.abs(puck.vel.x) * WALL_RESTITUTION;
        // Wall contact friction imparts spin
        puck.rotVel += puck.vel.y * WALL_SPIN_FACTOR;
    }
    // Right wall / screen edge
    else if (curX > maxX) {
        puck.pos.x = maxX - puck.homeX;
        puck.vel.x = -Math.abs(puck.vel.x) * WALL_RESTITUTION;
        puck.rotVel -= puck.vel.y * WALL_SPIN_FACTOR;
    }

    // Top boundary
    if (curY < minY) {
        puck.pos.y = minY - puck.homeY;
        puck.vel.y = Math.abs(puck.vel.y) * WALL_RESTITUTION;
        puck.rotVel -= puck.vel.x * WALL_SPIN_FACTOR;
    }
    // Bottom boundary
    else if (curY > maxY) {
        puck.pos.y = maxY - puck.homeY;
        puck.vel.y = -Math.abs(puck.vel.y) * WALL_RESTITUTION;
        puck.rotVel += puck.vel.x * WALL_SPIN_FACTOR;
    }
}

// ─── Puck-to-Puck Elastic Collision (Deterministic) ──────────────────────────
function resolvePuckCollision(a: Puck, b: Puck): void {
    const ax = a.homeX + a.pos.x;
    const ay = a.homeY + a.pos.y;
    const bx = b.homeX + b.pos.x;
    const by = b.homeY + b.pos.y;

    // AABB intersection test
    const overlapX = Math.min(ax + a.width, bx + b.width) - Math.max(ax, bx);
    const overlapY = Math.min(ay + a.height, by + b.height) - Math.max(ay, by);

    if (overlapX <= 0 || overlapY <= 0) return;

    const centerAx = ax + a.width * 0.5;
    const centerAy = ay + a.height * 0.5;
    const centerBx = bx + b.width * 0.5;
    const centerBy = by + b.height * 0.5;

    // Resolve along shallowest overlap axis
    if (overlapX < overlapY) {
        const sign = centerAx < centerBx ? -1 : 1;
        const push = overlapX * 0.5;

        if (!a.dragging) a.pos.x += sign * push;
        if (!b.dragging) b.pos.x -= sign * push;

        // Exchange velocities on X axis (pure elastic, zero random variance)
        const vRel = a.vel.x - b.vel.x;
        if ((sign > 0 && vRel > 0) || (sign < 0 && vRel < 0)) {
            const impulse = (1 + PUCK_RESTITUTION) * vRel * 0.5;
            if (!a.dragging) a.vel.x -= impulse;
            if (!b.dragging) b.vel.x += impulse;

            // Glancing velocity on Y transfers angular spin
            const glancingRelY = a.vel.y - b.vel.y;
            const spinTransfer = glancingRelY * COLLISION_SPIN_FACTOR * sign;
            if (!a.dragging) a.rotVel += spinTransfer;
            if (!b.dragging) b.rotVel -= spinTransfer;
        }
    } else {
        const sign = centerAy < centerBy ? -1 : 1;
        const push = overlapY * 0.5;

        if (!a.dragging) a.pos.y += sign * push;
        if (!b.dragging) b.pos.y -= sign * push;

        // Exchange velocities on Y axis (pure elastic, zero random variance)
        const vRel = a.vel.y - b.vel.y;
        if ((sign > 0 && vRel > 0) || (sign < 0 && vRel < 0)) {
            const impulse = (1 + PUCK_RESTITUTION) * vRel * 0.5;
            if (!a.dragging) a.vel.y -= impulse;
            if (!b.dragging) b.vel.y += impulse;

            // Glancing velocity on X transfers angular spin
            const glancingRelX = a.vel.x - b.vel.x;
            const spinTransfer = glancingRelX * COLLISION_SPIN_FACTOR * sign;
            if (!a.dragging) a.rotVel -= spinTransfer;
            if (!b.dragging) b.rotVel += spinTransfer;
        }
    }
}

// ─── Rendering ───────────────────────────────────────────────────────────────
function renderPuck(puck: Puck): void {
    puck.el.style.transform = `translate3d(${puck.pos.x.toFixed(2)}px, ${puck.pos.y.toFixed(2)}px, 0) rotate(${puck.rot.toFixed(2)}deg)`;
}
