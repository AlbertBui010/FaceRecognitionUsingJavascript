const video = document.getElementById("video");
const isScreenSmall = window.matchMedia("(max-width: 700px)");
let predictedAges = [];
let registeredDescriptors = {};

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri("./models"),
  faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
  faceapi.nets.faceRecognitionNet.loadFromUri("./models"),
  faceapi.nets.faceExpressionNet.loadFromUri("./models"),
  faceapi.nets.ageGenderNet.loadFromUri("./models"),
]).then(startVideo);

function startVideo() {
  navigator.mediaDevices
    .getUserMedia({ video: {} })
    .then((stream) => (video.srcObject = stream))
    .catch((err) => console.error("Lỗi khi bật webcam:", err));
}

// Đăng ký khuôn mặt
async function registerFace(label) {
  const detections = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detections) {
    alert("❌ Không tìm thấy khuôn mặt, hãy thử lại!");
    return;
  }

  registeredDescriptors[label] = new faceapi.LabeledFaceDescriptors(label, [
    new Float32Array(detections.descriptor),
  ]);

  alert(`✅ Đã lưu khuôn mặt của ${label}`);
}

// 📌 Xác nhận khuôn mặt
async function verifyFace() {
  if (Object.keys(registeredDescriptors).length === 0) {
    alert("❌ Chưa có khuôn mặt nào được đăng ký!");
    return;
  }

  const detections = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detections) {
    alert("❌ Không tìm thấy khuôn mặt!");
    return;
  }

  const faceMatcher = new faceapi.FaceMatcher(
    Object.values(registeredDescriptors),
    0.6
  );

  const bestMatch = faceMatcher.findBestMatch(detections.descriptor);
  alert(`🔍 Kết quả: ${bestMatch.toString()}`);
}

function screenResize(isScreenSmall) {
  video.style.width = isScreenSmall.matches ? "320px" : "500px";
}
screenResize(isScreenSmall);
isScreenSmall.addListener(screenResize);

video.addEventListener("playing", () => {
  console.log("Webcam đã hoạt động!");

  const canvas = faceapi.createCanvasFromMedia(video);
  let container = document.querySelector(".container");
  container.append(canvas);

  const displaySize = { width: video.width, height: video.height };
  faceapi.matchDimensions(canvas, displaySize);

  setInterval(async () => {
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();

    if (!detections || detections.length === 0) {
      console.log("Không phát hiện khuôn mặt!");
      return;
    }

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

    faceapi.draw.drawDetections(canvas, resizedDetections);
    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

    resizedDetections.forEach((detection, i) => {
      const { age, gender, expressions, detection: faceBox } = detection;
      const interpolatedAge = interpolateAgePredictions(age);
      const emotion = Object.keys(expressions).reduce((a, b) =>
        expressions[a] > expressions[b] ? a : b
      );

      const box = faceBox.box;
      const drawBox = new faceapi.draw.DrawBox(box, {
        label: `👤 ${gender}, ${Math.round(
          interpolatedAge
        )} tuổi, 😃 ${emotion}`,
      });
      drawBox.draw(canvas);
    });
  }, 500);
});

function interpolateAgePredictions(age) {
  predictedAges = [age].concat(predictedAges).slice(0, 30);
  const avgPredictedAge =
    predictedAges.reduce((total, a) => total + a) / predictedAges.length;
  return avgPredictedAge;
}
