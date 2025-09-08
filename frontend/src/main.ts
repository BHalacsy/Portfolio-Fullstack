import {Chatroom} from "./chatroom.ts";
import {Canvas, GetPixel} from "./canvas.ts";
import {Observer} from "tailwindcss-intersect";


//Start Intersect Observer
Observer.start();

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
const volumeIcon = document.getElementById("volumeIcon") as HTMLImageElement;
const arrowUp = document.getElementById("arrowUp") as HTMLImageElement;
const chatViewer = document.getElementById("chatViewer") as HTMLDivElement;

//Audio elements
const player = document.getElementById("player") as HTMLAudioElement;
const trackID = document.getElementById("trackSelect") as HTMLSelectElement;
const trackMap = new Map<string,string>([
    ["A" , "audio/DiscoElysium.mp3"],
    ["B" , "audio/LittleBigPlanet.mp3"],
    ["C" , "audio/ClubPenguin.mp3"]
]);
const volSlider = document.getElementById("volumeControl") as HTMLInputElement;


function darkToggle() : void {
    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");
    landingImg.src = isDark ? "media/darkLanding.svg" : "media/lightLanding.svg";
    darkModeIcon.src = isDark ? "media/darkToggle.svg" : "media/lightToggle.svg";
    arrowDown.src = isDark ? "media/darkArrow.svg" : "media/lightArrow.svg";
    volumeIcon.src = isDark ? "media/darkVolume.svg" : "media/lightVolume.svg";
    arrowUp.src = isDark ? "media/darkArrow.svg" : "media/lightArrow.svg";
    chatViewer.classList.toggle("bg-black", isDark);
    chatViewer.classList.toggle("bg-white", !isDark);
}

function loadSettings() : void {
    const mode = localStorage.getItem("mode") ?? "light";
    if (mode === "dark") {
        darkToggle();
    }
    //Used to hold the track and vol selected, but autoplay restrictions have made those obsolete
}

function updateUserCount() : void {
    theChatroom.getUsers().then(active => {
        const userCount = document.getElementById("userCount") as HTMLSpanElement;
        userCount.innerHTML = `${active}/16`;
    });
}

//User joins
window.addEventListener("DOMContentLoaded", async () =>{
    //Set user pref
    loadSettings();

    //Init counter
    const respCounter : Response = await fetch("http://localhost:5127/counter/view");
    const theCounter : string = await respCounter.json();
    const counterSpan = document.getElementById("viewCounter") as HTMLSpanElement;
    counterSpan.innerHTML = `You are visitor number:<br> ${theCounter}`;

    //Init chatroom
    await theChatroom.connectChat();
    const connectedUsers = await theChatroom.getUsers();
    const userCount = document.getElementById("userCount") as HTMLSpanElement;
    userCount.innerHTML = `${connectedUsers}/16`;

    //Init canvas
    await theCanvas.connectCanvas();
});


//User leaves
window.addEventListener("beforeunload", async () => {
    const mode : string = document.body.classList.contains("dark") ? "dark" : "light";
    // const track : string = (document.getElementById("trackSelect") as HTMLSelectElement).value;
    // const vol : string = (document.getElementById("volumeControl") as HTMLInputElement).value;
    localStorage.setItem("mode", `${mode}`);
    // localStorage.setItem("track", `${track}`);
    // localStorage.setItem("vol", `${vol}`);

    theChatroom.disconnectChat();
    theCanvas.disconnectCanvas();
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
    darkToggle();
});

//Track switching
trackID.addEventListener("change", (e) =>{
    const selected = (e.target as HTMLSelectElement).value

    if (selected && trackMap.has(selected)) {
        player.src = trackMap.get(selected)!;
        player.load();
        player.volume = Number(volSlider.value) / 100;
        player.play().catch(err => {
            console.warn("Autoplay failed:", err);
        })
    }
    else {
        player.src = "";
    }
});

//Volume slider
volSlider.addEventListener("input", () => {
    player.volume = Number(volSlider.value) / 100;
});

//Occasional refresh user count
setInterval(updateUserCount, 10000);