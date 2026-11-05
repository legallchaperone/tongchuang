import Foundation
import Observation
import TCCore
import TCPixel

/// App state (will mirror lib/store.tsx). This increment: demo classmates and a local focus timer only.
@MainActor
@Observable
final class AppModel {
    var classmates: [Classmate]
    /// recorded focus sessions of "me" (demo history + what the local timer records)
    var sessions: [Session]
    /// ticks once a second, drives the menu bar timer and the state texts
    private(set) var now = Date()
    /// when the local timer started (nil = not focusing)
    private(set) var focusStartedAt: Date?
    /// the last tongchuang:// link the app was opened with (magic-link sign-in lands here later, D7)
    private(set) var lastURL: URL?

    let myId = "me"
    let myTz = TimeZone.current.identifier

    @ObservationIgnored private var ticker: Task<Void, Never>?

    init() {
        let start = Date()
        classmates = DemoData.classmates(now: start)
        sessions = DemoData.mySessions(now: start, tz: TimeZone.current.identifier)
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                self?.now = Date()
            }
        }
    }

    var isFocusing: Bool { focusStartedAt != nil }

    /// focused ms of the running local timer
    var focusElapsedMs: Double {
        guard let s = focusStartedAt else { return 0 }
        return max(0, now.timeIntervalSince(s) * 1000)
    }

    /// menu bar title: the timer while focusing ("▮ 24:13"), otherwise the app name
    var menuBarTitle: String { isFocusing ? "▮ " + clock(focusElapsedMs) : "同窗" }

    /// "me" as a desk, live while the local timer runs
    var me: Classmate {
        var live: LiveStatus?
        if let s = focusStartedAt {
            let ms = s.timeIntervalSince1970 * 1000
            live = LiveStatus(userId: myId, state: .focus, mode: .stopwatch, startedAt: ms, accumulatedMs: 0, runningSince: ms, updatedAt: ms)
        }
        return Classmate(id: myId, name: "我", tz: myTz, color: 0, look: AvatarLook(skin: 0, hair: 2, hairColor: 2), live: live, present: true)
    }

    /// me first, then the others
    var everyone: [Classmate] { [me] + classmates }

    func startFocus() {
        guard focusStartedAt == nil else { return }
        now = Date()
        focusStartedAt = now
    }

    func stopFocus() {
        guard let s = focusStartedAt else { return }
        let end = Date()
        let ms = end.timeIntervalSince(s) * 1000
        if ms >= 60_000 {
            sessions.append(Session(id: UUID().uuidString, userId: myId, startedAt: s.timeIntervalSince1970 * 1000,
                                    endedAt: end.timeIntervalSince1970 * 1000, durationMs: ms, mode: .stopwatch, tz: myTz))
        }
        focusStartedAt = nil
        now = end
    }

    func toggleFocus() { isFocusing ? stopFocus() : startFocus() }

    func handle(_ url: URL) {
        guard url.scheme == "tongchuang" else { return }
        lastURL = url
    }

    // MARK: numbers for 今天 / 数据 (TCCore, the same functions the web app uses)

    private var myLive: LiveStatus? { me.live }
    var todayMs: Double { TCCore.workDayMs(sessions, myId, myLive, myTz, now: now.timeIntervalSince1970 * 1000) }
    var weekSummary: Summary {
        let nowMs = now.timeIntervalSince1970 * 1000
        let all = withLive(sessions, myId, myLive, myTz, now: nowMs)
        return summarize(all, myTz, lastDays(7, myTz, now: nowMs), goalMs: 2 * HOUR_MS)
    }
    var streak: Streaks {
        let nowMs = now.timeIntervalSince1970 * 1000
        return streaks(byDay(withLive(sessions, myId, myLive, myTz, now: nowMs), myTz), myTz, now: nowMs)
    }
}
