import AppKit
import SwiftUI

/// Colors of the web app, copied from the `:root` custom properties in app/globals.css
/// (light = `:root`, dark = `@media (prefers-color-scheme: dark)` / `:root[data-theme="dark"]`).
/// Follows the system appearance. TODO(阶段 0c): generate from design/tokens.json once it exists.
enum Tokens {
    // floor planks
    static let floorA = dynamic(0xc4874f, 0x2b1d14)
    static let floorB = dynamic(0xb97d47, 0x261a11)
    static let floorSeam = dynamic(0x8e5730, 0x1a110b)
    // parchment panels
    static let panel = dynamic(0xf8e6bd, 0x33261c)
    static let panel2 = dynamic(0xf0d7a2, 0x3d2e22)
    static let slot = dynamic(0xe6c88e, 0x4a3828)
    // wood
    static let wood = dynamic(0xa8683a, 0x5e3a20)
    static let woodHi = dynamic(0xd39a5e, 0x8a5a34)
    static let woodDk = dynamic(0x6e3d1d, 0x2a1a10)
    /// pixel outline
    static let edge = dynamic(0x3a2016, 0x120b07)
    // text
    static let ink = dynamic(0x3a2016, 0xf6e7c8)
    static let ink2 = dynamic(0x6b4429, 0xd8bf96)
    static let ink3 = dynamic(0x9a7350, 0xa8885f)
    static let onWood = dynamic(0xfff1d2, 0xffeccc)
    // lamp / accents
    static let lamp = dynamic(0xf5b83d, 0xf5b83d)
    static let lampInk = dynamic(0x7a4a00, 0xffd27a)
    static let lampSoft = dynamic(0xffe7a8, 0x5a4318)
    static let grass = dynamic(0x4f9a4a, 0x5fae54)
    static let good = dynamic(0x3e8a3c, 0x7ccf6a)
    static let bad = dynamic(0xb8402e, 0xf08060)
    static let focusRing = dynamic(0x2f6f8f, 0x8cc8e8)
    // buttons
    static let btn = dynamic(0x6fae54, 0x4f8a3f)
    static let btnHi = dynamic(0x9bd27a, 0x6fae54)
    static let btnDk = dynamic(0x3f7a35, 0x2c5a24)
    static let btnInk = dynamic(0xfff8e6, 0xfff8e6)
    /// subject / person colors (--s0 … --s7)
    static let categorical: [Color] = [
        dynamic(0x2a78d6, 0x3987e5), dynamic(0xeb6834, 0xd95926), dynamic(0x1baf7a, 0x199e70), dynamic(0xeda100, 0xc98500),
        dynamic(0xe87ba4, 0xd55181), dynamic(0x008300, 0x008300), dynamic(0x6250d6, 0x9085e9), dynamic(0xe34948, 0xe66767),
    ]

    static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? NSColor(hex: dark) : NSColor(hex: light)
        })
    }
}

extension NSColor {
    convenience init(hex: UInt32) {
        self.init(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
                  blue: CGFloat(hex & 255) / 255, alpha: 1)
    }
}
