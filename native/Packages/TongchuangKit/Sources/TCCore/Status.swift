import Foundation

// Port of the display helpers of lib/status.ts (R-005 personal status).

public struct ActiveStatus: Equatable, Sendable {
    public var emoji: String
    public var text: String
    public var until: Double?
    public var setAt: Double
}

/// the status that is set and not yet expired, regardless of focus
public func activeStatus(_ l: LiveStatus?, now: Double) -> ActiveStatus? {
    guard let l, let emoji = l.statusEmoji, !emoji.isEmpty else { return nil }
    if let until = l.statusUntil, until <= now { return nil }
    return ActiveStatus(emoji: emoji, text: l.statusText ?? "", until: l.statusUntil, setAt: l.statusSetAt ?? l.updatedAt)
}

/// what others should see: focus (and breaks) win over the status
public func shownStatus(_ l: LiveStatus?, now: Double) -> ActiveStatus? {
    if let l, l.state == .focus || l.state == .paused || l.state == .break { return nil }
    return activeStatus(l, now: now)
}

public func isSleep(_ s: ActiveStatus?) -> Bool { s?.emoji == "😴" }
