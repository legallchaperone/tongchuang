import Foundation
import XCTest
@testable import TCCore

/// Checks the Swift ports against design/fixtures/logic.json, produced from the TypeScript by
/// `node scripts/native-fixtures.mjs`.
final class LogicFixtureTests: XCTestCase {
    static let root: URL = {
        var u = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { u.deleteLastPathComponent() } // Tests/TCCoreTests/x.swift -> repo root
        return u
    }()

    static let fixtures: LogicFixtures = {
        let url = root.appendingPathComponent("design/fixtures/logic.json")
        do {
            return try JSONDecoder().decode(LogicFixtures.self, from: Data(contentsOf: url))
        } catch {
            fatalError("cannot read \(url.path): \(error)")
        }
    }()

    var fx: LogicFixtures { Self.fixtures }

    private var failures = 0
    /// GitHub Actions annotation, so failures are readable without the job log
    private func annotate(_ msg: String) {
        failures += 1
        if failures <= 8 { print("::error title=TCCore fixtures::\(msg)") }
    }
    private func eq<T: Equatable>(_ got: T, _ want: T, _ what: @autoclosure () -> String, file: StaticString = #filePath, line: UInt = #line) {
        if got != want {
            let m = "\(what()): got \(got), want \(want)"
            annotate(m)
            XCTFail(m, file: file, line: line)
        }
    }
    private func close(_ got: Double, _ want: Double, _ what: @autoclosure () -> String, file: StaticString = #filePath, line: UInt = #line) {
        if abs(got - want) > max(1e-6, abs(want) * 1e-12) {
            let m = "\(what()): got \(got), want \(want)"
            annotate(m)
            XCTFail(m, file: file, line: line)
        }
    }

    func testTimeZones() {
        for c in fx.offsetMin { eq(offsetMin(c.tz, c.ms), c.expected, "offsetMin(\(c.tz), \(c.ms))") }
        for c in fx.partsIn { eq(partsIn(c.ms, c.tz), c.expected, "partsIn(\(c.ms), \(c.tz))") }
        for c in fx.dayKey { eq(dayKey(c.ms, c.tz), c.expected, "dayKey(\(c.ms), \(c.tz))") }
        for c in fx.startOfDay { eq(startOfDay(c.ms, c.tz), c.expected, "startOfDay(\(c.ms), \(c.tz))") }
        for c in fx.hhmm { eq(hhmm(c.ms, c.tz), c.expected, "hhmm(\(c.ms), \(c.tz))") }
        for c in fx.zonedToUtc {
            eq(zonedToUtc(c.y, c.mo, c.d, c.h, c.mi, c.tz), c.expected, "zonedToUtc(\(c.y)-\(c.mo)-\(c.d) \(c.h):\(c.mi), \(c.tz))")
        }
    }

    func testDayKeys() {
        for c in fx.addDaysKey { eq(addDaysKey(c.key, c.n), c.expected, "addDaysKey(\(c.key), \(c.n))") }
        for c in fx.weekdayOfKey { eq(weekdayOfKey(c.key), c.expected, "weekdayOfKey(\(c.key))") }
        for c in fx.lastDays { eq(lastDays(c.n, c.tz, now: c.now), c.expected, "lastDays(\(c.n), \(c.tz), \(c.now))") }
        for c in fx.phaseAt { eq(phaseAt(c.hour), c.expected, "phaseAt(\(c.hour))") }
    }

    func testWorkDay() {
        for c in fx.workDay { eq(workDay(c.ms, c.tz), c.expected, "workDay(\(c.ms), \(c.tz))") }
    }

    func testDayShares() {
        for c in fx.dayShares {
            let s = fx.sessions[c.session]
            let got = dayShares(s, c.tz)
            eq(got.map { $0.0 }, c.expected.map(\.key), "dayShares keys(\(s.id), \(c.tz))")
            for (g, w) in zip(got, c.expected) { close(g.1, w.value, "dayShares(\(s.id), \(c.tz))[\(w.key)]") }
        }
        let u1 = fx.sessions.filter { $0.userId == "u1" }
        for c in fx.byDay {
            let got = byDay(u1, c.tz)
            eq(got.keys, c.expected.map(\.key), "byDay keys(\(c.tz))")
            for w in c.expected { close(got[w.key] ?? -1, w.value, "byDay(\(c.tz))[\(w.key)]") }
        }
    }

    func testStreaks() {
        for c in fx.streaks {
            let daily = DayTotals(c.daily.map { ($0.key, $0.value) })
            eq(streaks(daily, c.tz, now: c.now, minMs: c.minMs), c.expected, "streaks(\(c.tz), \(c.now), \(c.minMs))")
        }
    }

