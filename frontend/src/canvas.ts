import {HubConnection, HubConnectionBuilder} from "@microsoft/signalr";

export interface Pixel {
    x: number;
    y: number;
}

export interface Stroke {
    color: string;
    pixels: Pixel[];
}

interface GetPixel{
    color: string;
    x: number;
    y: number;
}

export class Canvas {
    private readonly connection : HubConnection;

    private canvas : HTMLCanvasElement;
    private inputColor : HTMLInputElement;
    private smallBrush : HTMLButtonElement;
    private mediumBrush : HTMLButtonElement;
    private largeBrush : HTMLButtonElement;
    private crc : CanvasRenderingContext2D;

    private draw : boolean = false;
    private updatePixels : Pixel[] = [];

    constructor(id : string){
        this.connection = new HubConnectionBuilder()
            .withUrl("/canvas/hub")
            .withAutomaticReconnect()
            .build();
        this.canvas = document.getElementById(id) as HTMLCanvasElement;
        this.inputColor = document.getElementById("inputColor") as HTMLInputElement;
        this.smallBrush = document.getElementById("smallBrush") as HTMLButtonElement;
        this.mediumBrush = document.getElementById("mediumBrush") as HTMLButtonElement;
        this.largeBrush = document.getElementById("largeBrush") as HTMLButtonElement;
        this.crc = <CanvasRenderingContext2D>this.canvas.getContext("2d");
        this.crc.lineWidth = 4;
        this.crc.lineCap = "round";
        this.crc.lineJoin = "round";

        this.eventListen();
    }

    private eventListen() {
        this.canvas.addEventListener("mousedown", (e) => this.startDraw(e));
        this.canvas.addEventListener("mousemove", (e) => this.drawMove(e));
        this.canvas.addEventListener("mouseup", () => this.endDraw());
        this.canvas.addEventListener("mouseleave", () => this.endDraw());
        this.inputColor.addEventListener("change", (e) => this.setColor((e.target as HTMLInputElement).value));
        this.smallBrush.addEventListener("click", () => this.setSize(4));
        this.mediumBrush.addEventListener("click", () => this.setSize(6));
        this.largeBrush.addEventListener("click", () => this.setSize(10));
    }

    private startDraw(e: MouseEvent) {
        this.draw = true;
        this.crc.beginPath();
        this.crc.moveTo(e.offsetX, e.offsetY);
    }

    private drawMove(e: MouseEvent) {
        if (!this.draw) return;

        const radius : number = Math.round(this.crc.lineWidth / 2);
        const centerX : number = Math.round(e.offsetX);
        const centerY : number = Math.round(e.offsetY);
        const color = this.crc.strokeStyle as string;

        this.crc.beginPath();
        this.crc.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.crc.fillStyle = color;
        this.crc.fill();
        this.crc.closePath();

        for (let dx : number = -radius; dx <= radius; dx++) {
            for (let dy : number = -radius; dy <= radius; dy++) {
                if (dx * dx + dy * dy <= radius * radius) {
                    this.updatePixels.push({
                        x: centerX + dx,
                        y: centerY + dy,
                    });
                }
            }
        }
    }

    private endDraw() : void {
        this.draw = false;
        this.crc.closePath();
        this.updateCanvas(this.updatePixels);
        this.updatePixels = [];
    }

    public async initCanvas() : Promise<void>{
        for (let i : number = 0; i <= 99; i++){
            const respCanvas: Response = await fetch(`http://localhost:5127/canvas/data/${i}`);
            if (!respCanvas.ok) {
                console.warn(`Canvas tile ${i} load failed`);
                continue;
            }

            const respData: GetPixel[] = await respCanvas.json();
            for (const pixel of respData) {
                this.crc.fillStyle = pixel.color;
                this.crc.fillRect(pixel.x, pixel.y, 1, 1);
            }
        }
    }

    public async updateCanvas(pixels : Pixel[]) : Promise<void>{
        if (pixels.length === 0) return;

        //Clean up pixels reg multiple times
        const uniquePixels : Pixel[] = Array.from(
            pixels.reduce((map, p) =>
                map.set(`${p.x},${p.y}`, p), new Map<string, Pixel>()).values()
        );

        const color = this.crc.strokeStyle as string;

        //For real-time updates
        const stroke: Stroke = {color, pixels: [...uniquePixels]};
        await this.sendStroke(stroke);

        //For storage of canvas
        //Tile splitting
        const tiles: Map<number, Stroke> = new Map();
        for (const p of uniquePixels) {
            const tileX : number = Math.floor(p.x / 30);
            const tileY : number = Math.floor(p.y / 30);
            const tileID : number = tileY * 10 + tileX;

            if (!tiles.has(tileID)) tiles.set(tileID,{color, pixels: []});
            tiles.get(tileID)!.pixels.push(p);
        }

        const tileEntries = Array.from(tiles.entries());

        for (const [tileID, stroke] of tileEntries) {
            //Chunking for custom redis to handle length
            const chunkSize = 150;
            const pixelChunks = [];
            if (stroke.pixels.length > chunkSize) {
                for (let i : number = 0; i < stroke.pixels.length; i += chunkSize) {
                    pixelChunks.push(stroke.pixels.slice(i, i + chunkSize));
                }
            } else {
                pixelChunks.push(stroke.pixels);
            }

            for (const chunk of pixelChunks) {
                try {
                    await fetch(`http://localhost:5127/canvas/draw/${tileID}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ color: stroke.color, pixels: chunk }),
                    });
                } catch (e) {
                    console.error(`Failed to send tile ${tileID}:`, e);
                }
            }
        }
    }

    private setColor(color : string) : void {
        this.crc.strokeStyle = color;
        const circles = document.querySelectorAll('circle');
        circles.forEach(circle => {
            circle.setAttribute('fill', color);
        });
    }

    private setSize(size : number) : void{
        this.crc.lineWidth = size;
    }


    //SignalR functionality
    public async connectCanvas() : Promise<void>{
        await this.initCanvas();

        this.connection.on("RecvStroke", (recv : Stroke) : void => {
            this.crc.fillStyle = recv.color;
            for (const pixel of recv.pixels) {
                this.crc.fillRect(pixel.x, pixel.y, 1, 1);
            }
        });

        await this.connection.start();
        console.log("Canvas hub online!");
    }

    public async sendStroke(stroke : Stroke) : Promise<void> {
        if (!this.connection){
            console.warn("Non-connected try to send stroke");
            return;
        }

        //SignalR default max size is 32kb
        const size : number = JSON.stringify(stroke).length;
        if (size > 32000) {
            const chunkSize : number = Math.ceil(stroke.pixels.length / Math.ceil(size / 32000));

            for (let i : number = 0; i < stroke.pixels.length; i += chunkSize) {
                const chunk: Stroke = {
                    color: stroke.color,
                    pixels: stroke.pixels.slice(i, i + chunkSize)
                };

                try {
                    await this.connection.invoke("BroadcastStroke", chunk);
                } catch (e) {
                    console.error("Chunked stroke sending failed: ", e);
                }
            }
        } else {
            try
            {
                await this.connection.invoke("BroadcastStroke", stroke);
            } catch (e) {
                console.error("Stroke sending failed: ", e);
            }
        }
        return;
    }

    public disconnectCanvas() : void {
        if (this.connection) {
            this.connection.stop().then(_ => console.log("Canvas hub offline"));
        }
    }
}