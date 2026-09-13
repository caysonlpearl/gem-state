import AppKit
import CoreImage
import Foundation
import Vision

enum CutoutError: Error, CustomStringConvertible {
  case usage
  case unreadableImage(String)
  case missingForeground
  case outputFailed(String)

  var description: String {
    switch self {
    case .usage:
      return "Usage: remove-background.swift <input-image> <output-png> [all|center]"
    case .unreadableImage(let path):
      return "Could not read image at \(path)"
    case .missingForeground:
      return "Vision did not find a foreground subject"
    case .outputFailed(let path):
      return "Could not write transparent PNG to \(path)"
    }
  }
}

func cgImage(at path: String) throws -> CGImage {
  guard
    let image = NSImage(contentsOfFile: path),
    let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else {
    throw CutoutError.unreadableImage(path)
  }
  return cgImage
}

func centerInstance(in observation: VNInstanceMaskObservation) -> IndexSet? {
  let buffer = observation.instanceMask
  CVPixelBufferLockBaseAddress(buffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }

  guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
  let width = CVPixelBufferGetWidth(buffer)
  let height = CVPixelBufferGetHeight(buffer)
  let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
  let pixels = base.assumingMemoryBound(to: UInt8.self)

  let centerX = width / 2
  let centerY = height / 2
  let maxRadius = max(width, height) / 3
  for radius in 0...maxRadius {
    let minX = max(0, centerX - radius)
    let maxX = min(width - 1, centerX + radius)
    let minY = max(0, centerY - radius)
    let maxY = min(height - 1, centerY + radius)
    for y in minY...maxY {
      for x in minX...maxX where x == minX || x == maxX || y == minY || y == maxY {
        let value = Int(pixels[y * rowBytes + x])
        if value > 0 { return IndexSet(integer: value) }
      }
    }
  }
  return nil
}

func removeBackground(inputPath: String, outputPath: String, selection: String) throws {
  let source = try cgImage(at: inputPath)
  let request = VNGenerateForegroundInstanceMaskRequest()
  let handler = VNImageRequestHandler(cgImage: source, options: [:])
  try handler.perform([request])

  guard
    let observation = request.results?.first,
    !observation.allInstances.isEmpty
  else {
    throw CutoutError.missingForeground
  }

  let instances = selection == "center"
    ? (centerInstance(in: observation) ?? observation.allInstances)
    : observation.allInstances

  let maskBuffer = try observation.generateScaledMaskForImage(
    forInstances: instances,
    from: handler
  )

  let sourceImage = CIImage(cgImage: source)
  let maskImage = CIImage(cvPixelBuffer: maskBuffer)
  let transparent = CIImage(color: .clear).cropped(to: sourceImage.extent)
  let cutout = sourceImage.applyingFilter(
    "CIBlendWithMask",
    parameters: [
      kCIInputBackgroundImageKey: transparent,
      kCIInputMaskImageKey: maskImage,
    ]
  )

  let outputURL = URL(fileURLWithPath: outputPath)
  try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
  )

  let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
  let context = CIContext(options: [.useSoftwareRenderer: false])
  do {
    try context.writePNGRepresentation(
      of: cutout,
      to: outputURL,
      format: .RGBA8,
      colorSpace: colorSpace
    )
  } catch {
    throw CutoutError.outputFailed(outputPath)
  }
}

do {
  guard CommandLine.arguments.count == 3 || CommandLine.arguments.count == 4 else {
    throw CutoutError.usage
  }
  try removeBackground(
    inputPath: CommandLine.arguments[1],
    outputPath: CommandLine.arguments[2],
    selection: CommandLine.arguments.count == 4 ? CommandLine.arguments[3] : "all"
  )
} catch {
  fputs("\(error)\n", stderr)
  exit(1)
}
