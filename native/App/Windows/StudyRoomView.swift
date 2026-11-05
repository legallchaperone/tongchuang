import SwiftUI
import TCCore
import TCPixel

/// 自习室: everyone's desk at 2 pt per art pixel (192 x 160 pt). A wider window gets more columns, never bigger art.
struct StudyRoomView: View {
    @Environment(AppModel.self) private var model

    private let deskScale: CGFloat = 2
    private var deskWidth: CGFloat { CGFloat(Pixel.sceneW) * deskScale }

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: deskWidth + 24, maximum: deskWidth + 24), spacing: 16)], spacing: 16) {
                ForEach(model.everyone) { mate in
                    Panel {
                        VStack(alignment: .leading, spacing: 8) {
                            DeskView(mate: mate, scale: deskScale)
                            HStack(spacing: 8) {
                                AvatarView(mate: mate, scale: 1)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(mate.name).font(.headline)
                                    Text(mate.stateText(at: model.now)).font(.caption).foregroundStyle(Tokens.ink2)
                                }
                                Spacer(minLength: 0)
                                Text(mate.localTime(at: model.now)).font(.caption.monospacedDigit()).foregroundStyle(Tokens.ink3)
                            }
                            .frame(width: deskWidth)
                        }
                    }
                }
            }
            .padding(20)
        }
        .navigationTitle("自习室")
    }
}
