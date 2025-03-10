const video = document.getElementById("video"); // Lấy phần tử video từ HTML
const isScreenSmall = window.matchMedia("(max-width: 700px)"); // Kiểm tra kích thước màn hình

let predictedAges = new Array(30).fill(0); // Mảng lưu trữ các dự đoán tuổi
let currentAgeIndex = 0; // Chỉ số hiện tại trong mảng dự đoán tuổi
let registeredDescriptors = {}; // Đối tượng lưu trữ các descriptor khuôn mặt đã đăng ký
let lastUpdateTime = 0; // Thời gian cập nhật cuối cùng
const updateInterval = 1000; // Khoảng thời gian cập nhật (1 giây)

// Load các mô hình từ face-api.js
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri("./models"), // Tải mô hình phát hiện khuôn mặt nhanh
  faceapi.nets.faceLandmark68Net.loadFromUri("./models"), // Tải mô hình landmark khuôn mặt
  faceapi.nets.faceRecognitionNet.loadFromUri("./models"), // Tải mô hình nhận diện khuôn mặt
  faceapi.nets.faceExpressionNet.loadFromUri("./models"), // Tải mô hình biểu cảm khuôn mặt
  faceapi.nets.ageGenderNet.loadFromUri("./models"), // Tải mô hình dự đoán tuổi và giới tính
]).then(startVideo); // Sau khi tải xong, gọi hàm startVideo

// Bật webcam
function startVideo() {
  navigator.mediaDevices
    .getUserMedia({ video: {} }) // Yêu cầu quyền truy cập webcam
    .then((stream) => (video.srcObject = stream)) // Gán stream video cho phần tử video
    .catch((err) => {
      console.error("Lỗi khi bật webcam:", err); // In lỗi nếu không bật được webcam
      alert(
        "❌ Lỗi khi bật webcam. Vui lòng kiểm tra lại kết nối và quyền truy cập."
      ); // Hiển thị thông báo lỗi
    });
}

// Hiển thị pop-up với nội dung cho trước
function showPopup(content) {
  document.getElementById("popup-content").textContent = content; // Đặt nội dung pop-up
  document.getElementById("popup").style.display = "block"; // Hiển thị pop-up
}

// Ẩn pop-up
function hidePopup() {
  document.getElementById("popup").style.display = "none"; // Ẩn pop-up
}

// Gắn sự kiện click cho nút đóng pop-up
document.getElementById("close-popup").addEventListener("click", hidePopup);

// Hàm lưu dữ liệu descriptor khuôn mặt đã đăng ký vào localStorage
function saveData() {
  const data = Object.keys(registeredDescriptors).reduce((acc, label) => {
    acc[label] = {
      label: label,
      descriptors: registeredDescriptors[label].descriptors.map((descriptor) =>
        Array.from(descriptor)
      ), // Chuyển đổi descriptor thành mảng thường
    };
    return acc;
  }, {});
  localStorage.setItem("faceData", JSON.stringify(data)); // Lưu dữ liệu vào localStorage
}

// Hàm tải dữ liệu descriptor khuôn mặt đã đăng ký từ localStorage
function loadData() {
  const savedData = localStorage.getItem("faceData"); // Lấy dữ liệu từ localStorage
  if (savedData) {
    const data = JSON.parse(savedData); // Phân tích cú pháp dữ liệu JSON
    registeredDescriptors = Object.keys(data).reduce((acc, label) => {
      acc[label] = new faceapi.LabeledFaceDescriptors(
        label,
        data[label].descriptors.map(
          (descriptor) => new Float32Array(descriptor)
        ) // Tạo lại LabeledFaceDescriptors từ dữ liệu đã tải
      );
      return acc;
    }, {});
  }
}
loadData(); // Tải dữ liệu khi trang web được tải

