import Lenis from "lenis";
import Snap from "lenis/snap";

const ANCHOR_OFFSET = -64;
const RAMP = 1;
const SNAP_DURATION = 2;
const SNAP_DELAY = 700;

// How close to a snap point counts as parked there, in pixels
const SETTLE_TOLERANCE = 2;

interface SnapTarget {
    id: string; // what anchors link to, and the key resting positions are stored under
    measureId?: string; // element the position is measured from, when it is not #id itself
    align: "start" | "center" | "end";
    offset?: number;
}

// Sections scrolling comes to rest on, and where each parks in the viewport.
// The tile grids are 85vh, so centring leaves them an even margin; the footer
// aligns to the document end it already sits against. The landing rests on its
// title with the same headroom scroll-pt-16 gives anchors — the section box
// starts at the title's collapsed top margin, so aligning the section instead
// would pull the title flush against the top of the viewport.
const SNAP_TARGETS: SnapTarget[] = [
    { id: "landingPage", measureId: "landingTitle", align: "start", offset: ANCHOR_OFFSET },
    { id: "aboutMe", align: "center" },
    { id: "toybox", align: "center" },
    { id: "projRedis", align: "center" },
    { id: "projPortfolio", align: "center" },
    { id: "footerSection", align: "end" },
];

// offsetTop chains are layout positions, so measuring stays correct even while
// tiles are translated mid-animation
const documentTop = (el: HTMLElement): number => {
    let y = 0;
    let node: HTMLElement | null = el;
    while (node) {
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
    }
    return y;
};

interface Section {
    el: HTMLElement;
    top: number; // document-space layout position, unaffected by the translate we apply
    height: number;
    tiles: HTMLElement[];
}

