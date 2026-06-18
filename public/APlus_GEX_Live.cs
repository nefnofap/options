// ╔══════════════════════════════════════════════════════════════════════╗
// ║  A+ GEX Levels — Live Quantower Indicator                            ║
// ║  Fetches live GEX data directly from the A+ options app API.         ║
// ║                                                                      ║
// ║  HOW TO INSTALL:                                                     ║
// ║  1. Open Quantower → Algo → Scripts → New script                     ║
// ║  2. Paste this entire file and click Compile                         ║
// ║  3. Apply the indicator to any chart                                 ║
// ║  4. Set Symbol, API Key, and App URL in the indicator settings        ║
// ║     (get your API key from the app: GEX page → Quantower Live)       ║
// ║                                                                      ║
// ║  The indicator auto-refreshes every N minutes (default: 15).         ║
// ║  Apply it to the same instrument you trade (SPY, SPX, QQQ, etc.)     ║
// ╚══════════════════════════════════════════════════════════════════════╝

using System;
using System.Drawing;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using TradingPlatform.BusinessLayer;

namespace QuantowerAlgo
{
    [Indicator("A+ GEX Levels (Live)", "A+GEX", 1,
        Description = "Live GEX levels from the A+ options app. Set Symbol, API Key, and App URL in settings.")]
    public class APlus_GEX_Live : Indicator
    {
        // ── Required settings ─────────────────────────────────────────────
        [InputParameter("Symbol (SPY, SPX, QQQ, IWM…)", 0)]
        public string Symbol = "SPY";

        [InputParameter("Expiration (blank = all expirations)", 1)]
        public string Expiration = "";

        [InputParameter("API Key  (copy from app → GEX → Quantower Live)", 2)]
        public string ApiKey = "";

        [InputParameter("App URL  (no trailing slash)", 3)]
        public string AppUrl = "https://your-app.vercel.app";

        // ── Refresh ────────────────────────────────────────────────────────
        [InputParameter("Auto-refresh every N minutes  (0 = manual only)", 4, 0, 1440)]
        public int RefreshMinutes = 15;

        // ── Display ────────────────────────────────────────────────────────
        [InputParameter("Show GEX profile bars", 5)]
        public bool ShowBars = true;

        [InputParameter("Show key levels (flip / walls / pain)", 6)]
        public bool ShowLevels = true;

        [InputParameter("Show reversal-bias labels on levels", 7)]
        public bool ShowBias = true;

        [InputParameter("Show spot-at-load line", 8)]
        public bool ShowSpot = true;

        [InputParameter("GEX bar max width (% of chart width)", 9, 1, 50)]
        public int BarWidthPct = 15;

        // ── Data ───────────────────────────────────────────────────────────
        private double[]  _strikes  = Array.Empty<double>();
        private double[]  _gex      = Array.Empty<double>();
        private double    _maxAbsGex;
        private double    _strikeStep;
        private double    _spot     = double.NaN;
        private double    _flip     = double.NaN;
        private double    _callWall = double.NaN;
        private double    _putWall  = double.NaN;
        private double    _maxPain  = double.NaN;
        private string    _callBias = "";
        private string    _putBias  = "";
        private string    _flipBias = "";
        private string    _status   = "Click Refresh or wait for auto-refresh";
        private DateTime  _loadedAt = DateTime.MinValue;
        private bool      _fetching;
        private readonly object _lock = new object();

        private static readonly HttpClient Http = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(30)
        };
        private Timer? _timer;

        // ── A+ palette (matches website) ──────────────────────────────────
        private static readonly Color BullColor    = Color.FromArgb(95,  211, 154);  // #5fd39a
        private static readonly Color BearColor    = Color.FromArgb(240, 106, 122);  // #f06a7a
        private static readonly Color NeutralColor = Color.FromArgb(140, 140, 152);  // #8c8c98
        private static readonly Color TextColor    = Color.FromArgb(230, 230, 234);  // #e6e6ea

        public APlus_GEX_Live() : base()
        {
            this.Name = "A+ GEX Levels (Live)";
            this.Description = "Live GEX levels from the A+ options app API.";
            this.SeparateWindow = false;
        }

