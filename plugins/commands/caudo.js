const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const { createCanvas } = require('canvas');

module.exports.config = {
    name: "caudo",
    version: "1.0.0",
    role: 0,
    author: "Cascade",
    description: "Chơi trò câu đố vui với canvas",
    category: "Giải trí",
    usage: "<prefix>caudo [dap_an]",
    cooldowns: 5
};

// Database câu đố và trắc nghiệm
const questions = [
    // Câu đố thường
    {
        type: "text",
        question: "Cái gì chạy quanh sân nhưng không bao giờ di chuyển?",
        answer: "hàng rào",
        hint: "Nó bao quanh ngôi nhà"
    },
    {
        type: "text",
        question: "Cái gì có đầu và đuôi nhưng không có thân?",
        answer: "đồng xu",
        hint: "Vật dụng dùng để mua sắm"
    },
    {
        type: "text",
        question: "Tháng nào trong năm có 28 ngày?",
        answer: "tất cả",
        hint: "Không chỉ tháng 2 đâu nhé!"
    },
    {
        type: "text",
        question: "Cái gì càng lấy đi càng to?",
        answer: "cái hố",
        hint: "Đào đất..."
    },
    {
        type: "text",
        question: "Con gì đi bằng 4 chân buổi sáng, 2 chân buổi trưa, 3 chân buổi tối?",
        answer: "con người",
        hint: "Câu đố của nhân sư Ai Cập"
    },
    
    // Câu trắc nghiệm
    {
        type: "choice",
        question: "Thủ đô của Việt Nam là gì?",
        options: {
            A: "Hồ Chí Minh",
            B: "Hà Nội",
            C: "Đà Nẵng",
            D: "Huế"
        },
        answer: "B",
        hint: "Ở miền Bắc"
    },
    {
        type: "choice",
        question: "Hành tinh nào gần Mặt Trời nhất?",
        options: {
            A: "Trái Đất",
            B: "Sao Hỏa",
            C: "Sao Thủy",
            D: "Sao Kim"
        },
        answer: "C",
        hint: "Tên bắt đầu bằng chữ T"
    },
    {
        type: "choice",
        question: "1 + 1 = ?",
        options: {
            A: "1",
            B: "2",
            C: "3",
            D: "11"
        },
        answer: "B",
        hint: "Quá dễ rồi!"
    },
    {
        type: "choice",
        question: "Đại dương lớn nhất thế giới là?",
        options: {
            A: "Đại Tây Dương",
            B: "Ấn Độ Dương",
            C: "Thái Bình Dương",
            D: "Bắc Băng Dương"
        },
        answer: "C",
        hint: "Nằm giữa châu Á và châu Mỹ"
    },
    {
        type: "choice",
        question: "Loài động vật nào bay được?",
        options: {
            A: "Chim cánh cụt",
            B: "Đà điểu",
            C: "Gà",
            D: "Đại bàng"
        },
        answer: "D",
        hint: "Vua của bầu trời"
    },
    {
        type: "choice",
        question: "Năm 2024 là năm con gì?",
        options: {
            A: "Mão (Mèo)",
            B: "Thìn (Rồng)",
            C: "Tỵ (Rắn)",
            D: "Ngọ (Ngựa)"
        },
        answer: "B",
        hint: "Con vật huyền thoại"
    },
    {
        type: "choice",
        question: "Công thức nước là gì?",
        options: {
            A: "H2O",
            B: "CO2",
            C: "O2",
            D: "NaCl"
        },
        answer: "A",
        hint: "2 nguyên tố: Hydro và Oxy"
    },
    {
        type: "choice",
        question: "Ai là tác giả 'Truyện Kiều'?",
        options: {
            A: "Hồ Chí Minh",
            B: "Nguyễn Du",
            C: "Hồ Xuân Hương",
            D: "Xuân Diệu"
        },
        answer: "B",
        hint: "Đại thi hào"
    },
    {
        type: "choice",
        question: "Màu sắc của hộp đen trên máy bay là gì?",
        options: {
            A: "Đen",
            B: "Cam",
            C: "Vàng",
            D: "Xanh"
        },
        answer: "B",
        hint: "Không phải màu đen!"
    },
    {
        type: "choice",
        question: "Quốc gia nào có diện tích lớn nhất thế giới?",
        options: {
            A: "Trung Quốc",
            B: "Canada",
            C: "Mỹ",
            D: "Nga"
        },
        answer: "D",
        hint: "Ở châu Âu và châu Á"
    },
    {
        type: "choice",
        question: "Cái gì sinh ra không có mắt nhưng vẫn nhìn thấy?",
        options: {
            A: "Gương",
            B: "Mắt kiếng",
            C: "Bóng",
            D: "Đồng hồ"
        },
        answer: "A",
        hint: "Phản chiếu hình ảnh"
    },
    {
        type: "choice",
        question: "Cái gì đi khắp thế gian mà vẫn ở trong góc nhà?",
        options: {
            A: "Bản đồ",
            B: "Tem thư",
            C: "Điện thoại",
            D: "Bản vẽ"
        },
        answer: "B",
        hint: "Dán trên bì thư"
    },
    {
        type: "choice",
        question: "Cái gì càng lấy đi càng lớn?",
        options: {
            A: "Lỗ",
            B: "Ví",
            C: "Két sắt",
            D: "Tim"
        },
        answer: "A",
        hint: "Đào đất..."
    },
    {
        type: "choice",
        question: "Con gì không có chân mà vẫn bò?",
        options: {
            A: "Rắn",
            B: "Cá",
            C: "Ốc sên",
            D: "Dơi"
        },
        answer: "A",
        hint: "Bò trên đất"
    },
    {
        type: "choice",
        question: "1 năm có bao nhiêu tháng có 28 ngày?",
        options: {
            A: "0",
            B: "1",
            C: "12",
            D: "6"
        },
        answer: "C",
        hint: "Tất cả các tháng đều có!"
    },
    {
        type: "choice",
        question: "Cái gì càng rửa càng bẩn?",
        options: {
            A: "Quần áo",
            B: "Nước",
            C: "Bàn chải",
            D: "Rửa tay"
        },
        answer: "B",
        hint: "Chất lỏng"
    },
    {
        type: "choice",
        question: "Con gì đi bằng bốn chân vào buổi sáng, hai chân buổi trưa, ba chân buổi chiều?",
        options: {
            A: "Chó",
            B: "Người",
            C: "Người già",
            D: "Mèo"
        },
        answer: "B",
        hint: "Câu đố nổi tiếng của Ai Cập"
    },
    {
        type: "choice",
        question: "Cái gì có nhiều răng nhưng không cắn?",
        options: {
            A: "Răng giả",
            B: "Lược",
            C: "Cưa",
            D: "Cái kéo"
        },
        answer: "B",
        hint: "Dùng để chải tóc"
    },
    {
        type: "choice",
        question: "Cây gì không có lá?",
        options: {
            A: "Cây tre",
            B: "Cây cầu",
            C: "Cây chuối",
            D: "Cây gỗ"
        },
        answer: "B",
        hint: "Không phải thực vật"
    },
    {
        type: "choice",
        question: "Cái gì của bạn nhưng người khác dùng nhiều hơn bạn?",
        options: {
            A: "Quần áo",
            B: "Tên",
            C: "Điện thoại",
            D: "Tiền"
        },
        answer: "B",
        hint: "Gọi tên bạn"
    },
    {
        type: "choice",
        question: "Cái gì bay mà không có cánh?",
        options: {
            A: "Bóng bay",
            B: "Thời gian",
            C: "Máy bay",
            D: "Chim"
        },
        answer: "B",
        hint: "Trừu tượng"
    },
    {
        type: "choice",
        question: "Cái gì càng khoe càng mất?",
        options: {
            A: "Tiền",
            B: "Bí mật",
            C: "Danh dự",
            D: "Sức khỏe"
        },
        answer: "B",
        hint: "Giữ kín"
    },
    {
        type: "choice",
        question: "Cái gì nhỏ bằng hạt, ăn vào không no, bỏ đi không tiếc?",
        options: {
            A: "Muối",
            B: "Nước mắt",
            C: "Hạt tiêu",
            D: "Kim cương"
        },
        answer: "A",
        hint: "Gia vị"
    },
    {
        type: "choice",
        question: "Cái gì đập thì sống, không đập thì chết?",
        options: {
            A: "Trống",
            B: "Tim",
            C: "Cánh",
            D: "Máy bơm"
        },
        answer: "B",
        hint: "Trong cơ thể"
    },
    {
        type: "choice",
        question: "Cái gì có một chân mà vẫn đứng?",
        options: {
            A: "Gậy",
            B: "Nấm",
            C: "Cột điện",
            D: "Ghế đẩu"
        },
        answer: "B",
        hint: "Loại nấm"
    },
    {
        type: "choice",
        question: "Cái gì không thể giữ nhưng dễ dàng trao đi?",
        options: {
            A: "Vàng",
            B: "Lời hứa",
            C: "Tên",
            D: "Tiền"
        },
        answer: "B",
        hint: "Cam kết"
    },
    {
        type: "choice",
        question: "Cái gì có thể vỡ mà không rơi?",
        options: {
            A: "Tim",
            B: "Gương",
            C: "Thủy tinh",
            D: "Trái tim"
        },
        answer: "A",
        hint: "Cảm xúc"
    },
    {
        type: "choice",
        question: "Cái gì có thể đánh nhưng không đau?",
        options: {
            A: "Đấm",
            B: "Trống",
            C: "Lời nói",
            D: "Máy tính"
        },
        answer: "B",
        hint: "Nhạc cụ"
    },
    {
        type: "choice",
        question: "Cái gì lớn nhất thế giới mà vẫn có thể đặt trên bàn?",
        options: {
            A: "Núi",
            B: "Bản đồ thế giới",
            C: "Con voi",
            D: "Tivi"
        },
        answer: "B",
        hint: "Giấy"
    },
    {
        type: "choice",
        question: "Cái gì rơi nhưng không bao giờ vỡ?",
        options: {
            A: "Mưa",
            B: "Trái tim",
            C: "Trứng",
            D: "Gương"
        },
        answer: "A",
        hint: "Từ trời xuống"
    },
    {
        type: "choice",
        question: "Cái gì ai cũng muốn nhưng ít người có?",
        options: {
            A: "Hạnh phúc",
            B: "Tiền",
            C: "Sức khỏe",
            D: "Nổi tiếng"
        },
        answer: "A",
        hint: "Cảm xúc tích cực"
    },
    {
        type: "choice",
        question: "Cái gì có thể chạy mà không có chân?",
        options: {
            A: "Nước",
            B: "Xe",
            C: "Đồng hồ",
            D: "Ô tô"
        },
        answer: "A",
        hint: "Chất lỏng"
    },
    {
        type: "choice",
        question: "Cái gì bạn càng cho càng nhiều?",
        options: {
            A: "Tiền",
            B: "Tình yêu",
            C: "Đồ ăn",
            D: "Nợ"
        },
        answer: "B",
        hint: "Cảm xúc"
    },
    {
        type: "choice",
        question: "Con gì có răng mà không ăn?",
        options: {
            A: "Lược",
            B: "Cưa",
            C: "Con cá",
            D: "Cả A và B"
        },
        answer: "D",
        hint: "Dụng cụ"
    },
    {
        type: "choice",
        question: "Cái gì nổi trên mặt nước?",
        options: {
            A: "Gỗ",
            B: "Sắt",
            C: "Đồng",
            D: "Đất sét"
        },
        answer: "A",
        hint: "Nhẹ hơn nước"
    },
    {
        type: "choice",
        question: "Cái gì bạn phá khi nói?",
        options: {
            A: "Giấc ngủ",
            B: "Bí mật",
            C: "Cửa sổ",
            D: "Đội bóng"
        },
        answer: "A",
        hint: "Yên lặng"
    },
    {
        type: "choice",
        question: "Cái gì ướt khi nó khô?",
        options: {
            A: "Khăn",
            B: "Áo mưa",
            C: "Quần",
            D: "Gối"
        },
        answer: "A",
        hint: "Lau người"
    },
    {
        type: "choice",
        question: "Cái gì mà khi bạn nói tên của nó, nó không còn hiện diện?",
        options: {
            A: "Im lặng",
            B: "Tiếng ồn",
            C: "Bí mật",
            D: "Bóng đêm"
        },
        answer: "A",
        hint: "Yên tĩnh"
    },
    {
        type: "choice",
        question: "Cái gì càng nóng càng lạnh?",
        options: {
            A: "Trái đất",
            B: "Trái tim",
            C: "Tình yêu",
            D: "Lò nước đá"
        },
        answer: "B",
        hint: "Cảm xúc"
    },
    {
        type: "choice",
        question: "Con gì càng kêu càng bé?",
        options: {
            A: "Con heo",
            B: "Con vịt quay",
            C: "Con chim sẻ",
            D: "Con chó"
        },
        answer: "B",
        hint: "Món ăn"
    },
    {
        type: "choice",
        question: "Cái gì càng ăn càng bé?",
        options: {
            A: "Gạo",
            B: "Bánh mì",
            C: "Hòn đá",
            D: "Cục xà phòng"
        },
        answer: "D",
        hint: "Dùng để tắm"
    },
    {
        type: "choice",
        question: "Cái gì có đầu mà không có cổ?",
        options: {
            A: "Đinh",
            B: "Chó",
            C: "Người",
            D: "Gà"
        },
        answer: "A",
        hint: "Dụng cụ"
    },
    {
        type: "choice",
        question: "Cái gì biết đi mà không biết chạy?",
        options: {
            A: "Con rùa",
            B: "Đồng hồ",
            C: "Ô tô",
            D: "Con cá"
        },
        answer: "B",
        hint: "Thời gian"
    },
    {
        type: "choice",
        question: "Cái gì cao bằng trời nhưng nhẹ?",
        options: {
            A: "Lời nói",
            B: "Mây",
            C: "Khói",
            D: "Tình yêu"
        },
        answer: "B",
        hint: "Trên trời"
    },
    {
        type: "choice",
        question: "Cái gì ban đêm nhiều hơn ban ngày?",
        options: {
            A: "Bóng tối",
            B: "Giấc mơ",
            C: "Mặt trăng",
            D: "Ngôi sao"
        },
        answer: "D",
        hint: "Lấp lánh"
    },
    {
        type: "choice",
        question: "Cái gì có chân nhưng không có thân?",
        options: {
            A: "Cái bàn",
            B: "Con chó",
            C: "Cái ghế",
            D: "Con chim"
        },
        answer: "A",
        hint: "Đồ vật"
    },
    {
        type: "choice",
        question: "Cái gì đen khi bạn mua, đỏ khi dùng, trắng khi bỏ?",
        options: {
            A: "Than",
            B: "Gạo",
            C: "Mực",
            D: "Giấy"
        },
        answer: "A",
        hint: "Đốt lửa"
    },
    {
        type: "choice",
        question: "Con gì không chạy mà vẫn đến?",
        options: {
            A: "Ngày mai",
            B: "Ô tô",
            C: "Xe đạp",
            D: "Gió"
        },
        answer: "A",
        hint: "Thời gian"
    },
    {
        type: "choice",
        question: "Cái gì càng dài càng ngắn?",
        options: {
            A: "Cây",
            B: "Đường",
            C: "Bút chì",
            D: "Khoảng đời"
        },
        answer: "C",
        hint: "Viết"
    },
    {
        type: "choice",
        question: "Cái gì nhỏ nhưng chứa được cả thế giới?",
        options: {
            A: "Con mắt",
            B: "Trái tim",
            C: "Não",
            D: "Tấm bản đồ"
        },
        answer: "A",
        hint: "Trong cơ thể"
    },
    {
        type: "choice",
        question: "Cái gì chạy nhưng không mệt?",
        options: {
            A: "Xe",
            B: "Dòng nước",
            C: "Giờ",
            D: "Gió"
        },
        answer: "B",
        hint: "Chất lỏng"
    },
    {
        type: "choice",
        question: "Con gì đội trời đạp đất?",
        options: {
            A: "Con người",
            B: "Con voi",
            C: "Con trâu",
            D: "Con hổ"
        },
        answer: "C",
        hint: "Ở nông thôn"
    },
    {
        type: "choice",
        question: "Cái gì càng để lâu càng cứng?",
        options: {
            A: "Bánh mì",
            B: "Gạo",
            C: "Đất",
            D: "Trái cây"
        },
        answer: "A",
        hint: "Món ăn"
    },
    {
        type: "choice",
        question: "Cái gì mở ra thì sáng, đóng lại thì tối?",
        options: {
            A: "Mắt",
            B: "Cửa sổ",
            C: "Đèn",
            D: "Điện thoại"
        },
        answer: "A",
        hint: "Trên mặt"
    },
    {
        type: "choice",
        question: "Cái gì không có chân nhưng bước đi nhanh?",
        options: {
            A: "Thời gian",
            B: "Gió",
            C: "Mưa",
            D: "Đồng hồ cát"
        },
        answer: "A",
        hint: "Trừu tượng"
    },
    {
        type: "choice",
        question: "Cái gì không thể chạm mà ai cũng cảm nhận được?",
        options: {
            A: "Gió",
            B: "Tình yêu",
            C: "Mùi",
            D: "Nỗi buồn"
        },
        answer: "B",
        hint: "Cảm xúc"
    },
    {
        type: "choice",
        question: "Cái gì đi sát đất nhưng không bao giờ chạm đất?",
        options: {
            A: "Bóng",
            B: "Gió",
            C: "Mây",
            D: "Bụi"
        },
        answer: "A",
        hint: "Theo sát bạn"
    },
    {
        type: "choice",
        question: "Cái gì lớn nhất trên cơ thể con người?",
        options: {
            A: "Tim",
            B: "Não",
            C: "Da",
            D: "Phổi"
        },
        answer: "C",
        hint: "Bao phủ cơ thể"
    },
    {
        type: "choice",
        question: "Con gì nghe rất giỏi?",
        options: {
            A: "Chó",
            B: "Người",
            C: "Dơi",
            D: "Mèo"
        },
        answer: "C",
        hint: "Bay đêm"
    },
    {
        type: "choice",
        question: "Con gì có thể ngủ suốt mùa đông?",
        options: {
            A: "Gấu",
            B: "Hươu",
            C: "Chó sói",
            D: "Cá voi"
        },
        answer: "A",
        hint: "Ngủ đông"
    },
    {
        type: "choice",
        question: "Cái gì càng tìm càng mất?",
        options: {
            A: "Đồ vật",
            B: "Thời gian",
            C: "Bình tĩnh",
            D: "Cơ hội"
        },
        answer: "C",
        hint: "Cảm xúc"
    },
    {
        type: "choice",
        question: "Con gì vừa bay vừa chạy vừa bơi?",
        options: {
            A: "Vịt",
            B: "Gà",
            C: "Chó",
            D: "Cá"
        },
        answer: "A",
        hint: "Gia cầm"
    },
    {
        type: "choice",
        question: "Trái gì không mọc trên cây?",
        options: {
            A: "Cam",
            B: "Dừa",
            C: "Trái tim",
            D: "Táo"
        },
        answer: "C",
        hint: "Trong cơ thể"
    },
    {
        type: "choice",
        question: "Cái gì không bao giờ chung thủy?",
        options: {
            A: "Tiền",
            B: "Gió",
            C: "Con người",
            D: "Mưa"
        },
        answer: "B",
        hint: "Thiên nhiên"
    },
    {
        type: "choice",
        question: "Cái gì càng xài càng mới?",
        options: {
            A: "Tình yêu",
            B: "Trí tuệ",
            C: "Quần áo",
            D: "Giầy"
        },
        answer: "B",
        hint: "Kiến thức"
    },
    {
        type: "choice",
        question: "Cái gì ăn lửa uống gió?",
        options: {
            A: "Bếp lò",
            B: "Tàu hơi nước",
            C: "Máy bay",
            D: "Núi lửa"
        },
        answer: "B",
        hint: "Phương tiện"
    },
    {
        type: "choice",
        question: "Cái gì có thể chiếu sáng nhưng không nóng?",
        options: {
            A: "Đèn LED",
            B: "Đom đóm",
            C: "Mặt trăng",
            D: "Sao"
        },
        answer: "B",
        hint: "Côn trùng"
    },
    {
        type: "choice",
        question: "Cái gì có thể lấp kín khoảng cách giữa hai người?",
        options: {
            A: "Lời nói",
            B: "Tiền",
            C: "Sự im lặng",
            D: "Thời gian"
        },
        answer: "C",
        hint: "Yên lặng"
    },
    {
        type: "choice",
        question: "Con gì biết hát nhưng không có miệng?",
        options: {
            A: "Chim",
            B: "Sáo",
            C: "Gió",
            D: "Tiếng vang"
        },
        answer: "C",
        hint: "Thiên nhiên"
    },
    {
        type: "choice",
        question: "Cái gì nhỏ bé mà có thể giết một thành phố?",
        options: {
            A: "Con vi rút",
            B: "Súng",
            C: "Dao",
            D: "Bom"
        },
        answer: "A",
        hint: "Vi sinh vật"
    },
    {
        type: "choice",
        question: "Cái gì dài nhất khi trẻ và ngắn nhất khi già?",
        options: {
            A: "Cuộc đời",
            B: "Giấc ngủ",
            C: "Tóc",
            D: "Thời gian rảnh"
        },
        answer: "B",
        hint: "Ban đêm"
    },
    {
        type: "choice",
        question: "Cái gì lạnh nhất thế giới?",
        options: {
            A: "Bắc Cực",
            B: "Trái tim người hết yêu",
            C: "Kim loại trong tủ đông",
            D: "Băng"
        },
        answer: "B",
        hint: "Cảm xúc"
    },
    {
        type: "choice",
        question: "Cái gì sinh ra từ ánh sáng nhưng lại sợ ánh sáng?",
        options: {
            A: "Bóng",
            B: "Mắt",
            C: "Lửa",
            D: "Mưa"
        },
        answer: "A",
        hint: "Theo bạn"
    },
    {
        type: "choice",
        question: "Cái gì càng mỏng càng khó giữ?",
        options: {
            A: "Kiên nhẫn",
            B: "Giấy",
            C: "Sợi chỉ",
            D: "Tình cảm"
        },
        answer: "D",
        hint: "Cảm xúc"
    },
    {
        type: "choice",
        question: "Điều gì làm bạn yếu đi nhưng cũng mạnh lên?",
        options: {
            A: "Khó khăn",
            B: "Tình yêu",
            C: "Thời gian",
            D: "Bệnh tật"
        },
        answer: "A",
        hint: "Thử thách"
    },
    {
        type: "choice",
        question: "Cái gì cắt không bằng dao mà đau hơn dao?",
        options: {
            A: "Lời chê",
            B: "Lời phản bội",
            C: "Sự thật",
            D: "Lời nói dối"
        },
        answer: "C",
        hint: "Chân thật"
    },
    {
        type: "choice",
        question: "Thứ gì càng vỡ càng to?",
        options: {
            A: "Cơn giận",
            B: "Sự im lặng",
            C: "Bọt xà phòng",
            D: "Tin đồn"
        },
        answer: "D",
        hint: "Lời đồn"
    },
    {
        type: "choice",
        question: "Cái gì càng kéo càng dài, càng dài càng rối?",
        options: {
            A: "Tóc",
            B: "Chuyện",
            C: "Dây thừng",
            D: "Sợi len"
        },
        answer: "B",
        hint: "Nói chuyện"
    },
    {
        type: "choice",
        question: "Vật gì xài càng nhiều càng sắc bén?",
        options: {
            A: "Dao",
            B: "Kiến thức",
            C: "Kiếm",
            D: "Kéo"
        },
        answer: "B",
        hint: "Học hỏi"
    },
    {
        type: "choice",
        question: "Cái gì đứng càng lâu càng thấp?",
        options: {
            A: "Bút chì",
            B: "Nến",
            C: "Tàn thuốc",
            D: "Cả 3"
        },
        answer: "D",
        hint: "Đều đúng"
    },
    {
        type: "choice",
        question: "Điều gì biết đi nhưng không thể quay lại?",
        options: {
            A: "Câu nói",
            B: "Thời gian",
            C: "Sai lầm",
            D: "Cả 3"
        },
        answer: "D",
        hint: "Tất cả"
    }
];

