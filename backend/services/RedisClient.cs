using System.Net.Sockets;
using System.Text;
using backend.util;

namespace backend.services;

public class RedisClient : IDisposable
{
    private readonly TcpClient _client;
    
    public RedisClient(string host = "localhost", int port = 6379)
    {
        _client = new TcpClient(host, port);
    }

    public async Task<string> Command(string command)
    {
        var stream = _client.GetStream();
        var sendPayload = Encoding.UTF8.GetBytes(Parser.ParseCommand(command));
        await stream.WriteAsync(sendPayload, 0, sendPayload.Length);

        var recvBuffer = new byte[4096];
        var retString = new StringBuilder();
        int recvLen;

        do
        {
            recvLen = await stream.ReadAsync(recvBuffer, 0, recvBuffer.Length);
            if (recvLen == 0) break;
            retString.Append(Encoding.UTF8.GetString(recvBuffer, 0, recvLen));
        } 
        while (stream.DataAvailable);

        return retString.ToString();
    }

    // public async Task<string> ReadServer()
    // {
    //     var stream = _client.GetStream();
    //     var recvBuffer = new byte[1024];
    //     var retString = new StringBuilder();
    //     int recvLen;
    //
    //     do
    //     {
    //         recvLen = await stream.ReadAsync(recvBuffer, 0, recvBuffer.Length);
    //         if (recvLen == 0) break;
    //         retString.Append(Encoding.UTF8.GetString(recvBuffer, 0, recvLen));
    //     } 
    //     while (stream.DataAvailable); //TODO change DataAvailable to something more robust?
    //
    //     return retString.ToString();
    // }

    public void Dispose()
    {
        _client.Close();
        _client.Dispose();
    }
}