using backend.hubs;
using Microsoft.AspNetCore.WebSockets;
using backend.services;
using backend.util;
using Microsoft.AspNetCore.SignalR;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
// builder.Services.AddWebSockets(options =>
// {
//     
// });
builder.Services.AddSignalR();
builder.Services.AddSingleton<CanvasService>();
builder.Services.AddSingleton<ChatService>();


var app = builder.Build();


if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
app.UseHttpsRedirection();
app.UseCors();


app.MapHub<ChatHub>("/chat/hub");
app.MapHub<CanvasHub>("/canvas/hub");


//Counter increase and get
app.MapGet("/stat/viewer", async () =>
{
    using var client = new RedisClient();
    var resp = await client.Command("INCR viewcounter");
    return Parser.IntParser(resp);
});


//Get canvas update
app.MapGet("/canvas/data", async (CanvasService cs) =>
{
    return await cs.GetCanvas();
});

//Make change to canvas
app.MapPost("/canvas/draw", async (CanvasService cs, HttpRequest req, IHubContext<CanvasHub> hc) =>
{
    using var reader = new StreamReader(req.Body);
    var body = await reader.ReadToEndAsync();

    var newCanvas = System.Text.Json.JsonSerializer.Deserialize<Canvas>(body);
    if (newCanvas == null) return Results.BadRequest("Null canvas data");

    await cs.DrawCanvas(newCanvas);
    await hc.Clients.All.SendAsync("recvStroke", newCanvas.Pixels);
    return Results.Ok();
});

//Get users all
app.MapGet("/chat/users", async (ChatService chs) =>
{
    var retList = await chs.GetUsers();
    return Results.Ok(retList);
});


//Set username
app.MapPost("/chat/join", async (ChatService chs, HttpRequest req) =>
{
    using var reader = new StreamReader(req.Body);
    string username = (await reader.ReadToEndAsync());
    
    if (await chs.Join(username)) return Results.Ok();
    return Results.BadRequest("Failed to join chatroom");
});

//Del username
app.MapDelete("/chat/leave", async (ChatService chs, HttpRequest req) =>
{
    using var reader = new StreamReader(req.Body);
    string username = (await reader.ReadToEndAsync());

    await chs.Leave(username);
    return Results.Ok();
});




app.Run();