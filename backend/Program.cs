using backend.hubs;
using backend.services;
using backend.util;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowDev", policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
    
    options.AddPolicy("AllowLive", policy =>
    {
        policy.WithOrigins("https://balint.halacsy.com")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddSignalR();
builder.Services.AddSingleton<RedisClient>();

builder.Services.AddSingleton<CanvasService>();
builder.Services.AddSingleton<ChatService>();

var app = builder.Build();


app.UseHttpsRedirection();
app.UseCors("AllowDev");
app.UseCors("AllowLive");


app.MapHub<ChatHub>("/chat/hub");
app.MapHub<CanvasHub>("/canvas/hub");



_ = Task.Run(async () =>
{
    while (true)
    {
        using var scope = app.Services.CreateScope();
        var cs = scope.ServiceProvider.GetRequiredService<CanvasService>();
        var chs = scope.ServiceProvider.GetRequiredService<ChatService>();
        
        
        await cs.ClearCanvas();
        await chs.Reset();
        
        Console.WriteLine("Reset");
        await Task.Delay(TimeSpan.FromHours(24));
    }
});

//Counter increase and get
app.MapGet("/counter/view", async (RedisClient client) => {
    var resp = await client.Command("INCR viewcounter");
    return Results.Ok(Parser.IntParser(resp));
});


//Get canvas update
app.MapGet("/canvas/data/{id:int}", async (int id, CanvasService cs) =>
{
    var resp = await cs.GetCanvas(id);
    return Results.Ok(resp);
});

//Make change to canvas
app.MapPost("/canvas/draw/{id:int}", async (int id, CanvasService cs, HttpRequest req) =>
{
    using var reader = new StreamReader(req.Body);
    var body = await reader.ReadToEndAsync();

    var newStroke = System.Text.Json.JsonSerializer.Deserialize<Stroke>(body);
    if (newStroke == null) return Results.BadRequest("Null canvas data");

    await cs.DrawCanvas(id, newStroke);
    return Results.Ok();
});

//Get users all
app.MapGet("/chat/users", (ChatService chs) =>
{
    var userCount = chs.GetUsers();
    return Results.Ok(userCount);
});

//Set username
app.MapGet("/chat/join", async (ChatService chs) =>
{
    var resp = await chs.Join();
    if (resp != null) return Results.Ok(resp);
    return Results.BadRequest("Failed to join chatroom");
});

//Del username
app.MapPost("/chat/leave", async (ChatService chs, HttpRequest req) => //Set to post for navigator.beacon
{
    using var reader = new StreamReader(req.Body);
    string username = (await reader.ReadToEndAsync());
    await chs.Leave(username);
    return Results.Ok();
});

app.Run();