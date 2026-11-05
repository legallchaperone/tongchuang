import Foundation

// Port of lib/review.ts (R-007 收工). A "work day" runs until 5 a.m. local time,
// so closing up at 1 a.m. still counts for the evening before.

public let DAY_ROLLS_AT = 5

/// local date key of the work day containing `now`
public func workDay(_ now: Double, _ tz: String) -> String {
    let k = dayKey(now, tz)
    return partsIn(now, tz).h < DAY_ROLLS_AT ? addDaysKey(k, -1) : k
}

/// focused ms of the current work day (the small hours after midnight count for the evening before)
public func workDayMs(_ sessions: [Session], _ userId: UserId, _ live: LiveStatus?, _ tz: String, now: Double) -> Double {
    let mine = withLive(sessions, userId, live, tz, now: now)
    let wd = workDay(now, tz)
    let today = dayKey(now, tz)
    return msOnDay(mine, tz, wd) + (wd != today ? msOnDay(mine, tz, today) : 0)
}

/// sessions (running one included) that count for the work day
public func workDaySessions(_ sessions: [Session], _ userId: UserId, _ live: LiveStatus?, _ tz: String, now: Double) -> [Session] {
    let mine = withLive(sessions, userId, live, tz, now: now)
    let keys: Set<String> = [workDay(now, tz), dayKey(now, tz)]
    return mine.filter { keys.contains(dayKey($0.startedAt, tz)) || keys.contains(dayKey($0.endedAt, tz)) }
}

/// the evening hours when the 收工 button lights up
public func isWindDown(_ now: Double, _ tz: String) -> Bool {
    let h = partsIn(now, tz).h
    return h >= 21 || h < DAY_ROLLS_AT
}

/// someone's review for today if their desk is closed: they reviewed this work day
/// and have not started focusing again since.
public func closedReview(_ reviews: [DailyReview], _ sessions: [Session], _ live: LiveStatus?, _ userId: UserId, _ tz: String, now: Double) -> DailyReview? {
    let wd = workDay(now, tz)
    guard let r = reviews.first(where: { $0.userId == userId && $0.day == wd }) else { return nil }
    if let live, live.state == .focus || live.state == .paused || live.state == .break, live.updatedAt > r.updatedAt { return nil }
    if sessions.contains(where: { $0.userId == userId && $0.startedAt > r.updatedAt }) { return nil }
    return r
}

/// "今天" / "昨天" / "前天" / "11月1日" relative to the current work day
public func dayLabel(_ day: String, _ current: String) -> String {
    if day == current { return "今天" }
    if addDaysKey(day, 1) == current { return "昨天" }
    if addDaysKey(day, 2) == current { return "前天" }
    let k = splitKey(day)
    return "\(k.m)月\(k.d)日"
}
