using System;
using System.Net;
using System.Text;

public class CPHInline
{
    public bool Execute()
    {
        int coins = 0, repeatCount = 1;
        string giftName = "", username = "Viewer", giftId = "";
        CPH.TryGetArg("coins", out coins);
        if (!CPH.TryGetArg("repeatCount", out repeatCount) || repeatCount < 1) repeatCount = 1;
        CPH.TryGetArg("giftName", out giftName);
        CPH.TryGetArg("username", out username);
        if (!CPH.TryGetArg("giftId", out giftId))
        {
            int numericId;
            if (CPH.TryGetArg("giftId", out numericId)) giftId = numericId.ToString();
        }
        if (coins <= 0 || string.IsNullOrWhiteSpace(giftName))
        {
            CPH.LogWarn("ARK BRIDGE: missing giftName or coins; skipped");
            return true;
        }
        try
        {
            string body = "giftName=" + Uri.EscapeDataString(giftName)
                + "&coins=" + coins + "&repeatCount=" + repeatCount
                + "&username=" + Uri.EscapeDataString(username ?? "Viewer")
                + "&giftId=" + Uri.EscapeDataString(giftId ?? "");
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3210/bridge/gift");
            req.Method = "POST";
            req.Proxy = null;
            req.Timeout = 1500;
            req.ReadWriteTimeout = 1500;
            req.ContentType = "application/x-www-form-urlencoded";
            req.Headers.Add("X-Ice-Pack", "1");
            req.ContentLength = bytes.Length;
            using (var stream = req.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            using (var response = (HttpWebResponse)req.GetResponse())
                CPH.LogInfo("ARK BRIDGE: " + giftName + " forwarded (" + (int)response.StatusCode + ")");
        }
        catch (Exception ex) { CPH.LogWarn("ARK BRIDGE: " + ex.Message); }
        return true;
    }
}
