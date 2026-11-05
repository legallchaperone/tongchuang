import Foundation
import TCCore

// Port of drawScene() in lib/pixel.ts: a person's little room, 96 x 80 art pixels.
// Every call, constant and evaluation order follows the TypeScript so the result matches Chromium
// pixel for pixel (Tests/TCPixelTests compares against design/fixtures/pixel/*.json).

public struct SceneOpts: Codable, Equatable, Sendable {
    public var look: AvatarLook
    public var shirt: RGB
    public var state: LiveState
    /// local hour of the person (fractional)
    public var hour: Double
    public var minute: Double
    public var phase: Phase
    public var frame: Int
    public var seed: UInt32
    public var rain: Bool?
    /// has the app open
    public var present: Bool
    /// flow mode (R-001): focused ms so far; lights a star per 25 minutes and brightens the lamp
    public var flowMs: Double?
    /// R-005: status says "sleeping": lights off, head down on the desk
    public var sleeping: Bool?
    /// R-007: they 收工'd for the day — lights out until they focus again
    public var closed: Bool?

    public init(look: AvatarLook, shirt: RGB, state: LiveState, hour: Double, minute: Double, phase: Phase, frame: Int, seed: UInt32,
                rain: Bool = false, present: Bool, flowMs: Double? = nil, sleeping: Bool = false, closed: Bool = false) {
        self.look = look; self.shirt = shirt; self.state = state; self.hour = hour; self.minute = minute; self.phase = phase
        self.frame = frame; self.seed = seed; self.rain = rain; self.present = present; self.flowMs = flowMs
        self.sleeping = sleeping; self.closed = closed
    }
}

/// the LCG of lib/pixel.ts: `s = (s * 1664525 + 1013904223) >>> 0; return s / 2^32`
public struct SceneRNG {
    var s: UInt32
    public init(_ seed: UInt32) { s = seed == 0 ? 1 : seed }
    public mutating func next() -> Double {
        s = s &* 1_664_525 &+ 1_013_904_223
        return Double(s) / 4_294_967_296
    }
}

private func hex(_ s: String) -> RGB { RGB(hex: s) }

private enum C {
    static let p = PixelData.scene
    static let wall = hex(p["wall"]!), wallStripe = hex(p["wallStripe"]!), trim = hex(p["trim"]!), base = hex(p["base"]!)
    static let floorA = hex(p["floorA"]!), floorB = hex(p["floorB"]!), seam = hex(p["seam"]!)
    static let wood = hex(p["wood"]!), woodHi = hex(p["woodHi"]!), woodDk = hex(p["woodDk"]!)
    static let deskTop = hex(p["deskTop"]!), deskHi = hex(p["deskHi"]!), deskFront = hex(p["deskFront"]!), deskDk = hex(p["deskDk"]!)
    static let paper = hex(p["paper"]!), paperLine = hex(p["paperLine"]!)
}

private let skyBands: [Phase: [RGB]] = [
    .day: ["#7cc6f2", "#9ad4f6", "#bfe5fa"].map(hex),
    .dawn: ["#9a86c8", "#f0a3a0", "#f9d29a"].map(hex),
    .dusk: ["#4f3f86", "#c4627a", "#f2a35e"].map(hex),
    .night: ["#0f1533", "#172049", "#202c61"].map(hex),
]
private let bookCols = ["#b5442e", "#3f7d5c", "#2f5f8a", "#d9a443", "#6a4a8f", "#c06a3a"].map(hex)
private let white = RGB(255, 255, 255)

extension PixelBuffer {
    private mutating func rect(_ x: Int, _ y: Int, _ w: Int, _ h: Int, _ c: RGB) { fill(x, y, w, h, c) }

