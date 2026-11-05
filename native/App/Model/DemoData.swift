import Foundation
import TCCore
import TCPixel

/// Demo content until the Supabase backend is wired up (阶段 1 step 3). Times are relative to app launch.
enum DemoData {
    static func classmates(now: Date) -> [Classmate] {
        let t = now.timeIntervalSince1970 * 1000
        let mn = MINUTE_MS
        return [
            Classmate(
                id: "demo-linzhou", name: "林舟", tz: "Asia/Shanghai", color: 1, look: nil,
                live: LiveStatus(userId: "demo-linzhou", state: .focus, task: "线代第三章", mode: .pomodoro,
                                 startedAt: t - 18 * mn, plannedEnd: t + 7 * mn, accumulatedMs: 0, runningSince: t - 18 * mn, updatedAt: t - 18 * mn),
                present: true
            ),
            Classmate(
                id: "demo-xiaoman", name: "小满", tz: "America/New_York", color: 4,
                look: AvatarLook(skin: 1, hair: 1, hairColor: 3),
                live: LiveStatus(userId: "demo-xiaoman", state: .idle, updatedAt: t - 90 * mn,
                                 statusEmoji: "😴", statusText: "睡觉了", statusUntil: nil, statusSetAt: t - 90 * mn),
                present: false
            ),
            Classmate(
                id: "demo-ajie", name: "阿杰", tz: "Europe/London", color: 2,
                look: AvatarLook(skin: 2, hair: 4, hairColor: 0),
                live: LiveStatus(userId: "demo-ajie", state: .focus, task: "论文", mode: .stopwatch,
                                 startedAt: t - 70 * mn, accumulatedMs: 30 * mn, runningSince: t - 40 * mn, updatedAt: t - 40 * mn),
                present: true, rain: true
            ),
        ]
    }

    /// a week of made-up history for the 数据 page
    static func mySessions(now: Date, tz: String) -> [Session] {
        let nowMs = now.timeIntervalSince1970 * 1000
        let keys = lastDays(7, tz, now: nowMs)
        let minutes = [50, 0, 95, 120, 30, 75, 0]
        var out: [Session] = []
        for (i, key) in keys.enumerated() where minutes[i] > 0 && i < keys.count - 1 {
            let k = splitKey(key)
            let start = zonedToUtc(k.y, k.m, k.d, 20, 0, tz)
            let ms = Double(minutes[i]) * MINUTE_MS
            out.append(Session(id: "demo-\(i)", userId: "me", startedAt: start, endedAt: start + ms + 5 * MINUTE_MS,
                               durationMs: ms, mode: .pomodoro, rating: 3 + i % 3, tz: tz))
        }
        return out
    }
}
