import {HubConnection, HubConnectionBuilder} from "@microsoft/signalr";


export class Chatroom {
    private username : string | undefined;
    private readonly connection : HubConnection;
    private sendButton : HTMLButtonElement;
    private inputText : HTMLInputElement;
    // private colorAssign : Map<string,string>;

    constructor() {
        this.connection = new HubConnectionBuilder()
                        .withUrl("/chat/hub")
                        .withAutomaticReconnect()
                        .build();
        this.sendButton = document.getElementById("inputButton") as HTMLButtonElement;
        this.inputText = document.getElementById("inputText") as HTMLInputElement;
        // this.colorAssign = new Map<string, string>([
        //    // ['lion', '#e6194b'],
        //    //  ['panther', ''],
        //    //  ['tiger', ''],
        //    //  ['jay', ''],
        //    //  ['robin', ''],
        //    //  ['giraffe', ''],
        //    //  ['bee', ''],
        //    //  ['pig', ''],
        //    //  ['monkey', ''],
        //    //  ['donkey', ''],
        //    //  ['fish', ''],
        //    //  ['hippo', ''],
        //    //  ['panda', ''],
        //    //  ['wolf', ''],
        //    //  ['bear', ''],
        //    //  ['deer', '']
        //     //TODO fill with colors
        // ]);
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

    private async getUsers() : Promise<string []>{ //TODO make public and use in UI to show active users
        //TODO change to be a list locally in the backend?
        const req = new Request("/chat/users", {
            method: "GET",
            headers: {"Content-Type": "text/plain"}
        });

        const resp : Response = await fetch(req);
        if (!resp.ok){
            console.warn(resp.statusText);
            return [];
        }
        return await resp.json();
    }

    public async hubConnect() : Promise<boolean>{
        if (!await this.initUsername()) return false;

        this.connection.on("RecvMessage", (recv) => {
            const {username, message, timestamp} = recv;
            const chatViewer = document.getElementById("chatViewer");
            if (chatViewer) {
                const msgDiv = document.createElement("div");
                msgDiv.className = "bg-blue-100 p-2 rounded self-end";
                msgDiv.textContent = `[${timestamp}] ${username}: ${message}`;
                chatViewer.appendChild(msgDiv);
                // chatViewer.scrollTop = chatViewer.scrollHeight;
            }
            //TODO change to rem milli seconds
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

        //TODO make active users list.
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

    public async hubDisconnect() : Promise<void>{ //TODO implement on leave
        const req = new Request("/chat/leave", {
            method: "DELETE",
            body: this.username,
            headers: {"Content-Type": "text/plain"}
        });
        await fetch(req);

        if (this.connection) {
            await this.connection.stop();
            console.log("Message hub offline");
        }
    }
}