// Drives the .move-* tiles in global.css: Lenis smooths the scroll, and every
// tile in a section shares one --scroll-p so the mosaic moves as a unit.
// p ramps 0 → 1 while the section scrolls in from the bottom, holds 1 while it
// is in full view, and ramps back 1 → 0 as it leaves through the top.
export function startSmoothScroll(): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Gating tile content on .settled only makes sense where a wheel parks the
    // page exactly on a snap point; Snap ignores touchmove, so a touch device
    // would otherwise be left with tiles it can never scroll
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        document.documentElement.classList.add("gate-tiles");
    }

    // allowNestedScroll hands a wheel event back to the browser while the tile
    // under the cursor still has content to scroll, then takes over again once
    // that tile bottoms out, so overflowing tiles scroll and chain on to the page
    const lenis = new Lenis({ allowNestedScroll: true });
    const raf = (time: number) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    // Stands in for the archived page's CSS scroll-snap, which Lenis cannot
    // coexist with. Mandatory matches what snap-y snap-mandatory did there:
    // every scroll settles on a section rather than only nearby ones.
    const snap = new Snap(lenis, {
        type: "mandatory",
        duration: SNAP_DURATION,
        debounce: SNAP_DELAY,
    });

    // Lenis emits "virtual-scroll" before it works out whether an event belongs
    // to a nested scroller, so Snap would queue a snap off wheel ticks that never
    // moved the page — yanking the section away while a tile is being read.
    // Suppress those: whichever event lands last before the debounce elapses
    // decides whether the page settles.
    const SCROLLABLE = ["auto", "scroll", "overlay"];
    const scrollsTile = (event: Event, delta: number): boolean => {
        for (const node of event.composedPath()) {
            if (node === document.body) break;
            if (!(node instanceof HTMLElement)) continue;
            const style = getComputedStyle(node);
            // .tile-scroll is overflow:hidden until its section settles, so an
            // unsettled tile never matches and the wheel drives the page instead
            if (!SCROLLABLE.includes(style.overflowY)) continue;
            if (node.scrollHeight - node.clientHeight <= 1) continue;
            // A contained tile keeps the wheel at its ends too — the same rule
            // Lenis applies, so both sides agree on who owns the event
            if (style.overscrollBehaviorY !== "auto") return true;
            const room = delta > 0 ? node.scrollHeight - node.clientHeight - node.scrollTop : node.scrollTop;
            if (room > 1) return true;
        }
        return false;
    };
    lenis.on("virtual-scroll", ({ deltaY, event }) => {
        if (scrollsTile(event, deltaY)) snap.stop();
        else snap.start();
    });

    // Snap.addElement derives positions from the element box alone — it has no
    // equivalent of scroll-padding — so we compute the values ourselves and
    // register them with snap.add(). Anchors then reuse the same numbers, which
    // is what keeps the landing arrow and a wheel gesture landing in one place.
    const snapPoints = new Map<string, { el: HTMLElement; value: number }>();
    let removeSnaps: (() => void)[] = [];

    const registerSnaps = () => {
        for (const remove of removeSnaps) remove();
        removeSnaps = [];
        snapPoints.clear();

        const viewport = window.innerHeight;
        const maxScroll = Math.max(document.documentElement.scrollHeight - viewport, 0);
        for (const { id, measureId, align, offset = 0 } of SNAP_TARGETS) {
            const el = document.getElementById(measureId ?? id);
            if (!el) continue;
            const top = documentTop(el);
            const height = el.offsetHeight;
            const aligned =
                align === "start" ? top
                : align === "center" ? top + height / 2 - viewport / 2
                : top + height - viewport;
            const value = Math.min(Math.max(Math.round(aligned + offset), 0), maxScroll);
            // The class goes on the section itself, which is not always what was
            // measured — the landing is measured from its title
            snapPoints.set(id, { el: document.getElementById(id) ?? el, value });
            removeSnaps.push(snap.add(value));
        }
    };

    // Group tiles by their section: the nearest ancestor with an id
    // (#aboutMe, #projRedis, #projPortfolio, ...)
    let sections: Section[] = [];

    const collectSections = () => {
        sections = [];
        const sectionByEl = new Map<HTMLElement, Section>();
        const tiles = document.querySelectorAll<HTMLElement>(
            ".move-l, .move-r, .move-d, .move-u, .move-lu, .move-ld, .move-ru, .move-rd",
        );
        for (const tile of tiles) {
            const container = (tile.closest("[id]") as HTMLElement | null) ?? tile;
            let section = sectionByEl.get(container);
            if (!section) {
                section = { el: container, top: 0, height: 0, tiles: [] };
                sectionByEl.set(container, section);
                sections.push(section);
            }
            section.tiles.push(tile);
        }
    };

    const update = () => {
        const ramp = window.innerHeight * RAMP;
        const scrolled = window.scrollY;
        const viewportBottom = scrolled + window.innerHeight;

        let needsMeasure = false;
        for (const section of sections) {
            if (!section.el.isConnected || section.tiles.some((t) => !t.isConnected)) {
                needsMeasure = true;
                break;
            }
        }
        if (needsMeasure) {
            measure();
            return;
        }

        for (const section of sections) {
            const entering = (viewportBottom - section.top) / ramp;
            const leaving = (section.top + section.height - scrolled) / ramp;
            const linear = Math.min(Math.max(Math.min(entering, leaving), 0), 1);
            // Cubic ease-out: tiles cover most of their travel early and
            // decelerate into place, instead of scrubbing at constant speed
            const progress = (1 - (1 - linear) ** 3).toFixed(3);
            section.el.style.setProperty("--scroll-p", progress);
            for (const tile of section.tiles) tile.style.setProperty("--scroll-p", progress);
        }
        // Hands the tiles their content scroll only once the section has come to
        // rest on its snap point, so nothing can be scrolled mid-animation
        for (const [id, point] of snapPoints) {
            const liveEl = document.getElementById(id) ?? point.el;
            liveEl.classList.toggle("settled", Math.abs(scrolled - point.value) <= SETTLE_TOLERANCE);
        }
    };

    const measure = () => {
        collectSections();
        for (const section of sections) {
            const liveEl = (section.el.id ? document.getElementById(section.el.id) : null) ?? section.el;
            section.el = liveEl;
            section.top = documentTop(liveEl);
            section.height = liveEl.offsetHeight;
        }
        // Snap has ResizeObservers of its own, but they are debounced 500ms —
        // recompute with us so the points are right the moment images land
        registerSnaps();
        update();
    };

    let mutationTimeout: number | null = null;
    const observer = new MutationObserver(() => {
        if (mutationTimeout !== null) return;
        mutationTimeout = window.setTimeout(() => {
            mutationTimeout = null;
            measure();
        }, 50);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    lenis.on("scroll", update);
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure); // images/fonts shift layout
    measure();

    // Route same-page anchors through Lenis for smooth scrolling. A link into a
    // snapped section goes to that section's resting position rather than to its
    // top edge, so clicking the landing arrow ends where scrolling there would —
    // otherwise the jump lands off-snap and stays there, since Snap only reacts
    // to user input ("virtual-scroll") and never corrects a programmatic scroll.
    document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener("click", (event) => {
            const href = anchor.getAttribute("href")!;
            const target = document.querySelector<HTMLElement>(href);
            if (!target) return;
            event.preventDefault();
            const snapPoint = snapPoints.get(href.slice(1));
            if (snapPoint !== undefined) lenis.scrollTo(snapPoint.value, { duration: SNAP_DURATION });
            else lenis.scrollTo(target, { offset: ANCHOR_OFFSET, duration: SNAP_DURATION });
        });
    });
}
