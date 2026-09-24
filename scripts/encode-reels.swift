#!/usr/bin/env swift
/**
 * Feed reels: assets-src/videos/reelN.mp4 -> public/video/reelN.<hash8>.mp4
 *                                         + assets-src/images/reelN.jpg (poster, then `npm run images`)
 *                                         + content/videos.generated.ts (id -> URL)
 *
 *   swift scripts/encode-reels.swift
 *
 * macOS only (AVFoundation, no ffmpeg needed). Run it by hand after changing a
 * master; outputs are committed, masters are gitignored (~177 MB).
 *
 * Output: 720x1280, 30 fps, H.264 High ~2 Mbps + AAC 128 kbps stereo, moov atom
 * first (fast start), no metadata. File names embed a content hash so
 * public/video/ can be cached as immutable (deploy/headers.mjs).
 */
import AVFoundation
import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let srcDir = root.appendingPathComponent("assets-src/videos")
let outDir = root.appendingPathComponent("public/video")
let posterDir = root.appendingPathComponent("assets-src/images")
let manifest = root.appendingPathComponent("content/videos.generated.ts")

let size = CGSize(width: 720, height: 1280)
let fps: Int32 = 30
let videoBitrate = 2_000_000
let audioBitrate = 128_000
/** Poster frame time in seconds (skips the black/fade-in first frames). */
let posterAt = 1.0

func fail(_ message: String) -> Never {
  FileHandle.standardError.write("encode-reels: \(message)\n".data(using: .utf8)!)
  exit(1)
}

func encode(_ src: URL, to dst: URL) async throws {
  let asset = AVURLAsset(url: src)
  guard let vTrack = try await asset.loadTracks(withMediaType: .video).first else { fail("\(src.lastPathComponent) has no video track") }
  let aTrack = try await asset.loadTracks(withMediaType: .audio).first
  let (natural, transform) = try await vTrack.load(.naturalSize, .preferredTransform)
  let oriented = natural.applying(transform)
  let srcSize = CGSize(width: abs(oriented.width), height: abs(oriented.height))

  // Scale-to-fill (sources are already 9:16, so this is a plain downscale).
  let scale = max(size.width / srcSize.width, size.height / srcSize.height)
  let fitted = CGSize(width: srcSize.width * scale, height: srcSize.height * scale)
  let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: vTrack)
  layer.setTransform(
    transform
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
      .concatenating(CGAffineTransform(translationX: (size.width - fitted.width) / 2, y: (size.height - fitted.height) / 2)),
    at: .zero)
  let instruction = AVMutableVideoCompositionInstruction()
  instruction.timeRange = CMTimeRange(start: .zero, duration: try await asset.load(.duration))
  instruction.layerInstructions = [layer]
  let composition = AVMutableVideoComposition()
  composition.renderSize = size
  composition.frameDuration = CMTime(value: 1, timescale: fps)
  composition.instructions = [instruction]

  let reader = try AVAssetReader(asset: asset)
  let vOut = AVAssetReaderVideoCompositionOutput(videoTracks: [vTrack], videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  vOut.videoComposition = composition
  reader.add(vOut)
  var aOut: AVAssetReaderTrackOutput?
  if let aTrack {
    let out = AVAssetReaderTrackOutput(track: aTrack, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM])
    reader.add(out)
    aOut = out
  }

  try? FileManager.default.removeItem(at: dst)
  let writer = try AVAssetWriter(outputURL: dst, fileType: .mp4)
  writer.shouldOptimizeForNetworkUse = true
  writer.metadata = []
  let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: size.width,
    AVVideoHeightKey: size.height,
    AVVideoCompressionPropertiesKey: [
      AVVideoAverageBitRateKey: videoBitrate,
      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      AVVideoMaxKeyFrameIntervalKey: fps * 2,
      AVVideoExpectedSourceFrameRateKey: fps,
    ],
  ])
  vIn.expectsMediaDataInRealTime = false
  writer.add(vIn)
  var aIn: AVAssetWriterInput?
  if aOut != nil {
    let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVNumberOfChannelsKey: 2,
      AVSampleRateKey: 44_100,
      AVEncoderBitRateKey: audioBitrate,
    ])
    input.expectsMediaDataInRealTime = false
    writer.add(input)
    aIn = input
  }

  guard reader.startReading() else { fail("cannot read \(src.lastPathComponent): \(String(describing: reader.error))") }
  guard writer.startWriting() else { fail("cannot write \(dst.lastPathComponent): \(String(describing: writer.error))") }
  writer.startSession(atSourceTime: .zero)

  func pump(_ input: AVAssetWriterInput, _ output: AVAssetReaderOutput, _ label: String) async {
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
      input.requestMediaDataWhenReady(on: DispatchQueue(label: label)) {
        while input.isReadyForMoreMediaData {
          guard let sample = output.copyNextSampleBuffer() else {
            // nil means end of track OR a decode failure; the writer cannot tell the two apart
            // and would happily finish a truncated file, so check the reader before closing.
            if reader.status == .failed { fail("\(src.lastPathComponent): \(String(describing: reader.error))") }
            input.markAsFinished()
            done.resume()
            return
          }
          input.append(sample)
        }
      }
    }
  }
  async let video: Void = pump(vIn, vOut, "video")
  if let aIn, let aOut { await pump(aIn, aOut, "audio") }
  await video

  await writer.finishWriting()
  if writer.status != .completed { fail("\(dst.lastPathComponent): \(String(describing: writer.error))") }
}

