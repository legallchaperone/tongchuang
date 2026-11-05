import TCCore

/// an opaque sRGB color, written "#rrggbb" in the web app
public struct RGB: Hashable, Sendable, Codable, CustomStringConvertible {
    public var r: UInt8, g: UInt8, b: UInt8

    public init(_ r: UInt8, _ g: UInt8, _ b: UInt8) { self.r = r; self.g = g; self.b = b }
    public init(rgb: UInt32) { self.init(UInt8((rgb >> 16) & 255), UInt8((rgb >> 8) & 255), UInt8(rgb & 255)) }
    /// "#rrggbb" (like `parseInt(hex.slice(1), 16)`; malformed input gives black)
    public init(hex: String) { self.init(rgb: UInt32(hex.dropFirst(), radix: 16) ?? 0) }

    public var rgb: UInt32 { UInt32(r) << 16 | UInt32(g) << 8 | UInt32(b) }
    public var hex: String {
        let s = String(rgb, radix: 16)
        return "#" + String(repeating: "0", count: 6 - s.count) + s
    }
    public var description: String { hex }

    public init(from decoder: Decoder) throws { self.init(hex: try decoder.singleValueContainer().decode(String.self)) }
    public func encode(to encoder: Encoder) throws { var c = encoder.singleValueContainer(); try c.encode(hex) }
}

/// A row-major RGBA8 image (straight alpha, sRGB) that the scene is drawn into, standing in for a 2D canvas.
///
/// Translucent fills use the integer blending of Chromium's software canvas, measured and checked in
/// scripts/native-fixtures/buf-ctx.mjs:
///   A = round(alpha * 255); sp = round(src * A / 255)
///   source-over on an opaque pixel: out = sp + (dst * (256 - A)) >> 8
///   lighter:                        out = min(255, sp + dst)
public struct PixelBuffer: Equatable, Sendable {
    public let width: Int
    public let height: Int
    public var data: [UInt8]

    private var clip: (x0: Int, y0: Int, x1: Int, y1: Int)
    private var clipStack: [(x0: Int, y0: Int, x1: Int, y1: Int)] = []

    public init(width: Int, height: Int) {
        self.width = width; self.height = height
        data = [UInt8](repeating: 0, count: width * height * 4)
        clip = (0, 0, width, height)
    }

    public static func == (a: PixelBuffer, b: PixelBuffer) -> Bool { a.width == b.width && a.height == b.height && a.data == b.data }

    /// rgba of one pixel
    public func pixel(_ x: Int, _ y: Int) -> (r: UInt8, g: UInt8, b: UInt8, a: UInt8) {
        let i = (y * width + x) * 4
        return (data[i], data[i + 1], data[i + 2], data[i + 3])
    }

    /// `ctx.save(); ctx.beginPath(); ctx.rect(...); ctx.clip()`
    public mutating func pushClip(_ x: Int, _ y: Int, _ w: Int, _ h: Int) {
        clipStack.append(clip)
        let r = Self.norm(x, y, w, h)
        clip = (max(clip.x0, r.x0), max(clip.y0, r.y0), min(clip.x1, r.x1), min(clip.y1, r.y1))
    }
    /// `ctx.restore()`
    public mutating func popClip() { if let c = clipStack.popLast() { clip = c } }

    /// `ctx.clearRect` (ignores the clip, which is all lib/pixel.ts needs)
    public mutating func clear() { for i in data.indices { data[i] = 0 } }

    /// `fillRect` with an opaque color; negative sizes extend left / up like canvas
    public mutating func fill(_ x: Int, _ y: Int, _ w: Int, _ h: Int, _ c: RGB) {
        let r = bounded(x, y, w, h)
        guard r.x0 < r.x1 else { return }
        for yy in r.y0..<r.y1 {
            var i = (yy * width + r.x0) * 4
            for _ in r.x0..<r.x1 {
                data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; data[i + 3] = 255
                i += 4
            }
        }
    }

    /// `fillRect` with `rgba(r,g,b,alpha)`, source-over or "lighter", onto opaque pixels
    public mutating func blend(_ x: Int, _ y: Int, _ w: Int, _ h: Int, _ c: RGB, alpha: Double, lighter: Bool = false) {
        if alpha >= 1 && !lighter { fill(x, y, w, h, c); return }
        let a = Int(JS.round(alpha * 255))
        guard a > 0 || lighter else { return }
        let sp = [Int(c.r), Int(c.g), Int(c.b)].map { ($0 * a + 127) / 255 }
        let inv = 256 - a
        let r = bounded(x, y, w, h)
        guard r.x0 < r.x1 else { return }
        for yy in r.y0..<r.y1 {
            var i = (yy * width + r.x0) * 4
            for _ in r.x0..<r.x1 {
                for k in 0..<3 {
                    let d = Int(data[i + k])
                    data[i + k] = UInt8(lighter ? min(255, sp[k] + d) : sp[k] + ((d * inv) >> 8))
                }
                i += 4
            }
        }
    }

    private static func norm(_ x: Int, _ y: Int, _ w: Int, _ h: Int) -> (x0: Int, y0: Int, x1: Int, y1: Int) {
        var x = x, y = y, w = w, h = h
        if w < 0 { x += w; w = -w }
        if h < 0 { y += h; h = -h }
        return (x, y, x + w, y + h)
    }

    private func bounded(_ x: Int, _ y: Int, _ w: Int, _ h: Int) -> (x0: Int, y0: Int, x1: Int, y1: Int) {
        let r = Self.norm(x, y, w, h)
        let x0 = max(r.x0, clip.x0, 0), y0 = max(r.y0, clip.y0, 0)
        let x1 = min(r.x1, clip.x1, width), y1 = min(r.y1, clip.y1, height)
        return x0 < x1 && y0 < y1 ? (x0, y0, x1, y1) : (0, 0, 0, 0)
    }
}

extension PixelBuffer {
    /// a grid (character, portrait) as an image of its own size; empty cells are transparent
    public init(grid: Grid) {
        self.init(width: grid.first?.count ?? 0, height: grid.count)
        drawGrid(grid, 0, 0)
    }

    /// `drawGrid` in lib/pixel.ts
    public mutating func drawGrid(_ g: Grid, _ x: Int, _ y: Int) {
        for (r, row) in g.enumerated() {
            for (c, col) in row.enumerated() { if let col { fill(x + c, y + r, 1, 1, col) } }
        }
    }
}
