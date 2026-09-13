import AppKit
import CoreImage
import Foundation

enum CompositeError: Error, CustomStringConvertible {
  case usage
  case unreadableImage(String)
  case outputFailed(String)

  var description: String {
    switch self {
    case .usage:
      return "Usage: composite-cutout.swift <input-png> <output-jpg>"
    case .unreadableImage(let path):
      return "Could not read image at \(path)"
    case .outputFailed(let path):
      return "Could not write catalog image to \(path)"
    }
  }
}

do {
  guard CommandLine.arguments.count == 3 else { throw CompositeError.usage }
  let input = CommandLine.arguments[1]
  let output = CommandLine.arguments[2]

  guard let image = NSImage(contentsOfFile: input),
        let sourceCG = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { throw CompositeError.unreadableImage(input) }

  let canvasSize: CGFloat = 1600
  let maximumSubjectSize: CGFloat = 1240
  let source = CIImage(cgImage: sourceCG)
  let scale = min(maximumSubjectSize / source.extent.width,
                  maximumSubjectSize / source.extent.height)
  let scaled = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
  let targetX = (canvasSize - scaled.extent.width) / 2 - scaled.extent.minX
  let targetY = (canvasSize - scaled.extent.height) / 2 - scaled.extent.minY + 24
  let positioned = scaled.transformed(
    by: CGAffineTransform(translationX: targetX, y: targetY)
  )

  let shadow = positioned
    .applyingFilter("CIDropShadow", parameters: [
      "inputRadius": 24.0,
      "inputOffset": CIVector(x: 0, y: -22),
      "inputColor": CIColor(red: 0, green: 0, blue: 0, alpha: 0.22),
    ])
    .cropped(to: CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))

  let background = CIImage(color: CIColor(red: 1, green: 1, blue: 1, alpha: 1))
    .cropped(to: CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))
  let result = positioned.composited(over: shadow).composited(over: background)

  let outputURL = URL(fileURLWithPath: output)
  try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
  )
  let context = CIContext(options: [.useSoftwareRenderer: false])
  try context.writeJPEGRepresentation(
    of: result,
    to: outputURL,
    colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
    options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.92]
  )
} catch {
  fputs("\(error)\n", stderr)
  exit(1)
}
