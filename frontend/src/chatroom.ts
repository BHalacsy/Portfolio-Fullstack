import {HubConnection, HubConnectionBuilder} from "@microsoft/signalr";


export class Chatroom {
    private username : string | undefined;
    private readonly connection : HubConnection;
    private sendButton : HTMLButtonElement;
    private inputText : HTMLInputElement;

    constructor() {
        this.connection = new HubConnectionBuilder()
                        .withUrl("/chat/hub")
                        .withAutomaticReconnect()
                        .build();
        this.sendButton = document.getElementById("inputButton") as HTMLButtonElement;
        this.inputText = document.getElementById("inputText") as HTMLInputElement;
        this.sendButton.addEventListener("click", async () => {
            const message = this.inputText.value.trim();
            if (message){
                await this.sendMessage(message);
                this.inputText.value = "";
            }
        })
    }

    private async initUsername() : Promise<boolean> {
        const req = new Request("/chat/join", {
            method: "GET",
            headers: {"Content-Type": "text/plain"}
        });

        const resp : Response = await fetch(req);
        if (!resp.ok){
            //TODO alert user max users chatting or invalid username
            console.warn(await resp.text()); // maybe just body?
            return false;
        }

        this.username = await resp.json();
        console.log(this.username);
        return true;
    }

    public async getUsers() : Promise<number>{
        const req = new Request("/chat/users", {
            method: "GET",
            headers: {"Content-Type": "text/plain"}
        });

        const resp : Response = await fetch(req);
        if (!resp.ok){
            console.warn(resp.statusText);
            return 0;
        }
        return Number(await resp.text());
    }

    //TODO should also handle stroke sending
    public async hubConnect() : Promise<boolean>{
        if (!await this.initUsername()) return false;

        const usernameSpan = document.getElementById("userDisplay") as HTMLSpanElement;
        usernameSpan.innerHTML = `you are connected as: ${this.username}`;

        this.connection.on("RecvMessage", (recv) => {
            const {username, message, timestamp} = recv;
            const chatViewer = document.getElementById("chatViewer");
            if (chatViewer) {
                const msgDiv = document.createElement("div");
                msgDiv.className = `bg-[var(--${username}-color)] mt-2 p-2 rounded self-end`;
                msgDiv.textContent = `[${timestamp}] ${username}: ${message}`;
                chatViewer.appendChild(msgDiv);
            }
        });

        await this.connection.start();

        console.log("Message hub online!");
        return true;
    }

    public async sendMessage(message : string) : Promise<void> {
        if (!this.connection){
            console.warn("SignalR connection not online");
            return;
        }

        if (this.username == undefined){
            console.warn("Logged out user sending message");
            return;
        }

        try
        {
            await this.connection.invoke("BroadcastMessage", this.username, message);
        } catch (e) {
            console.error("Message sending failed: ", e);
        }
    }

    public hubDisconnect() : void{
        if (this.username) {
            navigator.sendBeacon("/chat/leave", this.username);
        }
        if (this.connection) {
            this.connection.stop();
            console.log("Message hub offline");
        }
    }
}