import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

export async function createFaceLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
    );
    return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true, // gives head pose directly
    });
}

// head pose straight from the task's facialTransformationMatrixes
// (4x4 rotation matrix, row-major), standard euler extraction:
//   roll  = head tilt sideways, pitch = nod up/down, yaw = turn left/right
export function headPose(face) {
    const m = face.facialTransformationMatrixes?.[0]?.data;
    if (!m) return null;
    const [m00, m01, m02, , m10, m11, m12, , m20, m21, m22] = m;
    const sy = Math.sqrt(m00 * m00 + m01 * m01);
    return {
        pitch: (Math.atan2(m21, m22) * 180) / Math.PI,
        roll: (Math.atan2(m10, m00) * 180) / Math.PI,
        yaw: (Math.atan2(-m20, sy) * 180) / Math.PI,
    };
}
