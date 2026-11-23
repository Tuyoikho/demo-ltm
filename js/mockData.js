/**
 * js/mockData.js
 * Khởi tạo dữ liệu mẫu vào localStorage khi ứng dụng chạy lần đầu.
 * Lưu ý: File này được nhúng ĐẦU TIÊN trong tất cả các trang HTML.
 */

window.APP_STORAGE_KEYS = {
  USERS: "eduforum_users",
  TOPICS: "eduforum_topics",
  POSTS: "eduforum_posts",
  RESOURCES: "eduforum_resources",
  REPORTS: "eduforum_reports",
  CURRENT_USER: "eduforum_current_user"
};

(function initMockData() {
  const KEYS = window.APP_STORAGE_KEYS;

  // 1. Dữ liệu mẫu Người dùng (role: "admin" hoặc "user")
  const defaultUsers = [
    {
      id: "user_admin",
      username: "admin",
      password: "123456",
      fullName: "Quản trị viên Hệ thống",
      avatar: "assets/images/default-avatar.png",
      role: "admin",
      friends: ["user_1"],
      friendRequests: []
    },
    {
      id: "user_1",
      username: "minhanh",
      password: "123456",
      fullName: "Nguyễn Minh Anh",
      avatar: "assets/images/default-avatar.png",
      role: "user",
      friends: ["user_2", "user_admin"],
      friendRequests: ["user_3"] // Đang có lời mời kết bạn từ Lê Thu Hà
    },
    {
      id: "user_2",
      username: "hoangnam",
      password: "123456",
      fullName: "Trần Hoàng Nam",
      avatar: "assets/images/default-avatar.png",
      role: "user",
      friends: ["user_1"],
      friendRequests: []
    },
    {
      id: "user_3",
      username: "thuha",
      password: "123456",
      fullName: "Lê Thu Hà",
      avatar: "assets/images/default-avatar.png",
      role: "user",
      friends: [],
      friendRequests: []
    }
  ];

  // 2. Dữ liệu mẫu Chủ đề học tập (Mảng chuỗi, số liệu tương tác được tính động)
  const defaultTopics = [
    "HTML & CSS",
    "JavaScript cơ bản",
    "DOM & LocalStorage",
    "Tài liệu ôn thi",
    "Kinh nghiệm đồ án"
  ];

  // 3. Dữ liệu mẫu Bài thảo luận (Đủ các phạm vi: public, friends, onlyme & trạng thái kiểm duyệt)
  const defaultPosts = [
    {
      id: "post_1",
      authorId: "user_1",
      title: "Tổng hợp mẹo chia bố cục Flexbox chuẩn Responsive không bị vỡ khung",
      content:
        "Khi làm layout 3 cột với Flexbox, các bạn nhớ kết hợp thuộc tính flex-wrap: wrap và đặt min-width: 0 cho cột giữa để nội dung dài hoặc bảng biểu không đẩy tràn màn hình trên thiết bị di động.",
      topic: "HTML & CSS",
      mediaUrl: "assets/images/sample-code.png",
      mediaType: "image", // "image" | "video" | "none"
      visibility: "public", // "public" | "friends" | "onlyme"
      status: "approved", // "pending" | "approved" | "needs_edit" | "rejected"
      priority: "normal", // "high" | "normal"
      moderatorNote: "",
      likes: ["user_2", "user_3", "user_admin"],
      dislikes: [],
      comments: [
        {
          id: "cmt_101",
          authorId: "user_2",
          content: "Mẹo min-width: 0 rất hữu ích, mình vừa áp dụng cho trang bảng tin và hết lỗi tràn ngang!",
          mediaUrl: "assets/images/sample-code.png",
          mediaType: "image",
          createdAt: "2026-11-18T09:15:00.000Z",
          replies: [
            {
              id: "rep_201",
              authorId: "user_1",
              content: "Chuẩn luôn Nam ơi, kết hợp thêm overflow-x: auto cho thẻ table nữa là đẹp.",
              mediaUrl: "",
              mediaType: "none",
              createdAt: "2026-11-18T09:30:00.000Z"
            }
          ]
        },
        {
          id: "cmt_102",
          authorId: "user_3",
          content: "Cảm ơn bạn đã chia sẻ, mình xin phép lưu lại để áp dụng cho bài cuối kỳ.",
          mediaUrl: "",
          mediaType: "none",
          createdAt: "2026-11-18T10:05:00.000Z",
          replies: []
        }
      ],
      createdAt: "2026-11-18T08:30:00.000Z"
    },
    {
      id: "post_2",
      authorId: "user_2",
      title: "Nhóm mình thống nhất phân chia module JS cho đồ án cuối kỳ",
      content:
        "Bài viết này chỉ hiển thị cho bạn bè của Nam: Mình đã hoàn thiện phần giao diện trang chủ, Minh Anh kiểm tra giúp mình luồng lưu dữ liệu vào localStorage nhé!",
      topic: "Kinh nghiệm đồ án",
      mediaUrl: "",
      mediaType: "none",
      visibility: "friends",
      status: "approved",
      priority: "normal",
      moderatorNote: "",
      likes: ["user_1"],
      dislikes: [],
      comments: [
        {
          id: "cmt_103",
          authorId: "user_1",
          content: "Mình đã xem qua cấu trúc JSON rồi, chạy rất mượt nhé.",
          mediaUrl: "",
          mediaType: "none",
          createdAt: "2026-11-19T14:20:00.000Z",
          replies: []
        }
      ],
      createdAt: "2026-11-19T14:00:00.000Z"
    },
    {
      id: "post_3",
      authorId: "user_1",
      title: "Ghi chú cá nhân: Checklist các câu hỏi vấn đáp môn Lập trình Web",
      content:
        "1. Phân biệt localStorage và sessionStorage.\n2. Cách hoạt động của Event Delegation trong DOM.\n3. Sự khác nhau giữa == và === trong JavaScript.",
      topic: "Tài liệu ôn thi",
      mediaUrl: "",
      mediaType: "none",
      visibility: "onlyme",
      status: "approved",
      priority: "normal",
      moderatorNote: "",
      likes: [],
      dislikes: [],
      comments: [],
      createdAt: "2026-11-19T16:45:00.000Z"
    },
    {
      id: "post_4",
      authorId: "user_3",
      title: "Video hướng dẫn thao tác mảng với filter, map, reduce trong 10 phút",
      content:
        "Mình mới tìm được video giải thích rất trực quan về các hàm xử lý mảng ES6, cực kỳ cần thiết khi làm chức năng lọc và thống kê dữ liệu.",
      topic: "JavaScript cơ bản",
      mediaUrl: "https://www.youtube.com/embed/W6NZfCO5SIk",
      mediaType: "video",
      visibility: "public",
      status: "pending", // Bài mới chờ Admin duyệt (ưu tiên thường)
      priority: "normal",
      moderatorNote: "",
      likes: [],
      dislikes: [],
      comments: [],
      createdAt: "2026-11-20T09:10:00.000Z"
    },
    {
      id: "post_5",
      authorId: "user_2",
      title: "Chia sẻ khóa học làm web siêu tốc không cần viết code",
      content:
        "Tham khảo ngay công cụ kéo thả tự động tại liên kết bên ngoài để hoàn thành bài tập lớn trong 5 phút.",
      topic: "Kinh nghiệm đồ án",
      mediaUrl: "",
      mediaType: "none",
      visibility: "public",
      status: "pending", // Đang bị báo cáo vi phạm -> ưu tiên cao (high)
      priority: "high",
      moderatorNote: "",
      likes: [],
      dislikes: ["user_1"],
      comments: [],
      createdAt: "2026-11-20T11:00:00.000Z"
    },
    {
      id: "post_6",
      authorId: "user_3",
      title: "Hỏi bài tập DOM",
      content: "Cho mình hỏi tại sao hàm querySelector của mình trả về null?",
      topic: "DOM & LocalStorage",
      mediaUrl: "",
      mediaType: "none",
      visibility: "public",
      status: "needs_edit", // Yêu cầu tác giả chỉnh sửa
      priority: "normal",
      moderatorNote: "Vui lòng bổ sung đoạn mã HTML/JS gặp lỗi để mọi người dễ hỗ trợ.",
      likes: [],
      dislikes: [],
      comments: [],
      createdAt: "2026-11-20T13:30:00.000Z"
    }
  ];

  // 4. Dữ liệu mẫu Tài liệu học tập (Đầy đủ topic, likes, dislikes, savedBy)
  const defaultResources = [
    {
      id: "res_1",
      authorId: "user_1",
      title: "Giáo trình tóm tắt HTML5 & CSS3 cơ bản (PDF nội bộ)",
      description:
        "Tài liệu hệ thống hóa các thẻ ngữ nghĩa HTML5, mô hình Box Model, Flexbox và Media Queries phục vụ ôn tập thực hành.",
      topic: "HTML & CSS",
      fileLink: "assets/docs/tai-lieu-html-css.pdf",
      visibility: "public",
      status: "approved",
      priority: "normal",
      moderatorNote: "",
      likes: ["user_2", "user_3", "user_admin"],
      dislikes: [],
      savedBy: ["user_2", "user_3"],
      createdAt: "2026-11-17T10:00:00.000Z"
    },
    {
      id: "res_2",
      authorId: "user_2",
      title: "Tài liệu tra cứu JavaScript chuẩn MDN Web Docs",
      description:
        "Nguồn tài liệu chính thống giải thích chi tiết cú pháp ES6, đối tượng Window, DOM API và Web Storage.",
      topic: "JavaScript cơ bản",
      fileLink: "https://developer.mozilla.org/vi/docs/Web/JavaScript",
      visibility: "public",
      status: "approved",
      priority: "normal",
      moderatorNote: "",
      likes: ["user_1", "user_admin"],
      dislikes: [],
      savedBy: ["user_1"],
      createdAt: "2026-11-18T15:20:00.000Z"
    },
    {
      id: "res_3",
      authorId: "user_1",
      title: "Hướng dẫn chi tiết LocalStorage & JSON.stringify/parse",
      description:
        "Ví dụ thực tế về lưu trữ mảng đối tượng trong trình duyệt (Chia sẻ phạm vi bạn bè).",
      topic: "DOM & LocalStorage",
      fileLink: "https://javascript.info/localstorage",
      visibility: "friends",
      status: "approved",
      priority: "normal",
      moderatorNote: "",
      likes: ["user_2"],
      dislikes: [],
      savedBy: ["user_2"],
      createdAt: "2026-11-19T11:40:00.000Z"
    },
    {
      id: "res_4",
      authorId: "user_3",
      title: "Bộ câu hỏi trắc nghiệm ôn tập HTML/CSS/JS",
      description:
        "Tổng hợp 50 câu hỏi trắc nghiệm kiểm tra kiến thức nền tảng trước kỳ thi cuối kỳ.",
      topic: "Tài liệu ôn thi",
      fileLink: "https://www.w3schools.com/js/js_quiz.asp",
      visibility: "public",
      status: "pending",
      priority: "normal",
      moderatorNote: "",
      likes: [],
      dislikes: [],
      savedBy: [],
      createdAt: "2026-11-20T14:15:00.000Z"
    }
  ];

  // 5. Dữ liệu mẫu Báo cáo vi phạm
  const defaultReports = [
    {
      id: "rep_1",
      reporterId: "user_1",
      targetType: "post", // "post" | "resource"
      targetId: "post_5",
      reason: "Nội dung quảng cáo công cụ làm web tự động, không phù hợp tiêu chí học thuật.",
      status: "pending", // "pending" | "resolved"
      createdAt: "2026-11-20T11:15:00.000Z"
    },
    {
      id: "rep_2",
      reporterId: "user_2",
      targetType: "resource",
      targetId: "res_1",
      reason: "Nhờ quản trị viên kiểm tra giúp liên kết tải file PDF.",
      status: "resolved",
      createdAt: "2026-11-18T12:00:00.000Z"
    }
  ];

  // Chỉ khởi tạo nếu khóa chưa tồn tại trong localStorage
  if (!localStorage.getItem(KEYS.USERS)) {
    localStorage.setItem(KEYS.USERS, JSON.stringify(defaultUsers));
  }
  if (!localStorage.getItem(KEYS.TOPICS)) {
    localStorage.setItem(KEYS.TOPICS, JSON.stringify(defaultTopics));
  }
  if (!localStorage.getItem(KEYS.POSTS)) {
    localStorage.setItem(KEYS.POSTS, JSON.stringify(defaultPosts));
  }
  if (!localStorage.getItem(KEYS.RESOURCES)) {
    localStorage.setItem(KEYS.RESOURCES, JSON.stringify(defaultResources));
  }
  if (!localStorage.getItem(KEYS.REPORTS)) {
    localStorage.setItem(KEYS.REPORTS, JSON.stringify(defaultReports));
  }

  // Cung cấp hàm tiện ích để khôi phục dữ liệu mẫu khi cần demo/test
  window.resetAllMockData = function () {
    Object.values(KEYS).forEach(function (key) {
      localStorage.removeItem(key);
    });
    initMockData();
  };
})();