// Đăng ký khuôn mặt
async function registerFace(label) {
  const detections = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()) // Phát hiện khuôn mặt đơn
    .withFaceLandmarks() // Lấy landmark khuôn mặt
    .withFaceDescriptor(); // Lấy descriptor khuôn mặt

  if (!detections) {
    showPopup(`❌ Không tìm thấy khuôn mặt, hãy thử lại!`); // Hiển thị thông báo nếu không tìm thấy khuôn mặt
    return;
  }

  registeredDescriptors[label] = new faceapi.LabeledFaceDescriptors(label, [
    detections.descriptor,
  ]); // Lưu descriptor khuôn mặt đã đăng ký

  saveData(); // Lưu dữ liệu

  const fullDetections = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()) // Phát hiện tất cả khuôn mặt
    .withFaceLandmarks() // Lấy landmark khuôn mặt
    .withFaceExpressions() // Lấy biểu cảm khuôn mặt
    .withAgeAndGender(); // Lấy tuổi và giới tính

  if (fullDetections && fullDetections.length > 0) {
    const { age, gender, expressions } = fullDetections[0]; // Lấy thông tin từ kết quả phát hiện
    const interpolatedAge = interpolateAgePredictions(age); // Làm mượt dự đoán tuổi
    const emotion = Object.keys(expressions).reduce((a, b) =>
      expressions[a] > expressions[b] ? a : b
    ); // Lấy biểu cảm nổi bật

    captureAndExport(label, interpolatedAge, gender, emotion); // Chụp ảnh và xuất file
  }
  showPopup(`✅ Đã lưu khuôn mặt của ${label}`); // Hiển thị thông báo đăng ký thành công
}

// Xác minh khuôn mặt
async function verifyFace() {
  if (Object.keys(registeredDescriptors).length === 0) {
    alert("❌ Chưa có khuôn mặt nào được đăng ký!"); // Hiển thị thông báo nếu chưa có khuôn mặt đăng ký
    return;
  }

  const detections = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()) // Phát hiện khuôn mặt đơn
    .withFaceLandmarks() // Lấy landmark khuôn mặt
    .withFaceDescriptor(); // Lấy descriptor khuôn mặt

  if (!detections) {
    showPopup(`❌ Không tìm thấy khuôn mặt!`); // Hiển thị thông báo nếu không tìm thấy khuôn mặt
    return;
  }

  console.log("Registered Descriptors:", registeredDescriptors); // In descriptor đã đăng ký vào console

  try {
    const faceMatcher = new faceapi.FaceMatcher(
      Object.values(registeredDescriptors),
      0.6
    ); // Tạo FaceMatcher

    const bestMatch = faceMatcher.findBestMatch(detections.descriptor); // Tìm khuôn mặt khớp nhất

    const fullDetections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()) // Phát hiện tất cả khuôn mặt
      .withFaceLandmarks() // Lấy landmark khuôn mặt
      .withFaceExpressions() // Lấy biểu cảm khuôn mặt
      .withAgeAndGender(); // Lấy tuổi và giới tính

    if (fullDetections && fullDetections.length > 0) {
      const { age, gender, expressions } = fullDetections[0]; // Lấy thông tin từ kết quả phát hiện
      const emotion = Object.keys(expressions).reduce((a, b) =>
        expressions[a] > expressions[b] ? a : b
      ); // Lấy biểu cảm nổi bật

      showPopup(
        ` Kết quả: ${bestMatch.toString()}, 
        Tuổi: ${Math.round(age)}, 
        Trạng thái: ${emotion}, 
        Giới tính: ${gender}`
      ); // Hiển thị thông tin xác minh
      console.log(
        `Kết quả: ${bestMatch.toString()}, Tuổi: ${Math.round(
          age
        )}, Trạng thái: ${emotion}`
      ); // In thông tin xác minh vào console
    } else {
      showPopup(
        ` Kết quả: ${bestMatch.toString()}, Tuổi: ${Math.round(
          age
        )}, Trạng thái: ${emotion}`
      ); // Hiển thị thông tin xác minh
    }
  } catch (error) {
    console.error("Lỗi khi tạo FaceMatcher:", error); // In lỗi nếu tạo FaceMatcher thất bại
    alert("❌ Lỗi xác minh khuôn mặt!"); // Hiển thị thông báo lỗi
  }
}

// Thay đổi kích thước video khi kích thước màn hình thay đổi
function screenResize(isScreenSmall) {
  video.style.width = isScreenSmall.matches ? "320px" : "500px"; // Thay đổi chiều rộng video
}
screenResize(isScreenSmall); // Gọi hàm screenResize khi trang web được tải
isScreenSmall.addListener(screenResize); // Gắn sự kiện thay đổi kích thước màn hình