// Helper: Rounded rectangle
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Tạo ảnh câu hỏi
async function createQuestionImage(question, hint, questionNumber, options = null) {
    const width = 1200;
    const height = options ? 1050 : 800; // Cao hơn nếu có trắc nghiệm
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e293b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Pattern overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < width; i += 60) {
        for (let j = 0; j < height; j += 60) {
            ctx.fillRect(i, j, 30, 30);
        }
    }

    const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
    borderGradient.addColorStop(0, '#f59e0b');
    borderGradient.addColorStop(0.5, '#ef4444');
    borderGradient.addColorStop(1, '#ec4899');

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, 'rgba(245, 158, 11, 0.2)');
    headerGradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.2)');
    headerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.2)');
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Title
    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    titleGradient.addColorStop(0, '#f59e0b');
    titleGradient.addColorStop(0.5, '#ef4444');
    titleGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px Arial';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
    ctx.shadowBlur = 25;
    ctx.fillText('🤔 CÂU ĐỐ VUI', width / 2, 105);
    ctx.shadowBlur = 0;

    // Question number badge
    const badgeY = 200;
    const badgeGradient = ctx.createRadialGradient(width / 2, badgeY, 0, width / 2, badgeY, 50);
    badgeGradient.addColorStop(0, 'rgba(245, 158, 11, 0.3)');
    badgeGradient.addColorStop(1, 'rgba(239, 68, 68, 0.3)');
    
    ctx.fillStyle = badgeGradient;
    ctx.beginPath();
    ctx.arc(width / 2, badgeY, 50, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(width / 2, badgeY, 50, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`#${questionNumber}`, width / 2, badgeY + 12);

    // Question card
    const cardY = 300;
    const cardHeight = 280;
    
    const cardGradient = ctx.createLinearGradient(60, cardY, width - 60, cardY);
    cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
    cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
    
    roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    roundRect(ctx, 60, cardY, width - 120, cardHeight, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Question icon
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 50px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('❓', width / 2, cardY + 70);

    // Question text - word wrap
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    
    const words = question.split(' ');
    let lines = [];
    let currentLine = '';
    const maxWidth = width - 200;
    
    for (let word of words) {
        const testLine = currentLine + word + ' ';
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && currentLine !== '') {
            lines.push(currentLine.trim());
            currentLine = word + ' ';
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine.trim() !== '') {
        lines.push(currentLine.trim());
    }
    
    let textY = cardY + 130;
    for (let line of lines) {
        ctx.fillText(line, width / 2, textY);
        textY += 38;
    }

    // Hint
    const hintY = cardY + cardHeight - 50;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`💡 Gợi ý: ${hint}`, width / 2, hintY);

    // Options (nếu là trắc nghiệm)
    if (options) {
        let optY = cardY + cardHeight + 40;
        
        const optColors = {
            A: '#3b82f6',
            B: '#10b981',
            C: '#f59e0b',
            D: '#ec4899'
        };
        
        for (let [key, value] of Object.entries(options)) {
            const optCardHeight = 70;
            const optCardGradient = ctx.createLinearGradient(100, optY, width - 100, optY);
            optCardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
            optCardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
            
            roundRect(ctx, 100, optY, width - 200, optCardHeight, 12);
            ctx.fillStyle = optCardGradient;
            ctx.fill();
            
            roundRect(ctx, 100, optY, width - 200, optCardHeight, 12);
            ctx.strokeStyle = optColors[key];
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Letter badge
            ctx.fillStyle = optColors[key];
            ctx.fillRect(100, optY, 60, optCardHeight);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(key, 130, optY + 48);
            
            // Option text
            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'left';
            const optText = value.length > 50 ? value.substring(0, 50) + '...' : value;
            ctx.fillText(optText, 180, optY + 45);
            
            optY += optCardHeight + 15;
        }
    }

    // Footer
    const footerY = height - 80;
    const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerGradient.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.15)');
    footerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#f59e0b');
    footerTextGradient.addColorStop(0.5, '#ef4444');
    footerTextGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = footerTextGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px Arial';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('💎 BONZ VIP - MUA BOT LH 0785000270', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