func writePoster(_ src: URL, to dst: URL) async throws {
  let generator = AVAssetImageGenerator(asset: AVURLAsset(url: src))
  generator.appliesPreferredTrackTransform = true
  generator.maximumSize = size
  generator.requestedTimeToleranceBefore = .zero
  generator.requestedTimeToleranceAfter = .zero
  let (image, _) = try await generator.image(at: CMTime(seconds: posterAt, preferredTimescale: 600))
  guard let out = CGImageDestinationCreateWithURL(dst as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { fail("cannot create \(dst.path)") }
  CGImageDestinationAddImage(out, image, [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
  guard CGImageDestinationFinalize(out) else { fail("cannot write \(dst.path)") }
}

let masters = (try? FileManager.default.contentsOfDirectory(at: srcDir, includingPropertiesForKeys: nil))?
  .filter { $0.pathExtension.lowercased() == "mp4" }
  .sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending } ?? []
if masters.isEmpty { fail("no .mp4 masters in \(srcDir.path) (download them from the Drive folder in README.md)") }

try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
var entries: [(id: String, url: String)] = []
for master in masters {
  let id = master.deletingPathExtension().lastPathComponent
  let tmp = outDir.appendingPathComponent("\(id).tmp.mp4")
  try await encode(master, to: tmp)
  let hash = SHA256.hash(data: try Data(contentsOf: tmp)).map { String(format: "%02x", $0) }.joined().prefix(8)
  let name = "\(id).\(hash).mp4"
  // Drop older encodes of this reel, then move the new one into place.
  for old in try FileManager.default.contentsOfDirectory(atPath: outDir.path) where old.hasPrefix("\(id).") && old.hasSuffix(".mp4") && old != name && old != tmp.lastPathComponent {
    try FileManager.default.removeItem(at: outDir.appendingPathComponent(old))
  }
  let dst = outDir.appendingPathComponent(name)
  try? FileManager.default.removeItem(at: dst)
  try FileManager.default.moveItem(at: tmp, to: dst)
  try await writePoster(master, to: posterDir.appendingPathComponent("\(id).jpg"))
  let bytes = (try FileManager.default.attributesOfItem(atPath: dst.path)[.size] as? Int) ?? 0
  print("\(name)  \(String(format: "%.1f", Double(bytes) / 1_048_576)) MB")
  entries.append((id, "/video/\(name)"))
}

let body = entries.map { "  \"\($0.id)\": \"\($0.url)\"," }.joined(separator: "\n")
try """
  // GENERATED by `swift scripts/encode-reels.swift`. Do not edit by hand.
  export const reelVideos = {
  \(body)
  } as const;

  export type ReelId = keyof typeof reelVideos;

  """.write(to: manifest, atomically: true, encoding: .utf8)
print("wrote \(manifest.lastPathComponent) (\(entries.count) reels); now run `npm run images` for the posters")
