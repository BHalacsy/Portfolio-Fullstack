//import {Chatroom} from "./chatroom.js";
import {Canvas} from "./canvas.js";

window.addEventListener("DOMContentLoaded", () => {
    //TODO replace with get Canvas from backend
    const theCanvas = new Canvas("theCanvas");
    theCanvas.setColor("#FF0000");
    theCanvas.setSize(5);
});
