


export class Canvas {
    private size : number = 5;
    private color : string = "#000000";
    private canvas : HTMLCanvasElement;
    private crc : CanvasRenderingContext2D;
    private draw : boolean = false;

    constructor(id : string){
        this.canvas = document.getElementById(id) as HTMLCanvasElement;
        this.crc = <CanvasRenderingContext2D>this.canvas.getContext("2d");
        this.eventListen();
    }

    private eventListen() {
        this.canvas.addEventListener("mousedown", (e) => this.startDraw(e));
        this.canvas.addEventListener("mousemove", (e) => this.drawMove(e));
        this.canvas.addEventListener("mouseup", () => this.endDraw());
        this.canvas.addEventListener("mouseleave", () => this.endDraw());
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
    }

    private endDraw() {
        this.draw = false;
        this.crc.closePath();
    }

    public setColor(color: string) {
        this.color = color;
        this.crc.strokeStyle = color;
    }

    public setSize(size: number) {
        this.size = size;
        this.crc.lineWidth = size;
    }
}