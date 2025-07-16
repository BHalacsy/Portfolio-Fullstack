using Microsoft.AspNetCore.WebSockets;
using backend.services;
using backend.util;

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
builder.Services.AddSingleton<CanvasService>();
builder.Services.AddSingleton<ChatService>();
builder.Services.AddSingleton<RedisClient>();


var app = builder.Build();


if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
app.UseHttpsRedirection();
app.UseCors();
app.UseWebSockets();


// app.Map("/sse", async context =>
// {
//     
// });


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
app.MapPost("/canvas/draw", async (CanvasService cs, HttpRequest req) => //TODO make separate put and post req
{
    using var reader = new StreamReader(req.Body);
    var body = await reader.ReadToEndAsync();

    var newCanvas = System.Text.Json.JsonSerializer.Deserialize<Canvas>(body);
    if (newCanvas == null) return Results.BadRequest("Null canvas data");

    await cs.DrawCanvas(newCanvas);
    return Results.Ok();
});


//Get all users
app.MapGet("/chat/join", async (ChatService chs, HttpRequest req) =>
{
    using var reader = new StreamReader(req.Body);
    string username = (await reader.ReadToEndAsync());
    
    if (await chs.Join(username)) return Results.Ok();
    return Results.BadRequest("Failed to join chatroom");
});

//Set username
app.MapPost("/chat/send", async (ChatService chs, HttpRequest req) =>
{
    using var reader = new StreamReader(req.Body);
    string username = (await reader.ReadToEndAsync());

    await chs.Send(username, "test"); //TODO change to handle json and message
    return Results.Ok();
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