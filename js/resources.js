/**
 * js/resources.js
 * Quản lý toàn bộ logic Kho tài liệu học tập:
 * - Chia sẻ, Sửa, Xóa, Đổi phạm vi hiển thị tài liệu (URL liên kết hoặc assets/docs/)
 * - Chọn chủ đề có sẵn hoặc thêm chủ đề mới vào danh mục dùng chung
 * - Lọc theo quyền xem (status + visibility), từ khóa, chủ đề & Sắp xếp (Mới nhất, Hữu ích nhất, Quan tâm nhất)
 * - Tương tác Like / Dislike, Lưu tài liệu (savedBy), Mở liên kết tài nguyên & Báo cáo vi phạm
 */

const ResourcesModule = (function () {
  const filterState = {
    keyword: "",
    topic: "all",
    visibility: "all",
    sortBy: "newest", // "newest" | "most_useful" | "most_interested" | "topic_interested"
    onlyAuthorId: null,
    onlySavedByUserId: null
  };

  // =========================================================================
  // 1. CRUD TÀI LIỆU HỌC TẬP
  // =========================================================================

  /**
   * Chia sẻ tài liệu mới -> Trạng thái mặc định "pending" chờ Admin duyệt
   */
  function createResource(payload) {
    const currentUser = AuthModule.requireAuth("chia sẻ tài liệu");
    if (!currentUser) return { ok: false, message: "Chưa đăng nhập." };

    const title = (payload.title || "").trim();
    const description = (payload.description || "").trim();
    const rawTopic = (payload.newTopic || payload.topic || "").trim();
    const fileLink = (payload.fileLink || "").trim();
    const visibility = ["public", "friends", "onlyme"].includes(payload.visibility)
      ? payload.visibility
      : "public";

    if (!title || !description || !rawTopic || !fileLink) {
      return {
        ok: false,
        message: "Vui lòng nhập đầy đủ tiêu đề, chủ đề, mô tả và đường dẫn tài liệu."
      };
    }

    const finalTopic = StorageDB.addTopic(rawTopic);

    const newResource = {
      id: StorageDB.generateId("res"),
      authorId: currentUser.id,
      title: title,
      description: description,
      topic: finalTopic,
      fileLink: fileLink,
      visibility: visibility,
      status: "pending",
      priority: "normal",
      moderatorNote: "",
      likes: [],
      dislikes: [],
      savedBy: [],
      createdAt: new Date().toISOString()
    };

    const resources = StorageDB.getResources();
    resources.unshift(newResource);
    StorageDB.saveResources(resources);

    return {
      ok: true,
      message: "Chia sẻ tài liệu thành công! Tài liệu đang chờ Quản trị viên kiểm duyệt.",
      resource: newResource
    };
  }

  /**
   * Cập nhật thông tin tài liệu (Tác giả hoặc Admin)
   */
  function updateResource(resourceId, payload) {
    const currentUser = AuthModule.requireAuth("chỉnh sửa tài liệu");
    if (!currentUser) return { ok: false, message: "Chưa đăng nhập." };

    const resources = StorageDB.getResources();
    const index = resources.findIndex(function (r) {
      return r.id === resourceId;
    });

    if (index === -1) {
      return { ok: false, message: "Không tìm thấy tài liệu." };
    }

    const resItem = resources[index];
    if (!StorageDB.canModifyItem(resItem, currentUser)) {
      return { ok: false, message: "Bạn không có quyền chỉnh sửa tài liệu này." };
    }

    const title = (payload.title !== undefined ? payload.title : resItem.title).trim();
    const description = (
      payload.description !== undefined ? payload.description : resItem.description
    ).trim();
    const rawTopic = (payload.newTopic || payload.topic || resItem.topic).trim();
    const fileLink = (payload.fileLink !== undefined ? payload.fileLink : resItem.fileLink).trim();
    const visibility = ["public", "friends", "onlyme"].includes(payload.visibility)
      ? payload.visibility
      : resItem.visibility;

    if (!title || !description || !rawTopic || !fileLink) {
      return { ok: false, message: "Vui lòng điền đầy đủ thông tin tài liệu." };
    }

    const finalTopic = StorageDB.addTopic(rawTopic);

    let nextStatus = resItem.status;
    let nextNote = resItem.moderatorNote || "";
    if (
      (resItem.status === "needs_edit" || resItem.status === "rejected") &&
      currentUser.id === resItem.authorId
    ) {
      nextStatus = "pending";
      nextNote = "";
    }

    resources[index] = Object.assign({}, resItem, {
      title: title,
      description: description,
      topic: finalTopic,
      fileLink: fileLink,
      visibility: visibility,
      status: nextStatus,
      moderatorNote: nextNote
    });

    StorageDB.saveResources(resources);
    return {
      ok: true,
      message:
        nextStatus === "pending" && resItem.status !== "pending"
          ? "Đã cập nhật và gửi lại tài liệu để kiểm duyệt!"
          : "Đã cập nhật thông tin tài liệu!",
      resource: resources[index]
    };
  }

  /**
   * Đổi nhanh phạm vi hiển thị tài liệu
   */
  function changeResourceVisibility(resourceId, newVisibility) {
    if (!["public", "friends", "onlyme"].includes(newVisibility)) {
      return { ok: false, message: "Phạm vi hiển thị không hợp lệ." };
    }
    return updateResource(resourceId, { visibility: newVisibility });
  }

  /**
   * Xóa tài liệu (Tác giả hoặc Admin)
   */
  function deleteResource(resourceId) {
    const currentUser = AuthModule.requireAuth("xóa tài liệu");
    if (!currentUser) return { ok: false, message: "Chưa đăng nhập." };

    const resources = StorageDB.getResources();
    const target = resources.find(function (r) {
      return r.id === resourceId;
    });

    if (!target) {
      return { ok: false, message: "Tài liệu không tồn tại." };
    }

    if (!StorageDB.canModifyItem(target, currentUser)) {
      return { ok: false, message: "Bạn không có quyền xóa tài liệu này." };
    }

    StorageDB.saveResources(
      resources.filter(function (r) {
        return r.id !== resourceId;
      })
    );

    // Đánh dấu đã xử lý các báo cáo liên quan đến tài liệu đã xóa
    const updatedReports = StorageDB.getReports().map(function (rep) {
      if (rep.targetType === "resource" && rep.targetId === resourceId && rep.status === "pending") {
        return Object.assign({}, rep, { status: "resolved" });
      }
      return rep;
    });
    StorageDB.saveReports(updatedReports);

    return { ok: true, message: "Đã xóa tài liệu." };
  }

  // =========================================================================
  // 2. TƯƠNG TÁC TÀI LIỆU: LIKE / DISLIKE, LƯU TÀI LIỆU & BÁO CÁO
  // =========================================================================

  /**
   * Toggle Like tài liệu (tự động gỡ Dislike nếu đang Dislike)
   */
  function toggleLike(resourceId) {
    const currentUser = AuthModule.requireAuth("đánh giá hữu ích tài liệu");
    if (!currentUser) return { ok: false };

    const resources = StorageDB.getResources();
    const index = resources.findIndex(function (r) {
      return r.id === resourceId;
    });
    if (index === -1) return { ok: false };

    const resItem = resources[index];
    if (!StorageDB.canViewItem(resItem, currentUser)) {
      AuthModule.showToast("Bạn không có quyền tương tác với tài liệu này.", "error");
      return { ok: false };
    }

    resItem.likes = Array.isArray(resItem.likes) ? resItem.likes : [];
    resItem.dislikes = Array.isArray(resItem.dislikes) ? resItem.dislikes : [];

    const likeIdx = resItem.likes.indexOf(currentUser.id);
    if (likeIdx > -1) {
      resItem.likes.splice(likeIdx, 1);
    } else {
      resItem.likes.push(currentUser.id);
      const dislikeIdx = resItem.dislikes.indexOf(currentUser.id);
      if (dislikeIdx > -1) {
        resItem.dislikes.splice(dislikeIdx, 1);
      }
    }

    resources[index] = resItem;
    StorageDB.saveResources(resources);
    return { ok: true, resource: resItem };
  }

  /**
   * Toggle Dislike tài liệu (tự động gỡ Like nếu đang Like)
   */
  function toggleDislike(resourceId) {
    const currentUser = AuthModule.requireAuth("bày tỏ không thích tài liệu");
    if (!currentUser) return { ok: false };

    const resources = StorageDB.getResources();
    const index = resources.findIndex(function (r) {
      return r.id === resourceId;
    });
    if (index === -1) return { ok: false };

    const resItem = resources[index];
    if (!StorageDB.canViewItem(resItem, currentUser)) {
      AuthModule.showToast("Bạn không có quyền tương tác với tài liệu này.", "error");
      return { ok: false };
    }

    resItem.likes = Array.isArray(resItem.likes) ? resItem.likes : [];
    resItem.dislikes = Array.isArray(resItem.dislikes) ? resItem.dislikes : [];

    const dislikeIdx = resItem.dislikes.indexOf(currentUser.id);
    if (dislikeIdx > -1) {
      resItem.dislikes.splice(dislikeIdx, 1);
    } else {
      resItem.dislikes.push(currentUser.id);
      const likeIdx = resItem.likes.indexOf(currentUser.id);
      if (likeIdx > -1) {
        resItem.likes.splice(likeIdx, 1);
      }
    }

    resources[index] = resItem;
    StorageDB.saveResources(resources);
    return { ok: true, resource: resItem };
  }

  /**
   * Lưu hoặc bỏ lưu tài liệu vào danh sách cá nhân (savedBy)
   */
  function toggleSave(resourceId) {
    const currentUser = AuthModule.requireAuth("lưu tài liệu vào danh sách cá nhân");
    if (!currentUser) return { ok: false };

    const resources = StorageDB.getResources();
    const index = resources.findIndex(function (r) {
      return r.id === resourceId;
    });
    if (index === -1) return { ok: false };

    const resItem = resources[index];
    if (!StorageDB.canViewItem(resItem, currentUser)) {
      AuthModule.showToast("Tài liệu ngoài phạm vi truy cập.", "error");
      return { ok: false };
    }

    resItem.savedBy = Array.isArray(resItem.savedBy) ? resItem.savedBy : [];
    const savedIdx = resItem.savedBy.indexOf(currentUser.id);
    let isNowSaved = false;

    if (savedIdx > -1) {
      resItem.savedBy.splice(savedIdx, 1);
      isNowSaved = false;
    } else {
      resItem.savedBy.push(currentUser.id);
      isNowSaved = true;
    }

    resources[index] = resItem;
    StorageDB.saveResources(resources);

    AuthModule.showToast(
      isNowSaved ? "Đã lưu tài liệu vào hồ sơ cá nhân!" : "Đã bỏ lưu tài liệu.",
      isNowSaved ? "success" : "info"
    );
    return { ok: true, saved: isNowSaved, resource: resItem };
  }

  /**
   * Báo cáo tài liệu vi phạm -> Tạo bản ghi trong reports & nâng priority lên "high"
   */
  function reportResource(resourceId, reasonInput) {
    const currentUser = AuthModule.requireAuth("báo cáo tài liệu vi phạm");
    if (!currentUser) return { ok: false, message: "Chưa đăng nhập." };

    const reason = (reasonInput || "").trim();
    if (!reason) {
      return { ok: false, message: "Vui lòng nhập lý do báo cáo vi phạm." };
    }

    const resources = StorageDB.getResources();
    const index = resources.findIndex(function (r) {
      return r.id === resourceId;
    });
    if (index === -1) {
      return { ok: false, message: "Không tìm thấy tài liệu cần báo cáo." };
    }

    const reports = StorageDB.getReports();
    const newReport = {
      id: StorageDB.generateId("rep"),
      reporterId: currentUser.id,
      targetType: "resource",
      targetId: resourceId,
      reason: reason,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    reports.unshift(newReport);
    StorageDB.saveReports(reports);

    resources[index].priority = "high";
    StorageDB.saveResources(resources);

    return {
      ok: true,
      message: "Đã gửi báo cáo tài liệu tới Quản trị viên.",
      report: newReport
    };
  }

  // =========================================================================
  // 3. LỌC & SẮP XẾP DANH SÁCH TÀI LIỆU
  // =========================================================================

  function getResourceEngagementScore(resItem) {
    const likes = Array.isArray(resItem.likes) ? resItem.likes.length : 0;
    const dislikes = Array.isArray(resItem.dislikes) ? resItem.dislikes.length : 0;
    const saves = Array.isArray(resItem.savedBy) ? resItem.savedBy.length : 0;
    return likes + dislikes + saves;
  }

  function getFilteredResources(customFilters) {
    const criteria = Object.assign({}, filterState, customFilters || {});
    const currentUser = StorageDB.getCurrentUser();
    const allResources = StorageDB.getResources();

    // Bước 1: Lọc theo quyền xem (status === 'approved' || author) & visibility (public/friends/onlyme)
    let visibleResources = StorageDB.filterVisibleItems(allResources, currentUser);

    // Bước 2: Lọc theo tác giả cụ thể (dùng cho tab "Tài liệu đã chia sẻ" ở profile.html)
    if (criteria.onlyAuthorId) {
      visibleResources = visibleResources.filter(function (r) {
        return r.authorId === criteria.onlyAuthorId;
      });
    }

    // Bước 3: Lọc theo danh sách đã lưu (dùng cho tab "Tài liệu đã lưu" ở profile.html)
    if (criteria.onlySavedByUserId) {
      visibleResources = visibleResources.filter(function (r) {
        return Array.isArray(r.savedBy) && r.savedBy.includes(criteria.onlySavedByUserId);
      });
    }

    // Bước 4: Lọc theo chủ đề
    if (criteria.topic && criteria.topic !== "all") {
      visibleResources = visibleResources.filter(function (r) {
        return r.topic === criteria.topic;
      });
    }

    // Bước 5: Lọc theo phạm vi hiển thị
    if (criteria.visibility && criteria.visibility !== "all") {
      visibleResources = visibleResources.filter(function (r) {
        return r.visibility === criteria.visibility;
      });
    }

    // Bước 6: Tìm kiếm theo từ khóa
    if (criteria.keyword && criteria.keyword.trim() !== "") {
      const kw = criteria.keyword.trim().toLowerCase();
      visibleResources = visibleResources.filter(function (r) {
        const author = StorageDB.getUserById(r.authorId);
        const authorName = author ? author.fullName.toLowerCase() : "";
        return (
          r.title.toLowerCase().includes(kw) ||
          r.description.toLowerCase().includes(kw) ||
          r.topic.toLowerCase().includes(kw) ||
          authorName.includes(kw)
        );
      });
    }

    // Bước 7: Sắp xếp
    const topicStatsMap = {};
    if (criteria.sortBy === "topic_interested") {
      StorageDB.getTopicsWithStats().forEach(function (t) {
        topicStatsMap[t.name] = t.interestScore;
      });
    }

    visibleResources.sort(function (a, b) {
      if (criteria.sortBy === "most_useful") {
        const diff = (b.likes ? b.likes.length : 0) - (a.likes ? a.likes.length : 0);
        if (diff !== 0) return diff;
      } else if (criteria.sortBy === "most_interested") {
        const diff = getResourceEngagementScore(b) - getResourceEngagementScore(a);
        if (diff !== 0) return diff;
      } else if (criteria.sortBy === "topic_interested") {
        const diff = (topicStatsMap[b.topic] || 0) - (topicStatsMap[a.topic] || 0);
        if (diff !== 0) return diff;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return visibleResources;
  }

  // =========================================================================
  // 4. RENDER GIAO DIỆN DANH SÁCH TÀI LIỆU
  // =========================================================================

  function getVisibilityLabel(visibility) {
    const map = {
      public: { text: "Công khai", cls: "badge-public" },
      friends: { text: "Bạn bè", cls: "badge-friends" },
      onlyme: { text: "Chỉ mình tôi", cls: "badge-onlyme" }
    };
    return map[visibility] || map.public;
  }

  function getStatusBadgeHTML(status) {
    const map = {
      approved: "",
      pending: '<span class="badge badge-pending">Chờ kiểm duyệt</span>',
      needs_edit: '<span class="badge badge-warning">Yêu cầu chỉnh sửa</span>',
      rejected: '<span class="badge badge-danger">Đã bị từ chối</span>'
    };
    return map[status] || "";
  }

  function renderResourcesList(containerId, customFilters) {
    const container = document.getElementById(containerId || "resourcesContainer");
    if (!container) return;

    const currentUser = StorageDB.getCurrentUser();
    const resources = getFilteredResources(customFilters);

    if (resources.length === 0) {
      container.innerHTML =
        '<div class="empty-state card">' +
        "<p>Không tìm thấy tài liệu học tập nào phù hợp với tiêu chí hoặc quyền truy cập.</p>" +
        "</div>";
      return;
    }

    container.innerHTML = resources
      .map(function (resItem) {
        const author = StorageDB.getUserById(resItem.authorId) || {
          fullName: "Thành viên",
          avatar: "assets/images/default-avatar.png"
        };
        const visInfo = getVisibilityLabel(resItem.visibility);
        const isAuthor = Boolean(currentUser && currentUser.id === resItem.authorId);
        const canModify = StorageDB.canModifyItem(resItem, currentUser);

        const likes = Array.isArray(resItem.likes) ? resItem.likes : [];
        const dislikes = Array.isArray(resItem.dislikes) ? resItem.dislikes : [];
        const savedBy = Array.isArray(resItem.savedBy) ? resItem.savedBy : [];

        const isLiked = currentUser ? likes.includes(currentUser.id) : false;
        const isDisliked = currentUser ? dislikes.includes(currentUser.id) : false;
        const isSaved = currentUser ? savedBy.includes(currentUser.id) : false;

        const isLocalDoc = resItem.fileLink.startsWith("assets/");
        const sourceBadge = isLocalDoc
          ? '<span class="badge badge-info">Tài liệu nội bộ</span>'
          : '<span class="badge badge-outline">Liên kết ngoài</span>';

        const modNoteHTML =
          resItem.moderatorNote && (isAuthor || (currentUser && currentUser.role === "admin"))
            ? '<div class="moderator-note-box"><strong>Ghi chú kiểm duyệt:</strong> ' +
              StorageDB.escapeHTML(resItem.moderatorNote) +
              "</div>"
            : "";

        const visibilitySelectHTML = isAuthor
          ? '<select class="visibility-quick-select js-change-resource-visibility" data-resource-id="' +
            resItem.id +
            '" title="Đổi phạm vi chia sẻ">' +
            '<option value="public"' +
            (resItem.visibility === "public" ? " selected" : "") +
            ">Công khai</option>" +
            '<option value="friends"' +
            (resItem.visibility === "friends" ? " selected" : "") +
            ">Bạn bè</option>" +
            '<option value="onlyme"' +
            (resItem.visibility === "onlyme" ? " selected" : "") +
            ">Chỉ mình tôi</option>" +
            "</select>"
          : '<span class="badge ' + visInfo.cls + '">' + visInfo.text + "</span>";

        const manageButtonsHTML =
          '<div class="post-card-controls">' +
          (canModify
            ? '<button type="button" class="btn btn-sm btn-outline js-edit-resource" data-resource-id="' +
              resItem.id +
              '">Sửa</button>' +
              '<button type="button" class="btn btn-sm btn-danger-outline js-delete-resource" data-resource-id="' +
              resItem.id +
              '">Xóa</button>'
            : "") +
          (!isAuthor
            ? '<button type="button" class="btn btn-sm btn-warning-outline js-report-resource" data-resource-id="' +
              resItem.id +
              '">Báo cáo</button>'
            : "") +
          "</div>";

        return (
          '<article class="resource-card card" data-resource-id="' +
          resItem.id +
          '">' +
          '<header class="post-card-header">' +
          '<div class="post-author-info">' +
          '<img class="avatar-md" src="' +
          StorageDB.escapeHTML(author.avatar) +
          '" alt="' +
          StorageDB.escapeHTML(author.fullName) +
          '">' +
          "<div>" +
          '<h4 class="author-name">' +
          StorageDB.escapeHTML(author.fullName) +
          "</h4>" +
          '<div class="post-meta">' +
          "<span>" +
          StorageDB.formatDate(resItem.createdAt) +
          "</span>" +
          ' • <span class="badge badge-topic">' +
          StorageDB.escapeHTML(resItem.topic) +
          "</span>" +
          " • " +
          visibilitySelectHTML +
          " " +
          sourceBadge +
          " " +
          getStatusBadgeHTML(resItem.status) +
          "</div>" +
          "</div>" +
          "</div>" +
          manageButtonsHTML +
          "</header>" +
          modNoteHTML +
          '<div class="resource-card-body">' +
          '<h3 class="resource-title">' +
          StorageDB.escapeHTML(resItem.title) +
          "</h3>" +
          '<p class="resource-description">' +
          StorageDB.escapeHTML(resItem.description).replace(/\n/g, "<br>") +
          "</p>" +
          '<div class="resource-link-box">' +
          '<span class="resource-url-preview">' +
          StorageDB.escapeHTML(resItem.fileLink) +
          "</span>" +
          '<a class="btn btn-sm btn-primary" href="' +
          StorageDB.escapeHTML(resItem.fileLink) +
          '" target="_blank" rel="noopener noreferrer">Mở tài nguyên ↗</a>' +
          "</div>" +
          "</div>" +
          '<footer class="post-card-footer">' +
          '<div class="post-reactions">' +
          '<button type="button" class="btn-reaction js-like-resource ' +
          (isLiked ? "active" : "") +
          '" data-resource-id="' +
          resItem.id +
          '">👍 Hữu ích (' +
          likes.length +
          ")</button>" +
          '<button type="button" class="btn-reaction js-dislike-resource ' +
          (isDisliked ? "active" : "") +
          '" data-resource-id="' +
          resItem.id +
          '">👎 Không hữu ích (' +
          dislikes.length +
          ")</button>" +
          '<button type="button" class="btn-reaction js-save-resource ' +
          (isSaved ? "active-save" : "") +
          '" data-resource-id="' +
          resItem.id +
          '">' +
          (isSaved ? "★ Đã lưu" : "☆ Lưu tài liệu") +
          " (" +
          savedBy.length +
          ")</button>" +
          "</div>" +
          "</footer>" +
          "</article>"
        );
      })
      .join("");
  }

  function populateResourceTopicsSidebar() {
    if (typeof PostsModule !== "undefined" && PostsModule.populateTopicElements) {
      PostsModule.populateTopicElements();
    }

    const sidebarList = document.getElementById("resourceSidebarTopics");
    if (!sidebarList) return;

    const topicsWithStats = StorageDB.getTopicsWithStats().sort(function (a, b) {
      return b.interestScore - a.interestScore;
    });

    sidebarList.innerHTML =
      '<li><button type="button" class="topic-filter-btn js-resource-topic-btn ' +
      (filterState.topic === "all" ? "active" : "") +
      '" data-topic="all">Tất cả chủ đề</button></li>' +
      topicsWithStats
        .map(function (t) {
          return (
            '<li><button type="button" class="topic-filter-btn js-resource-topic-btn ' +
            (filterState.topic === t.name ? "active" : "") +
            '" data-topic="' +
            StorageDB.escapeHTML(t.name) +
            '">' +
            "<span>" +
            StorageDB.escapeHTML(t.name) +
            "</span>" +
            '<small class="topic-stat-pill">' +
            t.resourceCount +
            " tài liệu • " +
            t.usefulnessScore +
            " thích</small>" +
            "</button></li>"
          );
        })
        .join("");
  }

  function refreshAllResourceViews() {
    populateResourceTopicsSidebar();
    renderResourcesList("resourcesContainer");
    document.dispatchEvent(new CustomEvent("resources:changed"));
  }

  function openEditResourceModalOrPrompt(resourceId) {
    const resItem = StorageDB.getResourceById(resourceId);
    if (!resItem) return;

    const editModal = document.getElementById("editResourceModal");
    const editForm = document.getElementById("editResourceForm");

    if (editModal && editForm) {
      editForm.dataset.resourceId = resItem.id;
      if (editForm.querySelector('[name="title"]')) {
        editForm.querySelector('[name="title"]').value = resItem.title;
      }
      if (editForm.querySelector('[name="description"]')) {
        editForm.querySelector('[name="description"]').value = resItem.description;
      }
      if (editForm.querySelector('[name="topic"]')) {
        editForm.querySelector('[name="topic"]').value = resItem.topic;
      }
      if (editForm.querySelector('[name="fileLink"]')) {
        editForm.querySelector('[name="fileLink"]').value = resItem.fileLink;
      }
      if (editForm.querySelector('[name="visibility"]')) {
        editForm.querySelector('[name="visibility"]').value = resItem.visibility;
      }
      editModal.style.display = "flex";
      return;
    }

    const newTitle = prompt("Chỉnh sửa tên tài liệu:", resItem.title);
    if (newTitle === null) return;
    const newLink = prompt("Chỉnh sửa đường dẫn tài liệu:", resItem.fileLink);
    if (newLink === null) return;

    const updated = updateResource(resourceId, { title: newTitle, fileLink: newLink });
    AuthModule.showToast(updated.message, updated.ok ? "success" : "error");
    if (updated.ok) refreshAllResourceViews();
  }

  // =========================================================================
  // 5. GẮN SỰ KIỆN CHO TRANG TÀI LIỆU & EVENT DELEGATION
  // =========================================================================

  function bindResourceEvents() {
    populateResourceTopicsSidebar();

    // Form chia sẻ tài liệu mới (resources.html)
    const createResourceForm = document.getElementById("createResourceForm");
    if (createResourceForm) {
      createResourceForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const res = createResource({
          title: (createResourceForm.querySelector('[name="title"]') || {}).value,
          description: (createResourceForm.querySelector('[name="description"]') || {}).value,
          topic: (createResourceForm.querySelector('[name="topic"]') || {}).value,
          newTopic: (createResourceForm.querySelector('[name="newTopic"]') || {}).value,
          fileLink: (createResourceForm.querySelector('[name="fileLink"]') || {}).value,
          visibility: (createResourceForm.querySelector('[name="visibility"]') || {}).value
        });

        AuthModule.showToast(res.message, res.ok ? "success" : "error");
        if (res.ok) {
          createResourceForm.reset();
          refreshAllResourceViews();
        }
      });
    }

    // Form sửa tài liệu trong Modal (nếu có)
    const editResourceForm = document.getElementById("editResourceForm");
    if (editResourceForm) {
      editResourceForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const resourceId = editResourceForm.dataset.resourceId;
        const res = updateResource(resourceId, {
          title: (editResourceForm.querySelector('[name="title"]') || {}).value,
          description: (editResourceForm.querySelector('[name="description"]') || {}).value,
          topic: (editResourceForm.querySelector('[name="topic"]') || {}).value,
          newTopic: (editResourceForm.querySelector('[name="newTopic"]') || {}).value,
          fileLink: (editResourceForm.querySelector('[name="fileLink"]') || {}).value,
          visibility: (editResourceForm.querySelector('[name="visibility"]') || {}).value
        });

        AuthModule.showToast(res.message, res.ok ? "success" : "error");
        if (res.ok) {
          const editModal = document.getElementById("editResourceModal");
          if (editModal) editModal.style.display = "none";
          refreshAllResourceViews();
        }
      });
    }

    // Các bộ lọc tìm kiếm, chủ đề, phạm vi, sắp xếp trên resources.html
    const searchInput = document.getElementById("resourceSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        filterState.keyword = searchInput.value;
        renderResourcesList();
      });
    }

    const topicFilter = document.getElementById("resourceTopicFilter");
    if (topicFilter) {
      topicFilter.addEventListener("change", function () {
        filterState.topic = topicFilter.value;
        refreshAllResourceViews();
      });
    }

    const visibilityFilter = document.getElementById("resourceVisibilityFilter");
    if (visibilityFilter) {
      visibilityFilter.addEventListener("change", function () {
        filterState.visibility = visibilityFilter.value;
        renderResourcesList();
      });
    }

    const sortSelect = document.getElementById("resourceSortSelect");
    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        filterState.sortBy = sortSelect.value;
        renderResourcesList();
      });
    }

    document.addEventListener("click", function (e) {
      // Lọc chủ đề ở sidebar tài liệu
      const topicBtn = e.target.closest(".js-resource-topic-btn");
      if (topicBtn) {
        filterState.topic = topicBtn.dataset.topic || "all";
        const selectEl = document.getElementById("resourceTopicFilter");
        if (selectEl) selectEl.value = filterState.topic;
        refreshAllResourceViews();
        return;
      }

      // Like tài liệu
      const likeBtn = e.target.closest(".js-like-resource");
      if (likeBtn) {
        const res = toggleLike(likeBtn.dataset.resourceId);
        if (res.ok) refreshAllResourceViews();
        return;
      }

      // Dislike tài liệu
      const dislikeBtn = e.target.closest(".js-dislike-resource");
      if (dislikeBtn) {
        const res = toggleDislike(dislikeBtn.dataset.resourceId);
        if (res.ok) refreshAllResourceViews();
        return;
      }

      // Lưu / Bỏ lưu tài liệu
      const saveBtn = e.target.closest(".js-save-resource");
      if (saveBtn) {
        const res = toggleSave(saveBtn.dataset.resourceId);
        if (res.ok) refreshAllResourceViews();
        return;
      }

      // Sửa tài liệu
      const editBtn = e.target.closest(".js-edit-resource");
      if (editBtn) {
        openEditResourceModalOrPrompt(editBtn.dataset.resourceId);
        return;
      }

      // Xóa tài liệu
      const deleteBtn = e.target.closest(".js-delete-resource");
      if (deleteBtn) {
        if (!confirm("Bạn có chắc chắn muốn xóa tài liệu này?")) return;
        const res = deleteResource(deleteBtn.dataset.resourceId);
        AuthModule.showToast(res.message, res.ok ? "info" : "error");
        if (res.ok) refreshAllResourceViews();
        return;
      }

      // Báo cáo tài liệu vi phạm
      const reportBtn = e.target.closest(".js-report-resource");
      if (reportBtn) {
        if (!AuthModule.requireAuth("báo cáo tài liệu vi phạm")) return;
        const reason = prompt("Nhập lý do báo cáo vi phạm cho tài liệu này:");
        if (reason === null) return;
        const res = reportResource(reportBtn.dataset.resourceId, reason);
        AuthModule.showToast(res.message, res.ok ? "success" : "error");
      }
    });

    document.addEventListener("change", function (e) {
      const visSelect = e.target.closest(".js-change-resource-visibility");
      if (visSelect) {
        const res = changeResourceVisibility(visSelect.dataset.resourceId, visSelect.value);
        AuthModule.showToast(res.message, res.ok ? "success" : "error");
        if (res.ok) refreshAllResourceViews();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindResourceEvents();
    if (document.getElementById("resourcesContainer")) {
      renderResourcesList("resourcesContainer");
    }
  });

  return {
    filterState: filterState,
    createResource: createResource,
    updateResource: updateResource,
    changeResourceVisibility: changeResourceVisibility,
    deleteResource: deleteResource,
    toggleLike: toggleLike,
    toggleDislike: toggleDislike,
    toggleSave: toggleSave,
    reportResource: reportResource,
    getFilteredResources: getFilteredResources,
    renderResourcesList: renderResourcesList,
    populateResourceTopicsSidebar: populateResourceTopicsSidebar
  };
})();