// Tạo ảnh đáp án
async function createAnswerImage(question, userAnswer, correctAnswer, isCorrect) {
    const width = 1200;
    const height = 850;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e293b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < width; i += 60) {
        for (let j = 0; j < height; j += 60) {
            ctx.fillRect(i, j, 30, 30);
        }
    }

    const borderGradient = ctx.createLinearGradient(0, 0, width, 0);
    if (isCorrect) {
        borderGradient.addColorStop(0, '#10b981');
        borderGradient.addColorStop(0.5, '#059669');
        borderGradient.addColorStop(1, '#047857');
    } else {
        borderGradient.addColorStop(0, '#ef4444');
        borderGradient.addColorStop(0.5, '#dc2626');
        borderGradient.addColorStop(1, '#b91c1c');
    }

    // Header
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    if (isCorrect) {
        headerGradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
        headerGradient.addColorStop(0.5, 'rgba(5, 150, 105, 0.2)');
        headerGradient.addColorStop(1, 'rgba(4, 120, 87, 0.2)');
    } else {
        headerGradient.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
        headerGradient.addColorStop(0.5, 'rgba(220, 38, 38, 0.2)');
        headerGradient.addColorStop(1, 'rgba(185, 28, 28, 0.2)');
    }
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.fillStyle = headerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, 30, width - 80, 120, 25);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Title
    const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
    if (isCorrect) {
        titleGradient.addColorStop(0, '#10b981');
        titleGradient.addColorStop(0.5, '#059669');
        titleGradient.addColorStop(1, '#047857');
    } else {
        titleGradient.addColorStop(0, '#ef4444');
        titleGradient.addColorStop(0.5, '#dc2626');
        titleGradient.addColorStop(1, '#b91c1c');
    }
    
    ctx.fillStyle = titleGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px Arial';
    ctx.shadowColor = isCorrect ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
    ctx.shadowBlur = 25;
    ctx.fillText(isCorrect ? '✅ CHÍNH XÁC!' : '❌ SAI RỒI!', width / 2, 105);
    ctx.shadowBlur = 0;

    // Result icon
    const iconY = 220;
    const iconGradient = ctx.createRadialGradient(width / 2, iconY, 0, width / 2, iconY, 80);
    if (isCorrect) {
        iconGradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
        iconGradient.addColorStop(1, 'rgba(5, 150, 105, 0.3)');
    } else {
        iconGradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
        iconGradient.addColorStop(1, 'rgba(220, 38, 38, 0.3)');
    }
    
    ctx.fillStyle = iconGradient;
    ctx.beginPath();
    ctx.arc(width / 2, iconY, 80, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(width / 2, iconY, 80, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = isCorrect ? '#10b981' : '#ef4444';
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(isCorrect ? '😄' : '😢', width / 2, iconY + 30);

    // Question
    let currentY = 350;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('📝 Câu hỏi:', width / 2, currentY);
    
    currentY += 40;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 22px Arial';
    const questionText = question.length > 70 ? question.substring(0, 70) + '...' : question;
    ctx.fillText(questionText, width / 2, currentY);

    // Answer cards
    currentY += 80;
    const cardHeight = 100;
    
    // Your answer
    const cardGradient = ctx.createLinearGradient(100, currentY, width - 100, currentY);
    cardGradient.addColorStop(0, 'rgba(30, 41, 59, 0.8)');
    cardGradient.addColorStop(1, 'rgba(15, 23, 42, 0.8)');
    
    roundRect(ctx, 100, currentY, width - 200, cardHeight, 15);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    roundRect(ctx, 100, currentY, width - 200, cardHeight, 15);
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('💭 Câu trả lời của bạn:', 130, currentY + 40);
    
    ctx.fillStyle = isCorrect ? '#10b981' : '#ef4444';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(userAnswer, 130, currentY + 75);

    // Correct answer
    currentY += cardHeight + 20;
    
    roundRect(ctx, 100, currentY, width - 200, cardHeight, 15);
    ctx.fillStyle = cardGradient;
    ctx.fill();
    
    roundRect(ctx, 100, currentY, width - 200, cardHeight, 15);
    const correctBorderGradient = ctx.createLinearGradient(0, 0, width, 0);
    correctBorderGradient.addColorStop(0, '#10b981');
    correctBorderGradient.addColorStop(0.5, '#059669');
    correctBorderGradient.addColorStop(1, '#047857');
    ctx.strokeStyle = correctBorderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('✓ Đáp án đúng:', 130, currentY + 40);
    
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(correctAnswer, 130, currentY + 75);

    // Footer
    const footerY = height - 80;
    const footerGradient = ctx.createLinearGradient(0, footerY, width, footerY);
    footerGradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)');
    footerGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.15)');
    footerGradient.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    ctx.fillStyle = footerGradient;
    ctx.fill();
    
    roundRect(ctx, 40, footerY, width - 80, 60, 20);
    const footerBorderGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerBorderGradient.addColorStop(0, '#3b82f6');
    footerBorderGradient.addColorStop(0.5, '#8b5cf6');
    footerBorderGradient.addColorStop(1, '#ec4899');
    ctx.strokeStyle = footerBorderGradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    const footerTextGradient = ctx.createLinearGradient(0, 0, width, 0);
    footerTextGradient.addColorStop(0, '#3b82f6');
    footerTextGradient.addColorStop(0.5, '#8b5cf6');
    footerTextGradient.addColorStop(1, '#ec4899');
    
    ctx.fillStyle = footerTextGradient;
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px Arial';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
    ctx.shadowBlur = 15;
    ctx.fillText('💎 BONZ VIP - MUA BOT LH 0785000270', width / 2, footerY + 40);
    ctx.shadowBlur = 0;

    return canvas.toBuffer('image/png');
}

