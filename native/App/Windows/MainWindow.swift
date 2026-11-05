import SwiftUI
import TCCore

enum SidebarItem: String, CaseIterable, Identifiable, Hashable {
    case today, room, stats, settings

    var id: Self { self }
    var title: String {
        switch self {
        case .today: return "今天"
        case .room: return "自习室"
        case .stats: return "数据"
        case .settings: return "设置"
        }
    }
    var icon: String {
        switch self {
        case .today: return "sun.max"
        case .room: return "person.3"
        case .stats: return "chart.bar"
        case .settings: return "gearshape"
        }
    }
}

struct MainWindow: View {
    @State private var selection: SidebarItem? = .room

    var body: some View {
        NavigationSplitView {
            List(SidebarItem.allCases, selection: $selection) { item in
                Label(item.title, systemImage: item.icon).tag(item)
            }
            .navigationSplitViewColumnWidth(min: 150, ideal: 170, max: 220)
        } detail: {
            Group {
                switch selection ?? .room {
                case .today: TodayView()
                case .room: StudyRoomView()
                case .stats: StatsView()
                case .settings: SettingsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Tokens.floorA)
            .foregroundStyle(Tokens.ink)
        }
    }
}

/// a parchment panel with a 1pt outline (the 9-slice pixel frame comes with TCDesign)
struct Panel<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(12)
            .background(Tokens.panel)
            .overlay(Rectangle().strokeBorder(Tokens.edge, lineWidth: 2))
    }
}