        protected override void OnInit()
        {
            FetchData();

            if (RefreshMinutes > 0)
            {
                var interval = TimeSpan.FromMinutes(RefreshMinutes);
                _timer = new Timer(_ => FetchData(), null, interval, interval);
            }
        }

        protected override void OnCalculate(int bar, double price) { }

        protected override void OnClear()
        {
            _timer?.Dispose();
            _timer = null;
        }

        // ── Fetch ──────────────────────────────────────────────────────────
        private void FetchData()
        {
            lock (_lock)
            {
                if (_fetching) return;
                _fetching = true;
                _status = "Loading…";
            }

            Task.Run(async () =>
            {
                try
                {
                    if (string.IsNullOrWhiteSpace(ApiKey))
                    {
                        SetStatus("No API key — set it in indicator settings");
                        return;
                    }

                    var qs = $"symbol={Uri.EscapeDataString(Symbol)}&key={Uri.EscapeDataString(ApiKey)}";
                    if (!string.IsNullOrWhiteSpace(Expiration))
                        qs += $"&exp={Uri.EscapeDataString(Expiration)}";

                    var url = $"{AppUrl.TrimEnd('/')}/api/gex-levels?{qs}";
                    var json = await Http.GetStringAsync(url);
                    ParseResponse(json);
                }
                catch (HttpRequestException ex)
                {
                    SetStatus($"Network error: {ex.Message.Split('\n')[0]}");
                }
                catch (Exception ex)
                {
                    SetStatus($"Error: {ex.Message.Split('\n')[0]}");
                }
                finally
                {
                    lock (_lock) { _fetching = false; }
                }
            });
        }

        private void ParseResponse(string json)
        {
            using var doc = JsonDocument.Parse(json);
            var r = doc.RootElement;

            // Check for API error response
            if (r.TryGetProperty("error", out var errProp))
            {
                SetStatus($"API: {errProp.GetString()}");
                return;
            }

            lock (_lock)
            {
                _spot     = GetDouble(r, "spot");
                _flip     = GetDouble(r, "gammaFlip");
                _callWall = GetDouble(r, "callWall");
                _putWall  = GetDouble(r, "putWall");
                _maxPain  = GetDouble(r, "maxPain");
                _maxAbsGex   = GetDouble(r, "maxAbsGex");
                _strikeStep  = GetDouble(r, "strikeStep");
                _callBias = GetString(r, "callBias");
                _putBias  = GetString(r, "putBias");
                _flipBias = GetString(r, "flipBias");

                if (r.TryGetProperty("strikes", out var sarr) &&
                    r.TryGetProperty("gex",     out var garr))
                {
                    var strikes = new System.Collections.Generic.List<double>();
                    var gex     = new System.Collections.Generic.List<double>();
                    foreach (var v in sarr.EnumerateArray()) strikes.Add(v.GetDouble());
                    foreach (var v in garr.EnumerateArray()) gex.Add(v.GetDouble());
                    _strikes = strikes.ToArray();
                    _gex     = gex.ToArray();
                }

                _loadedAt = DateTime.UtcNow;
                _status = $"Loaded {_loadedAt:HH:mm} UTC · {Symbol.ToUpper()}";
            }
        }

        private void SetStatus(string msg)
        {
            lock (_lock) { _status = msg; }
        }

