using backend.util;

namespace backend.services;

public class ChatService
{
    private int _connected;

    public ChatService()
    {
        _connected = 0;
    }

    private async Task<bool> SetUser(string username)
    {
        var client = new RedisClient();
        username = username.Trim();

        if (string.IsNullOrEmpty(username) || username.Length != 3) //Username must be 3 characters only
            return false;

        var resp = await client.Command($"SADD users {username}");

        if (Parser.IntParser(resp) == 0) return false;
        return true;
    }

    private async Task DelUser(string username)
    {
        var client = new RedisClient();
        await client.Command($"SREM users {username}");
    }
    
    public async Task<List<string>> GetUsers()
    {
        var client = new RedisClient();
        var resp = await client.Command("SMEMBERS users");

        List<string> retList = Parser.ListParser(resp);
        return retList;
    }

    public async Task<bool> Join(string user)
    {
        if (!await SetUser(user)) return false;
        if (_connected >= 16) return false; //Just set 

        _connected++;
        return true;
    }
    

    public async Task Leave(string user)
    {
        await DelUser(user);
        _connected--;
    }
}