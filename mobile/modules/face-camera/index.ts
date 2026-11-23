import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { requireNativeViewManager } from "expo-modules-core";
import { ViewProps } from "react-native";

export type FaceAlignmentStatus =
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "TOO_FAR"
  | "TOO_CLOSE"
  | "INVALID_ANGLES"
  | "ALIGNED";

export interface LiveFaceStatusEvent {
  status: FaceAlignmentStatus;
  reason?: string;
  faceCount: number;
  angles: { pitch: number; yaw: number; roll: number };
  eyesOpen?: { left: number; right: number };
  areaRatio: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface PictureCapturedEvent {
  uri: string;
  width: number;
  height: number;
}

export interface FaceCameraViewProps extends ViewProps {
  isActive?: boolean;
  facing?: "front" | "back";
  onFaceStatusChanged?: (event: { nativeEvent: LiveFaceStatusEvent }) => void;
  onPictureCaptured?: (event: { nativeEvent: PictureCapturedEvent }) => void;
}

export interface FaceCameraRef {
  takePicture: () => Promise<PictureCapturedEvent>;
}

const NativeView = requireNativeViewManager("FaceCamera");

export const FaceCameraView = forwardRef<FaceCameraRef, FaceCameraViewProps>((props, ref) => {
  const nativeRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    takePicture: async () => {
      if (nativeRef.current?.takePicture) {
        return await nativeRef.current.takePicture();
      }
      throw new Error("Native camera ref not ready");
    },
  }));

  return React.createElement(NativeView, { ref: nativeRef, ...props });
});

export default FaceCameraView;
