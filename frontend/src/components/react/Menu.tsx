import { useEffect, useRef, useState } from "react";

const TRACKS = [
    { id: "", label: "None", src: "" },
    { id: "A", label: "Disco Elysium", src: "/audio/DiscoElysium.mp3" },
    { id: "B", label: "Little Big Planet", src: "/audio/LittleBigPlanet.mp3" },
    { id: "C", label: "Club Penguin", src: "/audio/ClubPenguin.mp3" },
];

export default function Menu() {
    const [open, setOpen] = useState(false);
    const [track, setTrack] = useState("");
    const [volume, setVolume] = useState(50);
    const playerRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const player = playerRef.current;
        if (player) player.volume = volume / 100;
    }, [volume]);

    const toggleDark = () => {
        const isDark = document.documentElement.classList.toggle("dark");
        localStorage.setItem("mode", isDark ? "dark" : "light");
    };

    const changeTrack = (id: string) => {
        setTrack(id);

        const player = playerRef.current;
        const src = TRACKS.find((t) => t.id === id)?.src;
        if (!player) return;

        if (!src) {
            player.pause();
            player.removeAttribute("src");
            player.load();
            return;
        }

        player.src = src;
        player.load();
        player.volume = volume / 100;
        player.play().catch((err) => console.warn("Autoplay failed:", err));
    };

    return (
        <section id="menu">
            <audio ref={playerRef} loop preload="auto" />
            <div className="fixed top-0 left-0 right-0 z-50 flex flex-col items-center pointer-events-none">
                <button
                    type="button"
                    aria-label="Menu"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                    className="pointer-events-auto bg-[var(--accent-tinted-color)] hover:bg-[var(--accent-color)] px-6 py-3 rounded-b-lg hover:scale-105 transition-all duration-200 cursor-pointer"
                >
                    <img
                        src="/media/menuArrow.svg"
                        alt=""
                        className={`w-6 h-6 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    />
                </button>
                {open && (
                    <div className="pointer-events-auto mt-2 z-50 bg-[var(--accent-tinted-color)] rounded-lg p-4 border border-[var(--accent-color)] motion-preset-bounce motion-duration-500 max-w-[95vw]">
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <div className="flex flex-col">
                                <button
                                    type="button"
                                    aria-label="Toggle light/dark mode"
                                    onClick={toggleDark}
                                    className="bg-[var(--fg-color)] hover:bg-[var(--fg-tinted-color)] pop-button text-[#EDEEF7] px-4 py-2 rounded-2xl whitespace-nowrap cursor-pointer"
                                >
                                    <img src="/media/lightToggle.svg" alt="" className="w-6 h-6 dark:hidden" />
                                    <img src="/media/darkToggle.svg" alt="" className="w-6 h-6 hidden dark:block" />
                                </button>
                            </div>
                            <div className="flex flex-col">
                                <select
                                    aria-label="Background music"
                                    value={track}
                                    onChange={(e) => changeTrack(e.target.value)}
                                    className="bg-[var(--fg-color)] w-auto hover:bg-[var(--fg-tinted-color)] px-4 py-2 text-[var(--txt-color)] rounded-2xl pop-button cursor-pointer"
                                >
                                    {TRACKS.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center bg-[var(--fg-color)] hover:bg-[var(--fg-tinted-color)] px-4 py-2 rounded-2xl pop-button">
                                <img src="/media/lightVolume.svg" alt="" className="w-4 h-4 mr-2 dark:hidden" />
                                <img src="/media/darkVolume.svg" alt="" className="w-4 h-4 mr-2 hidden dark:block" />
                                <input
                                    type="range"
                                    aria-label="Volume"
                                    min="0"
                                    max="100"
                                    value={volume}
                                    onChange={(e) => setVolume(Number(e.target.value))}
                                    className="w-20 h-2 bg-[var(--accent-tinted-color)] rounded-lg appearance-none accent-[var(--accent-color)] cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
