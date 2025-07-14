using System.Text.Json.Serialization;

namespace backend.services;

public record Pixel(
    [property: JsonPropertyName("x")] int X,
    [property: JsonPropertyName("y")] int Y,
    [property: JsonPropertyName("color")] string Color
);
public record Canvas([property: JsonPropertyName("pixels")] List<Pixel> Pixels);