// import * as signalR from "@microsoft/signalr" //TODO change to only use needed signalR functions
//
//
// export class Chatroom {
//     private username : string;
//     private readonly connection : signalR.HubConnection
//     private sendButton : HTMLButtonElement
//     private inputText : HTMLInputElement
//
//     constructor(private name : string) {
//         this.username = name;
//         this.connection = new signalR.HubConnectionBuilder()
//                         .withUrl("/chat/hub")
//                         .withAutomaticReconnect()
//                         .build();
//         this.sendButton = document.getElementById("inputButton") as HTMLButtonElement;
//         this.inputText = document.getElementById("inputText") as HTMLInputElement;
//         this.sendButton.addEventListener("click", async () => {
//             const message = this.inputText.value.trim();
//             if (message){
//                 await this.sendMessage(message);
//                 this.inputText.value = ""; // Optionally clear input
//             }
//         })
//     }
//
//     private async initUsername() : Promise<boolean> {
//         const req = new Request("/chat/join", {
//             method: "GET",
//             headers: {"Content-Type": "text/plain"}
//         });
//
//         const resp : Response = await fetch(req);
//         if (!resp.ok){
//             //TODO alert user max users chatting or invalid username
//             console.warn(await resp.text()); // maybe just body?
//             return false;
//         }
//
//         this.username = await resp.json();
//         return true;
//     }
//
//     private async getUsers() : Promise<string []>{
//         const req = new Request("/chat/users", {
//             method: "GET",
//             headers: {"Content-Type": "text/plain"}
//         });
//
//         const resp : Response = await fetch(req);
//         if (!resp.ok){
//             console.warn(resp.statusText);
//             return [];
//         }
//
//         return await resp.json();
//     }
//
//     public async hubConnect() : Promise<boolean>{
//         if (!await this.initUsername()) return false;
//
//         this.connection.on("RecvMessage", (recv) => {
//             const {user, msg, time} = recv;
//             //TODO DOM inject here
//             console.log(`At ${time} from ${user} : ${msg}`);
//         });
//
//         await this.connection.start();
//         console.log("Message hub online!");
//         return true;
//     }
//
//     public async sendMessage(message : string) : Promise<void> {
//         if (!this.connection){
//             console.warn("SignalR connection not online");
//             return;
//         }
//
//         const users : string[] = await this.getUsers();
//         if (!users.includes(this.username)){
//             console.warn("Logged out user sending message");
//             return;
//         }
//
//         try
//         {
//             await this.connection.invoke("BroadcastMessage", this.username, message);
//         } catch (e) {
//             console.error("Message sending failed: ", e);
//         }
//     }
//
//     public async hubDisconnect() : Promise<void>{
//         const req = new Request("/chat/leave", {
//             method: "DELETE",
//             body: this.username,
//             headers: {"Content-Type": "text/plain"}
//         });
//         await fetch(req);
//
//         if (this.connection) {
//             await this.connection.stop();
//             console.log("Message hub offline");
//         }
//     }
// }