    private mutating func sky(_ o: SceneOpts, _ x: Int, _ y: Int, _ w: Int, _ h: Int) {
        let b = skyBands[o.phase]!
        let bh = (h + 2) / 3 // Math.ceil(h / 3)
        for (i, c) in b.enumerated() { rect(x, y + i * bh, w, min(bh, h - i * bh), c) }
        var r = SceneRNG(o.seed)
        if o.phase == .night {
            for i in 0..<14 {
                let sx = x + Int(JS.floor(r.next() * Double(w)))
                let sy = y + Int(JS.floor(r.next() * Double(h) * 0.8))
                let tw = (o.frame + i) % 9 == 0
                rect(sx, sy, 1, 1, tw ? white : hex("#c9d3ff"))
            }
            // crescent moon
            let moon = hex("#f6f0c8")
            rect(x + w - 9, y + 3, 4, 1, moon); rect(x + w - 10, y + 4, 5, 3, moon); rect(x + w - 9, y + 7, 4, 1, moon)
            rect(x + w - 8, y + 4, 3, 3, b[0])
        } else {
            // sun height follows the hour
            let t = max(0, min(1, (o.hour - 5) / 15))
            let sunY = y + Int(JS.round(Double(h) - 4 - sin(t * Double.pi) * Double(h - 9)))
            let sunX = x + 3 + Int(JS.round(t * Double(w - 10)))
            let sun = o.phase == .day ? hex("#ffe680") : hex("#ffc36b")
            rect(sunX + 1, sunY, 3, 5, sun); rect(sunX, sunY + 1, 5, 3, sun)
            // drifting cloud
            let cx = x + ((o.frame / 6 + Int(JS.floor(r.next() * 30))) % (w + 12)) - 10
            let cc = o.phase == .day ? white : hex("#f6d6c8")
            pushClip(x, y, w, h)
            rect(cx, y + 6, 9, 2, cc); rect(cx + 2, y + 5, 5, 1, cc); rect(cx + 1, y + 8, 7, 1, Pixel.shade(cc, -0.06))
            popClip()
        }
        // distant hills
        let hill = o.phase == .night ? hex("#18304a") : o.phase == .day ? hex("#5aa25a") : hex("#6a5a6a")
        let seed13 = Int(o.seed % 13)
        for i in 0..<w {
            let hh = 2 + Int(JS.round(sin(Double(i + seed13) / 3.2) * 1.5 + sin(Double(i) / 7) * 1.5))
            rect(x + i, y + h - hh, 1, hh, hill)
        }
        if o.rain == true {
            pushClip(x, y, w, h)
            for i in 0..<12 {
                let rx = x + ((i * 7 + o.frame * 2) % (w + 4)) - 2
                let ry = y + ((i * 11 + o.frame * 5) % (h + 4)) - 2
                blend(rx, ry, 1, 2, RGB(200, 225, 255), alpha: 0.8)
            }
            popClip()
        }
    }

    private mutating func line(_ x0d: Double, _ y0d: Double, _ x1d: Double, _ y1d: Double, _ c: RGB) {
        var x0 = Int(JS.round(x0d)), y0 = Int(JS.round(y0d))
        let x1 = Int(JS.round(x1d)), y1 = Int(JS.round(y1d))
        let dx = abs(x1 - x0), dy = -abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
        var err = dx + dy
        while true {
            rect(x0, y0, 1, 1, c)
            if x0 == x1 && y0 == y1 { break }
            let e2 = 2 * err
            if e2 >= dy { err += dy; x0 += sx }
            if e2 <= dx { err += dx; y0 += sy }
        }
    }

