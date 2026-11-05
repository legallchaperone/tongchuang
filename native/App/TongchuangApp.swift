import SwiftUI

@main
struct TongchuangApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup("同窗", id: "main") {
            MainWindow()
                .environment(model)
                .frame(minWidth: 640, minHeight: 440)
                // tongchuang://… (registered in project.yml); the magic-link sign-in will arrive here (D7)
                .onOpenURL { model.handle($0) }
        }
        .defaultSize(width: 900, height: 600)

        MenuBarExtra {
            MenuBarPanel()
                .environment(model)
        } label: {
            Text(model.menuBarTitle)
                .monospacedDigit()
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
                .environment(model)
                .frame(width: 460)
        }
    }
}
