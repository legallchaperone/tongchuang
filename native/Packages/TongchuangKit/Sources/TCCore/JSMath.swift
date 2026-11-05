import Foundation

/// JavaScript number semantics the ported code relies on, so results match the web app bit for bit.
public enum JS {
    /// `Math.round`: nearest integer, ties toward +infinity (Swift's `.rounded()` rounds ties away from zero).
    @inlinable
    public static func round(_ x: Double) -> Double {
        guard x.isFinite else { return x }
        let f = x.rounded(.down)
        return x - f >= 0.5 ? f + 1 : f
    }

    @inlinable
    public static func floor(_ x: Double) -> Double { x.rounded(.down) }

    /// `Math.hypot` for two arguments, ported from V8 (src/builtins/math.tq): scale by the larger
    /// magnitude, then a Kahan-compensated sum of squares. The lamp light rings depend on it.
    public static func hypot(_ a: Double, _ b: Double) -> Double {
        if a.isInfinite || b.isInfinite { return .infinity }
        if a.isNaN || b.isNaN { return .nan }
        let x = Swift.abs(a), y = Swift.abs(b)
        var maxV = 0.0
        if x > maxV { maxV = x }
        if y > maxV { maxV = y }
        if maxV == 0 { return 0 }
        var sum = 0.0
        var compensation = 0.0
        // the same two loop iterations, unrolled (argument order matters)
        var n = x / maxV
        var summand = n * n - compensation
        var preliminary = sum + summand
        compensation = (preliminary - sum) - summand
        sum = preliminary
        n = y / maxV
        summand = n * n - compensation
        preliminary = sum + summand
        compensation = (preliminary - sum) - summand
        sum = preliminary
        return sum.squareRoot() * maxV
    }

    /// `Number.prototype.toFixed(digits)` for non-negative finite numbers below 1e21, parsed back to a Double.
    /// Exact: the decimal is chosen from the exact binary value, ties go to the larger candidate (as the spec says).
    public static func toFixed(_ x: Double, _ digits: Int) -> Double {
        precondition(x >= 0 && x < 1e15 && digits >= 0 && digits <= 6)
        var p = 1.0
        for _ in 0..<digits { p *= 10 }
        let s = x * p
        let err = (-s).addingProduct(x, p) // x*p - s, exactly
        var n = s.rounded(.down)
        var frac = (s - n) + err
        if frac < 0 { n -= 1; frac += 1 }
        if frac >= 0.5 { n += 1 }
        let digitsStr = String(Int64(n))
        let padded = String(repeating: "0", count: max(0, digits + 1 - digitsStr.count)) + digitsStr
        let cut = padded.index(padded.endIndex, offsetBy: -digits)
        let text: String = digits == 0 ? padded : String(padded[..<cut]) + "." + String(padded[cut...])
        return Double(text) ?? 0
    }

    /// `a % b` for integers (sign follows the dividend, like JavaScript and Swift).
    @inlinable
    public static func mod(_ a: Int, _ b: Int) -> Int { a % b }
}

@inlinable
func pad2(_ n: Int) -> String { n < 10 && n >= 0 ? "0\(n)" : String(n) }
