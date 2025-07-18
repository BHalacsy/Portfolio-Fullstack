using backend.services;
using Microsoft.AspNetCore.SignalR;

namespace backend.hubs;

public class CanvasHub : Hub
{
    // public async Task SendStroke(List<Pixel> stroke)
    // {
    //     await Clients.All.SendAsync("recvStroke", stroke);
    // }
    //replaces program.cs line 70 "recvStroke" if needed
}