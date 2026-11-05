import AppKit
import SwiftUI
import TCCore

/// the window-style menu bar panel: classmates, the focus button, a way into the main window
struct MenuBarPanel: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("同窗").font(.headline)
                Spacer()
                Text("今天 \(dur(model.todayMs))").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            ForEach(model.classmates) { mate in
                HStack(spacing: 10) {
                    AvatarView(mate: mate, scale: 2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(mate.name)
                        Text(mate.stateText(at: model.now)).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    Text(mate.localTime(at: model.now)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            }
            Divider()
            HStack {
                if model.isFocusing {
                    Text(clock(model.focusElapsedMs)).font(.title3.monospacedDigit())
                    Button("结束") { model.stopFocus() }
                } else {
                    Button("开始专注") { model.startFocus() }
                        .buttonStyle(.borderedProminent)
                        .tint(Tokens.btn)
                }
                Spacer()
                Button("打开同窗") {
                    openWindow(id: "main")
                    NSApplication.shared.activate()
                }
            }
            HStack {
                Spacer()
                Button("退出") { NSApplication.shared.terminate(nil) }
                    .buttonStyle(.link)
                    .font(.caption)
            }
        }
        .padding(14)
        .frame(width: 300)
    }
}
