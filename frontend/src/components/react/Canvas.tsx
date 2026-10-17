import { useEffect, useMemo, useRef, useState } from "react";
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
const FLUSH_INTERVAL_MS = 40;
const FLUSH_PIXEL_THRESHOLD = 80;

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
    const unsentStrokeRef = useRef<Pixel[]>([]);
    const flushTimerRef = useRef<number | null>(null);

    const clientIdRef = useRef(clientId);
    clientIdRef.current = clientId;

    const loadedRef = useRef(false);
    const pendingRef = useRef<Broadcast[]>([]);

    const [color, setColor] = useState("#000000");
    const strokeColorRef = useRef(color);
    strokeColorRef.current = color;
    const [width, setWidth] = useState(6);

    const cursorStyle = useMemo(() => {
        const r = Math.max(1, Math.round(width / 2));
        const size = Math.max(32, Math.ceil((r + 4) * 2));
        const evenSize = size % 2 === 0 ? size : size + 1;
        const center = evenSize / 2;

        let inner = "";
        if (r <= 1) {
            inner = `<circle cx="${center}" cy="${center}" r="1.5" fill="none" stroke="rgba(0, 0, 0, 0.4)" stroke-width="1"/><circle cx="${center}" cy="${center}" r="1" fill="${color}"/>`;
        } else if (r === 2) {
            inner = `<circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="rgba(0, 0, 0, 0.4)" stroke-width="1.8"/><circle cx="${center}" cy="${center}" r="${r}" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="1"/>`;
        } else {
            inner = `<circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="rgba(0, 0, 0, 0.45)" stroke-width="2.5"/><circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="rgba(255, 255, 255, 0.8)" stroke-width="0.75"/><circle cx="${center}" cy="${center}" r="${r}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1.5"/>${r >= 4 ? `<circle cx="${center}" cy="${center}" r="0.75" fill="${color}" stroke="rgba(0, 0, 0, 0.5)" stroke-width="0.5"/>` : ""}`;
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${evenSize}" height="${evenSize}" viewBox="0 0 ${evenSize} ${evenSize}">${inner}</svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
    }, [color, width]);

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
            if (flushTimerRef.current !== null) {
                clearInterval(flushTimerRef.current);
                flushTimerRef.current = null;
            }
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
                const k = key(x, y);
                if (!strokeRef.current.has(k)) {
                    const p = { x, y };
                    strokeRef.current.set(k, p);
                    unsentStrokeRef.current.push(p);
                }
            }
        }
    };

    const flushChunk = () => {
        const sub = subRef.current;
        const pixels = unsentStrokeRef.current;
        if (pixels.length === 0) return;

        unsentStrokeRef.current = [];

        if (sub) {
            for (const chunk of chunkPixels(pixels)) {
                sub.publish({ color: strokeColorRef.current, pixels: chunk } satisfies Stroke).catch((e) =>
                    console.error("Stroke sending failed: ", e),
                );
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
        strokeColorRef.current = color;
        e.currentTarget.setPointerCapture(e.pointerId);

        const radius = Math.round(width / 2);
        const point = at(e);
        lastPointRef.current = point;
        drawDot(point, radius);
        flushChunk();

        if (flushTimerRef.current !== null) {
            clearInterval(flushTimerRef.current);
        }
        flushTimerRef.current = window.setInterval(flushChunk, FLUSH_INTERVAL_MS);
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

        if (unsentStrokeRef.current.length >= FLUSH_PIXEL_THRESHOLD) {
            flushChunk();
        }
    };

    const endDraw = () => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        lastPointRef.current = null;

        if (flushTimerRef.current !== null) {
            clearInterval(flushTimerRef.current);
            flushTimerRef.current = null;
        }

        flushChunk();

        const pixels = [...strokeRef.current.values()];
        strokeRef.current = new Map();
        if (pixels.length === 0) return;

        void saveStroke({ color: strokeColorRef.current, pixels });
    };

    return (
        <div className="flex flex-col items-center justify-between w-full h-full">
            <div className="flex justify-center items-center py-1">
                <input
                    type="color"
                    aria-label="Brush colour"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="glass-button w-10 h-10 mx-2 p-1"
                />
                <div className="flex items-center px-3 h-10 mx-2 rounded-xl bg-white/40 dark:bg-white/10 backdrop-blur-sm border border-white/40 dark:border-white/15 shadow-[4px_4px_0px_0px_#1e293b]">
                    <input
                        type="range"
                        min="2"
                        max="24"
                        value={width}
                        onChange={(e) => setWidth(Number(e.target.value))}
                        aria-label="Brush size"
                        style={{ accentColor: color }}
                        className="w-24 sm:w-28 cursor-pointer"
                    />
                </div>
                <div
                    className="w-10 h-10 mx-2 flex items-center justify-center rounded-xl bg-white/40 dark:bg-white/10 backdrop-blur-sm border border-white/40 dark:border-white/15 shadow-[4px_4px_0px_0px_#1e293b]"
                    title={`Brush size: ${width}px`}
                    aria-label={`Brush size: ${width}px`}
                >
                    <svg width="32" height="32" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r={Math.max(1, width / 2)} fill={color} />
                    </svg>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center w-full min-h-0">
                <canvas
                    ref={canvasRef}
                    width={BOARD_SIZE}
                    height={BOARD_SIZE}
                    style={{ cursor: cursorStyle }}
                    className="bg-white touch-none"
                    onPointerDown={startDraw}
                    onPointerMove={drawMove}
                    onPointerUp={endDraw}
                    onPointerCancel={endDraw}
                />
            </div>
            <div className="h-[52px] invisible" aria-hidden="true" />
        </div>
    );
}
