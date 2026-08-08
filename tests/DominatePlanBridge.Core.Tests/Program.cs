using DominatePlanBridge.Core;

var state = new BridgeState(new BridgeConfig(hitCooldownMs: 120, climaxLockMs: 8000));

var firstHit = AssertNotNull(state.TryHit("MunePlus", 0), "first hit");
AssertEqual("hit", firstHit.Action, "hit action");
AssertEqual("chest", firstHit.Part, "MunePlus maps to chest");
AssertNull(state.TryHit("MunePlus", 100), "hit cooldown suppresses duplicate");

var laterHit = AssertNotNull(state.TryHit("MunePlus", 121), "later hit");
AssertEqual("chest", laterHit.Part, "hit after cooldown is allowed");

var ep = AssertNotNull(state.TryEp(12, 25), "ep increase");
AssertEqual("ep", ep.Action, "ep action");
AssertEqual(13, ep.EpGain, "ep gain");
AssertEqual(25, ep.EpStock, "ep stock");
AssertEqual("chest", ep.Part, "ep uses last part");

AssertNull(state.TryEp(25, 24), "ep decrease is ignored");

var firstClimax = AssertNotNull(state.TryClimax(0, 1, 1000), "first climax");
AssertEqual("climax", firstClimax.Action, "climax action");
AssertEqual(1, firstClimax.ClimaxCount, "climax count");
AssertNull(state.TryClimax(1, 2, 2000), "climax lock suppresses duplicate");

var laterClimax = AssertNotNull(state.TryClimax(1, 2, 9100), "later climax");
AssertEqual(2, laterClimax.ClimaxCount, "climax after lock is allowed");

AssertEqual("chest", PartMapper.FromSourceName("BattleStatus.MunePlus"), "qualified MunePlus maps to chest");
AssertEqual("lower", PartMapper.FromSourceName("BattleStatus.KabuPlus"), "qualified KabuPlus maps to lower");

var metricHit = WebhookPayload.HitWithMetrics("mouth", 3419, 74.5m);
AssertEqual("hit", metricHit.Action, "metric hit action");
AssertEqual("mouth", metricHit.Part, "metric hit part");
AssertEqual(3419, metricHit.PartValue, "metric hit part value");
AssertEqual(74.5m, metricHit.PartPercent, "metric hit part percent");
var metricHitJson = metricHit.ToJson();
AssertContains("\"action\":\"hit\"", metricHitJson, "metric hit json action");
AssertContains("\"part\":\"mouth\"", metricHitJson, "metric hit json part");
AssertContains("\"partValue\":3419", metricHitJson, "metric hit json part value");
AssertContains("\"partPercent\":74.5", metricHitJson, "metric hit json part percent");

AssertEqual("abc123", WebhookIdNormalizer.Normalize(" abc123 "), "bare webhook id is trimmed");
AssertEqual("abc123", WebhookIdNormalizer.Normalize("https://webhook.xtoys.app/abc123"), "webhook url id is extracted");
AssertEqual("abc123", WebhookIdNormalizer.Normalize("https://webhook.xtoys.app/abc123?from=copy"), "webhook url query is ignored");
AssertEqual(string.Empty, WebhookIdNormalizer.Normalize("   "), "blank webhook id stays blank");

var postSummary = new PostStatusAggregator(5000);
AssertNull(postSummary.RecordSuccess(1000), "first post success is held for summary");
AssertNull(postSummary.RecordSuccess(2000), "second post success is held for summary");
AssertEqual(2, postSummary.FlushDue(6000), "post successes summarize after interval");
AssertNull(postSummary.FlushDue(7000), "post summary does not repeat without new successes");
AssertNull(postSummary.RecordSuccess(8000), "new post success starts next summary window");
AssertEqual(1, postSummary.Flush(), "manual flush reports remaining post success");
AssertNull(postSummary.Flush(), "manual flush returns null when empty");

var directBatchPayload = WebhookPayload.BatchedHit(
    200,
    HitBatchSlot.Empty,
    new HitBatchSlot("chest", 12630, 84m),
    HitBatchSlot.Empty,
    new HitBatchSlot("butt", 10093, 25.5m));
