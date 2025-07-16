using backend.util;

namespace backend.services;

public class ChatService
{
    private int _connected;

    public ChatService()
    {
        _connected = 0;
        

    }

    ~ChatService()
    {
        
    }
    

    private async Task<List<string>> GetUsers()
    {
        var client = new RedisClient();
        var resp = await client.Command("SMEMBERS users");

        List<string> retList = Parser.ListParser(resp);
        return retList;
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

    public async Task<bool> Join(string user)
    {
        _connected = 0; //todo to reg username and then loop listen for publishes
        var client = new RedisClient();
        if (!await SetUser(user)) return false;

        var userSet = await GetUsers();
        foreach (var i in userSet)
        {
            await client.Command($"SUBSCRIBE {i}");
            _connected++;
        }
        return true;
    }

    public async Task Send(string user, string message) //TODO maybe use bool for success or fail
    {
        var client = new RedisClient();
        await client.Command($"PUBLISH {user} {message}");
    }

    public async Task Leave(string user)
    {
        var client = new RedisClient();
        await DelUser(user);
        await client.Command($"UNSUBSCRIBE {user}");
        _connected--;
    }
}