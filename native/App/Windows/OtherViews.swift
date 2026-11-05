import SwiftUI
import TCCore
import TCPixel

/// 今天: my own desk large (3 pt per art pixel) and today's total
struct TodayView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Panel {
                    DeskView(mate: model.me, scale: 3)
                }
                Panel {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("今天专注 \(dur(model.todayMs))").font(.title3)
                        HStack {
                            if model.isFocusing {
                                Text(clock(model.focusElapsedMs)).font(.title2.monospacedDigit())
                                Button("结束") { model.stopFocus() }
                            } else {
                                Button("开始专注") { model.startFocus() }
                                    .buttonStyle(.borderedProminent)
                                    .tint(Tokens.btn)
                            }
                        }
                        Text("这是演示数据：计时只在本机，还没有连上同窗的服务器。").font(.caption).foregroundStyle(Tokens.ink3)
                    }
                    .frame(width: CGFloat(Pixel.sceneW) * 3, alignment: .leading)
                }
            }
            .padding(20)
        }
        .navigationTitle("今天")
    }
}

/// 数据: a first taste, computed with TCCore (the same rules as the web app)
struct StatsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let s = model.weekSummary
        let st = model.streak
        ScrollView {
            Panel {
                Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 8) {
                    GridRow { Text("最近 7 天"); Text(dur(s.totalMs)) }
                    GridRow { Text("日均"); Text(dur(s.avgDayMs)) }
                    GridRow { Text("学习天数"); Text("\(s.activeDays) / \(s.days)") }
                    GridRow { Text("达标天数（2 小时）"); Text("\(s.goalDays)") }
                    GridRow { Text("最长一次"); Text(dur(s.longestMs)) }
                    GridRow { Text("连续天数"); Text("\(st.current)（最长 \(st.best)）") }
                    GridRow { Text("平均专注评分"); Text(s.avgRating.map { String(format: "%.1f", $0) } ?? "—") }
                }
                .font(.body.monospacedDigit())
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("数据")
    }
}

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("uiFont") private var uiFont = "system"

    var body: some View {
        Form {
            Picker("界面字体", selection: $uiFont) {
                Text("系统").tag("system")
                Text("像素（Fusion Pixel，即将提供）").tag("pixel")
            }
            .disabled(true)
            LabeledContent("时区", value: "\(tzCity(model.myTz))（\(model.myTz)）")
            LabeledContent("链接", value: model.lastURL?.absoluteString ?? "还没有通过 tongchuang:// 打开过")
            LabeledContent("版本", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
        }
        .formStyle(.grouped)
        .padding(20)
        .navigationTitle("设置")
    }
}
