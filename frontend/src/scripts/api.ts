export const API_BASE = (
    import.meta.env.PUBLIC_API_URL ??
    (import.meta.env.DEV ? "http://localhost:5127" : "https://api.halacsy.com")
).replace(/\/+$/, "");

export const WS_URL =
    import.meta.env.PUBLIC_WS_URL ?? `${API_BASE.replace(/^http/, "ws")}/connection/websocket`;

export interface Pixel {
    x: number;
    y: number;
}

export interface StoredPixel extends Pixel {
    color: string;
}

export interface Stroke {
    color: string;
    pixels: Pixel[];
}

export const BOARD_SIZE = 300;
const TILE_SIZE = 30;
const TILES_PER_ROW = BOARD_SIZE / TILE_SIZE;
export const TILE_COUNT = TILES_PER_ROW * TILES_PER_ROW;
export const MAX_PIXELS_PER_REQUEST = 1000;

export function chunkPixels<T>(pixels: T[], size: number = MAX_PIXELS_PER_REQUEST): T[][] {
    if (pixels.length <= size) return [pixels];

    const chunks: T[][] = [];
    for (let i = 0; i < pixels.length; i += size) chunks.push(pixels.slice(i, i + size));
    return chunks;
}

const tileOf = (p: Pixel) => Math.floor(p.y / TILE_SIZE) * TILES_PER_ROW + Math.floor(p.x / TILE_SIZE);

async function json<T>(path: string): Promise<T> {
    const resp = await fetch(`${API_BASE}${path}`);
    if (!resp.ok) throw new Error(`GET ${path} -> ${resp.status}`);
    return (await resp.json()) as T;
}

export function fetchBoard(): Promise<StoredPixel[][]> {
    return Promise.all(
        Array.from({ length: TILE_COUNT }, (_, id) =>
            json<StoredPixel[] | null>(`/canvas/data/${id}`)
                .then((pixels) => pixels ?? [])
                .catch((e) => {
                    console.warn("Canvas tile load failed: ", e);
                    return [] as StoredPixel[];
                }),
        ),
    );
}

export function saveStroke({ color, pixels }: Stroke): Promise<unknown> {
    const tiles = new Map<number, Pixel[]>();
    for (const pixel of pixels) {
        const id = tileOf(pixel);
        const bucket = tiles.get(id);
        if (bucket) bucket.push(pixel);
        else tiles.set(id, [pixel]);
    }

    return Promise.all(
        [...tiles].flatMap(([id, tilePixels]) =>
            chunkPixels(tilePixels).map((chunk) =>
                fetch(`${API_BASE}/canvas/draw/${id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ color, pixels: chunk } satisfies Stroke),
                })
                    .then((resp) => {
                        if (!resp.ok) throw new Error(`tile ${id} -> ${resp.status}`);
                    })
                    .catch((e) => console.error("Stroke saving failed: ", e)),
            ),
        ),
    );
}

export const fetchChatUsers = () => json<number>("/chat/users");

export const fetchViewCount = () => json<number>("/counter/view");
