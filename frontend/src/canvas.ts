
export interface Pixel {
    x: number;
    y: number;
    color: string;
}

export class Canvas {
    private canvas : HTMLCanvasElement;
    private inputColor : HTMLInputElement;
    public crc : CanvasRenderingContext2D;
    private draw : boolean = false;
    private updatePixels : Pixel[] = [];

    constructor(id : string){
        this.canvas = document.getElementById(id) as HTMLCanvasElement;
        this.inputColor = document.getElementById("inputColor") as HTMLInputElement;
        this.crc = <CanvasRenderingContext2D>this.canvas.getContext("2d");
        this.crc.lineWidth = 10;
        this.eventListen();
    }

    private eventListen() {
        this.canvas.addEventListener("mousedown", (e) => this.startDraw(e));
        this.canvas.addEventListener("mousemove", (e) => this.drawMove(e));
        this.canvas.addEventListener("mouseup", () => this.endDraw());
        this.canvas.addEventListener("mouseleave", () => this.endDraw());
        this.inputColor.addEventListener("change", (e) => this.setColor((e.target as HTMLInputElement).value));
    }

    private startDraw(e: MouseEvent) {
        this.draw = true;
        this.crc.beginPath();
        this.crc.moveTo(e.offsetX, e.offsetY);
    }

    private drawMove(e: MouseEvent) {
        if (!this.draw) return;
        this.crc.lineTo(e.offsetX, e.offsetY);
        this.crc.stroke();
        const radius = Math.round(this.crc.lineWidth / 2);
        const centerX = Math.round(e.offsetX);
        const centerY = Math.round(e.offsetY);
        const color = this.crc.strokeStyle as string;

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (dx * dx + dy * dy <= radius * radius) {
                    this.updatePixels.push({
                        x: centerX + dx,
                        y: centerY + dy,
                        color: color
                    });
                }
            }
        }
    }

    private endDraw() {
        this.draw = false;
        this.crc.closePath();
        this.updateCanvas(this.updatePixels);
        this.updatePixels = [];
    }

    public async updateCanvas(pixels : Pixel[]) : Promise<void>{
        await fetch("http://localhost:5127/canvas/draw",{
            method: "POST",
            headers: {"Content-Type" : "application/json"},
            body: JSON.stringify(pixels)
        });
    }

    public setColor(color : string) {
        this.crc.strokeStyle = color;
    }
}