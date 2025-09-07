using System.Text.Json.Serialization;
using backend.util;

namespace backend.services;

public record Pixel(
    [property: JsonPropertyName("x")] int X,
    [property: JsonPropertyName("y")] int Y,
    [property: JsonPropertyName("color")] string Color
);
//public record Canvas([property: JsonPropertyName("pixels")] List<Pixel> Pixels);

public class CanvasService
{
    public async Task<List<Pixel>> GetCanvas(int tileID)
    {
        using var client = new RedisClient();
        var resp = await client.Command($"HGETALL canvas{tileID}");
        var pixels = Parser.CanvasParser(resp);
        return pixels;
    }
    
    public async Task DrawCanvas(int tileID, List<Pixel> pixels)
    {
        var cmd = $"HSET canvas{tileID} "; //chunk to send full
        Console.WriteLine(pixels.Count);
        foreach(var i in pixels)
        {
            cmd += $"{i.X}x{i.Y} {i.Color} ";
            
        }
        cmd = cmd.TrimEnd();
        using var client = new RedisClient();
        await client.Command(cmd);
    }
    
    //TODO implement on 24hr clock
    public async Task ClearCanvas()
    {
        for (int i = 0; i < 99; i++)
        {
            var cmd = $"DEL canvas{i}";
            using var client = new RedisClient();
            await client.Command(cmd);
        }
    }
}