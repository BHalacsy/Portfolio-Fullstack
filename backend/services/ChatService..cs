using backend.util;

namespace backend.services;

public class ChatService
{
    private int _connected;
    private readonly RedisClient _client;
    
    public ChatService(RedisClient client)
    {
        _connected = 0;
        _client = client;
    }

    private async Task<string> SetUser()
    {
        var resp = await _client.Command($"SPOP users");
        var parts = resp.Split("\r\n");
        
        return parts[1];
    }
    
    public int GetUsers()
    {
        return _connected;
    }

    public async Task<string?> Join()
    {
        if (_connected >= 16) return null;
        
        _connected++;
        return await SetUser();
    }
    

    public async Task Leave(string user)
    {
        var resp = await _client.Command($"SADD users {user}");
        if (Parser.IntParser(resp) == 1)
        {
            Console.WriteLine($"Added back {user}");
            _connected--;
            return;
        }
        Console.WriteLine($"Added back already pooled name: {user}");
    }

    public async Task Reset()
    {
        await _client.Command($"SADD users lion panther jay tiger robin giraffe bee cow pig donkey fish hippo panda wolf deer bear");
        _connected = 0;
    }
}