// Storage cho câu hỏi đang active
const activeQuestions = new Map();

module.exports.run = async function({ api, event, args }) {
    const { threadId, senderID, type } = event;
    const tempPath = path.join(__dirname, '../../cache');
    
    try {
        await fs.mkdir(tempPath, { recursive: true });
    } catch (e) {
        console.error("Không thể tạo thư mục cache:", e);
    }

    try {
        // Nếu không có args - hiển thị câu hỏi mới
        if (args.length === 0) {
            // Random câu hỏi
            const randomQ = questions[Math.floor(Math.random() * questions.length)];
            const questionNumber = Math.floor(Math.random() * 100) + 1;
            
            // Lưu câu hỏi active
            const questionKey = `${threadId}_${senderID}`;
            activeQuestions.set(questionKey, {
                type: randomQ.type,
                question: randomQ.question,
                answer: randomQ.type === 'choice' ? randomQ.answer.toUpperCase() : randomQ.answer.toLowerCase(),
                options: randomQ.options || null,
                timestamp: Date.now()
            });
            
            // Tạo ảnh câu hỏi
            const questionImage = await createQuestionImage(
                randomQ.question, 
                randomQ.hint, 
                questionNumber,
                randomQ.options
            );
            const imagePath = path.join(tempPath, `caudo_q_${Date.now()}.png`);
            await fs.writeFile(imagePath, questionImage);
            
            const instructionMsg = randomQ.type === 'choice' 
                ? `🤔 Chọn đáp án đúng!\n💡 Dùng: caudo A/B/C/D`
                : `🤔 Hãy suy nghĩ và trả lời!\n💡 Dùng: caudo <đáp án>`;
            
            await api.sendMessage({
                msg: instructionMsg,
                attachments: [imagePath]
            }, threadId, type);
            
            setTimeout(async () => {
                try {
                    await fs.unlink(imagePath);
                } catch (_) {}
            }, 10000);
            
        } else {
            // Kiểm tra đáp án
            const questionKey = `${threadId}_${senderID}`;
            const activeQ = activeQuestions.get(questionKey);
            
            if (!activeQ) {
                return api.sendMessage("⚠️ Bạn chưa có câu hỏi nào! Hãy dùng lệnh 'caudo' để bắt đầu.", threadId, type);
            }
            
            let userAnswer = args.join(' ').trim();
            let isCorrect = false;
            let displayAnswer = activeQ.answer;
            
            if (activeQ.type === 'choice') {
                // Trắc nghiệm - so sánh A/B/C/D
                userAnswer = userAnswer.toUpperCase();
                isCorrect = userAnswer === activeQ.answer;
                displayAnswer = `${activeQ.answer}. ${activeQ.options[activeQ.answer]}`;
            } else {
                // Text - so sánh text
                userAnswer = userAnswer.toLowerCase();
                isCorrect = userAnswer === activeQ.answer || userAnswer.includes(activeQ.answer);
                displayAnswer = activeQ.answer;
            }
            
            // Tạo ảnh đáp án
            const answerImage = await createAnswerImage(
                activeQ.question,
                args.join(' '),
                displayAnswer,
                isCorrect
            );
            const imagePath = path.join(tempPath, `caudo_a_${Date.now()}.png`);
            await fs.writeFile(imagePath, answerImage);
            
            const msg = isCorrect 
                ? `🎉 Chính xác! Bạn thật thông minh!\n💡 Chơi tiếp: caudo`
                : `😢 Sai rồi! Đáp án đúng là: ${displayAnswer}\n💡 Thử lại: caudo`;
            
            await api.sendMessage({
                msg: msg,
                attachments: [imagePath]
            }, threadId, type);
            
            // Xóa câu hỏi sau khi trả lời
            activeQuestions.delete(questionKey);
            
            setTimeout(async () => {
                try {
                    await fs.unlink(imagePath);
                } catch (_) {}
            }, 10000);
        }
        
    } catch (error) {
        console.error("Lỗi khi xử lý câu đố:", error);
        await api.sendMessage("❌ Đã xảy ra lỗi khi xử lý câu đố. Vui lòng thử lại!", threadId, type);
    }
};
