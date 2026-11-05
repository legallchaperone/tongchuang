import Foundation

// Port of lib/time.ts. Instants are epoch milliseconds as Double, like JavaScript numbers.
// Checked against design/fixtures/logic.json (Tests/TCCoreTests).

public let MINUTE_MS: Double = 60_000
public let HOUR_MS: Double = 3_600_000
public let DAY_MS: Double = 86_400_000

/// wall-clock parts of an instant in a time zone (`partsIn` in lib/time.ts); `wd` 0 = Sunday
public struct WallParts: Equatable, Codable, Sendable {
    public var y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int, wd: Int
    public init(y: Int, mo: Int, d: Int, h: Int, mi: Int, s: Int, wd: Int) {
        self.y = y; self.mo = mo; self.d = d; self.h = h; self.mi = mi; self.s = s; self.wd = wd
    }
}

/// Gregorian calendars per time zone identifier. An unknown identifier falls back to UTC, like the web app.
final class CalendarCache: @unchecked Sendable {
    static let shared = CalendarCache()
    private var cache: [String: Calendar] = [:]
    private let lock = NSLock()

    func calendar(_ tz: String) -> Calendar {
        lock.lock(); defer { lock.unlock() }
        if let c = cache[tz] { return c }
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: tz) ?? TimeZone(identifier: "UTC")!
        cache[tz] = c
        return c
    }
}

public func partsIn(_ ms: Double, _ tz: String) -> WallParts {
    let cal = CalendarCache.shared.calendar(tz)
    // Intl formats whole seconds: drop the milliseconds first so nothing can round up
    let date = Date(timeIntervalSince1970: (ms / 1000).rounded(.down))
    let c = cal.dateComponents([.year, .month, .day, .hour, .minute, .second, .weekday], from: date)
    return WallParts(y: c.year ?? 1970, mo: c.month ?? 1, d: c.day ?? 1, h: (c.hour ?? 0) % 24,
                     mi: c.minute ?? 0, s: c.second ?? 0, wd: (c.weekday ?? 1) - 1)
}

/// days since 1970-01-01 of a proleptic Gregorian date (month 1-12)
public func daysFromCivil(_ year: Int, _ month: Int, _ day: Int) -> Int {
    let y = month <= 2 ? year - 1 : year
    let era = (y >= 0 ? y : y - 399) / 400
    let yoe = y - era * 400
    let doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146097 + doe - 719468
}

/// the date of a day number (inverse of `daysFromCivil`)
public func civilFromDays(_ days: Int) -> (y: Int, m: Int, d: Int) {
    let z = days + 719468
    let era = (z >= 0 ? z : z - 146096) / 146097
    let doe = z - era * 146097
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
    let y = yoe + era * 400
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    let mp = (5 * doy + 2) / 153
    let d = doy - (153 * mp + 2) / 5 + 1
    let m = mp < 10 ? mp + 3 : mp - 9
    return (m <= 2 ? y + 1 : y, m, d)
}

private func floorDiv(_ a: Int, _ b: Int) -> Int { a >= 0 ? a / b : -((-a + b - 1) / b) }

/// `Date.UTC(y, monthIndex, d, h, mi, s)`: out-of-range fields roll over. `monthIndex` is 0-based like JavaScript.
public func dateUTC(_ y: Int, _ monthIndex: Int, _ d: Int, _ h: Int = 0, _ mi: Int = 0, _ s: Int = 0) -> Double {
    let yy = y + floorDiv(monthIndex, 12)
    let mm = monthIndex - floorDiv(monthIndex, 12) * 12
    let days = daysFromCivil(yy, mm + 1, 1) + d - 1
    let secs = ((days * 24 + h) * 60 + mi) * 60 + s
    return Double(secs) * 1000
}

/// offset of tz from UTC in minutes at instant ms
public func offsetMin(_ tz: String, _ ms: Double) -> Int {
    let p = partsIn(ms, tz)
    let asUtc = dateUTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s)
    return Int(JS.round((asUtc - (ms / 1000).rounded(.down) * 1000) / MINUTE_MS))
}

/// epoch ms of a wall-clock time in tz (same two-step guess as the web app, including at DST gaps)
public func zonedToUtc(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int, _ tz: String) -> Double {
    let guess = dateUTC(y, mo - 1, d, h, mi)
    var t = guess - Double(offsetMin(tz, guess)) * MINUTE_MS
    t = guess - Double(offsetMin(tz, t)) * MINUTE_MS
    return t
}