    func testLive() {
        for c in fx.liveFocusMs { close(liveFocusMs(fx.lives[c.live], now: c.now), c.expected, "liveFocusMs(\(c.live), \(c.now))") }
        for c in fx.todayMs {
            close(todayMs(fx.sessions, c.userId, fx.lives[c.live], c.tz, now: c.now), c.expected, "todayMs(\(c.live), \(c.tz), \(c.now))")
        }
        for c in fx.workDayMs {
            close(workDayMs(fx.sessions, c.userId, fx.lives[c.live], c.tz, now: c.now), c.expected, "workDayMs(\(c.live), \(c.tz), \(c.now))")
        }
    }

    func testSummarize() {
        for c in fx.summarize {
            let sessions = withLive(fx.sessions, c.userId, fx.lives[c.live], c.tz, now: c.now)
            let got = summarize(sessions, c.tz, c.keys, goalMs: c.goalMs)
            let w = c.expected
            let what = "summarize(\(c.tz), \(c.now), \(c.keys.count) days)"
            close(got.totalMs, w.totalMs, what + ".totalMs")
            close(got.avgDayMs, w.avgDayMs, what + ".avgDayMs")
            close(got.longestMs, w.longestMs, what + ".longestMs")
            eq(got.days, w.days, what + ".days")
            eq(got.activeDays, w.activeDays, what + ".activeDays")
            eq(got.sessions, w.sessions, what + ".sessions")
            eq(got.goalDays, w.goalDays, what + ".goalDays")
            eq(got.avgRating == nil, w.avgRating == nil, what + ".avgRating is nil")
            if let g = got.avgRating, let ww = w.avgRating { close(g, ww, what + ".avgRating") }
        }
    }

    func testFixtureCoverage() {
        // guards against an empty or truncated fixture file silently passing
        XCTAssertGreaterThan(fx.offsetMin.count, 100)
        XCTAssertGreaterThan(fx.dayShares.count, 50)
        XCTAssertGreaterThan(fx.summarize.count, 10)
        let total = fx.offsetMin.count + fx.partsIn.count + fx.dayKey.count + fx.startOfDay.count + fx.hhmm.count + fx.zonedToUtc.count
            + fx.addDaysKey.count + fx.weekdayOfKey.count + fx.lastDays.count + fx.phaseAt.count + fx.workDay.count + fx.dayShares.count
            + fx.byDay.count + fx.streaks.count + fx.liveFocusMs.count + fx.todayMs.count + fx.workDayMs.count + fx.summarize.count
        print("::notice title=TCCore fixtures::\(total) logic cases (ICU \(fx.icu), tzdata \(fx.tzdata) on the generating side)")
    }
}

// MARK: - fixture shapes

struct Pair: Decodable {
    let key: String
    let value: Double
    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        key = try c.decode(String.self)
        value = try c.decode(Double.self)
    }
}

struct TzMs<T: Decodable>: Decodable { let tz: String; let ms: Double; let expected: T }
struct ZonedCase: Decodable { let tz: String; let y: Int; let mo: Int; let d: Int; let h: Int; let mi: Int; let expected: Double }
struct AddDaysCase: Decodable { let key: String; let n: Int; let expected: String }
struct KeyCase<T: Decodable>: Decodable { let key: String; let expected: T }
struct LastDaysCase: Decodable { let tz: String; let now: Double; let n: Int; let expected: [String] }
struct PhaseCase: Decodable { let hour: Double; let expected: Phase }
struct DaySharesCase: Decodable { let tz: String; let session: Int; let expected: [Pair] }
struct ByDayCase: Decodable { let tz: String; let expected: [Pair] }
struct StreaksCase: Decodable { let tz: String; let now: Double; let minMs: Double; let daily: [Pair]; let expected: Streaks }
struct LiveCase: Decodable { let live: String; let now: Double; let expected: Double }
struct UserLiveCase: Decodable { let live: String; let tz: String; let now: Double; let userId: String; let expected: Double }
struct SummarizeCase: Decodable {
    let tz: String; let now: Double; let live: String; let userId: String; let keys: [String]; let goalMs: Double; let expected: Summary
}

struct LogicFixtures: Decodable {
    let icu: String
    let tzdata: String
    let sessions: [Session]
    let lives: [String: LiveStatus]
    let offsetMin: [TzMs<Int>]
    let zonedToUtc: [ZonedCase]
    let dayKey: [TzMs<String>]
    let startOfDay: [TzMs<Double>]
    let partsIn: [TzMs<WallParts>]
    let workDay: [TzMs<String>]
    let hhmm: [TzMs<String>]
    let addDaysKey: [AddDaysCase]
    let weekdayOfKey: [KeyCase<Int>]
    let lastDays: [LastDaysCase]
    let phaseAt: [PhaseCase]
    let dayShares: [DaySharesCase]
    let byDay: [ByDayCase]
    let streaks: [StreaksCase]
    let liveFocusMs: [LiveCase]
    let todayMs: [UserLiveCase]
    let workDayMs: [UserLiveCase]
    let summarize: [SummarizeCase]
}
