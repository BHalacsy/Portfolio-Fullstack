import {Chatroom} from "./chatroom.ts";
import {Canvas, Pixel} from "./canvas.ts";

//Toybox elements
const theChatroom = new Chatroom();
const theCanvas = new Canvas("theCanvas");

//Overhead menu elements
const menuButton = document.getElementById("menuButton") as HTMLButtonElement;
const menuContent = document.getElementById("menuContent") as HTMLDivElement;
let menuVisible = false;

//Dark mode elements
const darkModeToggle = document.getElementById("darkModeToggle") as HTMLButtonElement;
const landingImg = document.getElementById("landingImg") as HTMLImageElement;
const darkModeIcon = document.getElementById("darkModeIcon") as HTMLImageElement;
const arrowDown = document.getElementById("arrowDown") as HTMLImageElement;

//Audio elements
const player = document.getElementById("player") as HTMLAudioElement;
const trackID = document.getElementById("trackSelect") as HTMLSelectElement;
const trackMap = new Map<string,string>([
    ["A" , "./public/audio/DiscoElysium.mp3"],
    ["B" , "./public/audio/LittleBigPlanet.mp3"],
    ["C" , "./public/audio/ClubPenguin.mp3"]
]);

//User joins
window.addEventListener("DOMContentLoaded", async () => {
    //Init counter
    const respCounter : Response = await fetch("http://localhost:5127/counter/view");
    const theCounter : string = await respCounter.json();
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


//Control menu visibility
menuButton.addEventListener("click", (e) =>{
    menuVisible = !menuVisible;
    menuContent.classList.toggle("hidden", !menuVisible);

    const menuArrow = menuButton.querySelector("img") as HTMLImageElement;
    menuArrow.style.transform = menuVisible ? "rotate(180deg)" : "rotate(0deg)";
});


//Dark mode switching
darkModeToggle.addEventListener("click", () =>{
    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");
    landingImg.src = isDark ? "./public/media/darkLanding.svg" : "./public/media/lightLanding.svg";
    darkModeIcon.src = isDark ? "./public/media/darkToggle.svg" : "./public/media/lightToggle.svg";
    arrowDown.src = isDark ? "./public/media/darkArrow.svg" : "./public/media/lightArrow.svg";

});

//Track switching
trackID.addEventListener("change", (e) =>{
   const selected = (e.target as HTMLSelectElement).value

   if (selected && trackMap.has(selected)) {
       player.src = trackMap.get(selected)!;
       player.load()
       player.play().catch(err => {
           console.warn("Autoplay failed:", err);
       })
   }
   else {
       player.src = "";
   }
});