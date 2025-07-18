using backend.services;
using Microsoft.AspNetCore.SignalR;

namespace backend.hubs;

public class ChatHub : Hub
{
    public async Task BroadcastMessage(string username, string message) //NOT called in backend
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(message)) return;
        
        var payload = new { username, message, timestamp = DateTime.UtcNow };
        await Clients.All.SendAsync("RecvMessage", payload);
    }
}