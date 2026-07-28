using backend.services;
using Microsoft.AspNetCore.SignalR;

namespace backend.hubs;

public class ChatHub : Hub
{
    private readonly ChatService _chatService;
    private static readonly Dictionary<string, string> _connectionIdtoUser = new();
    
    public ChatHub(ChatService chatService)
    {
        _chatService = chatService;
    }
    
    public async Task BroadcastMessage(string message)
    {
        if (!_connectionIdtoUser.TryGetValue(Context.ConnectionId, out var username))
        {
            await Clients.Caller.SendAsync("Error", "You are not connected.");
            return;
        }

        if (string.IsNullOrWhiteSpace(message)) return;

        var timeSent = DateTime.UtcNow.TimeOfDay;
        var timestamp = new TimeSpan(timeSent.Hours, timeSent.Minutes, timeSent.Seconds);
        var payload = new { username, message, timestamp };
        await Clients.All.SendAsync("RecvMessage", payload);
    }
    
     public override async Task OnConnectedAsync()
    {
        var username = await _chatService.Join();
        if (username == null)
        {
            await Clients.Caller.SendAsync("Error", "Chat is full at this time.");
            Context.Abort();
            return;
        }
        
        Console.WriteLine($"New user {username}");
        _connectionIdtoUser[Context.ConnectionId] = username;
        await Clients.Caller.SendAsync("RecvUsername", username);
        await base.OnConnectedAsync();
    }
     
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (_connectionIdtoUser.TryGetValue(Context.ConnectionId, out var username))
        {
            await _chatService.Leave(username);
            _connectionIdtoUser.Remove(Context.ConnectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }
}