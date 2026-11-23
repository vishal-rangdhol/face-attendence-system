import ExpoModulesCore

public class FaceCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FaceCamera")

    View(FaceCameraView.self) {
      Events("onFaceStatusChanged", "onPictureCaptured")

      AsyncFunction("takePicture") { (view: FaceCameraView, promise: Promise) in
        view.takePicture(promise: promise)
      }
    }
  }
}