// Làm mượt dự đoán tuổi
function interpolateAgePredictions(age) {
  predictedAges[currentAgeIndex] = age; // Lưu dự đoán tuổi vào mảng
  currentAgeIndex = (currentAgeIndex + 1) % predictedAges.length; // Cập nhật chỉ số

  const avgPredictedAge =
    predictedAges.reduce((total, a) => total + a) / predictedAges.length; // Tính tuổi trung bình
  return avgPredictedAge; // Trả về tuổi trung bình
}

// Chụp ảnh và xuất file
function captureAndExport(label, age, gender, emotion) {
  const canvas = document.createElement("canvas"); // Tạo phần tử canvas
  canvas.width = video.videoWidth; // Đặt chiều rộng canvas
  canvas.height = video.videoHeight; // Đặt chiều cao canvas
  const ctx = canvas.getContext("2d"); // Lấy context 2D của canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height); // Vẽ video lên canvas

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob); // Tạo URL đối tượng từ blob
    const a = document.createElement("a"); // Tạo phần tử a (liên kết)
    a.href = url; // Đặt href của liên kết
    const now = new Date();
    const dateString = now.toLocaleDateString("vi-VN"); // Định dạng ngày/tháng/năm
    const timeString = now.toLocaleTimeString("vi-VN"); // Định dạng giờ:phút:giây
    a.download = `${label}-face-${dateString.replace(
      /\//g,
      "-"
    )}-${timeString.replace(/:/g, "-")}.png`;
    a.click(); // Kích hoạt tải xuống
    URL.revokeObjectURL(url); // Thu hồi URL đối tượng

    showPopup(
      `Tuổi: ${Math.round(age)}, Giới tính: ${gender}, Trạng thái: ${emotion}`
    ); // Hiển thị thông tin trong pop-up
    console.log(
      `Tuổi: ${Math.round(age)}, Giới tính: ${gender}, Trạng thái: ${emotion}`
    ); // In thông tin vào console
  }, "image/png"); // Chuyển đổi canvas thành blob PNG
}

// Phát hiện khuôn mặt và vẽ (nếu cần)
function detectAndDraw() {
  requestAnimationFrame(async () => {
    const currentTime = Date.now(); // Lấy thời gian hiện tại
    if (currentTime - lastUpdateTime >= updateInterval) {
      // Kiểm tra xem đã đến lúc cập nhật chưa
      lastUpdateTime = currentTime; // Cập nhật thời gian cập nhật cuối cùng

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()) // Phát hiện tất cả khuôn mặt
        .withFaceLandmarks() // Lấy landmark khuôn mặt
        .withFaceExpressions() // Lấy biểu cảm khuôn mặt
        .withAgeAndGender(); // Lấy tuổi và giới tính

      if (!detections || detections.length === 0) {
        console.log("Không phát hiện khuôn mặt!"); // In thông báo nếu không tìm thấy khuôn mặt
        return;
      }
    }
    detectAndDraw(); // Gọi lại detectAndDraw
  });
}

// Xử lý sự kiện loadedmetadata của video
video.addEventListener("loadedmetadata", () => {
  console.log("Metadata đã tải, webcam đã hoạt động!"); // In thông báo

  const canvas = faceapi.createCanvasFromMedia(video); // Tạo canvas từ video
  let container = document.querySelector(".container"); // Lấy phần tử container
  container.append(canvas); // Thêm canvas vào container

  const displaySize = { width: video.videoWidth, height: video.videoHeight }; // Lấy kích thước hiển thị
  faceapi.matchDimensions(canvas, displaySize); // Khớp kích thước canvas với kích thước hiển thị

  detectAndDraw(); // Bắt đầu phát hiện khuôn mặt
});

// Xử lý sự kiện playing của video
video.addEventListener("playing", () => {
  console.log("Webcam đã hoạt động!"); // In thông báo
});

// Xử lý sự kiện beforeunload của window
window.addEventListener("beforeunload", () => {
  if (video.srcObject) {
    const stream = video.srcObject; // Lấy stream video
    const tracks = stream.getTracks(); // Lấy các track của stream
    tracks.forEach((track) => track.stop()); // Dừng tất cả các track
    video.srcObject = null; // Xóa stream video khỏi phần tử video
  }
});