        // ── Paint ──────────────────────────────────────────────────────────
        public override void OnPaintChart(PaintChartEventArgs args)
        {
            var gr   = args.Graphics;
            var rect = args.Rectangle;
            var conv = this.CurrentChart.MainWindow.CoordinatesConverter;

            string status;
            double[] strikes, gex;
            double maxAbsGex, strikeStep, spot, flip, callWall, putWall, maxPain;
            string callBias, putBias, flipBias;

            lock (_lock)
            {
                status     = _status;
                strikes    = _strikes;
                gex        = _gex;
                maxAbsGex  = _maxAbsGex;
                strikeStep = _strikeStep;
                spot       = _spot;
                flip       = _flip;
                callWall   = _callWall;
                putWall    = _putWall;
                maxPain    = _maxPain;
                callBias   = _callBias;
                putBias    = _putBias;
                flipBias   = _flipBias;
            }

            // Status line bottom-left
            using (var font  = new Font("Consolas", 7.5f))
            using (var brush = new SolidBrush(Color.FromArgb(100, TextColor.R, TextColor.G, TextColor.B)))
                gr.DrawString("A+ GEX  " + status, font, brush, rect.Left + 6f, rect.Bottom - 18f);

            if (strikes.Length == 0 && double.IsNaN(flip)) return;

            float rightX      = rect.Right - 5f;
            float barMaxWidth = rect.Width * BarWidthPct / 100f;

            // Half-height in screen pixels for one strike row
            float halfH = strikeStep > 0
                ? Math.Abs((float)conv.GetChartY(0) - (float)conv.GetChartY(strikeStep)) * 0.40f
                : 6f;
            halfH = Math.Max(halfH, 2f);

            // ── GEX profile bars ────────────────────────────────────────
            if (ShowBars && strikes.Length > 0)
            {
                for (int i = 0; i < strikes.Length; i++)
                {
                    float y = (float)conv.GetChartY(strikes[i]);
                    if (y < rect.Top - halfH || y > rect.Bottom + halfH) continue;

                    float barW = maxAbsGex > 0
                        ? (float)(Math.Abs(gex[i]) / maxAbsGex * barMaxWidth)
                        : 4f;
                    barW = Math.Max(barW, 2f);

                    Color c = gex[i] >= 0 ? BullColor : BearColor;
                    using (var brush = new SolidBrush(Color.FromArgb(80, c.R, c.G, c.B)))
                    using (var pen   = new Pen(c, 1f))
                    {
                        float top = y - halfH;
                        gr.FillRectangle(brush, rightX - barW, top, barW, halfH * 2f);
                        gr.DrawRectangle(pen,   rightX - barW, top, barW, halfH * 2f);
                    }
                }
            }

            // ── Key levels ───────────────────────────────────────────────
            if (ShowLevels)
            {
                if (!double.IsNaN(flip))
                    DrawLevel(gr, rect, conv, flip, NeutralColor, 2f,
                        "GAMMA FLIP" + (ShowBias && flipBias.Length > 0 ? "  [" + flipBias + "]" : ""));
                if (!double.IsNaN(callWall))
                    DrawLevel(gr, rect, conv, callWall, BullColor, 2f,
                        "CALL WALL" + (ShowBias && callBias.Length > 0 ? "  [" + callBias + "]" : ""));
                if (!double.IsNaN(putWall))
                    DrawLevel(gr, rect, conv, putWall, BearColor, 2f,
                        "PUT WALL" + (ShowBias && putBias.Length > 0 ? "  [" + putBias + "]" : ""));
                if (!double.IsNaN(maxPain))
                    DrawLevel(gr, rect, conv, maxPain,
                        Color.FromArgb(100, NeutralColor.R, NeutralColor.G, NeutralColor.B), 1f, "MAX PAIN");
            }

            if (ShowSpot && !double.IsNaN(spot))
                DrawLevel(gr, rect, conv, spot,
                    Color.FromArgb(80, TextColor.R, TextColor.G, TextColor.B), 1f, "SPOT @ load");
        }

        private static void DrawLevel(
            Graphics gr, Rectangle rect,
            IChartCoordinatesConverter conv,
            double price, Color color, float lineWidth, string label)
        {
            float y = (float)conv.GetChartY(price);
            if (y < rect.Top || y > rect.Bottom) return;

            using (var pen = new Pen(color, lineWidth)
                { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash })
                gr.DrawLine(pen, rect.Left, y, rect.Right, y);

            string text = label + "  " + price.ToString("F2");
            using (var font  = new Font("Consolas", 7.5f, FontStyle.Regular))
            using (var brush = new SolidBrush(color))
            {
                var sz = gr.MeasureString(text, font);
                gr.DrawString(text, font, brush,
                    rect.Right - sz.Width - 8f, y - sz.Height - 2f);
            }
        }

        private static double GetDouble(JsonElement root, string key) =>
            root.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number
                ? v.GetDouble()
                : double.NaN;

        private static string GetString(JsonElement root, string key) =>
            root.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String
                ? v.GetString() ?? ""
                : "";
    }
}
