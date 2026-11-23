/**
 * js/auth.js
 * Xử lý Đăng ký, Đăng nhập, Đăng xuất, Cập nhật hồ sơ,
 * Phân quyền hiển thị giao diện theo vai trò ("admin" / "user" / khách thăm)
 * và chặn thao tác yêu cầu đăng nhập.
 */

const AuthModule = (function () {
  // =========================================================================
  // 1. HỆ THỐNG THÔNG BÁO NHANH (TOAST NOTIFICATION) DÙNG CHUNG TOÀN SITE
  // =========================================================================

  function showToast(message, type, actionText, actionHref) {
    const toastType = type || "info"; // "success" | "error" | "warning" | "info"
    let container = document.getElementById("appToastContainer");

    if (!container) {
      container = document.createElement("div");
      container.id = "appToastContainer";
      container.style.cssText =
        "position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:360px;";
      document.body.appendChild(container);
    }

    const bgColors = {
      success: "#16a34a",
      error: "#dc2626",
      warning: "#d97706",
      info: "#0284c7"
    };

    const toast = document.createElement("div");
    toast.className = "app-toast app-toast-" + toastType;
    toast.style.cssText =
      "background:" +
      (bgColors[toastType] || bgColors.info) +
      ";color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.16);font-size:14px;line-height:1.45;display:flex;align-items:center;justify-content:space-between;gap:12px;animation:fadeIn 0.2s ease;";

    const textSpan = document.createElement("span");
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    if (actionText && actionHref) {
      const link = document.createElement("a");
      link.href = actionHref;
      link.textContent = actionText;
      link.style.cssText =
        "color:#fff;font-weight:700;text-decoration:underline;white-space:nowrap;";
      toast.appendChild(link);
    }

    container.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3800);
  }

  // =========================================================================
  // 2. XỬ LÝ ĐĂNG KÝ, ĐĂNG NHẬP, ĐĂNG XUẤT & CẬP NHẬT HỒ SƠ
  // =========================================================================

  /**
   * Đăng ký tài khoản mới (mặc định role: "user")
   */
  function register(payload) {
    const fullName = (payload.fullName || "").trim();
    const username = (payload.username || "").trim().toLowerCase();
    const password = (payload.password || "").trim();
    const confirmPassword = payload.confirmPassword !== undefined ? payload.confirmPassword.trim() : password;

    if (!fullName || !username || !password) {
      return { ok: false, message: "Vui lòng nhập đầy đủ họ tên, tên đăng nhập và mật khẩu." };
    }

    if (username.length < 3 || !/^[a-z0-9_]+$/.test(username)) {
      return {
        ok: false,
        message: "Tên đăng nhập từ 3 ký tự trở lên, chỉ gồm chữ thường, số hoặc dấu gạch dưới."
      };
    }

    if (password.length < 6) {
      return { ok: false, message: "Mật khẩu phải có ít nhất 6 ký tự." };
    }

    if (password !== confirmPassword) {
      return { ok: false, message: "Mật khẩu xác nhận không khớp." };
    }

    const users = StorageDB.getUsers();
    const existed = users.some(function (u) {
      return u.username.toLowerCase() === username;
    });

    if (existed) {
      return { ok: false, message: "Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác." };
    }

    const newUser = {
      id: StorageDB.generateId("user"),
      username: username,
      password: password,
      fullName: fullName,
      avatar: (payload.avatar || "").trim() || "assets/images/default-avatar.png",
      role: "user",
      friends: [],
      friendRequests: []
    };

    users.push(newUser);
    StorageDB.saveUsers(users);
    StorageDB.setCurrentUser(newUser);

    return { ok: true, message: "Đăng ký tài khoản thành công!", user: newUser };
  }

  /**
   * Đăng nhập hệ thống
   */
  function login(usernameInput, passwordInput) {
    const username = (usernameInput || "").trim().toLowerCase();
    const password = (passwordInput || "").trim();

    if (!username || !password) {
      return { ok: false, message: "Vui lòng nhập tên đăng nhập và mật khẩu." };
    }

    const users = StorageDB.getUsers();
    const matchedUser = users.find(function (u) {
      return u.username.toLowerCase() === username && u.password === password;
    });

    if (!matchedUser) {
      return { ok: false, message: "Sai tên đăng nhập hoặc mật khẩu." };
    }

    StorageDB.setCurrentUser(matchedUser);
    return { ok: true, message: "Đăng nhập thành công!", user: matchedUser };
  }

  /**
   * Đăng xuất và điều hướng về trang chủ hoặc trang đăng nhập
   */
  function logout(redirectUrl) {
    StorageDB.clearCurrentUser();
    showToast("Đã đăng xuất khỏi hệ thống.", "info");
    setTimeout(function () {
      window.location.href = redirectUrl || "index.html";
    }, 350);
  }

  /**
   * Cập nhật hồ sơ người dùng đang đăng nhập
   */
  function updateProfile(payload) {
    const currentUser = StorageDB.getCurrentUser();
    if (!currentUser) {
      return { ok: false, message: "Bạn cần đăng nhập để thực hiện thao tác này." };
    }

    const fullName = (payload.fullName || "").trim();
    const avatar = (payload.avatar || "").trim();
    const newPassword = (payload.newPassword || "").trim();

    if (!fullName) {
      return { ok: false, message: "Họ và tên không được để trống." };
    }

    if (newPassword && newPassword.length < 6) {
      return { ok: false, message: "Mật khẩu mới phải có ít nhất 6 ký tự." };
    }

    const updatedData = {
      id: currentUser.id,
      fullName: fullName,
      avatar: avatar || currentUser.avatar || "assets/images/default-avatar.png"
    };

    if (newPassword) {
      updatedData.password = newPassword;
    }

    const success = StorageDB.updateUser(updatedData);
    if (!success) {
      return { ok: false, message: "Không thể cập nhật thông tin. Vui lòng thử lại." };
    }

    applyAuthUI();
    return {
      ok: true,
      message: "Cập nhật thông tin cá nhân thành công!",
      user: StorageDB.getCurrentUser()
    };
  }

  // =========================================================================
  // 3. KIỂM TRA QUYỀN TRUY CẬP & CHẶN THAO TÁC CỦA KHÁCH THĂM
  // =========================================================================

  /**
   * Dùng cho các hành động yêu cầu đăng nhập (Like, Bình luận, Đăng bài, Lưu tài liệu, Kết bạn...)
   * Trả về object user hiện tại nếu hợp lệ, ngược lại hiện thông báo yêu cầu đăng nhập và trả về null.
   */
  function requireAuth(actionLabel) {
    const currentUser = StorageDB.getCurrentUser();
    if (currentUser) {
      return currentUser;
    }

    const label = actionLabel ? " để " + actionLabel : "";
    showToast(
      "Bạn đang ở chế độ Khách thăm. Vui lòng đăng nhập" + label + ".",
      "warning",
      "Đăng nhập ngay",
      "auth.html"
    );
    return null;
  }

  /**
   * Bảo vệ các trang yêu cầu đăng nhập hoặc yêu cầu quyền Admin
   */
  function enforcePageAccess() {
    const path = window.location.pathname.toLowerCase();
    const currentUser = StorageDB.getCurrentUser();

    // Trang kiểm duyệt chỉ dành cho Admin
    if (path.endsWith("admin.html")) {
      if (!currentUser) {
        alert("Vui lòng đăng nhập bằng tài khoản Quản trị viên (Admin) để truy cập trang này.");
        window.location.href = "auth.html";
        return false;
      }
      if (currentUser.role !== "admin") {
        alert("Bạn không có quyền truy cập trang Kiểm duyệt của Quản trị viên.");
        window.location.href = "index.html";
        return false;
      }
    }

    // Trang hồ sơ cá nhân yêu cầu đăng nhập
    if (path.endsWith("profile.html") && !currentUser) {
      alert("Vui lòng đăng nhập để xem và quản lý hồ sơ cá nhân.");
      window.location.href = "auth.html";
      return false;
    }

    return true;
  }

  // =========================================================================
  // 4. CẬP NHẬT GIAO DIỆN THEO VAI TRÒ (HEADER / NAV / SIDEBAR)
  // =========================================================================

  function applyAuthUI() {
    const currentUser = StorageDB.getCurrentUser();
    const isLogged = Boolean(currentUser);
    const isAdminRole = Boolean(currentUser && currentUser.role === "admin");

    // Ẩn/hiện các khối giao diện theo thuộc tính data-auth và data-role
    document.querySelectorAll('[data-auth="guest"]').forEach(function (el) {
      el.style.display = isLogged ? "none" : "";
    });

    document.querySelectorAll('[data-auth="user"]').forEach(function (el) {
      el.style.display = isLogged ? "" : "none";
    });

    document.querySelectorAll('[data-role="admin"]').forEach(function (el) {
      el.style.display = isAdminRole ? "" : "none";
    });

    // Cập nhật thông tin người dùng trên thanh điều hướng / widget cá nhân
    if (currentUser) {
      document.querySelectorAll(".js-current-user-name").forEach(function (el) {
        el.textContent = currentUser.fullName;
      });

      document.querySelectorAll(".js-current-user-role").forEach(function (el) {
        el.textContent = isAdminRole ? "Quản trị viên (Admin)" : "Thành viên";
      });

      document.querySelectorAll(".js-current-user-avatar").forEach(function (el) {
        el.src = currentUser.avatar || "assets/images/default-avatar.png";
        el.alt = currentUser.fullName;
      });

      // Hiển thị số lượng lời mời kết bạn chờ duyệt (nếu có badge)
      const requestCount = Array.isArray(currentUser.friendRequests)
        ? currentUser.friendRequests.length
        : 0;
      document.querySelectorAll(".js-friend-request-badge").forEach(function (el) {
        el.textContent = requestCount;
        el.style.display = requestCount > 0 ? "inline-block" : "none";
      });
    }
  }

  // =========================================================================
  // 5. GẮN SỰ KIỆN CHO TRANG ĐĂNG NHẬP / ĐĂNG KÝ (auth.html) & NÚT ĐĂNG XUẤT
  // =========================================================================

  function bindAuthEvents() {
    // Nút đăng xuất dùng chung ở mọi trang
    document.querySelectorAll(".js-logout-btn, #logoutBtn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        logout("index.html");
      });
    });

    // Form Đăng nhập (auth.html)
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const username = (loginForm.querySelector('[name="username"]') || {}).value;
        const password = (loginForm.querySelector('[name="password"]') || {}).value;
        const errorBox = document.getElementById("loginError");

        const result = login(username, password);
        if (!result.ok) {
          if (errorBox) {
            errorBox.textContent = result.message;
            errorBox.style.display = "block";
          } else {
            showToast(result.message, "error");
          }
          return;
        }

        if (errorBox) errorBox.style.display = "none";
        showToast(result.message, "success");

        setTimeout(function () {
          window.location.href = result.user.role === "admin" ? "admin.html" : "index.html";
        }, 400);
      });
    }

    // Form Đăng ký (auth.html)
    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
      registerForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const fullName = (registerForm.querySelector('[name="fullName"]') || {}).value;
        const username = (registerForm.querySelector('[name="username"]') || {}).value;
        const password = (registerForm.querySelector('[name="password"]') || {}).value;
        const confirmInput = registerForm.querySelector('[name="confirmPassword"]');
        const avatarInput = registerForm.querySelector('[name="avatar"]');
        const errorBox = document.getElementById("registerError");

        const result = register({
          fullName: fullName,
          username: username,
          password: password,
          confirmPassword: confirmInput ? confirmInput.value : password,
          avatar: avatarInput ? avatarInput.value : ""
        });

        if (!result.ok) {
          if (errorBox) {
            errorBox.textContent = result.message;
            errorBox.style.display = "block";
          } else {
            showToast(result.message, "error");
          }
          return;
        }

        if (errorBox) errorBox.style.display = "none";
        showToast(result.message, "success");

        setTimeout(function () {
          window.location.href = "index.html";
        }, 400);
      });
    }

    // Form Cập nhật hồ sơ (profile.html)
    const profileForm = document.getElementById("profileForm");
    if (profileForm) {
      const currentUser = StorageDB.getCurrentUser();
      if (currentUser) {
        const nameField = profileForm.querySelector('[name="fullName"]');
        const avatarField = profileForm.querySelector('[name="avatar"]');
        const usernameField = profileForm.querySelector('[name="username"]');
        if (nameField) nameField.value = currentUser.fullName || "";
        if (avatarField) avatarField.value = currentUser.avatar || "";
        if (usernameField) usernameField.value = currentUser.username || "";
      }

      profileForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const fullName = (profileForm.querySelector('[name="fullName"]') || {}).value;
        const avatar = (profileForm.querySelector('[name="avatar"]') || {}).value;
        const newPasswordField = profileForm.querySelector('[name="newPassword"]');

        const result = updateProfile({
          fullName: fullName,
          avatar: avatar,
          newPassword: newPasswordField ? newPasswordField.value : ""
        });

        if (!result.ok) {
          showToast(result.message, "error");
          return;
        }

        if (newPasswordField) newPasswordField.value = "";
        showToast(result.message, "success");
        document.dispatchEvent(new CustomEvent("profile:updated", { detail: result.user }));
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!enforcePageAccess()) return;
    applyAuthUI();
    bindAuthEvents();
  });

  return {
    showToast: showToast,
    register: register,
    login: login,
    logout: logout,
    updateProfile: updateProfile,
    requireAuth: requireAuth,
    enforcePageAccess: enforcePageAccess,
    applyAuthUI: applyAuthUI
  };
})();