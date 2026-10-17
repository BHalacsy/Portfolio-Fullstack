import { useEffect, useRef, useState } from "react";
import type { Centrifuge, Subscription } from "centrifuge";
import {
    BOARD_SIZE,
    chunkPixels,
    fetchBoard,
    saveStroke,
    type Pixel,
    type StoredPixel,
    type Stroke,
} from "../../scripts/api";

const CHANNEL = "canvas";

const BRUSHES = [
    { width: 4, icon: 3 },
    { width: 6, icon: 5 },
    { width: 10, icon: 8 },
];

interface Broadcast extends Stroke {
    from: string;
}

const key = (x: number, y: number) => y * BOARD_SIZE + x;

interface Props {
    client: Centrifuge | null;
    clientId: string;
}

export default function Canvas({ client, clientId }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const subRef = useRef<Subscription | null>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<Pixel | null>(null);
    const strokeRef = useRef<Map<number, Pixel>>(new Map());

    const clientIdRef = useRef(clientId);
    clientIdRef.current = clientId;

    const loadedRef = useRef(false);
    const pendingRef = useRef<Broadcast[]>([]);

    const [color, setColor] = useState("#000000");
    const [width, setWidth] = useState(BRUSHES[0].width);

    const paint = (fill: string, pixels: Pixel[]) => {
        const ctx = ctxRef.current;
        if (!ctx) return;

        ctx.fillStyle = fill;
        for (const p of pixels) ctx.fillRect(p.x, p.y, 1, 1);
    };

    useEffect(() => {
        ctxRef.current = canvasRef.current?.getContext("2d") ?? null;

        let cancelled = false;

        const flush = () => {
            loadedRef.current = true;
            for (const stroke of pendingRef.current) paint(stroke.color, stroke.pixels);
            pendingRef.current = [];
        };

        fetchBoard()
            .then((tiles) => {
                if (cancelled) return;

                const ctx = ctxRef.current;
                if (ctx) {
                    let last = "";
                    for (const tile of tiles) {
                        for (const pixel of tile as StoredPixel[]) {
                            if (pixel.color !== last) {
                                ctx.fillStyle = pixel.color;
                                last = pixel.color;
                            }
                            ctx.fillRect(pixel.x, pixel.y, 1, 1);
                        }
                    }
                }

                flush();
            })
            .catch((e) => {
                console.warn("Canvas load failed: ", e);
                if (!cancelled) flush();
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!client) return;

        const sub = client.newSubscription(CHANNEL);
        subRef.current = sub;

        sub.on("publication", (publication) => {
            const stroke = publication.data as Broadcast;

            if (stroke.from === clientIdRef.current) return;

            if (!loadedRef.current) {
                pendingRef.current.push(stroke);
                return;
            }

            paint(stroke.color, stroke.pixels);
        });

        sub.on("error", (e) => console.warn("Canvas subscription error: ", e.error));
        sub.subscribe();

        return () => {
            sub.unsubscribe();
            client.removeSubscription(sub);
            subRef.current = null;
        };
    }, [client]);

    const at = (e: React.PointerEvent<HTMLCanvasElement> | PointerEvent): Pixel => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.round(((e.clientX - rect.left) * canvas.width) / rect.width),
            y: Math.round(((e.clientY - rect.top) * canvas.height) / rect.height),
        };
    };

    const recordCircle = (centerX: number, centerY: number, radius: number) => {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (dx * dx + dy * dy > radius * radius) continue;
                const x = centerX + dx;
                const y = centerY + dy;
                if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) continue;
                strokeRef.current.set(key(x, y), { x, y });
            }
        }
    };

    const drawDot = (point: Pixel, radius: number) => {
        const ctx = ctxRef.current;
        if (!ctx) return;

        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        recordCircle(point.x, point.y, radius);
    };

    const drawLineSegment = (from: Pixel, to: Pixel, radius: number) => {
        const ctx = ctxRef.current;
        if (!ctx) return;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = radius * 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        const steps = Math.ceil(dist);

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = Math.round(from.x + dx * t);
            const y = Math.round(from.y + dy * t);
            recordCircle(x, y, radius);
        }
    };

    const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!e.isPrimary || e.button !== 0) return;

        drawingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);

        const radius = Math.round(width / 2);
        const point = at(e);
        lastPointRef.current = point;
        drawDot(point, radius);
    };

    const drawMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;

        const radius = Math.round(width / 2);
        const native = e.nativeEvent;
        const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [native];
        const eventList = events.length > 0 ? events : [native];

        for (const ev of eventList) {
            const curr = at(ev);
            if (lastPointRef.current) {
                drawLineSegment(lastPointRef.current, curr, radius);
            } else {
                drawDot(curr, radius);
            }
            lastPointRef.current = curr;
        }
    };

    const endDraw = () => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        lastPointRef.current = null;

        const pixels = [...strokeRef.current.values()];
        strokeRef.current = new Map();
        if (pixels.length === 0) return;

        const sub = subRef.current;
        if (sub) {
            for (const chunk of chunkPixels(pixels)) {
                sub.publish({ color, pixels: chunk } satisfies Stroke).catch((e) =>
                    console.error("Stroke sending failed: ", e),
                );
            }
        }

        void saveStroke({ color, pixels });
    };

    return (
        <>
            <div className="flex mb-2">
                <input
                    type="color"
                    aria-label="Brush colour"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-10 h-10 mt-4 mx-3 cursor-pointer"
                />
                {BRUSHES.map((brush) => (
                    <button
                        key={brush.width}
                        type="button"
                        aria-label={`Brush size ${brush.width}`}
                        aria-pressed={width === brush.width}
                        onClick={() => setWidth(brush.width)}
                        className={`bg-[var(--fg-tinted-color)] w-10 h-10 mx-3 my-3 p-2 flex items-center justify-center rounded-lg pop-button ${
                            width === brush.width ? "translate-x-1 translate-y-1 shadow-none" : ""
                        }`}
                    >
                        <svg width="20" height="20">
                            <circle cx="10" cy="10" r={brush.icon} fill={color} />
                        </svg>
                    </button>
                ))}
            </div>
            <canvas
                ref={canvasRef}
                width={BOARD_SIZE}
                height={BOARD_SIZE}
                className="bg-white touch-none"
                onPointerDown={startDraw}
                onPointerMove={drawMove}
                onPointerUp={endDraw}
                onPointerCancel={endDraw}
            />
        </>
    );
}
