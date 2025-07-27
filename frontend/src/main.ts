//import {Chatroom} from "./chatroom.js";
import {Canvas} from "./canvas.js";

window.addEventListener("DOMContentLoaded", async () => {
    //Init counter
    const respCounter = await fetch("http://localhost:5127/counter/view");
    const theCounter = await respCounter.json(); //TODO check what we get
    const counterSpan = document.getElementById("viewCounter") as HTMLElement;
    counterSpan.innerHTML = `You are visitor number:<br> ${theCounter}`;


    //Init chatroom
    // const theChatroom = new Chatroom("testusername"); //TODO replace with user input
    // while (!await theChatroom.hubConnect()){
    //     console.warn("Chatroom connection failed new username needed");
    // }
    // await theChatroom.sendMessage("TEST MESSAGE");



    //TODO replace with get Canvas from backend
    //Init canvas
    const theCanvas = new Canvas("theCanvas");
    const respCanvas = await fetch("http://localhost:5127/canvas/data");
    if (!respCanvas.ok){
        console.warn("Canvas init failed")
    }
    else{
        const respData = await respCanvas.json();
        for (const pixel of respData) {
            theCanvas.crc.fillStyle = pixel.color;
            theCanvas.crc.fillRect(pixel.x, pixel.y, 1, 1);
        }
    }
});
