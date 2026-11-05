#if canImport(CoreGraphics)
import CoreGraphics
import Foundation

extension PixelBuffer {
    /// the buffer as a CGImage at 1 image pixel per art pixel; scale it with nearest-neighbour
    /// (SwiftUI `.interpolation(.none)`) to whole points.
    public func cgImage() -> CGImage? {
        // straight (non-premultiplied) RGBA, like canvas getImageData
        guard width > 0, height > 0,
              let provider = CGDataProvider(data: Data(data) as CFData),
              let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                       space: space, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    }
}
#endif
