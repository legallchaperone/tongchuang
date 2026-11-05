import Foundation

// Mirrors of the record types in lib/types.ts that the ported functions need.

public typealias UserId = String

public enum FocusMode: String, Codable, Sendable {
    /// 心流 (counts up; the stored value predates the rename)
    case stopwatch
    /// 番茄钟
    case pomodoro
    /// 倒计时
    case countdown
}

public enum LiveState: String, Codable, Sendable {
    case focus, `break`, paused, idle
}

public struct Session: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var userId: UserId
    public var subjectId: String?
    public var task: String
    /// epoch ms
    public var startedAt: Double
    /// epoch ms
    public var endedAt: Double
    /// focused time, pauses excluded
    public var durationMs: Double
    public var mode: FocusMode
    /// 1-5 self-rated focus, nil if skipped
    public var rating: Int?
    public var note: String
    public var tz: String
    public var todoId: String?

    public init(id: String, userId: UserId, subjectId: String? = nil, task: String = "", startedAt: Double, endedAt: Double,
                durationMs: Double, mode: FocusMode = .pomodoro, rating: Int? = nil, note: String = "", tz: String, todoId: String? = nil) {
        self.id = id; self.userId = userId; self.subjectId = subjectId; self.task = task
        self.startedAt = startedAt; self.endedAt = endedAt; self.durationMs = durationMs
        self.mode = mode; self.rating = rating; self.note = note; self.tz = tz; self.todoId = todoId
    }
}

public struct LiveStatus: Codable, Equatable, Sendable {
    public var userId: UserId
    public var state: LiveState
    public var task: String
    public var subjectName: String
    public var subjectColor: Int?
    public var mode: FocusMode
    /// when the current focus block started
    public var startedAt: Double?
    /// pomodoro / countdown / break planned end, nil for flow
    public var plannedEnd: Double?
    /// focused ms accumulated before the current running stretch
    public var accumulatedMs: Double
    /// when the current running stretch started (nil while paused)
    public var runningSince: Double?
    public var updatedAt: Double
    public var statusEmoji: String?
    public var statusText: String?
    public var statusUntil: Double?
    public var statusSetAt: Double?

    public init(userId: UserId, state: LiveState, task: String = "", subjectName: String = "", subjectColor: Int? = nil,
                mode: FocusMode = .pomodoro, startedAt: Double? = nil, plannedEnd: Double? = nil, accumulatedMs: Double = 0,
                runningSince: Double? = nil, updatedAt: Double, statusEmoji: String? = nil, statusText: String? = nil,
                statusUntil: Double? = nil, statusSetAt: Double? = nil) {
        self.userId = userId; self.state = state; self.task = task; self.subjectName = subjectName
        self.subjectColor = subjectColor; self.mode = mode; self.startedAt = startedAt; self.plannedEnd = plannedEnd
        self.accumulatedMs = accumulatedMs; self.runningSince = runningSince; self.updatedAt = updatedAt
        self.statusEmoji = statusEmoji; self.statusText = statusText; self.statusUntil = statusUntil; self.statusSetAt = statusSetAt
    }
}

/// R-007 收工: one person's end-of-day review, one per local day
public struct DailyReview: Codable, Equatable, Sendable {
    public var userId: UserId
    /// the reviewer's local date key, YYYY-MM-DD
    public var day: String
    public var energy: Int?
    public var impact: Int?
    public var note: String
    public var totalMs: Double
    public var tz: String
    public var createdAt: Double
    public var updatedAt: Double
}

/// JavaScript truthiness of an optional number (nil, 0 and NaN are false)
@inlinable
func truthy(_ v: Double?) -> Bool {
    guard let v else { return false }
    return v != 0 && !v.isNaN
}
