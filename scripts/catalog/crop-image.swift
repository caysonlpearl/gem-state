import AppKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum CropError: Error, CustomStringConvertible {
  case usage
  case unreadableImage(String)
  case invalidCrop
  case outputFailed(String)

  var description: String {
    switch self {
    case .usage:
      return "Usage: crop-image.swift <input> <output> <x> <y> <width> <height>"
    case .unreadableImage(let path):
      return "Could not read image at \(path)"
    case .invalidCrop:
      return "Crop rectangle is outside the source image"
    case .outputFailed(let path):
      return "Could not write cropped image to \(path)"
    }
  }
}

do {
  guard CommandLine.arguments.count == 7,
        let x = Int(CommandLine.arguments[3]),
        let y = Int(CommandLine.arguments[4]),
        let width = Int(CommandLine.arguments[5]),
        let height = Int(CommandLine.arguments[6])
  else { throw CropError.usage }

  let input = CommandLine.arguments[1]
  let output = CommandLine.arguments[2]
  guard let image = NSImage(contentsOfFile: input),
        let source = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { throw CropError.unreadableImage(input) }

  let rect = CGRect(x: x, y: y, width: width, height: height)
  guard let cropped = source.cropping(to: rect) else { throw CropError.invalidCrop }

  let outputURL = URL(fileURLWithPath: output)
  try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
  )
  guard let destination = CGImageDestinationCreateWithURL(
    outputURL as CFURL,
    UTType.jpeg.identifier as CFString,
    1,
    nil
  ) else { throw CropError.outputFailed(output) }
  CGImageDestinationAddImage(
    destination,
    cropped,
    [kCGImageDestinationLossyCompressionQuality: 0.96] as CFDictionary
  )
  guard CGImageDestinationFinalize(destination) else {
    throw CropError.outputFailed(output)
  }
} catch {
  fputs("\(error)\n", stderr)
  exit(1)
}