/// YYYY-MM-DD of an instant in tz
public func dayKey(_ ms: Double, _ tz: String) -> String {
    let p = partsIn(ms, tz)
    return "\(p.y)-\(pad2(p.mo))-\(pad2(p.d))"
}

/// start (epoch ms) of the local day containing ms
public func startOfDay(_ ms: Double, _ tz: String) -> Double {
    let p = partsIn(ms, tz)
    return zonedToUtc(p.y, p.mo, p.d, 0, 0, tz)
}

func keyOf(days: Int) -> String {
    let c = civilFromDays(days)
    return "\(c.y)-\(pad2(c.m))-\(pad2(c.d))"
}

/// the parts of a "YYYY-MM-DD" key
public func splitKey(_ key: String) -> (y: Int, m: Int, d: Int) {
    let parts = key.split(separator: "-", omittingEmptySubsequences: false).map { Int($0) ?? 0 }
    return (parts.count > 0 ? parts[0] : 0, parts.count > 1 ? parts[1] : 1, parts.count > 2 ? parts[2] : 1)
}

/// list of the last n day keys ending today, oldest first
public func lastDays(_ n: Int, _ tz: String, now: Double) -> [String] {
    let p = partsIn(now, tz)
    let today = daysFromCivil(p.y, p.mo, 1) + p.d - 1
    return stride(from: n - 1, through: 0, by: -1).map { keyOf(days: today - $0) }
}

public func addDaysKey(_ key: String, _ n: Int) -> String {
    let k = splitKey(key)
    let mm = k.m - 1
    let days = daysFromCivil(k.y + floorDiv(mm, 12), mm - floorDiv(mm, 12) * 12 + 1, 1) + k.d - 1 + n
    return keyOf(days: days)
}

/// 0 = Sunday
public func weekdayOfKey(_ key: String) -> Int {
    let k = splitKey(key)
    let days = daysFromCivil(k.y, k.m, k.d)
    return ((days % 7) + 7 + 4) % 7 // 1970-01-01 was a Thursday
}

public func hhmm(_ ms: Double, _ tz: String) -> String {
    let p = partsIn(ms, tz)
    return "\(pad2(p.h)):\(pad2(p.mi))"
}

/// time-of-day phase for the sky treatment
public enum Phase: String, Codable, Sendable, CaseIterable {
    case night, dawn, day, dusk

    public var label: String {
        switch self {
        case .night: return "深夜"
        case .dawn: return "清晨"
        case .day: return "白天"
        case .dusk: return "傍晚"
        }
    }
}

public func phaseAt(_ hour: Double) -> Phase {
    if hour >= 5 && hour < 8 { return .dawn }
    if hour >= 8 && hour < 17 { return .day }
    if hour >= 17 && hour < 20 { return .dusk }
    return .night
}

/// "mm:ss", or "h:mm:ss" past an hour
public func clock(_ ms: Double, withHours: Bool = false) -> String {
    let s = max(0, Int((ms / 1000).rounded(.down)))
    let h = s / 3600, m = (s / 60) % 60, sec = s % 60
    return h > 0 || withHours ? "\(h):\(pad2(m)):\(pad2(sec))" : "\(pad2(m)):\(pad2(sec))"
}

/// "2小时15分"
public func dur(_ ms: Double) -> String {
    let m = Int(JS.round(ms / MINUTE_MS))
    if m < 60 { return "\(m)分" }
    let h = m / 60, r = m % 60
    return r != 0 ? "\(h)小时\(r)分" : "\(h)小时"
}

private let cityNames: [String: String] = [
    "Asia/Shanghai": "上海", "Asia/Hong_Kong": "香港", "Asia/Taipei": "台北", "Asia/Tokyo": "东京", "Asia/Seoul": "首尔",
    "Asia/Singapore": "新加坡", "Europe/London": "伦敦", "Europe/Paris": "巴黎", "Europe/Berlin": "柏林", "Europe/Amsterdam": "阿姆斯特丹",
    "America/New_York": "纽约", "America/Chicago": "芝加哥", "America/Denver": "丹佛", "America/Los_Angeles": "洛杉矶", "America/Toronto": "多伦多",
    "America/Vancouver": "温哥华", "Australia/Sydney": "悉尼", "Australia/Melbourne": "墨尔本", "Pacific/Auckland": "奥克兰", "UTC": "UTC",
]

/// "上海", or the last part of the identifier
public func tzCity(_ tz: String) -> String {
    if let c = cityNames[tz] { return c }
    return String(tz.split(separator: "/").last ?? Substring(tz)).replacingOccurrences(of: "_", with: " ")
}
