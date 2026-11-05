import TCCore

// Port of the character part of lib/pixel.ts: palettes, sprite stamping, outline, character(), portrait().

public typealias Grid = [[RGB?]]

public struct AvatarLook: Hashable, Codable, Sendable {
    /// index into `Pixel.skins` (any number: `pick` wraps and floors it like the web app)
    public var skin: Double
    /// style index into `Pixel.hairStyles`
    public var hair: Double
    /// index into `Pixel.hairColors`
    public var hairColor: Double

    public init(skin: Double, hair: Double, hairColor: Double) { self.skin = skin; self.hair = hair; self.hairColor = hairColor }
}

public enum Pose: String, Codable, Sendable { case sit, stand }

public enum Pixel {
    public static let skins = PixelData.skins.map(RGB.init(hex:))
    public static let hairColors = PixelData.hairColors.map(RGB.init(hex:))
    public static let hairNames = PixelData.hairNames
    /// shirt colors follow the categorical palette (light-mode hex)
    public static let shirts = PixelData.shirts.map(RGB.init(hex:))
    public static let outlineColor = RGB(hex: PixelData.outline)
    public static let hairStyles = PixelData.hairStyles
    public static let sceneW = PixelData.sceneW
    public static let sceneH = PixelData.sceneH

    /// safe index into a palette: works for negative, fractional or non-finite values
    public static func pick<T>(_ arr: [T], _ i: Double) -> T {
        let n = i.rounded(.down)
        guard n.isFinite else { return arr[0] }
        let len = Double(arr.count)
        let m = (n.truncatingRemainder(dividingBy: len) + len).truncatingRemainder(dividingBy: len)
        return arr[Int(m)]
    }

    /// FNV-1a over UTF-16 code units (`hash` in lib/pixel.ts)
    public static func hash(_ s: String) -> UInt32 {
        var h: UInt32 = 2_166_136_261
        for u in s.utf16 { h ^= UInt32(u); h = h &* 16_777_619 }
        return h
    }

    public static func defaultLook(_ id: String) -> AvatarLook {
        let h = hash(id)
        return AvatarLook(skin: Double(h % 4), hair: Double((h >> 3) % UInt32(hairStyles.count)), hairColor: Double((h >> 7) % 4))
    }

    /// the per-person desk seed (`seedOf` in components/Pixel.tsx): iterates code points, uses their first UTF-16 unit
    public static func seedOf(_ id: String) -> UInt32 {
        var h: UInt32 = 7
        for scalar in id.unicodeScalars {
            let v = scalar.value
            let unit = v > 0xFFFF ? 0xD800 + ((v - 0x10000) >> 10) : v
            h = h &* 31 &+ unit
        }
        return h
    }

    /// lighten (amt > 0) or darken (amt < 0) a color
    public static func shade(_ c: RGB, _ amt: Double) -> RGB {
        func f(_ v: UInt8) -> UInt8 {
            let c = Double(v)
            let x = JS.round(c + (amt < 0 ? c * amt : (255 - c) * amt))
            return UInt8(max(0, min(255, x)))
        }
        return RGB(f(c.r), f(c.g), f(c.b))
    }

    public static func mix(_ a: RGB, _ b: RGB, _ t: Double) -> RGB {
        func ch(_ x: UInt8, _ y: UInt8) -> UInt8 { UInt8(JS.round(Double(x) * (1 - t) + Double(y) * t)) }
        return RGB(ch(a.r, b.r), ch(a.g, b.g), ch(a.b, b.b))
    }

    static func blank(_ w: Int, _ h: Int) -> Grid { Array(repeating: Array(repeating: nil, count: w), count: h) }

    static func stamp(_ g: inout Grid, _ map: [String], _ ox: Int, _ oy: Int, _ colors: [Character: RGB?]) {
        for (y, row) in map.enumerated() {
            for (x, c) in row.enumerated() {
                if c == "." { continue }
                let gy = oy + y, gx = ox + x
                if gy < 0 || gy >= g.count || gx < 0 || gx >= g[0].count { continue }
                // unknown letters clear the cell, like `colors[c] ?? null`
                g[gy][gx] = c == "_" ? nil : (colors[c] ?? nil)
            }
        }
    }

    /// 1px outline around every filled cell (4-neighbourhood)
    public static func outline(_ g: Grid, color: RGB = Pixel.outlineColor) -> Grid {
        let h = g.count, w = g[0].count
        var out = g
        func n(_ yy: Int, _ xx: Int) -> Bool { yy >= 0 && yy < h && xx >= 0 && xx < w && g[yy][xx] != nil }
        for y in 0..<h {
            for x in 0..<w where g[y][x] == nil {
                if n(y - 1, x) || n(y + 1, x) || n(y, x - 1) || n(y, x + 1) { out[y][x] = color }
            }
        }
        return out
    }

    /// full character grid (16 x 16 seated, 16 x 26 standing), with a 1px outline margin
    public static func character(look: AvatarLook, shirt: RGB, pose: Pose, blink: Bool = false) -> Grid {
        let skin = pick(skins, look.skin)
        let hair = pick(hairColors, look.hairColor)
        let colors: [Character: RGB?] = [
            "S": skin, "s": shade(skin, -0.18), "E": blink ? shade(skin, -0.35) : RGB(hex: "#2a1a14"), "p": mix(skin, RGB(hex: "#f08a8a"), 0.35),
            "B": shirt, "b": shade(shirt, -0.22), "W": RGB(hex: "#fbf4e2"), "H": hair, "h": shade(hair, -0.25),
            "P": RGB(hex: "#3d4a6b"), "F": RGB(hex: "#2a1a14"),
        ]
        let body = pose == .sit ? PixelData.torsoSit : PixelData.bodyStand
        var g = blank(16, PixelData.head.count + body.count + 1)
        stamp(&g, PixelData.head, 0, 0, colors)
        stamp(&g, body, 0, PixelData.head.count, colors)
        stamp(&g, pick(hairStyles, look.hair), 0, 0, colors)
        return outline(g)
    }

    /// a head-and-shoulders portrait grid for avatars (16 x 15)
    public static func portrait(look: AvatarLook, shirt: RGB) -> Grid {
        Array(character(look: look, shirt: shirt, pose: .sit).prefix(15))
    }
}
