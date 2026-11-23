package com.lcu.facecamera

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FaceCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FaceCamera")

    View(FaceCameraView::class) {
      Events("onFaceStatusChanged", "onPictureCaptured")

      Prop("isActive") { view: FaceCameraView, active: Boolean? ->
        view.isActive = active ?: true
      }

      Prop("facing") { view: FaceCameraView, facing: String? ->
        view.facing = facing ?: "front"
      }

      AsyncFunction("takePicture") { view: FaceCameraView, promise: Promise ->
        view.takePicture(promise)
      }
    }
  }
}
