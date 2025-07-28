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
    }
    
    public async Task<List<string>> GetUsers()
    {
        var client = new RedisClient();
        var resp = await client.Command("SMEMBERS users");

        List<string> retList = Parser.ListParser(resp);
        return retList;
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
}