/**
 * js/storage.js
 * Tầng lõi quản lý đọc/ghi localStorage, phiên đăng nhập hiện tại,
 * kiểm tra quyền hiển thị nội dung (visibility + status) và thống kê chủ đề.
 */

const StorageDB = (function () {
  const KEYS = window.APP_STORAGE_KEYS || {
    USERS: "eduforum_users",
    TOPICS: "eduforum_topics",
    POSTS: "eduforum_posts",
    RESOURCES: "eduforum_resources",
    REPORTS: "eduforum_reports",
    CURRENT_USER: "eduforum_current_user"
  };

  // =========================================================================
  // 1. HÀM ĐỌC / GHI CƠ BẢN & TIỆN ÍCH CHUNG
  // =========================================================================

  function getCollection(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("Lỗi đọc dữ liệu từ localStorage [" + key + "]:", error);
      return [];
    }
  }

  function saveCollection(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("Lỗi ghi dữ liệu vào localStorage [" + key + "]:", error);
      return false;
    }
  }

  function generateId(prefix) {
    const cleanPrefix = prefix || "id";
    return cleanPrefix + "_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
  }

  function escapeHTML(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  // =========================================================================
  // 2. QUẢN LÝ NGƯỜI DÙNG & PHIÊN ĐĂNG NHẬP (CURRENT USER)
  // =========================================================================

  function getUsers() {
    return getCollection(KEYS.USERS);
  }

  function saveUsers(users) {
    return saveCollection(KEYS.USERS, users);
  }

  function getUserById(userId) {
    if (!userId) return null;
    return getUsers().find(function (u) {
      return u.id === userId;
    }) || null;
  }

  function updateUser(updatedUser) {
    if (!updatedUser || !updatedUser.id) return false;
    const users = getUsers();
    const index = users.findIndex(function (u) {
      return u.id === updatedUser.id;
    });
    if (index === -1) return false;

    users[index] = Object.assign({}, users[index], updatedUser);
    const saved = saveUsers(users);

    // Đồng bộ lại thông tin phiên nếu đang cập nhật chính user hiện tại
    const current = getCurrentUser();
    if (saved && current && current.id === updatedUser.id) {
      setCurrentUser(users[index]);
    }
    return saved;
  }

  /**
   * Lấy thông tin người dùng đang đăng nhập.
   * Luôn đối chiếu lại với mảng users mới nhất để đảm bảo danh sách bạn bè,
   * lời mời kết bạn và hồ sơ luôn đồng bộ giữa các tab/trang.
   */
  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(KEYS.CURRENT_USER);
      if (!raw) return null;
      const sessionData = JSON.parse(raw);
      const userId = typeof sessionData === "string" ? sessionData : sessionData.id;
      if (!userId) return null;

      const freshUser = getUserById(userId);
      if (!freshUser) {
        clearCurrentUser();
        return null;
      }
      return freshUser;
    } catch (error) {
      console.error("Lỗi đọc phiên người dùng:", error);
      return null;
    }
  }

  function setCurrentUser(user) {
    if (!user || !user.id) return;
    localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify({ id: user.id }));
  }

  function clearCurrentUser() {
    localStorage.removeItem(KEYS.CURRENT_USER);
  }

  function isLoggedIn() {
    return getCurrentUser() !== null;
  }

  function isAdmin() {
    const user = getCurrentUser();
    return Boolean(user && user.role === "admin");
  }

  // =========================================================================
  // 3. QUẢN LÝ CHỦ ĐỀ (TOPICS) & THỐNG KÊ CHỦ ĐỀ ĐỘNG
  // =========================================================================

  function getTopics() {
    return getCollection(KEYS.TOPICS);
  }

  function saveTopics(topics) {
    return saveCollection(KEYS.TOPICS, topics);
  }

  /**
   * Thêm chủ đề mới nếu chưa tồn tại (không phân biệt hoa thường).
   * Trả về tên chủ đề chuẩn hóa.
   */
  function addTopic(topicName) {
    if (!topicName || typeof topicName !== "string") return "";
    const trimmed = topicName.trim();
    if (!trimmed) return "";

    const topics = getTopics();
    const existing = topics.find(function (t) {
      return t.toLowerCase() === trimmed.toLowerCase();
    });
    if (existing) return existing;

    topics.push(trimmed);
    saveTopics(topics);
    return trimmed;
  }

  /**
   * Tính số liệu thống kê động cho từng chủ đề dựa trên posts và resources đã duyệt:
   * - interestScore (Mức độ quan tâm): Tổng likes + dislikes + comments (kể cả replies)
   * - usefulnessScore (Độ hữu ích): Tổng lượt likes
   */
  function getTopicsWithStats() {
    const topics = getTopics();
    const posts = getPosts().filter(function (p) {
      return p.status === "approved";
    });
    const resources = getResources().filter(function (r) {
      return r.status === "approved";
    });

    return topics.map(function (topicName) {
      const topicPosts = posts.filter(function (p) {
        return p.topic === topicName;
      });
      const topicResources = resources.filter(function (r) {
        return r.topic === topicName;
      });

      let totalLikes = 0;
      let totalDislikes = 0;
      let totalComments = 0;

      topicPosts.forEach(function (post) {
        totalLikes += Array.isArray(post.likes) ? post.likes.length : 0;
        totalDislikes += Array.isArray(post.dislikes) ? post.dislikes.length : 0;
        if (Array.isArray(post.comments)) {
          post.comments.forEach(function (cmt) {
            totalComments += 1 + (Array.isArray(cmt.replies) ? cmt.replies.length : 0);
          });
        }
      });

      topicResources.forEach(function (res) {
        totalLikes += Array.isArray(res.likes) ? res.likes.length : 0;
        totalDislikes += Array.isArray(res.dislikes) ? res.dislikes.length : 0;
      });

      return {
        name: topicName,
        postCount: topicPosts.length,
        resourceCount: topicResources.length,
        totalLikes: totalLikes,
        totalDislikes: totalDislikes,
        totalComments: totalComments,
        interestScore: totalLikes + totalDislikes + totalComments,
        usefulnessScore: totalLikes
      };
    });
  }

  // =========================================================================
  // 4. TRUY XUẤT BÀI THẢO LUẬN, TÀI LIỆU & BÁO CÁO
  // =========================================================================

  function getPosts() {
    return getCollection(KEYS.POSTS);
  }

  function savePosts(posts) {
    return saveCollection(KEYS.POSTS, posts);
  }

  function getPostById(postId) {
    return getPosts().find(function (p) {
      return p.id === postId;
    }) || null;
  }

  function getResources() {
    return getCollection(KEYS.RESOURCES);
  }

  function saveResources(resources) {
    return saveCollection(KEYS.RESOURCES, resources);
  }

  function getResourceById(resourceId) {
    return getResources().find(function (r) {
      return r.id === resourceId;
    }) || null;
  }

  function getReports() {
    return getCollection(KEYS.REPORTS);
  }

  function saveReports(reports) {
    return saveCollection(KEYS.REPORTS, reports);
  }

  function getReportById(reportId) {
    return getReports().find(function (r) {
      return r.id === reportId;
    }) || null;
  }

  // =========================================================================
  // 5. BỘ LỌC PHÂN QUYỀN XEM NỘI DUNG (CORE VISIBILITY & STATUS LOGIC)
  // =========================================================================

  /**
   * Kiểm tra hai người dùng có phải là bạn bè của nhau không.
   */
  function areFriends(userIdA, userIdB) {
    if (!userIdA || !userIdB) return false;
    if (userIdA === userIdB) return true;
    const userA = getUserById(userIdA);
    if (!userA || !Array.isArray(userA.friends)) return false;
    return userA.friends.includes(userIdB);
  }

  /**
   * Kiểm tra người dùng `viewer` có quyền xem một bài viết hoặc tài liệu `item` hay không.
   * Quy tắc nghiệp vụ:
   * 1. Nếu đang ở giao diện kiểm duyệt của Admin (options.isAdminView === true) -> Cho phép xem.
   * 2. Điều kiện trạng thái: item.status === "approved" HOẶC viewer chính là tác giả.
   * 3. Điều kiện phạm vi:
   *    - "public": Ai cũng xem được (kể cả khách thăm chưa đăng nhập).
   *    - "friends": Tác giả hoặc người nằm trong danh sách bạn bè của tác giả.
   *    - "onlyme": Chỉ duy nhất tác giả xem được.
   */
  function canViewItem(item, viewer, options) {
    if (!item) return false;
    const currentViewer = viewer !== undefined ? viewer : getCurrentUser();
    const opts = options || {};

    // Admin trong khu vực kiểm duyệt có toàn quyền xem để xử lý
    if (opts.isAdminView && currentViewer && currentViewer.role === "admin") {
      return true;
    }

    const isAuthor = Boolean(currentViewer && item.authorId === currentViewer.id);

    // Kiểm tra trạng thái kiểm duyệt (bài bị loại bỏ 'rejected' không hiển thị trên bảng tin chung)
    const isStatusAllowed = item.status === "approved" || isAuthor;
    if (!isStatusAllowed) {
      return false;
    }

    // Kiểm tra phạm vi hiển thị (visibility)
    if (item.visibility === "public") {
      return true;
    }

    // Khách thăm (chưa đăng nhập) không được xem nội dung "friends" hoặc "onlyme"
    if (!currentViewer) {
      return false;
    }

    if (isAuthor) {
      return true;
    }

    if (item.visibility === "friends") {
      return areFriends(item.authorId, currentViewer.id);
    }

    // Trường hợp "onlyme" và không phải tác giả
    return false;
  }

  /**
   * Lọc danh sách bài viết hoặc tài liệu theo quyền xem của người dùng.
   */
  function filterVisibleItems(items, viewer, options) {
    if (!Array.isArray(items)) return [];
    const currentViewer = viewer !== undefined ? viewer : getCurrentUser();
    return items.filter(function (item) {
      return canViewItem(item, currentViewer, options);
    });
  }

  /**
   * Kiểm tra quyền chỉnh sửa hoặc xóa nội dung (Tác giả hoặc Admin).
   */
  function canModifyItem(item, viewer) {
    if (!item) return false;
    const currentViewer = viewer !== undefined ? viewer : getCurrentUser();
    if (!currentViewer) return false;
    return item.authorId === currentViewer.id || currentViewer.role === "admin";
  }

  // Export Public API cho các module khác sử dụng
  return {
    KEYS: KEYS,
    getCollection: getCollection,
    saveCollection: saveCollection,
    generateId: generateId,
    escapeHTML: escapeHTML,
    formatDate: formatDate,

    // Users & Auth session
    getUsers: getUsers,
    saveUsers: saveUsers,
    getUserById: getUserById,
    updateUser: updateUser,
    getCurrentUser: getCurrentUser,
    setCurrentUser: setCurrentUser,
    clearCurrentUser: clearCurrentUser,
    isLoggedIn: isLoggedIn,
    isAdmin: isAdmin,

    // Topics & Dynamic stats
    getTopics: getTopics,
    saveTopics: saveTopics,
    addTopic: addTopic,
    getTopicsWithStats: getTopicsWithStats,

    // Entities
    getPosts: getPosts,
    savePosts: savePosts,
    getPostById: getPostById,
    getResources: getResources,
    saveResources: saveResources,
    getResourceById: getResourceById,
    getReports: getReports,
    saveReports: saveReports,
    getReportById: getReportById,

    // Permissions & Visibility
    areFriends: areFriends,
    canViewItem: canViewItem,
    filterVisibleItems: filterVisibleItems,
    canModifyItem: canModifyItem
  };
})();