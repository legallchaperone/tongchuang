import Foundation
import TCCore
import TCPixel

/// one person in the study room (demo data for now; TCBackend comes in a later increment)
struct Classmate: Identifiable, Equatable {
    let id: String
    var name: String
    /// IANA time zone
    var tz: String
    /// index into the categorical palette, 0-7
    var color: Int
    /// nil = derived from the id, like the web app
    var look: AvatarLook?
    var live: LiveStatus?
    /// has the app open
    var present: Bool
    var rain = false
    /// R-007 收工
    var closed = false

    var avatarLook: AvatarLook { look ?? Pixel.defaultLook(id) }
    var shirt: RGB { Pixel.pick(Pixel.shirts, Double(color)) }

    /// the scene options DeskScene in components/Pixel.tsx builds for this person
    func sceneOpts(at date: Date, frame: Int) -> SceneOpts {
        let ms = date.timeIntervalSince1970 * 1000
        let t = partsIn(ms, tz)
        let st = shownStatus(live, now: ms)
        return SceneOpts(
            look: avatarLook, shirt: shirt, state: live?.state ?? .idle,
            hour: Double(t.h) + Double(t.mi) / 60, minute: Double(t.mi), phase: phaseAt(Double(t.h)),
            frame: frame, seed: Pixel.seedOf(id), rain: rain, present: present,
            flowMs: live?.mode == .stopwatch ? liveFocusMs(live, now: ms) : 0,
            sleeping: isSleep(st), closed: closed
        )
    }

    /// short state for lists: "专注中 · 18分"
    func stateText(at date: Date) -> String {
        let ms = date.timeIntervalSince1970 * 1000
        if closed { return "已收工" }
        switch live?.state {
        case .focus?: return "\(live?.mode == .stopwatch ? "心流中" : "专注中") · \(dur(liveFocusMs(live, now: ms)))"
        case .paused?: return "暂停中 · \(dur(liveFocusMs(live, now: ms)))"
        case .break?: return "在休息"
        default:
            if let st = shownStatus(live, now: ms) { return "\(st.emoji) \(st.text)" }
            return present ? "在线" : "不在座位"
        }
    }

    /// VoiceOver label, same wording as the web canvas aria-label (components/Pixel.tsx)
    func deskLabel(at date: Date) -> String {
        let ms = date.timeIntervalSince1970 * 1000
        let what: String
        if closed {
            what = "已收工，熄灯了"
        } else if live?.state == .focus {
            what = live?.mode == .stopwatch ? "心流中" : "正在专注"
        } else if live?.state == .break {
            what = "在休息"
        } else if live?.state == .paused {
            what = "暂停中"
        } else if let st = shownStatus(live, now: ms) {
            what = "\(st.emoji) \(st.text)"
        } else {
            what = "不在座位"
        }
        return "\(name)的书桌：\(what)"
    }

    /// "上海 21:04"
    func localTime(at date: Date) -> String { "\(tzCity(tz)) \(hhmm(date.timeIntervalSince1970 * 1000, tz))" }
}
