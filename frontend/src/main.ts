import {Chatroom} from "./chatroom.ts";
import {Canvas, Pixel} from "./canvas.ts";

const theChatroom = new Chatroom();
const theCanvas = new Canvas("theCanvas");


//User joins
window.addEventListener("DOMContentLoaded", async () => {
    //Init counter
    const respCounter : Response = await fetch("http://localhost:5127/counter/view");
    const theCounter : string = await respCounter.json(); //TODO replace with load icon
    const counterSpan = document.getElementById("viewCounter") as HTMLElement;
    counterSpan.innerHTML = `You are visitor number:<br> ${theCounter}`;

    //Init chatroom
    await theChatroom.hubConnect();

    //Init canvas //TODO assure consistent loading
    for (let i = 0; i <= 99; i++){
        const respCanvas: Response = await fetch(`http://localhost:5127/canvas/data/${i}`);
        if (!respCanvas.ok) {
            console.warn(`Canvas tile ${i} load failed`);
            continue;
        }

        const respData: Pixel[] = await respCanvas.json();
        for (const pixel of respData) {
            theCanvas.crc.fillStyle = pixel.color;
            theCanvas.crc.fillRect(pixel.x, pixel.y, 1, 1);
        }
    }
});

//User leaves
window.addEventListener("beforeunload", async () => {
    await theChatroom.hubDisconnect();
});
