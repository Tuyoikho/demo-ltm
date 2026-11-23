/**
 * js/friends.js
 * Quản lý Luồng Kết nối & Bạn bè:
 * - Tìm kiếm người dùng theo họ tên hoặc tên đăng nhập
 * - Gửi lời mời kết bạn, hủy lời mời đã gửi
 * - Chấp nhận / Từ chối lời mời kết bạn đến (cập nhật đồng thời mảng friends của cả 2 bên)
 * - Hủy kết bạn và cập nhật quyền xem nội dung phạm vi "friends"
 */

const FriendsModule = (function () {
  // =========================================================================
  // 1. LOGIC NGHIỆP VỤ KẾT BẠN
  // =========================================================================

  /**
   * Xác định trạng thái quan hệ giữa currentUser và targetUserId:
   * "guest" | "self" | "friends" | "request_sent" | "request_received" | "none"
   */
  function getRelationshipStatus(targetUserId) {
    const currentUser = StorageDB.getCurrentUser();
    if (!currentUser) return "guest";
    if (currentUser.id === targetUserId) return "self";

    const targetUser = StorageDB.getUserById(targetUserId);
    if (!targetUser) return "none";

    const myFriends = Array.isArray(currentUser.friends) ? currentUser.friends : [];
    if (myFriends.includes(targetUserId)) {
      return "friends";
    }

    const myIncoming = Array.isArray(currentUser.friendRequests)
      ? currentUser.friendRequests
      : [];
    if (myIncoming.includes(targetUserId)) {
      return "request_received";
    }

    const targetIncoming = Array.isArray(targetUser.friendRequests)
      ? targetUser.friendRequests
      : [];
    if (targetIncoming.includes(currentUser.id)) {
      return "request_sent";
    }

    return "none";
  }

  /**
   * Tìm kiếm người dùng (loại trừ bản thân)
   */
  function searchUsers(keyword) {
    const currentUser = StorageDB.getCurrentUser();
    const kw = (keyword || "").trim().toLowerCase();

    return StorageDB.getUsers().filter(function (u) {
      if (currentUser && u.id === currentUser.id) return false;
      if (!kw) return true;
      return (
        u.fullName.toLowerCase().includes(kw) ||
        u.username.toLowerCase().includes(kw)
      );
    });
  }

  /**
   * Gửi lời mời kết bạn tới targetUserId
   */
  function sendFriendRequest(targetUserId) {
    const currentUser = AuthModule.requireAuth("gửi lời mời kết bạn");
    if (!currentUser) return { ok: false };

    if (currentUser.id === targetUserId) {
      return { ok: false, message: "Không thể tự gửi lời mời kết bạn cho chính mình." };
    }

    const users = StorageDB.getUsers();
    const meIndex = users.findIndex(function (u) {
      return u.id === currentUser.id;
    });
    const targetIndex = users.findIndex(function (u) {
      return u.id === targetUserId;
    });

    if (meIndex === -1 || targetIndex === -1) {
      return { ok: false, message: "Không tìm thấy người dùng." };
    }

    const me = users[meIndex];
    const target = users[targetIndex];

    me.friends = Array.isArray(me.friends) ? me.friends : [];
    me.friendRequests = Array.isArray(me.friendRequests) ? me.friendRequests : [];
    target.friendRequests = Array.isArray(target.friendRequests) ? target.friendRequests : [];

    if (me.friends.includes(targetUserId)) {
      return { ok: false, message: "Hai bạn đã là bạn bè." };
    }

    // Nếu đối phương đã gửi lời mời trước đó -> Tự động chấp nhận kết bạn luôn
    if (me.friendRequests.includes(targetUserId)) {
      return acceptFriendRequest(targetUserId);
    }

    if (target.friendRequests.includes(currentUser.id)) {
      return { ok: false, message: "Bạn đã gửi lời mời kết bạn cho người này rồi." };
    }

    target.friendRequests.push(currentUser.id);
    users[targetIndex] = target;
    StorageDB.saveUsers(users);

    return {
      ok: true,
      message: "Đã gửi lời mời kết bạn tới " + target.fullName + "."
    };
  }

  /**
   * Hủy lời mời kết bạn đã gửi
   */
  function cancelFriendRequest(targetUserId) {
    const currentUser = AuthModule.requireAuth("hủy lời mời kết bạn");
    if (!currentUser) return { ok: false };

    const users = StorageDB.getUsers();
    const targetIndex = users.findIndex(function (u) {
      return u.id === targetUserId;
    });
    if (targetIndex === -1) return { ok: false };

    const target = users[targetIndex];
    target.friendRequests = (target.friendRequests || []).filter(function (id) {
      return id !== currentUser.id;
    });

    users[targetIndex] = target;
    StorageDB.saveUsers(users);
    return { ok: true, message: "Đã hủy lời mời kết bạn." };
  }

  /**
   * Chấp nhận lời mời kết bạn từ senderId -> Xác lập quan hệ bạn bè 2 chiều
   */
  function acceptFriendRequest(senderId) {
    const currentUser = AuthModule.requireAuth("chấp nhận lời mời kết bạn");
    if (!currentUser) return { ok: false };

    const users = StorageDB.getUsers();
    const meIndex = users.findIndex(function (u) {
      return u.id === currentUser.id;
    });
    const senderIndex = users.findIndex(function (u) {
      return u.id === senderId;
    });

    if (meIndex === -1 || senderIndex === -1) {
      return { ok: false, message: "Không tìm thấy thông tin người dùng." };
    }

    const me = users[meIndex];
    const sender = users[senderIndex];

    me.friends = Array.isArray(me.friends) ? me.friends : [];
    me.friendRequests = Array.isArray(me.friendRequests) ? me.friendRequests : [];
    sender.friends = Array.isArray(sender.friends) ? sender.friends : [];
    sender.friendRequests = Array.isArray(sender.friendRequests) ? sender.friendRequests : [];

    // Gỡ lời mời ở cả hai phía
    me.friendRequests = me.friendRequests.filter(function (id) {
      return id !== senderId;
    });
    sender.friendRequests = sender.friendRequests.filter(function (id) {
      return id !== currentUser.id;
    });

    // Thêm vào danh sách bạn bè của cả hai phía
    if (!me.friends.includes(senderId)) {
      me.friends.push(senderId);
    }
    if (!sender.friends.includes(currentUser.id)) {
      sender.friends.push(currentUser.id);
    }

    users[meIndex] = me;
    users[senderIndex] = sender;
    StorageDB.saveUsers(users);

    return {
      ok: true,
      message: "Bạn và " + sender.fullName + " đã trở thành bạn bè!"
    };
  }

  /**
   * Từ chối lời mời kết bạn từ senderId
   */
  function rejectFriendRequest(senderId) {
    const currentUser = AuthModule.requireAuth("từ chối lời mời kết bạn");
    if (!currentUser) return { ok: false };

    const users = StorageDB.getUsers();
    const meIndex = users.findIndex(function (u) {
      return u.id === currentUser.id;
    });
    if (meIndex === -1) return { ok: false };

    const me = users[meIndex];
    me.friendRequests = (me.friendRequests || []).filter(function (id) {
      return id !== senderId;
    });

    users[meIndex] = me;
    StorageDB.saveUsers(users);
    return { ok: true, message: "Đã từ chối lời mời kết bạn." };
  }

  /**
   * Hủy kết bạn với friendId
   */
  function unfriend(friendId) {
    const currentUser = AuthModule.requireAuth("hủy kết bạn");
    if (!currentUser) return { ok: false };

    const users = StorageDB.getUsers();
    const meIndex = users.findIndex(function (u) {
      return u.id === currentUser.id;
    });
    const friendIndex = users.findIndex(function (u) {
      return u.id === friendId;
    });

    if (meIndex === -1 || friendIndex === -1) return { ok: false };

    users[meIndex].friends = (users[meIndex].friends || []).filter(function (id) {
      return id !== friendId;
    });
    users[friendIndex].friends = (users[friendIndex].friends || []).filter(function (id) {
      return id !== currentUser.id;
    });

    StorageDB.saveUsers(users);
    return {
      ok: true,
      message: "Đã hủy kết bạn với " + users[friendIndex].fullName + "."
    };
  }

  // =========================================================================
  // 2. RENDER GIAO DIỆN KẾT NỐI (LỜI MỜI, DANH SÁCH BẠN BÈ, TÌM KIẾM)
  // =========================================================================

  function renderActionButtonsHTML(targetUserId) {
    const status = getRelationshipStatus(targetUserId);

    if (status === "guest") {
      return (
        '<button type="button" class="btn btn-sm btn-outline js-send-friend-req" data-user-id="' +
        targetUserId +
        '">+ Kết bạn</button>'
      );
    }

    if (status === "friends") {
      return (
        '<span class="badge badge-friends">Bạn bè</span> ' +
        '<button type="button" class="btn btn-sm btn-danger-outline js-unfriend" data-user-id="' +
        targetUserId +
        '">Hủy kết bạn</button>'
      );
    }

    if (status === "request_sent") {
      return (
        '<button type="button" class="btn btn-sm btn-outline js-cancel-friend-req" data-user-id="' +
        targetUserId +
        '">Đã gửi lời mời (Hủy)</button>'
      );
    }

    if (status === "request_received") {
      return (
        '<button type="button" class="btn btn-sm btn-primary js-accept-friend-req" data-user-id="' +
        targetUserId +
        '">Chấp nhận</button> ' +
        '<button type="button" class="btn btn-sm btn-outline js-reject-friend-req" data-user-id="' +
        targetUserId +
        '">Từ chối</button>'
      );
    }

    return (
      '<button type="button" class="btn btn-sm btn-primary js-send-friend-req" data-user-id="' +
      targetUserId +
      '">+ Kết bạn</button>'
    );
  }

  /**
   * Render danh sách lời mời kết bạn đang chờ duyệt (profile.html)
   */
  function renderFriendRequests(containerId) {
    const container = document.getElementById(containerId || "friendRequestsContainer");
    if (!container) return;

    const currentUser = StorageDB.getCurrentUser();
    if (!currentUser) {
      container.innerHTML = "";
      return;
    }

    const requestIds = Array.isArray(currentUser.friendRequests)
      ? currentUser.friendRequests
      : [];

    if (requestIds.length === 0) {
      container.innerHTML = '<p class="text-muted">Không có lời mời kết bạn nào đang chờ.</p>';
      return;
    }

    container.innerHTML =
      '<ul class="user-list">' +
      requestIds
        .map(function (senderId) {
          const sender = StorageDB.getUserById(senderId);
          if (!sender) return "";
          return (
            '<li class="user-list-item">' +
            '<div class="user-item-info">' +
            '<img class="avatar-sm" src="' +
            StorageDB.escapeHTML(sender.avatar) +
            '" alt="' +
            StorageDB.escapeHTML(sender.fullName) +
            '">' +
            "<div>" +
            "<strong>" +
            StorageDB.escapeHTML(sender.fullName) +
            "</strong>" +
            '<small class="d-block text-muted">@' +
            StorageDB.escapeHTML(sender.username) +
            "</small>" +
            "</div>" +
            "</div>" +
            '<div class="user-item-actions">' +
            '<button type="button" class="btn btn-sm btn-primary js-accept-friend-req" data-user-id="' +
            sender.id +
            '">Chấp nhận</button>' +
            '<button type="button" class="btn btn-sm btn-outline js-reject-friend-req" data-user-id="' +
            sender.id +
            '">Từ chối</button>' +
            "</div>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
  }

  /**
   * Render danh sách bạn bè hiện tại (profile.html)
   */
  function renderFriendsList(containerId) {
    const container = document.getElementById(containerId || "friendsListContainer");
    if (!container) return;

    const currentUser = StorageDB.getCurrentUser();
    if (!currentUser) {
      container.innerHTML = "";
      return;
    }

    const friendIds = Array.isArray(currentUser.friends) ? currentUser.friends : [];
    if (friendIds.length === 0) {
      container.innerHTML =
        '<p class="text-muted">Bạn chưa kết nối với thành viên nào. Hãy tìm kiếm bạn học bên dưới!</p>';
      return;
    }

    container.innerHTML =
      '<ul class="user-list">' +
      friendIds
        .map(function (friendId) {
          const friend = StorageDB.getUserById(friendId);
          if (!friend) return "";
          return (
            '<li class="user-list-item">' +
            '<div class="user-item-info">' +
            '<img class="avatar-sm" src="' +
            StorageDB.escapeHTML(friend.avatar) +
            '" alt="' +
            StorageDB.escapeHTML(friend.fullName) +
            '">' +
            "<div>" +
            "<strong>" +
            StorageDB.escapeHTML(friend.fullName) +
            "</strong>" +
            '<small class="d-block text-muted">@' +
            StorageDB.escapeHTML(friend.username) +
            "</small>" +
            "</div>" +
            "</div>" +
            '<div class="user-item-actions">' +
            '<button type="button" class="btn btn-sm btn-danger-outline js-unfriend" data-user-id="' +
            friend.id +
            '">Hủy kết bạn</button>' +
            "</div>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
  }

  /**
   * Render danh sách tìm kiếm thành viên / gợi ý kết bạn (index.html & profile.html)
   */
  function renderUserDiscovery(containerId, keyword) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const matchedUsers = searchUsers(keyword);
    if (matchedUsers.length === 0) {
      container.innerHTML = '<p class="text-muted">Không tìm thấy thành viên phù hợp.</p>';
      return;
    }

    container.innerHTML =
      '<ul class="user-list">' +
      matchedUsers
        .map(function (user) {
          const roleLabel = user.role === "admin" ? " • Admin" : "";
          return (
            '<li class="user-list-item">' +
            '<div class="user-item-info">' +
            '<img class="avatar-sm" src="' +
            StorageDB.escapeHTML(user.avatar) +
            '" alt="' +
            StorageDB.escapeHTML(user.fullName) +
            '">' +
            "<div>" +
            "<strong>" +
            StorageDB.escapeHTML(user.fullName) +
            "</strong>" +
            '<small class="d-block text-muted">@' +
            StorageDB.escapeHTML(user.username) +
            roleLabel +
            "</small>" +
            "</div>" +
            "</div>" +
            '<div class="user-item-actions">' +
            renderActionButtonsHTML(user.id) +
            "</div>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
  }

  function refreshAllFriendViews() {
    if (typeof AuthModule !== "undefined" && AuthModule.applyAuthUI) {
      AuthModule.applyAuthUI();
    }

    renderFriendRequests("friendRequestsContainer");
    renderFriendsList("friendsListContainer");

    const searchInput = document.getElementById("userSearchInput");
    const kw = searchInput ? searchInput.value : "";
    renderUserDiscovery("userSearchResults", kw);
    renderUserDiscovery("friendSuggestionsList", kw);

    // Cập nhật lại bảng tin & tài liệu vì quan hệ bạn bè quyết định quyền xem nội dung "friends"
    if (typeof PostsModule !== "undefined" && document.getElementById("postsFeedContainer")) {
      PostsModule.renderPostsFeed("postsFeedContainer");
    }
    if (typeof ResourcesModule !== "undefined" && document.getElementById("resourcesContainer")) {
      ResourcesModule.renderResourcesList("resourcesContainer");
    }

    document.dispatchEvent(new CustomEvent("friends:changed"));
  }

  // =========================================================================
  // 3. GẮN SỰ KIỆN TƯƠNG TÁC KẾT BẠN
  // =========================================================================

  function bindFriendEvents() {
    const searchInput = document.getElementById("userSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        renderUserDiscovery("userSearchResults", searchInput.value);
        renderUserDiscovery("friendSuggestionsList", searchInput.value);
      });
    }

    document.addEventListener("click", function (e) {
      const sendBtn = e.target.closest(".js-send-friend-req");
      if (sendBtn) {
        const res = sendFriendRequest(sendBtn.dataset.userId);
        if (res.message) AuthModule.showToast(res.message, res.ok ? "success" : "info");
        if (res.ok) refreshAllFriendViews();
        return;
      }

      const cancelBtn = e.target.closest(".js-cancel-friend-req");
      if (cancelBtn) {
        const res = cancelFriendRequest(cancelBtn.dataset.userId);
        if (res.message) AuthModule.showToast(res.message, res.ok ? "info" : "error");
        if (res.ok) refreshAllFriendViews();
        return;
      }

      const acceptBtn = e.target.closest(".js-accept-friend-req");
      if (acceptBtn) {
        const res = acceptFriendRequest(acceptBtn.dataset.userId);
        if (res.message) AuthModule.showToast(res.message, res.ok ? "success" : "error");
        if (res.ok) refreshAllFriendViews();
        return;
      }

      const rejectBtn = e.target.closest(".js-reject-friend-req");
      if (rejectBtn) {
        const res = rejectFriendRequest(rejectBtn.dataset.userId);
        if (res.message) AuthModule.showToast(res.message, res.ok ? "info" : "error");
        if (res.ok) refreshAllFriendViews();
        return;
      }

      const unfriendBtn = e.target.closest(".js-unfriend");
      if (unfriendBtn) {
        if (!confirm("Bạn có chắc muốn hủy kết bạn với người này?")) return;
        const res = unfriend(unfriendBtn.dataset.userId);
        if (res.message) AuthModule.showToast(res.message, res.ok ? "info" : "error");
        if (res.ok) refreshAllFriendViews();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindFriendEvents();
    refreshAllFriendViews();
  });

  return {
    getRelationshipStatus: getRelationshipStatus,
    searchUsers: searchUsers,
    sendFriendRequest: sendFriendRequest,
    cancelFriendRequest: cancelFriendRequest,
    acceptFriendRequest: acceptFriendRequest,
    rejectFriendRequest: rejectFriendRequest,
    unfriend: unfriend,
    renderFriendRequests: renderFriendRequests,
    renderFriendsList: renderFriendsList,
    renderUserDiscovery: renderUserDiscovery,
    refreshAllFriendViews: refreshAllFriendViews
  };
})();