    /// draws one frame of a desk scene into this buffer (which should be `Pixel.sceneW` x `Pixel.sceneH`)
    public mutating func drawScene(_ o: SceneOpts) {
        let W = Pixel.sceneW, H = Pixel.sceneH
        var r = SceneRNG(o.seed &* 7 &+ 3)
        clear()
        // wall
        rect(0, 0, W, 48, C.wall)
        for x in stride(from: 2, to: W, by: 6) { rect(x, 0, 1, 46, C.wallStripe) }
        rect(0, 0, W, 2, C.trim)
        rect(0, 44, W, 2, C.trim); rect(0, 46, W, 2, C.base)
        // floor
        for y in stride(from: 48, to: H, by: 5) {
            let odd = ((y - 48) / 5) % 2 != 0
            rect(0, y, W, 5, odd ? C.floorA : C.floorB)
            rect(0, y + 4, W, 1, C.seam)
            let off = odd ? 9 : 25
            for x in stride(from: off, to: W, by: 32) { rect(x, y, 1, 4, C.seam) }
        }
        // rug
        let rugC = Pixel.shade(o.shirt, -0.35)
        rect(22, 70, 58, 8, rugC); rect(24, 71, 54, 6, Pixel.shade(rugC, 0.18))
        for x in stride(from: 26, to: 76, by: 4) { rect(x, 73, 2, 2, rugC) }

        // window frame + curtains
        let wx = 8, wy = 6, ww = 30, wh = 26
        rect(wx - 2, wy - 2, ww + 4, wh + 4, C.woodDk)
        rect(wx - 1, wy - 1, ww + 2, wh + 2, C.wood)
        sky(o, wx, wy, ww, wh)
        rect(wx + ww / 2 - 1, wy, 2, wh, C.wood); rect(wx, wy + wh / 2 - 1, ww, 2, C.wood)
        rect(wx - 3, wy + wh + 1, ww + 6, 2, C.woodHi) // sill
        let cur = Pixel.shade(o.shirt, 0.25)
        rect(wx - 5, wy - 3, 5, wh + 7, cur); rect(wx - 4, wy - 3, 1, wh + 7, Pixel.shade(cur, -0.15))
        rect(wx + ww, wy - 3, 5, wh + 7, cur); rect(wx + ww + 2, wy - 3, 1, wh + 7, Pixel.shade(cur, -0.15))
        rect(wx - 7, wy - 4, ww + 14, 2, C.woodDk) // rod

        // wall clock showing the person's local time
        let kx = 72, ky = 12
        rect(kx - 6, ky - 7, 13, 15, C.woodDk); rect(kx - 7, ky - 6, 15, 13, C.woodDk)
        rect(kx - 5, ky - 6, 11, 13, hex("#f6e7c4")); rect(kx - 6, ky - 5, 13, 11, hex("#f6e7c4"))
        for i in stride(from: 0, to: 12, by: 3) {
            let a = (Double(i) / 12) * Double.pi * 2
            rect(kx + Int(JS.round(sin(a) * 5)), ky - Int(JS.round(cos(a) * 5)), 1, 1, C.wood)
        }
        let ha = ((o.hour.truncatingRemainder(dividingBy: 12)) + o.minute / 60) / 12 * Double.pi * 2
        let ma = (o.minute / 60) * Double.pi * 2
        let kxd = Double(kx), kyd = Double(ky)
        line(kxd, kyd, kxd + sin(ma) * 4.6, kyd - cos(ma) * 4.6, hex("#3a2016"))
        line(kxd, kyd, kxd + sin(ha) * 3, kyd - cos(ha) * 3, hex("#b5442e"))

        // shelf with books and a plant
        rect(52, 30, 40, 2, C.woodHi); rect(52, 32, 40, 1, C.woodDk)
        var bx = 54
        for i in 0..<6 {
            let bw = 2 + Int(JS.floor(r.next() * 2)), bh = 6 + Int(JS.floor(r.next() * 4))
            rect(bx, 30 - bh, bw, bh, bookCols[(i + Int(o.seed % 6)) % bookCols.count])
            blend(bx, 30 - bh + 2, bw, 1, white, alpha: 0.35)
            bx += bw + 1
        }
        // plant
        rect(84, 25, 5, 5, hex("#b5603a")); rect(84, 25, 5, 1, hex("#d27a4e"))
        rect(85, 20, 1, 5, hex("#3f7d5c")); rect(83, 21, 3, 2, hex("#5aa25a")); rect(86, 19, 3, 2, hex("#5aa25a")); rect(87, 22, 2, 2, hex("#4a9050"))

        let seated = o.state == .focus || o.state == .paused
        let slump = o.sleeping == true && !seated && o.state != .break
        let lampOn = seated
        let flowMs = o.flowMs ?? 0
        // flow: the lamp warms up over the first two hours
        let boost = seated && flowMs != 0 && !flowMs.isNaN ? min(1, flowMs / (120 * 60_000)) : 0
        // chair back
        let chairC = C.wood
        if !seated && !slump {
            rect(38, 36, 20, 2, C.woodDk); rect(38, 38, 2, 12, C.woodDk); rect(56, 38, 2, 12, C.woodDk)
            rect(40, 38, 16, 9, chairC); rect(41, 39, 14, 1, C.woodHi)
        } else {
            rect(37, 40, 22, 10, C.woodDk); rect(38, 41, 20, 9, chairC)
        }
        // seated character
        let blink = o.frame % 23 == 0
        if seated {
            let g = Pixel.character(look: o.look, shirt: o.shirt, pose: .sit, blink: blink)
            let bob = o.state == .focus && o.frame % 8 < 4 ? 0 : 1
            drawGrid(g, 40, 32 + (o.state == .paused ? 1 : bob))
        }
        if slump {
            // head sunk onto the desk, eyes shut, slow breathing
            let g = Pixel.character(look: o.look, shirt: o.shirt, pose: .sit, blink: true)
            drawGrid(g, 40, 39 + (o.frame % 16 < 8 ? 0 : 1))
        }

        // desk
        rect(12, 49, 76, 1, C.deskDk)
        rect(12, 50, 76, 6, C.deskTop); rect(12, 50, 76, 1, C.deskHi)
        rect(14, 56, 72, 12, C.deskFront); rect(14, 56, 72, 1, C.deskDk)
        rect(58, 59, 24, 6, Pixel.shade(C.deskFront, 0.1)); rect(58, 59, 24, 1, C.deskDk); rect(69, 61, 2, 2, hex("#e7c56e"))
        rect(16, 68, 3, 9, C.deskDk); rect(81, 68, 3, 9, C.deskDk)
        blend(12, 77, 76, 1, RGB(60, 30, 10), alpha: 0.25)

        // books on the left of the desk
        rect(18, 45, 12, 2, hex("#2f5f8a")); rect(19, 43, 10, 2, hex("#b5442e")); rect(18, 41, 11, 2, hex("#3f7d5c"))
        rect(18, 45, 12, 1, hex("#4a7aa8"))
        // notebook / paper
        rect(40, 50, 16, 4, C.paper)
        for x in stride(from: 42, to: 55, by: 3) { rect(x, 51, 2, 1, C.paperLine) }
        if o.state == .focus {
            // written lines grow over time
            let n = (o.frame / 6) % 6
            for i in 0..<max(0, n) { rect(42 + i * 2, 52, 1, 1, hex("#4a5160")) }
        }
        // mug
        if o.state != .break {
            rect(32, 46, 4, 4, hex("#f2ece0")); rect(36, 47, 1, 2, hex("#f2ece0")); rect(32, 46, 4, 1, hex("#7a4523"))
            if seated && o.frame % 6 < 3 { blend(33, 43, 1, 2, white, alpha: 0.7) }
            if seated && o.frame % 6 >= 3 { blend(34, 42, 1, 2, white, alpha: 0.7) }
        }
        // hands writing
        if seated {
            let skin = Pixel.pick(Pixel.skins, o.look.skin)
            let hx = o.state == .focus ? 49 + (o.frame % 4 < 2 ? 0 : 2) : 49
            rect(42, 50, 3, 2, Pixel.outlineColor); rect(43, 50, 2, 1, skin)
            rect(hx, 50, 3, 2, Pixel.outlineColor); rect(hx, 50, 2, 1, skin)
            rect(hx + 2, 47, 1, 3, hex("#e7b73e")); rect(hx + 2, 46, 1, 1, hex("#e98f8f"))
        }
        if slump {
            // folded arms on the desk, the face resting on them
            let sh = o.shirt
            let skin = Pixel.pick(Pixel.skins, o.look.skin)
            rect(37, 47, 22, 5, Pixel.outlineColor)
            rect(38, 48, 20, 3, sh); rect(38, 50, 20, 1, Pixel.shade(sh, -0.22))
            rect(38, 48, 3, 2, skin); rect(55, 48, 3, 2, skin)
        }
        // lamp
        let lx = 70
        rect(lx, 47, 8, 3, hex("#2f4a3a")); rect(lx + 3, 37, 2, 10, hex("#2f4a3a"))
        rect(lx - 2, 33, 12, 5, hex("#3f7d5c")); rect(lx - 1, 32, 10, 1, hex("#3f7d5c")); rect(lx - 2, 33, 12, 1, hex("#5aa27a"))
        rect(lx + 1, 38, 6, 1, lampOn ? (boost > 0.5 ? hex("#fffbe0") : hex("#fff2a8")) : hex("#6d7a70"))

        // standing character on a break, holding a mug
        if o.state == .break {
            let g = Pixel.character(look: o.look, shirt: o.shirt, pose: .stand, blink: blink)
            drawGrid(g, 2, 49 + (o.frame % 10 < 5 ? 0 : 1))
            rect(14, 61, 3, 3, hex("#f2ece0")); rect(14, 61, 3, 1, hex("#7a4523"))
            if o.frame % 6 < 3 { blend(15, 58, 1, 2, white, alpha: 0.75) } else { blend(16, 57, 1, 2, white, alpha: 0.75) }
        }

        // lighting: their local time of day
        let skyDim: Double = o.phase == .night ? 0.45 : (o.phase == .dusk || o.phase == .dawn ? 0.14 : 0)
        let dim = max(skyDim, slump ? 0.4 : 0)
        if dim != 0 { blend(0, 0, W, H, RGB(14, 16, 44), alpha: dim) }
        if lampOn {
            // stepped pool of lamp light: three rings, brightest under the shade
            let k = (o.phase == .night ? 1 : 0.45) * (1 + boost * 0.9)
            let reach = 1 / (1 + boost * 0.3)
            let cx = lx + 4, cy = 44
            let warm = RGB(255, 196, 100)
            var alphas = [Double](repeating: 0, count: 4)
            for lvl in 1...3 { alphas[lvl] = JS.toFixed(Double(lvl) * 0.07 * k, 3) }
            for y in 22..<74 {
                for x in 18..<W {
                    let d = JS.hypot(Double(x - cx) * 0.8, Double(y - cy) * 1.25) * reach
                    let lvl = d < 10 ? 3 : d < 17 ? 2 : d < 25 ? 1 : 0
                    if lvl == 0 { continue }
                    // checkerboard dither on the outer ring
                    if lvl == 1 && (x + y) % 2 != 0 { continue }
                    blend(x, y, 1, 1, warm, alpha: alphas[lvl], lighter: true)
                }
            }
        }
        if seated && flowMs != 0 && !flowMs.isNaN {
            // flow: one pixel star outside the window for every 25 focused minutes; the newest one twinkles
            let stars = PixelData.flowStars
            let n = min(stars.count, Int(JS.floor(flowMs / PixelData.flowStarMs)))
            for i in 0..<max(0, n) {
                let sx = wx + stars[i].0, sy = wy + stars[i].1
                let tw = i == n - 1 && o.frame % 10 < 5
                rect(sx - 1, sy, 3, 1, hex("#ffd45a")); rect(sx, sy - 1, 1, 3, hex("#ffd45a"))
                if tw {
                    let c = hex("#ffe9a0")
                    rect(sx - 2, sy, 1, 1, c); rect(sx + 2, sy, 1, 1, c); rect(sx, sy - 2, 1, 1, c); rect(sx, sy + 2, 1, 1, c)
                }
                rect(sx, sy, 1, 1, hex("#fffbe6"))
            }
        }
        if o.closed == true && !seated && o.state != .break { drawClosed(o) }
        if slump || (!o.present && !seated && o.state != .break && o.phase == .night) {
            // "Zzz" over the empty chair: they're probably asleep
            let z = hex("#c9d3ff")
            let zy = 26 - (o.frame % 12 < 6 ? 0 : 1)
            rect(46, zy, 3, 1, z); rect(47, zy + 1, 1, 1, z); rect(46, zy + 2, 3, 1, z)
            rect(50, zy - 4, 4, 1, z); rect(52, zy - 3, 1, 1, z); rect(51, zy - 2, 1, 1, z); rect(50, zy - 1, 4, 1, z)
        }
    }

