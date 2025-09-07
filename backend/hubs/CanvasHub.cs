using backend.services;
using Microsoft.AspNetCore.SignalR;

namespace backend.hubs;

public class CanvasHub : Hub
{
     public async Task BroadcastStroke(Stroke stroke)
     {
         await Clients.Others.SendAsync("RecvStroke", stroke);
     }
}