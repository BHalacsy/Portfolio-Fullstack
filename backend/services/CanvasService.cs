using System.Text.Json.Serialization;
using backend.util;

namespace backend.services;

public record Pixel(
    [property: JsonPropertyName("x")] int X,
    [property: JsonPropertyName("y")] int Y,
    [property: JsonPropertyName("color")] string Color
);
public record Canvas([property: JsonPropertyName("pixels")] List<Pixel> Pixels);

public class CanvasService
{
    public async Task<string> GetCanvas()
    {
        using var client = new RedisClient();
        var resp = await client.Command("HGETALL canvas");
        var pixels = Parser.CanvasParser(resp);
        return System.Text.Json.JsonSerializer.Serialize(pixels);
    }
    
    public async Task DrawCanvas(List<Pixel> pixels)
    {
        var cmd = "HSET canvas ";
        foreach(var i in pixels)
        {
            cmd += $"{i.X}X{i.Y} {i.Color} ";
        }
        cmd = cmd.TrimEnd();
    
        using var client = new RedisClient();
        await client.Command(cmd);
    }
}