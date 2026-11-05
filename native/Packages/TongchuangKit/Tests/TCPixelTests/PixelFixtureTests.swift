import Foundation
import XCTest
import TCCore
@testable import TCPixel

/// Checks TCPixel against design/fixtures (pixels rendered by real Chromium canvas from lib/pixel.ts)
/// and design/pixel/*.json (the data constants). Regenerate with `node scripts/native-fixtures.mjs`.
final class PixelFixtureTests: XCTestCase {
    static let root: URL = {
        var u = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { u.deleteLastPathComponent() } // Tests/TCPixelTests/x.swift -> repo root
        return u
    }()

    static func load<T: Decodable>(_ rel: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(contentsOf: root.appendingPathComponent(rel)))
    }

    // MARK: data

    struct Palettes: Decodable { let SKINS, HAIR_COLORS, HAIR_NAMES, SHIRTS: [String]; let OUTLINE: String }
    struct Sprites: Decodable { let HEAD, TORSO_SIT, BODY_STAND: [String]; let HAIR_STYLES: [[String]] }
    struct SceneData: Decodable { let SCENE_W, SCENE_H: Int; let C: [String: String]; let FLOW_STARS: [[Int]]; let FLOW_STAR_MS: Double }

    func testPixelDataMatchesJSON() throws {
        let p: Palettes = try Self.load("design/pixel/palettes.json")
        XCTAssertEqual(PixelData.skins, p.SKINS)
        XCTAssertEqual(PixelData.hairColors, p.HAIR_COLORS)
        XCTAssertEqual(PixelData.hairNames, p.HAIR_NAMES)
        XCTAssertEqual(PixelData.shirts, p.SHIRTS)
        XCTAssertEqual(PixelData.outline, p.OUTLINE)
        let s: Sprites = try Self.load("design/pixel/sprites.json")
        XCTAssertEqual(PixelData.head, s.HEAD)
        XCTAssertEqual(PixelData.torsoSit, s.TORSO_SIT)
        XCTAssertEqual(PixelData.bodyStand, s.BODY_STAND)
        XCTAssertEqual(PixelData.hairStyles, s.HAIR_STYLES)
        let c: SceneData = try Self.load("design/pixel/scene.json")
        XCTAssertEqual(PixelData.sceneW, c.SCENE_W)
        XCTAssertEqual(PixelData.sceneH, c.SCENE_H)
        XCTAssertEqual(PixelData.scene, c.C)
        XCTAssertEqual(PixelData.flowStars.map { [$0.0, $0.1] }, c.FLOW_STARS)
        XCTAssertEqual(PixelData.flowStarMs, c.FLOW_STAR_MS)
    }

    // MARK: characters, colors, rng

    struct CharacterCase: Decodable { let look: AvatarLook; let shirt: RGB; let pose: Pose; let blink: Bool; let expected: [[String?]] }
    struct PortraitCase: Decodable { let look: AvatarLook; let shirt: RGB; let expected: [[String?]] }
    struct ShadeCase: Decodable { let hex: String; let amt: Double; let expected: String }
    struct MixCase: Decodable { let a: String; let b: String; let t: Double; let expected: String }
    struct LookCase: Decodable { let id: String; let expected: AvatarLook; let seed: UInt32 }
    struct RngCase: Decodable { let seed: Double; let expected: [Double] }
    struct Misc: Decodable {
        let characters: [CharacterCase]; let portraits: [PortraitCase]; let shade: [ShadeCase]; let mix: [MixCase]
        let defaultLook: [LookCase]; let rng: [RngCase]
    }

    static func hexGrid(_ g: Grid) -> [[String?]] { g.map { $0.map { $0?.hex } } }

    func testCharactersAndColors() throws {
        let m: Misc = try Self.load("design/fixtures/pixel-misc.json")
        XCTAssertFalse(m.characters.isEmpty)
        for c in m.characters {
            XCTAssertEqual(Self.hexGrid(Pixel.character(look: c.look, shirt: c.shirt, pose: c.pose, blink: c.blink)), c.expected,
                           "character \(c.look) \(c.pose) blink=\(c.blink)")
        }
        for c in m.portraits {
            XCTAssertEqual(Self.hexGrid(Pixel.portrait(look: c.look, shirt: c.shirt)), c.expected, "portrait \(c.look)")
        }
        for c in m.shade { XCTAssertEqual(Pixel.shade(RGB(hex: c.hex), c.amt).hex, c.expected, "shade(\(c.hex), \(c.amt))") }
        for c in m.mix { XCTAssertEqual(Pixel.mix(RGB(hex: c.a), RGB(hex: c.b), c.t).hex, c.expected, "mix(\(c.a), \(c.b), \(c.t))") }
        for c in m.defaultLook {
            XCTAssertEqual(Pixel.defaultLook(c.id), c.expected, "defaultLook(\(c.id))")
            XCTAssertEqual(Pixel.seedOf(c.id), c.seed, "seedOf(\(c.id))")
        }
        for c in m.rng {
            // rng(seed) starts with `seed >>> 0`
            var r = SceneRNG(UInt32(truncatingIfNeeded: Int64(c.seed)))
            XCTAssertEqual(c.expected.map { _ in r.next() }, c.expected, "rng(\(c.seed))")
        }
    }

    // MARK: scenes

    struct SceneIndex: Decodable { let chromium: String; let scenes: [String] }
    struct SceneCase: Decodable { let name: String; let width: Int; let height: Int; let opts: SceneOpts; let rgba: String; let translucentMask: String }

    /// Pixels must match Chromium exactly. As an interim allowance (docs/native/PLAN.md D4), a pixel whose final value
    /// came from a translucent rgba() fill may be off by up to 2 per channel; the count is reported.
    func testScenesMatchChromium() throws {
        let index: SceneIndex = try Self.load("design/fixtures/pixel/index.json")
        XCTAssertGreaterThanOrEqual(index.scenes.count, 20)
        var exact = 0, tolerated = 0, failed = 0, translucent = 0
        var reports = 0
        for file in index.scenes {
            let c: SceneCase = try Self.load("design/fixtures/pixel/" + file)
            guard let want = Data(base64Encoded: c.rgba), let mask = Data(base64Encoded: c.translucentMask) else {
                XCTFail("\(file): bad base64"); continue
            }
            XCTAssertEqual(want.count, c.width * c.height * 4)
            let got = Pixel.scene(c.opts)
            XCTAssertEqual(got.width, c.width); XCTAssertEqual(got.height, c.height)
            var sceneFailed = 0
            var first = ""
            let w = [UInt8](want), m = [UInt8](mask)
            for p in 0..<(c.width * c.height) {
                let isTranslucent = (m[p >> 3] >> (p & 7)) & 1 == 1
                if isTranslucent { translucent += 1 }
                var same = true, maxD = 0
                for k in 0..<4 {
                    let d = abs(Int(got.data[p * 4 + k]) - Int(w[p * 4 + k]))
                    if d != 0 { same = false; maxD = max(maxD, d) }
                }
                if same { exact += 1; continue }
                if isTranslucent && maxD <= 2 { tolerated += 1; continue }
                failed += 1; sceneFailed += 1
                if first.isEmpty {
                    let i = p * 4
                    first = "(\(p % c.width),\(p / c.width)) got \(Array(got.data[i..<i + 4])) want \(Array(w[i..<i + 4]))"
                }
            }
            if sceneFailed > 0 {
                reports += 1
                let msg = "\(c.name): \(sceneFailed) pixels differ, first at \(first)"
                if reports <= 8 { print("::error title=TCPixel golden::\(msg)") }
                XCTFail(msg)
            }
        }
        print("::notice title=TCPixel golden::\(index.scenes.count) scenes vs Chromium \(index.chromium): \(exact) exact, \(tolerated) within ±2 (translucent), \(failed) wrong; \(translucent) pixels come from translucent fills")
    }

    func testCGImage() throws {
        #if canImport(CoreGraphics)
        let img = Pixel.scene(SceneOpts(look: Pixel.defaultLook("u1"), shirt: Pixel.shirts[0], state: .focus, hour: 10, minute: 0,
                                        phase: .day, frame: 0, seed: 1, present: true)).cgImage()
        XCTAssertEqual(img?.width, Pixel.sceneW)
        XCTAssertEqual(img?.height, Pixel.sceneH)
        #endif
    }
}
