package com.lcu.facecamera

import android.content.Context
import android.graphics.Rect
import android.net.Uri
import android.util.Log
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.*
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.abs

class FaceCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val previewView = PreviewView(context)
  private var cameraProvider: ProcessCameraProvider? = null
  private var imageCapture: ImageCapture? = null
  private var cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()

  private val onFaceStatusChanged by EventDispatcher()
  private val onPictureCaptured by EventDispatcher()

  private var faceDetector: FaceDetector? = null

  override val shouldUseAndroidLayout: Boolean = true

  var isActive: Boolean = true
    set(value) {
      if (field != value) {
        field = value
        if (value) {
          startCamera()
        } else {
          stopCamera()
        }
      }
    }

  var facing: String = "front"
    set(value) {
      if (field != value) {
        field = value
        startCamera()
      }
    }

  init {
    previewView.layoutParams = LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    )
    // COMPATIBLE mode uses TextureView, preventing black-screen / punch-hole composition issues in React Native
    previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    previewView.scaleType = PreviewView.ScaleType.FILL_CENTER
    addView(previewView)

    initFaceDetector()
  }

  private fun initFaceDetector() {
    val options = FaceDetectorOptions.Builder()
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
      .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
      .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
      .setMinFaceSize(0.15f)
      .build()

    faceDetector = FaceDetection.getClient(options)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    measureChild(previewView, widthMeasureSpec, heightMeasureSpec)
    setMeasuredDimension(
      ViewGroup.resolveSize(previewView.measuredWidth, widthMeasureSpec),
      ViewGroup.resolveSize(previewView.measuredHeight, heightMeasureSpec)
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    val width = right - left
    val height = bottom - top
    previewView.layout(0, 0, width, height)
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    previewView.layout(0, 0, w, h)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    post { startCamera() }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    stopCamera()
    if (!cameraExecutor.isShutdown) {
      cameraExecutor.shutdown()
    }
  }

  private fun startCamera() {
    if (!isActive) return
    val lifecycleOwner = (appContext.currentActivity as? LifecycleOwner) ?: (context as? LifecycleOwner) ?: return
    val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

    cameraProviderFuture.addListener({
      try {
        cameraProvider = cameraProviderFuture.get()
        bindCameraUseCases(lifecycleOwner)
      } catch (e: Exception) {
        Log.e("FaceCameraView", "Failed to start camera", e)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  @OptIn(ExperimentalGetImage::class)
  private fun bindCameraUseCases(lifecycleOwner: LifecycleOwner) {
    val provider = cameraProvider ?: return
    provider.unbindAll()

    val cameraSelector = if (facing == "back") {
      CameraSelector.DEFAULT_BACK_CAMERA
    } else {
      CameraSelector.DEFAULT_FRONT_CAMERA
    }

    val preview = Preview.Builder().build().also {
      it.setSurfaceProvider(previewView.surfaceProvider)
    }

    val imageAnalysis = ImageAnalysis.Builder()
      .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
      .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
      .build()

    if (faceDetector == null) {
      initFaceDetector()
    }

    if (cameraExecutor.isShutdown) {
      cameraExecutor = Executors.newSingleThreadExecutor()
    }

    imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
      val mediaImage = imageProxy.image
      val detector = faceDetector
      if (mediaImage != null && detector != null) {
        val rotationDegrees = imageProxy.imageInfo.rotationDegrees
        val image = InputImage.fromMediaImage(mediaImage, rotationDegrees)

        detector.process(image)
          .addOnSuccessListener { faces ->
            analyzeFaces(faces, image.width, image.height)
          }
          .addOnFailureListener { e ->
            Log.w("FaceCameraView", "Face detection failed", e)
          }
          .addOnCompleteListener {
            imageProxy.close()
          }
      } else {
        imageProxy.close()
      }
    }

    imageCapture = ImageCapture.Builder()
      .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
      .build()

    try {
      provider.bindToLifecycle(lifecycleOwner, cameraSelector, preview, imageAnalysis, imageCapture)
    } catch (e: Exception) {
      Log.e("FaceCameraView", "Use case binding failed", e)
    }
  }

  private fun analyzeFaces(faces: List<Face>, frameWidth: Int, frameHeight: Int) {
    if (faces.isEmpty()) {
      onFaceStatusChanged(mapOf(
        "status" to "NO_FACE",
        "reason" to "Position your face inside the oval guide",
        "faceCount" to 0,
        "angles" to mapOf("pitch" to 0, "yaw" to 0, "roll" to 0),
        "areaRatio" to 0.0
      ))
      return
    }

    if (faces.size > 1) {
      onFaceStatusChanged(mapOf(
        "status" to "MULTIPLE_FACES",
        "reason" to "Multiple faces detected. Ensure only one person is in frame.",
        "faceCount" to faces.size,
        "angles" to mapOf("pitch" to 0, "yaw" to 0, "roll" to 0),
        "areaRatio" to 0.0
      ))
      return
    }

    val face = faces[0]
    val pitch = Math.round(face.headEulerAngleX)
    val yaw = Math.round(face.headEulerAngleY)
    val roll = Math.round(face.headEulerAngleZ)

    val leftEye = face.leftEyeOpenProbability ?: 1.0f
    val rightEye = face.rightEyeOpenProbability ?: 1.0f

    val frameArea = (frameWidth * frameHeight).toFloat()
    val faceArea = (face.boundingBox.width() * face.boundingBox.height()).toFloat()
    val areaRatio = if (frameArea > 0) faceArea / frameArea else 0.25f

    val boundingBox = mapOf(
      "x" to face.boundingBox.left.toFloat() / frameWidth,
      "y" to face.boundingBox.top.toFloat() / frameHeight,
      "width" to face.boundingBox.width().toFloat() / frameWidth,
      "height" to face.boundingBox.height().toFloat() / frameHeight
    )

    val angles = mapOf("pitch" to pitch, "yaw" to yaw, "roll" to roll)
    val eyesOpen = mapOf("left" to leftEye.toDouble(), "right" to rightEye.toDouble())

    // Validation Rules
    var status = "ALIGNED"
    var reason = "Face properly aligned"

    if (abs(roll) > 10) {
      status = "INVALID_ANGLES"
      reason = "Keep head level and upright"
    } else if (abs(yaw) > 15) {
      status = "INVALID_ANGLES"
      reason = if (yaw > 0) "Turn slightly to your right" else "Turn slightly to your left"
    } else if (abs(pitch) > 15) {
      status = "INVALID_ANGLES"
      reason = if (pitch > 0) "Tilt head slightly down" else "Tilt head slightly up"
    } else if (areaRatio < 0.12f) {
      status = "TOO_FAR"
      reason = "Move closer to the camera"
    } else if (areaRatio > 0.85f) {
      status = "TOO_CLOSE"
      reason = "Move slightly back from camera"
    }

    onFaceStatusChanged(mapOf(
      "status" to status,
      "reason" to reason,
      "faceCount" to 1,
      "angles" to angles,
      "eyesOpen" to eyesOpen,
      "areaRatio" to areaRatio.toDouble(),
      "boundingBox" to boundingBox
    ))
  }

  fun takePicture(promise: Promise) {
    val capture = imageCapture
    if (capture == null) {
      promise.reject("CAPTURE_ERROR", "Camera is not ready for image capture", null)
      return
    }

    val photoFile = File(context.cacheDir, "live_face_${System.currentTimeMillis()}.jpg")
    val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()

    capture.takePicture(
      outputOptions,
      ContextCompat.getMainExecutor(context),
      object : ImageCapture.OnImageSavedCallback {
        override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
          val uri = Uri.fromFile(photoFile).toString()
          val boundsOptions = android.graphics.BitmapFactory.Options().apply {
            inJustDecodeBounds = true
          }
          android.graphics.BitmapFactory.decodeFile(photoFile.absolutePath, boundsOptions)
          val result = mapOf(
            "uri" to uri,
            "width" to boundsOptions.outWidth,
            "height" to boundsOptions.outHeight
          )
          onPictureCaptured(result)
          promise.resolve(result)
        }

        override fun onError(exception: ImageCaptureException) {
          promise.reject("CAPTURE_ERROR", exception.message ?: "Failed to capture image", exception)
        }
      }
    )
  }

  private fun stopCamera() {
    try {
      cameraProvider?.unbindAll()
    } catch (e: Exception) {
      Log.w("FaceCameraView", "Error unbinding camera", e)
    }
  }
}
