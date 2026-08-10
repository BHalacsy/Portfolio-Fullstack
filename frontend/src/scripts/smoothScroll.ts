import Lenis from "lenis";
import Snap from "lenis/snap";

// Matches scroll-pt-16 on <html>, which native jumps fall back to without JS
const ANCHOR_OFFSET = -64;

// Fraction of the viewport height over which a section animates in/out
const RAMP = 1;

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

    const lenis = new Lenis();
    const raf = (time: number) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    // Stands in for the archived page's CSS scroll-snap, which Lenis cannot
    // coexist with. Mandatory matches what snap-y snap-mandatory did there:
    // every scroll settles on a section rather than only nearby ones.
    const snap = new Snap(lenis, { type: "mandatory" });

    // Snap.addElement derives positions from the element box alone — it has no
    // equivalent of scroll-padding — so we compute the values ourselves and
    // register them with snap.add(). Anchors then reuse the same numbers, which
    // is what keeps the landing arrow and a wheel gesture landing in one place.
    const snapPoints = new Map<string, number>();
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
            snapPoints.set(id, value);
            removeSnaps.push(snap.add(value));
        }
    };

    // Group tiles by their section: the nearest ancestor with an id
    // (#aboutMe, #projRedis, #projPortfolio, ...)
    const sections: Section[] = [];
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

    const update = () => {
        const ramp = window.innerHeight * RAMP;
        const scrolled = window.scrollY;
        const viewportBottom = scrolled + window.innerHeight;
        for (const section of sections) {
            const entering = (viewportBottom - section.top) / ramp;
            const leaving = (section.top + section.height - scrolled) / ramp;
            const linear = Math.min(Math.max(Math.min(entering, leaving), 0), 1);
            // Cubic ease-out: tiles cover most of their travel early and
            // decelerate into place, instead of scrubbing at constant speed
            const progress = (1 - (1 - linear) ** 3).toFixed(3);
            for (const tile of section.tiles) tile.style.setProperty("--scroll-p", progress);
        }
    };

    const measure = () => {
        for (const section of sections) {
            section.top = documentTop(section.el);
            section.height = section.el.offsetHeight;
        }
        // Snap has ResizeObservers of its own, but they are debounced 500ms —
        // recompute with us so the points are right the moment images land
        registerSnaps();
        update();
    };

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
            if (snapPoint !== undefined) lenis.scrollTo(snapPoint);
            else lenis.scrollTo(target, { offset: ANCHOR_OFFSET });
        });
    });
}
