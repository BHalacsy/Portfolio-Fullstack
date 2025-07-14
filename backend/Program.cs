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

var app = builder.Build();


if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
app.UseHttpsRedirection();
app.UseCors();
app.UseWebSockets();

//Counter increase and get
app.MapGet("/stat/viewer", async () =>
{
    using var client = new RedisClient("localhost", 6379);
    var resp = await client.Command("INCR viewcounter");
    return Parser.IntParser(resp);
})
.WithName("IncrViewCounter");

//Make change to canvas
app.MapPost("/canvas/draw", async (HttpRequest req) =>
{
    using var reader = new StreamReader(req.Body);
    var body = await reader.ReadToEndAsync();
    
    var canvas = System.Text.Json.JsonSerializer.Deserialize<Canvas>(body);
    if (canvas == null) return Results.BadRequest("Null canvas data");
    
    Console.WriteLine($"hit to loop");
    
    var cmd = "HSET canvas ";
    foreach(var i in canvas.Pixels)
    {
        cmd += $"{i.X}X{i.Y} {i.Color} ";
        Console.WriteLine($"{i.X}X{i.Y} {i.Color}");
    }
    cmd = cmd.TrimEnd();
    
    using var client = new RedisClient("localhost", 6379);
    await client.Command(cmd);
    return Results.Ok();
})
.WithName("DrawCanvas");

//Get canvas update
app.MapGet("/canvas/data", async () =>
{
    using var client = new RedisClient("localhost", 6379);
    var resp = await client.Command("HGETALL canvas");
    var pixels = Parser.CanvasParser(resp);
    return System.Text.Json.JsonSerializer.Serialize(pixels);
})
.WithName("GetCanvas");


app.Run();