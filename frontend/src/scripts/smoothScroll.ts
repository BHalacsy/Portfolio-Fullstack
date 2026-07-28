import Lenis from "lenis";

// Matches scroll-pt-16 on <html>, which native jumps fall back to without JS
const ANCHOR_OFFSET = -64;

// Fraction of the viewport height over which a section animates in/out
const RAMP = 0.5;

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

    // offsetTop chains are layout positions, so measuring stays correct even
    // while tiles are translated mid-animation
    const measure = () => {
        for (const section of sections) {
            let y = 0;
            let node: HTMLElement | null = section.el;
            while (node) {
                y += node.offsetTop;
                node = node.offsetParent as HTMLElement | null;
            }
            section.top = y;
            section.height = section.el.offsetHeight;
        }
        update();
    };

    lenis.on("scroll", update);
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure); // images/fonts shift layout
    measure();

    // Route same-page anchors through Lenis for smooth scrolling
    document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener("click", (event) => {
            const target = document.querySelector<HTMLElement>(anchor.getAttribute("href")!);
            if (!target) return;
            event.preventDefault();
            lenis.scrollTo(target, { offset: ANCHOR_OFFSET });
        });
    });
}
