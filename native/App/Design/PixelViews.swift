import SwiftUI
import TCCore
import TCPixel

/// a pixel buffer shown at a whole number of points per art pixel, nearest-neighbour
struct PixelImage: View {
    let buffer: PixelBuffer
    /// points per art pixel (whole numbers keep the pixels crisp)
    var scale: CGFloat = 2

    var body: some View {
        let size = CGSize(width: CGFloat(buffer.width) * scale, height: CGFloat(buffer.height) * scale)
        if let cg = buffer.cgImage() {
            Image(decorative: cg, scale: 1)
                .resizable()
                .interpolation(.none)
                .frame(width: size.width, height: size.height)
        } else {
            Color.clear.frame(width: size.width, height: size.height)
        }
    }
}

/// a person's little room, animated at 170 ms a frame like components/Pixel.tsx
struct DeskView: View {
    let mate: Classmate
    var scale: CGFloat = 2
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        // with reduced motion the scene stays on frame 0 and only the clock moves (once a minute)
        TimelineView(.periodic(from: .now, by: reduceMotion ? 60 : 0.17)) { context in
            let frame = reduceMotion ? 0 : Int(context.date.timeIntervalSinceReferenceDate / 0.17)
            PixelImage(buffer: Pixel.scene(mate.sceneOpts(at: context.date, frame: frame)), scale: scale)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isImage)
        .accessibilityLabel(mate.deskLabel(at: Date()))
    }
}

/// head-and-shoulders portrait (16 x 15 art pixels) on a small slot
struct AvatarView: View {
    let mate: Classmate
    var scale: CGFloat = 2

    var body: some View {
        PixelImage(buffer: PixelBuffer(grid: Pixel.portrait(look: mate.avatarLook, shirt: mate.shirt)), scale: scale)
            .padding(2)
            .background(Tokens.slot)
            .overlay(Rectangle().strokeBorder(Tokens.edge, lineWidth: 1))
            .accessibilityHidden(true)
    }
}
