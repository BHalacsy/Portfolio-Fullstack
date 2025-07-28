import {Chatroom} from "./chatroom.ts";
import {Canvas, Pixel} from "./canvas.ts";

window.addEventListener("DOMContentLoaded", async () => {
    //Init counter
    const respCounter : Response = await fetch("http://localhost:5127/counter/view");
    const theCounter : string = await respCounter.json(); //TODO check what we get
    const counterSpan = document.getElementById("viewCounter") as HTMLElement;
    counterSpan.innerHTML = `You are visitor number:<br> ${theCounter}`;


    //Init chatroom
    const theChatroom = new Chatroom();
    await theChatroom.hubConnect();
    await theChatroom.sendMessage("TEST MESSAGE");



    //Init canvas
    console.log("hit2")
    const theCanvas = new Canvas("theCanvas");
    const respCanvas : Response = await fetch("http://localhost:5127/canvas/data");
    if (!respCanvas.ok){
        console.warn("Canvas init failed")
    }
    else{
        const respData : Pixel[] = JSON.parse(await respCanvas.json());
        console.log(respData.length);
        for (const pixel of respData) {
            theCanvas.crc.fillStyle = pixel.color;
            theCanvas.crc.fillRect(pixel.x, pixel.y, 1, 1);
        }
    }
});
