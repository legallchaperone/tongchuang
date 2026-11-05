import Foundation

// Port of the parts of lib/stats.ts the Mac app needs first. Insertion order of the per-day totals is kept
// (an array of pairs) because floating-point sums depend on it.

/// per-day totals in the order the days were first seen (a JavaScript Map)
public struct DayTotals: Equatable, Sendable {
    public private(set) var keys: [String] = []
    public private(set) var values: [String: Double] = [:]

    public init() {}
    public init(_ pairs: [(String, Double)]) { for (k, v) in pairs { set(k, v) } }

    public subscript(_ key: String) -> Double? { values[key] }
    public var count: Int { keys.count }
    public var pairs: [(String, Double)] { keys.map { ($0, values[$0]!) } }

    public mutating func set(_ key: String, _ v: Double) {
        if values[key] == nil { keys.append(key) }
        values[key] = v
    }
    public mutating func add(_ key: String, _ v: Double) { set(key, (values[key] ?? 0) + v) }

    public static func == (a: DayTotals, b: DayTotals) -> Bool { a.keys == b.keys && a.values == b.values }
}

/// focused ms of a live status right now
public func liveFocusMs(_ l: LiveStatus?, now: Double) -> Double {
    guard let l, l.state == .focus || l.state == .paused else { return 0 }
    let running = l.state == .focus && truthy(l.runningSince) ? max(0, now - l.runningSince!) : 0
    return l.accumulatedMs + running
}

/// sessions + the running one as a pseudo session (id "live") at the front
public func withLive(_ sessions: [Session], _ userId: UserId, _ l: LiveStatus?, _ tz: String, now: Double) -> [Session] {
    var mine = sessions.filter { $0.userId == userId }
    let ms = liveFocusMs(l, now: now)
    if let l, ms > 0, truthy(l.startedAt) {
        mine.insert(Session(id: "live", userId: userId, subjectId: nil, task: l.task, startedAt: l.startedAt!, endedAt: now,
                            durationMs: ms, mode: l.mode, rating: nil, note: "", tz: tz), at: 0)
    }
    return mine
}

/// Focused time of one session per local day. A session that runs past midnight is split
/// in proportion to the wall-clock time on each side (pauses are spread evenly).
public func dayShares(_ s: Session, _ tz: String) -> [(String, Double)] {
    let k0 = dayKey(s.startedAt, tz)
    let end = max(s.startedAt, s.endedAt)
    if dayKey(max(s.startedAt, end - 1), tz) == k0 { return [(k0, s.durationMs)] }
    let span = end - s.startedAt
    var out: [(String, Double)] = []
    var t = s.startedAt
    var guardN = 0
    while t < end && guardN < 400 {
        let k = dayKey(t, tz)
        let n = splitKey(addDaysKey(k, 1))
        let next = min(end, zonedToUtc(n.y, n.m, n.d, 0, 0, tz))
        if next <= t { break }
        out.append((k, (s.durationMs * (next - t)) / span))
        t = next
        guardN += 1
    }
    return out
}

/// focused ms that falls on a given local day
public func msOnDay(_ sessions: [Session], _ tz: String, _ key: String) -> Double {
    var ms = 0.0
    for s in sessions { for (k, v) in dayShares(s, tz) where k == key { ms += v } }
    return ms
}

/// one person's focused time today in their own time zone, the running session included
public func todayMs(_ all: [Session], _ userId: UserId, _ live: LiveStatus?, _ tz: String, now: Double) -> Double {
    msOnDay(withLive(all, userId, live, tz, now: now), tz, dayKey(now, tz))
}

public func byDay(_ sessions: [Session], _ tz: String) -> DayTotals {
    var m = DayTotals()
    for s in sessions { for (k, v) in dayShares(s, tz) { m.add(k, v) } }
    return m
}

/// sessions with any focused time on one of these days
public func touching(_ sessions: [Session], _ tz: String, _ keys: Set<String>) -> [Session] {
    sessions.filter { s in dayShares(s, tz).contains { keys.contains($0.0) } }
}

public struct Streaks: Equatable, Codable, Sendable {
    public var current: Int
    public var best: Int
}

public func streaks(_ daily: DayTotals, _ tz: String, now: Double, minMs: Double = 15 * 60_000) -> Streaks {
    let today = dayKey(now, tz)
    var cur = 0
    var k = (daily[today] ?? 0) >= minMs ? today : addDaysKey(today, -1)
    while (daily[k] ?? 0) >= minMs { cur += 1; k = addDaysKey(k, -1) }
    let keys = daily.keys.filter { (daily[$0] ?? 0) >= minMs }.sorted()
    var best = 0, run = 0
    var prev = ""
    for x in keys {
        run = !prev.isEmpty && addDaysKey(prev, 1) == x ? run + 1 : 1
        best = max(best, run)
        prev = x
    }
    return Streaks(current: cur, best: max(best, cur))
}

public struct Summary: Equatable, Codable, Sendable {
    public var totalMs: Double
    public var days: Int
    public var activeDays: Int
    public var sessions: Int
    public var avgDayMs: Double
    public var avgRating: Double?
    public var longestMs: Double
    public var goalDays: Int
}

public func summarize(_ sessions: [Session], _ tz: String, _ keys: [String], goalMs: Double) -> Summary {
    let set = Set(keys)
    let inRange = touching(sessions, tz, set)
    let daily = DayTotals(byDay(inRange, tz).pairs.filter { set.contains($0.0) })
    let totalMs = daily.pairs.reduce(0.0) { $0 + $1.1 }
    let rated = inRange.filter { $0.rating != nil }
    let ratingSum = rated.reduce(0.0) { $0 + Double($1.rating ?? 0) }
    return Summary(
        totalMs: totalMs, days: keys.count, activeDays: daily.count,
        sessions: inRange.filter { $0.id != "live" }.count,
        avgDayMs: totalMs / Double(max(1, keys.count)),
        avgRating: rated.isEmpty ? nil : ratingSum / Double(rated.count),
        longestMs: inRange.reduce(0.0) { max($0, $1.durationMs) },
        goalDays: daily.pairs.filter { $0.1 >= goalMs }.count
    )
}
