import AppKit
import CoreImage
import Foundation

enum PrepareError: Error, CustomStringConvertible {
  case usage
  case unreadableImage(String)
  case outputFailed(String)

  var description: String {
    switch self {
    case .usage:
      return "Usage: prepare-transparent-product.swift <input-png> <output-png>"
    case .unreadableImage(let path):
      return "Could not read image at \(path)"
    case .outputFailed(let path):
      return "Could not write transparent PNG to \(path)"
    }
  }
}

do {
  guard CommandLine.arguments.count == 3 else { throw PrepareError.usage }
  let inputPath = CommandLine.arguments[1]
  let outputPath = CommandLine.arguments[2]

  guard let image = NSImage(contentsOfFile: inputPath),
        let sourceCG = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { throw PrepareError.unreadableImage(inputPath) }

  let canvas: CGFloat = 1600
  let maxSubject: CGFloat = 1240
  let source = CIImage(cgImage: sourceCG)
  let scale = min(maxSubject / source.extent.width, maxSubject / source.extent.height)
  let scaled = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
  let x = (canvas - scaled.extent.width) / 2 - scaled.extent.minX
  let y = (canvas - scaled.extent.height) / 2 - scaled.extent.minY + 24
  let positioned = scaled.transformed(by: CGAffineTransform(translationX: x, y: y))
  let canvasRect = CGRect(x: 0, y: 0, width: canvas, height: canvas)

  let clearCanvas = CIImage(color: .clear).cropped(to: canvasRect)
  let alphaMask = positioned
    .applyingFilter("CIMaskToAlpha")
    .clampedToExtent()
    .applyingFilter("CIGaussianBlur", parameters: ["inputRadius": 12.0])
    .transformed(by: CGAffineTransform(translationX: 0, y: -14))
    .cropped(to: canvasRect)
  let shadowColor = CIImage(color: CIColor(red: 0, green: 0, blue: 0, alpha: 0.65))
    .cropped(to: canvasRect)
  let shadow = shadowColor.applyingFilter("CIBlendWithMask", parameters: [
    kCIInputBackgroundImageKey: clearCanvas,
    kCIInputMaskImageKey: alphaMask,
  ])

  // Add a small floor shadow so the cutout still reads as grounded on white cards.
  let shadowContext = CGContext(
    data: nil,
    width: Int(canvas),
    height: Int(canvas),
    bitsPerComponent: 8,
    bytesPerRow: Int(canvas) * 4,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  )!
  shadowContext.setFillColor(CGColor(gray: 0, alpha: 0.16))
  shadowContext.fillEllipse(in: CGRect(x: 460, y: 160, width: 680, height: 60))
  let floorShadow = CIImage(cgImage: shadowContext.makeImage()!)
    .applyingFilter("CIGaussianBlur", parameters: ["inputRadius": 18.0])
    .cropped(to: canvasRect)

  let result = positioned
    .composited(over: shadow)
    .composited(over: floorShadow)
    .composited(over: clearCanvas)
  let outputURL = URL(fileURLWithPath: outputPath)
  try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
  )
  let context = CIContext(options: [.useSoftwareRenderer: false])
  try context.writePNGRepresentation(
    of: result,
    to: outputURL,
    format: .RGBA8,
    colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!
  )
} catch {
  fputs("\(error)\n", stderr)
  exit(1)
}
