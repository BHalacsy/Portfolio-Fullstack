using System.Text.Json.Serialization;
using backend.util;

namespace backend.services;

//Used for setting
public record Pixel(
    [property: JsonPropertyName("x")] int X,
    [property: JsonPropertyName("y")] int Y
);

public record Stroke(
    [property: JsonPropertyName("color")] string Color,
    [property: JsonPropertyName("pixels")] List<Pixel> Pixels
);

//Used to get canvas, ugly to use one for setting and one for getting but helps reduce the amount sent when setting
public record GetPixel(
    [property: JsonPropertyName("x")] int X,
    [property: JsonPropertyName("y")] int Y,
    [property: JsonPropertyName("color")] string Color
);

public class CanvasService
{
    public async Task<List<GetPixel>> GetCanvas(int tileID)
    {
        using var client = new RedisClient();
        var resp = await client.Command($"HGETALL canvas{tileID}");
        var pixels = Parser.CanvasParser(resp);
        return pixels;
    }
    
    public async Task DrawCanvas(int tileID, Stroke pixels)
    {
        var cmd = $"HSET canvas{tileID} "; //chunk to send full
        foreach(var i in pixels.Pixels)
        {
            cmd += $"{i.X}x{i.Y} {pixels.Color} ";
            
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