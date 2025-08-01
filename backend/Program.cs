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
builder.Services.AddSingleton<CanvasService>(); //TODO remove or implement
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

//TODO handle alt results for endpoints

//Counter increase and get
app.MapGet("/counter/view", async () =>
{
    using var client = new RedisClient();
    var resp = await client.Command("INCR viewcounter");
    return Results.Ok(Parser.IntParser(resp));
});


//Get canvas update
app.MapGet("/canvas/data", async (CanvasService cs) =>
{
    var resp = await cs.GetCanvas();
    return Results.Ok(resp);
});

//Make change to canvas
app.MapPost("/canvas/draw", async (CanvasService cs, HttpRequest req, IHubContext<CanvasHub> hc) =>
{
    using var reader = new StreamReader(req.Body);
    var body = await reader.ReadToEndAsync();

    var newCanvas = System.Text.Json.JsonSerializer.Deserialize<List<Pixel>>(body);
    if (newCanvas == null) return Results.BadRequest("Null canvas data");

    await cs.DrawCanvas(newCanvas);
    //await hc.Clients.All.SendAsync("recvStroke", newCanvas.Pixels); //TODO implement maybe
    return Results.Ok();
});

//Get users all
app.MapGet("/chat/users", async (ChatService chs) =>
{
    var retList = await chs.GetUsers();
    return Results.Ok(retList);
});

//Set username
app.MapGet("/chat/join", async (ChatService chs) =>
{
    var resp = await chs.Join();
    if (resp != null) return Results.Ok(resp);
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