var directBatchJson = directBatchPayload.ToJson();
AssertContains("\"action\":\"hit\"", directBatchJson, "batch json action");
AssertContains("\"batched\":true", directBatchJson, "batch json batched");
AssertContains("\"windowMs\":200", directBatchJson, "batch json window");
AssertContains("\"part1\":null", directBatchJson, "batch json empty mouth part");
AssertContains("\"partValue1\":null", directBatchJson, "batch json empty mouth value");
AssertContains("\"partPercent1\":null", directBatchJson, "batch json empty mouth percent");
AssertContains("\"part2\":\"chest\"", directBatchJson, "batch json chest part");
AssertContains("\"partValue2\":12630", directBatchJson, "batch json chest value");
AssertContains("\"partPercent2\":84", directBatchJson, "batch json chest percent");
AssertContains("\"part3\":null", directBatchJson, "batch json empty lower part");
AssertContains("\"part4\":\"butt\"", directBatchJson, "batch json butt part");
AssertContains("\"partPercent4\":25.5", directBatchJson, "batch json butt percent");

var hitBatcher = new HitBatcher(200);
AssertNull(hitBatcher.AddHit("chest", 100, 10m, 1000), "first batched hit is queued");
AssertNull(hitBatcher.AddHit("butt", 200, 20m, 1100), "second part inside window is queued");
AssertNull(hitBatcher.AddHit("chest", 111, 11m, 1150), "same part inside window updates latest metrics");
AssertNull(hitBatcher.FlushDue(1199), "batch does not flush before window");
var flushedBatch = AssertNotNull(hitBatcher.FlushDue(1200), "batch flushes at window");
var flushedBatchJson = flushedBatch.ToJson();
AssertContains("\"part1\":null", flushedBatchJson, "flushed batch mouth inactive");
AssertContains("\"part2\":\"chest\"", flushedBatchJson, "flushed batch chest active");
AssertContains("\"partValue2\":111", flushedBatchJson, "flushed batch keeps latest chest value");
AssertContains("\"partPercent2\":11", flushedBatchJson, "flushed batch keeps latest chest percent");
AssertContains("\"part3\":null", flushedBatchJson, "flushed batch lower inactive");
AssertContains("\"part4\":\"butt\"", flushedBatchJson, "flushed batch butt active");

var payload = laterClimax.ToJson();
AssertContains("\"action\":\"climax\"", payload, "json action");
AssertContains("\"part\":\"chest\"", payload, "json part");
AssertContains("\"climaxCount\":2", payload, "json climax count");

AssertTrue(ProbeNameFilter.ShouldCapture("Ero_Kuchi"), "captures mouth experience field");
AssertTrue(ProbeNameFilter.ShouldCapture("KuchiPercentText"), "captures mouth percentage text");
AssertTrue(ProbeNameFilter.ShouldCapture("Yogore"), "captures pollution field");
AssertFalse(ProbeNameFilter.ShouldCapture("transform"), "ignores generic Unity transform field");
AssertFalse(ProbeNameFilter.ShouldCapture("<>1__state"), "ignores compiler coroutine state field");

Console.WriteLine("All tests passed");

static void AssertEqual<T>(T expected, T actual, string label)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
    {
        throw new Exception($"{label}: expected '{expected}', got '{actual}'");
    }
}

static void AssertContains(string expected, string actual, string label)
{
    if (!actual.Contains(expected, StringComparison.Ordinal))
    {
        throw new Exception($"{label}: expected payload to contain '{expected}', got '{actual}'");
    }
}

static void AssertNull(object? actual, string label)
{
    if (actual != null)
    {
        throw new Exception($"{label}: expected null, got '{actual}'");
    }
}

static T AssertNotNull<T>(T? actual, string label)
    where T : class
{
    if (actual == null)
    {
        throw new Exception($"{label}: expected non-null value");
    }

    return actual;
}

static void AssertTrue(bool actual, string label)
{
    if (!actual)
    {
        throw new Exception($"{label}: expected true");
    }
}

static void AssertFalse(bool actual, string label)
{
    if (actual)
    {
        throw new Exception($"{label}: expected false");
    }
}
