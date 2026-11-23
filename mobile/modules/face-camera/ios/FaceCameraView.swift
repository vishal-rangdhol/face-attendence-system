import ExpoModulesCore
import UIKit
import AVFoundation
import Vision

public class FaceCameraView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate {
  private let session = AVCaptureSession()
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private let photoOutput = AVCapturePhotoOutput()
  private let videoDataOutput = AVCaptureVideoDataOutput()
  private let sessionQueue = DispatchQueue(label: "com.lcu.facecamera.sessionQueue")
  private let analysisQueue = DispatchQueue(label: "com.lcu.facecamera.analysisQueue")

  private var pendingCapturePromise: Promise?

  let onFaceStatusChanged = EventDispatcher()
  let onPictureCaptured = EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    setupCamera()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  public override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    if newWindow == nil {
      sessionQueue.async { [weak self] in
        self?.session.stopRunning()
      }
    } else {
      sessionQueue.async { [weak self] in
        if self?.session.isRunning == false {
          self?.session.startRunning()
        }
      }
    }
  }

  private func setupCamera() {
    sessionQueue.async { [weak self] in
      guard let self = self else { return }
      self.session.beginConfiguration()
      self.session.sessionPreset = .high

      guard let frontCamera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
            let input = try? AVCaptureDeviceInput(device: frontCamera) else {
        self.session.commitConfiguration()
        return
      }

      if self.session.canAddInput(input) {
        self.session.addInput(input)
      }

      if self.session.canAddOutput(self.photoOutput) {
        self.session.addOutput(self.photoOutput)
      }

      self.videoDataOutput.alwaysDiscardsLateVideoFrames = true
      self.videoDataOutput.setSampleBufferDelegate(self, queue: self.analysisQueue)
      if self.session.canAddOutput(self.videoDataOutput) {
        self.session.addOutput(self.videoDataOutput)
      }

      self.session.commitConfiguration()

      DispatchQueue.main.async {
        let preview = AVCaptureVideoPreviewLayer(session: self.session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = self.bounds
        self.layer.addSublayer(preview)
        self.previewLayer = preview
      }

      self.session.startRunning()
    }
  }

  // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate (Live In-Memory Analysis)

  public func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

    let request = VNDetectFaceLandmarksRequest { [weak self] (req, error) in
      guard let self = self else { return }
      if let error = error {
        return
      }
      guard let results = req.results as? [VNFaceObservation] else {
        self.emitNoFace()
        return
      }
      self.analyzeFaceObservations(results)
    }

    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .leftMirrored, options: [:])
    try? handler.perform([request])
  }

  private func emitNoFace() {
    DispatchQueue.main.async { [weak self] in
      self?.onFaceStatusChanged([
        "status": "NO_FACE",
        "reason": "Position your face inside the oval guide",
        "faceCount": 0,
        "angles": ["pitch": 0, "yaw": 0, "roll": 0],
        "areaRatio": 0.0
      ])
    }
  }

  private func analyzeFaceObservations(_ faces: [VNFaceObservation]) {
    if faces.isEmpty {
      emitNoFace()
      return
    }

    if faces.count > 1 {
      DispatchQueue.main.async { [weak self] in
        self?.onFaceStatusChanged([
          "status": "MULTIPLE_FACES",
          "reason": "Multiple faces detected. Ensure only one person is in frame.",
          "faceCount": faces.count,
          "angles": ["pitch": 0, "yaw": 0, "roll": 0],
          "areaRatio": 0.0
        ])
      }
      return
    }

    let face = faces[0]

    // Euler Angles (convert radians to degrees)
    let rollRad = face.roll?.doubleValue ?? 0.0
    let yawRad = face.yaw?.doubleValue ?? 0.0
    let pitchRad = face.pitch?.doubleValue ?? 0.0

    let roll = Int(round(rollRad * 180.0 / .pi))
    let yaw = Int(round(yawRad * 180.0 / .pi))
    let pitch = Int(round(pitchRad * 180.0 / .pi))

    // Bounding Box (Apple Vision coordinates have bottom-left origin; convert to top-left)
    let bbox = face.boundingBox
    let x = Double(bbox.origin.x)
    let y = Double(1.0 - bbox.origin.y - bbox.size.height)
    let width = Double(bbox.size.width)
    let height = Double(bbox.size.height)
    let areaRatio = width * height

    // Eye Openness Estimation using landmark geometry (Eye Aspect Ratio)
    var leftEyeOpen = 0.9
    var rightEyeOpen = 0.9

    if let leftLandmarks = face.landmarks?.leftEye, leftLandmarks.pointCount >= 6 {
      let pts = leftLandmarks.normalizedPoints
      let eyeHeight = abs(pts[1].y - pts[5].y) + abs(pts[2].y - pts[4].y)
      let eyeWidth = abs(pts[0].x - pts[3].x) * 2.0
      let ear = eyeWidth > 0 ? eyeHeight / eyeWidth : 0.25
      leftEyeOpen = ear >= 0.20 ? 0.85 : 0.15
    }

    if let rightLandmarks = face.landmarks?.rightEye, rightLandmarks.pointCount >= 6 {
      let pts = rightLandmarks.normalizedPoints
      let eyeHeight = abs(pts[1].y - pts[5].y) + abs(pts[2].y - pts[4].y)
      let eyeWidth = abs(pts[0].x - pts[3].x) * 2.0
      let ear = eyeWidth > 0 ? eyeHeight / eyeWidth : 0.25
      rightEyeOpen = ear >= 0.20 ? 0.85 : 0.15
    }

    // Validation Rules
    var status = "ALIGNED"
    var reason = "Face properly aligned"

    if abs(roll) > 10 {
      status = "INVALID_ANGLES"
      reason = "Keep head level and upright"
    } else if abs(yaw) > 15 {
      status = "INVALID_ANGLES"
      reason = yaw > 0 ? "Turn slightly to your right" : "Turn slightly to your left"
    } else if abs(pitch) > 15 {
      status = "INVALID_ANGLES"
      reason = pitch > 0 ? "Tilt head slightly down" : "Tilt head slightly up"
    } else if areaRatio < 0.12 {
      status = "TOO_FAR"
      reason = "Move closer to the camera"
    } else if areaRatio > 0.85 {
      status = "TOO_CLOSE"
      reason = "Move slightly back from camera"
    }

    DispatchQueue.main.async { [weak self] in
      self?.onFaceStatusChanged([
        "status": status,
        "reason": reason,
        "faceCount": 1,
        "angles": ["pitch": pitch, "yaw": yaw, "roll": roll],
        "eyesOpen": ["left": leftEyeOpen, "right": rightEyeOpen],
        "areaRatio": areaRatio,
        "boundingBox": ["x": x, "y": y, "width": width, "height": height]
      ])
    }
  }

  // MARK: - Single Photo Capture

  func takePicture(promise: Promise) {
    sessionQueue.async { [weak self] in
      guard let self = self else { return }
      self.pendingCapturePromise = promise
      let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
      self.photoOutput.capturePhoto(with: settings, delegate: self)
    }
  }

  public func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
    guard let promise = pendingCapturePromise else { return }
    pendingCapturePromise = nil

    if let error = error {
      promise.reject("CAPTURE_ERROR", error.localizedDescription)
      return
    }

    guard let photoData = photo.fileDataRepresentation() else {
      promise.reject("CAPTURE_ERROR", "Failed to retrieve photo data")
      return
    }

    let fileName = "live_face_\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
    let filePath = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(fileName)

    do {
      try photoData.write(to: filePath)
      let uri = filePath.absoluteString
      let result: [String: Any] = [
        "uri": uri,
        "width": Int(self.bounds.width),
        "height": Int(self.bounds.height)
      ]
      DispatchQueue.main.async { [weak self] in
        self?.onPictureCaptured(result)
      }
      promise.resolve(result)
    } catch {
      promise.reject("CAPTURE_ERROR", "Failed to write photo to disk: \(error.localizedDescription)")
    }
  }
}
