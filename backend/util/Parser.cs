using System.Text;
using backend.services;

namespace backend.util;

public static class Parser
{
    public static string ParseCommand(string command) //To Redis
    {
        var parts = command.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var builder = new StringBuilder();
        builder.Append($"*{parts.Length}\r\n");
        foreach (var i in parts)
        {
            builder.Append($"${i.Length}\r\n{i}\r\n");
        }
        return builder.ToString();
    }

    public static int IntParser(string line) //From Redis
    {
        int end = line.IndexOf("\r\n", StringComparison.Ordinal);
        return int.Parse(line.Substring(1, end - 1));
    }

    public static List<Pixel> CanvasParser(string line) // From Redis
    {
        var retList = new List<Pixel>();
        var lines = line.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        
        for (int i = 2; i < lines.Length; i += 4)
        {
            var key = lines[i];
            Console.Write(key + " ");
            var val = lines[i + 2];
            Console.Write(val + " ");
            var coords = key.Split("X");
            var append = new Pixel(int.Parse(coords[0]), int.Parse(coords[1]), val);
            retList.Add(append);
        }
        return retList;
    }

    public static List<string> ListParser(string line)
    {
        var retList = new List<string>();
        var parts = line.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        int elementCount = int.Parse(parts[0].Substring(1));
        for (var i = 2; i < parts.Length && retList.Count < elementCount; i += 2)
        {
            retList.Add(parts[i]);
        }
        return retList;
    }
}