    /// R-007 收工: notebook shut, a little moon sign on the chair, and the room goes dark
    private mutating func drawClosed(_ o: SceneOpts) {
        // closed notebook with the pencil laid on top
        let cover = Pixel.shade(o.shirt, -0.2)
        rect(40, 50, 16, 4, cover); rect(40, 50, 16, 1, Pixel.shade(cover, 0.25)); rect(40, 53, 16, 1, Pixel.shade(cover, -0.3))
        rect(41, 51, 1, 2, C.paper)
        rect(44, 52, 9, 1, hex("#e7b73e")); rect(53, 52, 1, 1, hex("#e98f8f"))
        // sign hung on the chair back: a crescent moon
        rect(47, 36, 1, 3, C.woodDk); rect(48, 35, 1, 1, C.woodDk); rect(49, 36, 1, 3, C.woodDk)
        rect(43, 39, 11, 7, C.woodDk); rect(44, 40, 9, 5, C.paper)
        rect(47, 41, 3, 1, hex("#d9a443")); rect(46, 42, 2, 2, hex("#d9a443")); rect(47, 44, 3, 1, hex("#d9a443"))
        // lights out
        let k = o.phase == .night ? 0.38 : o.phase == .day ? 0.5 : 0.44
        blend(0, 0, Pixel.sceneW, Pixel.sceneH, RGB(8, 10, 30), alpha: k)
    }
}

extension Pixel {
    /// one frame of a desk scene as a new 96 x 80 buffer
    public static func scene(_ o: SceneOpts) -> PixelBuffer {
        var b = PixelBuffer(width: sceneW, height: sceneH)
        b.drawScene(o)
        return b
    }
}
