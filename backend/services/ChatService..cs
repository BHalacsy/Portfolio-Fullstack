using backend.util;

namespace backend.services;

public class ChatService
{
    private int _connected;

    public ChatService()
    {
        _connected = 0;
    }

    private async Task<string> SetUser()
    {
        var client = new RedisClient();
        var resp = await client.Command($"SPOP users");
        var parts = resp.Split("\r\n");
        
        return parts[1];
    }

    private async Task DelUser(string username)
    {
        var client = new RedisClient();
        await client.Command($"SADD users {username}");
        Console.WriteLine($"Added back username {username}");
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
        await DelUser(user);
        _connected--;
    }

    public async Task Reset()
    {
        var client = new RedisClient();
        await client.Command($"SADD users lion panther jay tiger robin giraffe bee cow pig donkey fish hippo panda wolf deer bear");
    }
}