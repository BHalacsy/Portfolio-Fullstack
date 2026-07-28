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
    private readonly RedisClient _client;

    public CanvasService(RedisClient client)
    {
        _client = client;
    }
    
    public async Task<List<GetPixel>> GetCanvas(int tileID)
    {
        var resp = await _client.Command($"HGETALL canvas{tileID}");
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
        await _client.Command(cmd);
    }
    
    public async Task ClearCanvas()
    {
        for (int i = 0; i < 100; i++)
        {
            var cmd = $"DEL canvas{i}";
            await _client.Command(cmd);
        }
    }
}