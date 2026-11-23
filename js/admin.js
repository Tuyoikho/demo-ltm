/**
 * js/admin.js
 * Quản lý Luồng Kiểm duyệt, Xử lý Báo cáo vi phạm & Thống kê:
 * - Hàng chờ duyệt bài thảo luận & tài liệu (status === "pending") sắp xếp ưu tiên "high" lên trên
 * - Duyệt (approved), Yêu cầu chỉnh sửa (needs_edit + moderatorNote), Loại bỏ (rejected)
 * - Tiếp nhận & xử lý báo cáo vi phạm (reports)
 * - Tính toán thống kê cộng đồng bằng .reduce() / .length & đồng bộ thống kê trang hồ sơ cá nhân
 */

const AdminModule = (function () {
  const adminState = {
    queueTypeFilter: "all", // "all" | "post" | "resource"
    reportStatusFilter: "pending" // "pending" | "resolved" | "all"
  };

  // =========================================================================
  // 1. HÀNG CHỜ KIỂM DUYỆT ƯU TIÊN (POSTS + RESOURCES CÓ STATUS === "pending")
  // =========================================================================

  /**
   * Lấy danh sách nội dung chờ duyệt, sắp xếp priority "high" (bị báo cáo) lên trước "normal"
   */
  function getPendingModerationQueue(typeFilter) {
    const filter = typeFilter || adminState.queueTypeFilter || "all";
    const queue = [];

    if (filter === "all" || filter === "post") {
      StorageDB.getPosts().forEach(function (post) {
        if (post.status === "pending") {
          queue.push({
            itemType: "post",
            id: post.id,
            authorId: post.authorId,
            title: post.title,
            summary: post.content,
            topic: post.topic,
            visibility: post.visibility,
            priority: post.priority || "normal",
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType,
            createdAt: post.createdAt
          });
        }
      });
    }

    if (filter === "all" || filter === "resource") {
      StorageDB.getResources().forEach(function (resItem) {
        if (resItem.status === "pending") {
          queue.push({
            itemType: "resource",
            id: resItem.id,
            authorId: resItem.authorId,
            title: resItem.title,
            summary: resItem.description,
            topic: resItem.topic,
            visibility: resItem.visibility,
            priority: resItem.priority || "normal",
            fileLink: resItem.fileLink,
            createdAt: resItem.createdAt
          });
        }
      });
    }

    // Sắp xếp: priority === "high" xếp lên trên "normal", cùng mức ưu tiên thì mới nhất lên trước
    queue.sort(function (a, b) {
      const weightA = a.priority === "high" ? 2 : 1;
      const weightB = b.priority === "high" ? 2 : 1;
      if (weightB !== weightA) {
        return weightB - weightA;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return queue;
  }

  /**
   * Quyết định kiểm duyệt của Admin:
   * decision: "approved" | "needs_edit" | "rejected"
   */
  function moderateItem(itemType, itemId, decision, noteInput) {
    if (!StorageDB.isAdmin()) {
      return { ok: false, message: "Chỉ Quản trị viên (Admin) mới có quyền kiểm duyệt." };
    }

    if (!["approved", "needs_edit", "rejected"].includes(decision)) {
      return { ok: false, message: "Trạng thái kiểm duyệt không hợp lệ." };
    }

    const note = (noteInput || "").trim();
    if (decision === "needs_edit" && !note) {
      return { ok: false, message: "Vui lòng nhập ghi chú lý do yêu cầu tác giả chỉnh sửa." };
    }

    if (itemType === "post") {
      const posts = StorageDB.getPosts();
      const idx = posts.findIndex(function (p) {
        return p.id === itemId;
      });
      if (idx === -1) return { ok: false, message: "Không tìm thấy bài thảo luận." };

      posts[idx].status = decision;
      posts[idx].priority = "normal";
      posts[idx].moderatorNote = decision === "approved" ? "" : note;
      StorageDB.savePosts(posts);
    } else if (itemType === "resource") {
      const resources = StorageDB.getResources();
      const idx = resources.findIndex(function (r) {
        return r.id === itemId;
      });
      if (idx === -1) return { ok: false, message: "Không tìm thấy tài liệu." };

      resources[idx].status = decision;
      resources[idx].priority = "normal";
      resources[idx].moderatorNote = decision === "approved" ? "" : note;
      StorageDB.saveResources(resources);
    } else {
      return { ok: false, message: "Loại nội dung không hợp lệ." };
    }

    // Tự động đánh dấu "resolved" cho các báo cáo đang chờ của nội dung này
    const updatedReports = StorageDB.getReports().map(function (rep) {
      if (rep.targetType === itemType && rep.targetId === itemId && rep.status === "pending") {
        return Object.assign({}, rep, { status: "resolved" });
      }
      return rep;
    });
    StorageDB.saveReports(updatedReports);

    const actionLabels = {
      approved: "Đã phê duyệt nội dung hiển thị!",
      needs_edit: "Đã gửi yêu cầu chỉnh sửa tới tác giả.",
      rejected: "Đã loại bỏ nội dung khỏi hệ thống."
    };

    return { ok: true, message: actionLabels[decision] };
  }

  // =========================================================================
  // 2. XỬ LÝ BÁO CÁO VI PHẠM (REPORTS)
  // =========================================================================

  /**
   * Xử lý báo cáo vi phạm:
   * action: "keep" (giữ lại/duyệt) | "needs_edit" (yêu cầu sửa) | "reject" (loại bỏ)
   */
  function resolveReport(reportId, action, noteInput) {
    if (!StorageDB.isAdmin()) {
      return { ok: false, message: "Chỉ Quản trị viên (Admin) mới có quyền xử lý báo cáo." };
    }

    const reports = StorageDB.getReports();
    const repIdx = reports.findIndex(function (r) {
      return r.id === reportId;
    });
    if (repIdx === -1) {
      return { ok: false, message: "Không tìm thấy báo cáo." };
    }

    const report = reports[repIdx];
    const note = (noteInput || "").trim();

    if (action === "needs_edit" && !note) {
      return { ok: false, message: "Vui lòng nhập ghi chú yêu cầu chỉnh sửa cho tác giả." };
    }

    // Cập nhật nội dung bị báo cáo
    const statusMap = {
      keep: "approved",
      needs_edit: "needs_edit",
      reject: "rejected"
    };
    const targetStatus = statusMap[action] || "approved";

    if (report.targetType === "post") {
      const posts = StorageDB.getPosts();
      const pIdx = posts.findIndex(function (p) {
        return p.id === report.targetId;
      });
      if (pIdx > -1) {
        posts[pIdx].status = targetStatus;
        posts[pIdx].priority = "normal";
        posts[pIdx].moderatorNote =
          targetStatus === "approved"
            ? ""
            : note || "Nội dung bị loại bỏ sau khi xem xét báo cáo vi phạm.";
        StorageDB.savePosts(posts);
      }
    } else if (report.targetType === "resource") {
      const resources = StorageDB.getResources();
      const rIdx = resources.findIndex(function (r) {
        return r.id === report.targetId;
      });
      if (rIdx > -1) {
        resources[rIdx].status = targetStatus;
        resources[rIdx].priority = "normal";
        resources[rIdx].moderatorNote =
          targetStatus === "approved"
            ? ""
            : note || "Tài liệu bị loại bỏ sau khi xem xét báo cáo vi phạm.";
        StorageDB.saveResources(resources);
      }
    }

    // Cập nhật trạng thái báo cáo thành "resolved"
    reports[repIdx].status = "resolved";
    StorageDB.saveReports(reports);

    return { ok: true, message: "Đã hoàn tất xử lý báo cáo vi phạm." };
  }

  // =========================================================================
  // 3. THỐNG KÊ CỘNG ĐỒNG & THỐNG KÊ CÁ NHÂN (DÙNG .reduce() VÀ .length)
  // =========================================================================

  function getCommunityStats() {
    const users = StorageDB.getUsers();
    const posts = StorageDB.getPosts();
    const resources = StorageDB.getResources();
    const reports = StorageDB.getReports();
    const topicsWithStats = StorageDB.getTopicsWithStats();

    const postMetrics = posts.reduce(
      function (acc, post) {
        if (post.status === "approved") acc.approved += 1;
        else if (post.status === "pending") {
          acc.pending += 1;
          if (post.priority === "high") acc.highPriorityPending += 1;
        } else if (post.status === "needs_edit") acc.needsEdit += 1;
        else if (post.status === "rejected") acc.rejected += 1;

        acc.totalLikes += Array.isArray(post.likes) ? post.likes.length : 0;
        acc.totalDislikes += Array.isArray(post.dislikes) ? post.dislikes.length : 0;
        if (Array.isArray(post.comments)) {
          acc.totalComments += post.comments.reduce(function (cSum, c) {
            return cSum + 1 + (Array.isArray(c.replies) ? c.replies.length : 0);
          }, 0);
        }
        return acc;
      },
      {
        approved: 0,
        pending: 0,
        highPriorityPending: 0,
        needsEdit: 0,
        rejected: 0,
        totalLikes: 0,
        totalDislikes: 0,
        totalComments: 0
      }
    );

    const resourceMetrics = resources.reduce(
      function (acc, resItem) {
        if (resItem.status === "approved") acc.approved += 1;
        else if (resItem.status === "pending") {
          acc.pending += 1;
          if (resItem.priority === "high") acc.highPriorityPending += 1;
        }
        acc.totalLikes += Array.isArray(resItem.likes) ? resItem.likes.length : 0;
        acc.totalSaves += Array.isArray(resItem.savedBy) ? resItem.savedBy.length : 0;
        return acc;
      },
      {
        approved: 0,
        pending: 0,
        highPriorityPending: 0,
        totalLikes: 0,
        totalSaves: 0
      }
    );

    const pendingReportsCount = reports.reduce(function (count, rep) {
      return count + (rep.status === "pending" ? 1 : 0);
    }, 0);

    const topInterestedTopics = topicsWithStats.slice().sort(function (a, b) {
      return b.interestScore - a.interestScore;
    });

    const topUsefulTopics = topicsWithStats.slice().sort(function (a, b) {
      return b.usefulnessScore - a.usefulnessScore;
    });

    const topUsefulPosts = posts
      .filter(function (p) {
        return p.status === "approved";
      })
      .sort(function (a, b) {
        return (b.likes ? b.likes.length : 0) - (a.likes ? a.likes.length : 0);
      })
      .slice(0, 5);

    const topUsefulResources = resources
      .filter(function (r) {
        return r.status === "approved";
      })
      .sort(function (a, b) {
        return (b.likes ? b.likes.length : 0) - (a.likes ? a.likes.length : 0);
      })
      .slice(0, 5);

    return {
      totalUsers: users.length,
      totalPosts: posts.length,
      approvedPosts: postMetrics.approved,
      pendingPosts: postMetrics.pending,
      needsEditPosts: postMetrics.needsEdit,
      rejectedPosts: postMetrics.rejected,
      totalResources: resources.length,
      approvedResources: resourceMetrics.approved,
      pendingResources: resourceMetrics.pending,
      pendingQueueTotal: postMetrics.pending + resourceMetrics.pending,
      highPriorityPendingCount:
        postMetrics.highPriorityPending + resourceMetrics.highPriorityPending,
      pendingReportsCount: pendingReportsCount,
      totalReportsCount: reports.length,
      totalInteractions:
        postMetrics.totalLikes +
        postMetrics.totalDislikes +
        postMetrics.totalComments +
        resourceMetrics.totalLikes +
        resourceMetrics.totalSaves,
      topInterestedTopics: topInterestedTopics,
      topUsefulTopics: topUsefulTopics,
      topUsefulPosts: topUsefulPosts,
      topUsefulResources: topUsefulResources
    };
  }

  /**
   * Tính thống kê cá nhân cho trang profile.html
   */
  function getPersonalStats(userId) {
    const targetId = userId || (StorageDB.getCurrentUser() && StorageDB.getCurrentUser().id);
    if (!targetId) return null;

    const user = StorageDB.getUserById(targetId);
    const myPosts = StorageDB.getPosts().filter(function (p) {
      return p.authorId === targetId;
    });
    const myResources = StorageDB.getResources().filter(function (r) {
      return r.authorId === targetId;
    });
    const savedResources = StorageDB.getResources().filter(function (r) {
      return (
        Array.isArray(r.savedBy) &&
        r.savedBy.includes(targetId) &&
        StorageDB.canViewItem(r, user)
      );
    });

    const likesFromPosts = myPosts.reduce(function (sum, p) {
      return sum + (Array.isArray(p.likes) ? p.likes.length : 0);
    }, 0);
    const likesFromResources = myResources.reduce(function (sum, r) {
      return sum + (Array.isArray(r.likes) ? r.likes.length : 0);
    }, 0);

    return {
      postsCount: myPosts.length,
      resourcesCount: myResources.length,
      savedResourcesCount: savedResources.length,
      friendsCount: user && Array.isArray(user.friends) ? user.friends.length : 0,
      totalLikesReceived: likesFromPosts + likesFromResources
    };
  }

  // =========================================================================
  // 4. RENDER GIAO DIỆN QUẢN TRỊ (admin.html), WIDGET TRANG CHỦ & HỒ SƠ
  // =========================================================================

  function renderModerationQueueTable() {
    const tbody = document.getElementById("moderationQueueBody");
    if (!tbody) return;

    const queue = getPendingModerationQueue();
    if (queue.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted">Không có nội dung nào đang chờ kiểm duyệt.</td></tr>';
      return;
    }

    tbody.innerHTML = queue
      .map(function (item) {
        const author = StorageDB.getUserById(item.authorId) || { fullName: "Thành viên" };
        const priorityBadge =
          item.priority === "high"
            ? '<span class="badge badge-danger">🔥 Ưu tiên Cao (Bị báo cáo)</span>'
            : '<span class="badge badge-normal">Thường</span>';
        const typeBadge =
          item.itemType === "post"
            ? '<span class="badge badge-topic">Bài thảo luận</span>'
            : '<span class="badge badge-info">Tài liệu</span>';

        return (
          '<tr class="' +
          (item.priority === "high" ? "row-high-priority" : "") +
          '">' +
          "<td>" +
          priorityBadge +
          "</td>" +
          "<td>" +
          typeBadge +
          "</td>" +
          "<td>" +
          "<strong>" +
          StorageDB.escapeHTML(item.title) +
          "</strong>" +
          '<p class="table-snippet">' +
          StorageDB.escapeHTML(item.summary) +
          "</p>" +
          '<small class="text-muted">Chủ đề: ' +
          StorageDB.escapeHTML(item.topic) +
          (item.fileLink
            ? ' • <a href="' +
              StorageDB.escapeHTML(item.fileLink) +
              '" target="_blank" rel="noopener noreferrer">Xem liên kết ↗</a>'
            : "") +
          "</small>" +
          "</td>" +
          "<td>" +
          StorageDB.escapeHTML(author.fullName) +
          "</td>" +
          "<td>" +
          StorageDB.formatDate(item.createdAt) +
          "</td>" +
          '<td class="table-actions">' +
          '<button type="button" class="btn btn-sm btn-primary js-admin-approve" data-type="' +
          item.itemType +
          '" data-id="' +
          item.id +
          '">Duyệt</button> ' +
          '<button type="button" class="btn btn-sm btn-warning-outline js-admin-needs-edit" data-type="' +
          item.itemType +
          '" data-id="' +
          item.id +
          '">Yêu cầu sửa</button> ' +
          '<button type="button" class="btn btn-sm btn-danger-outline js-admin-reject" data-type="' +
          item.itemType +
          '" data-id="' +
          item.id +
          '">Loại bỏ</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderReportsTable() {
    const tbody = document.getElementById("reportsTableBody");
    if (!tbody) return;

    let reports = StorageDB.getReports();
    if (adminState.reportStatusFilter !== "all") {
      reports = reports.filter(function (r) {
        return r.status === adminState.reportStatusFilter;
      });
    }

    if (reports.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted">Không có báo cáo vi phạm nào trong mục này.</td></tr>';
      return;
    }

    tbody.innerHTML = reports
      .map(function (rep) {
        const reporter = StorageDB.getUserById(rep.reporterId) || { fullName: "Thành viên" };
        const targetObj =
          rep.targetType === "post"
            ? StorageDB.getPostById(rep.targetId)
            : StorageDB.getResourceById(rep.targetId);

        const targetTypeLabel = rep.targetType === "post" ? "Bài thảo luận" : "Tài liệu";
        const targetTitle = targetObj
          ? StorageDB.escapeHTML(targetObj.title)
          : '<em class="text-muted">(Nội dung đã bị xóa)</em>';

        const statusBadge =
          rep.status === "pending"
            ? '<span class="badge badge-danger">Chờ xử lý</span>'
            : '<span class="badge badge-public">Đã xử lý</span>';

        const actionsHTML =
          rep.status === "pending"
            ? '<button type="button" class="btn btn-sm btn-outline js-report-keep" data-report-id="' +
              rep.id +
              '">Giữ lại</button> ' +
              '<button type="button" class="btn btn-sm btn-warning-outline js-report-needs-edit" data-report-id="' +
              rep.id +
              '">Yêu cầu sửa</button> ' +
              '<button type="button" class="btn btn-sm btn-danger-outline js-report-reject" data-report-id="' +
              rep.id +
              '">Loại bỏ</button>'
            : '<span class="text-muted">Hoàn tất</span>';

        return (
          "<tr>" +
          "<td>" +
          StorageDB.escapeHTML(reporter.fullName) +
          "</td>" +
          "<td>" +
          targetTypeLabel +
          ": <strong>" +
          targetTitle +
          "</strong></td>" +
          "<td>" +
          StorageDB.escapeHTML(rep.reason) +
          "</td>" +
          "<td>" +
          StorageDB.formatDate(rep.createdAt) +
          "</td>" +
          "<td>" +
          statusBadge +
          "</td>" +
          '<td class="table-actions">' +
          actionsHTML +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderAdminDashboardStats() {
    const stats = getCommunityStats();

    // Render các thẻ KPI tổng quan trên admin.html
    const kpiContainer = document.getElementById("adminStatsContainer");
    if (kpiContainer) {
      kpiContainer.innerHTML =
        '<div class="stat-card card"><h4>Chờ kiểm duyệt</h4><p class="stat-number">' +
        stats.pendingQueueTotal +
        "</p><small>" +
        stats.highPriorityPendingCount +
        " ưu tiên cao</small></div>" +
        '<div class="stat-card card"><h4>Báo cáo chờ xử lý</h4><p class="stat-number">' +
        stats.pendingReportsCount +
        "</p><small>Tổng " +
        stats.totalReportsCount +
        " báo cáo</small></div>" +
        '<div class="stat-card card"><h4>Nội dung đã duyệt</h4><p class="stat-number">' +
        (stats.approvedPosts + stats.approvedResources) +
        "</p><small>" +
        stats.approvedPosts +
        " bài • " +
        stats.approvedResources +
        " tài liệu</small></div>" +
        '<div class="stat-card card"><h4>Thành viên & Tương tác</h4><p class="stat-number">' +
        stats.totalUsers +
        "</p><small>" +
        stats.totalInteractions +
        " lượt tương tác</small></div>";
    }

    // Render bảng xếp hạng chủ đề quan tâm & hữu ích trên admin.html
    const topicStatsBody = document.getElementById("adminTopicStatsBody");
    if (topicStatsBody) {
      topicStatsBody.innerHTML = stats.topInterestedTopics
        .map(function (t, idx) {
          return (
            "<tr>" +
            "<td>#" +
            (idx + 1) +
            "</td>" +
            "<td><strong>" +
            StorageDB.escapeHTML(t.name) +
            "</strong></td>" +
            "<td>" +
            t.postCount +
            " bài / " +
            t.resourceCount +
            " tài liệu</td>" +
            "<td>" +
            t.interestScore +
            "</td>" +
            "<td>" +
            t.usefulnessScore +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    }

    // Render widget thống kê nhanh trên index.html (nếu có)
    const quickStatsEl = document.getElementById("communityQuickStats");
    if (quickStatsEl) {
      const topTopic = stats.topInterestedTopics[0];
      quickStatsEl.innerHTML =
        '<ul class="quick-stats-list">' +
        "<li><span>Thành viên tham gia:</span> <strong>" +
        stats.totalUsers +
        "</strong></li>" +
        "<li><span>Bài thảo luận đã duyệt:</span> <strong>" +
        stats.approvedPosts +
        "</strong></li>" +
        "<li><span>Tài liệu học tập:</span> <strong>" +
        stats.approvedResources +
        "</strong></li>" +
        "<li><span>Chủ đề sôi nổi nhất:</span> <strong>" +
        (topTopic ? StorageDB.escapeHTML(topTopic.name) : "Chưa có") +
        "</strong></li>" +
        "</ul>";
    }
  }

  /**
   * Render dữ liệu trang Hồ sơ cá nhân (profile.html)
   */
  function renderProfilePageData() {
    const currentUser = StorageDB.getCurrentUser();
    if (!currentUser) return;

    const personalStatsEl = document.getElementById("personalStatsContainer");
    if (personalStatsEl) {
      const pStats = getPersonalStats(currentUser.id);
      personalStatsEl.innerHTML =
        '<div class="stat-card card"><h4>Bài thảo luận</h4><p class="stat-number">' +
        pStats.postsCount +
        "</p></div>" +
        '<div class="stat-card card"><h4>Tài liệu chia sẻ</h4><p class="stat-number">' +
        pStats.resourcesCount +
        "</p></div>" +
        '<div class="stat-card card"><h4>Tài liệu đã lưu</h4><p class="stat-number">' +
        pStats.savedResourcesCount +
        "</p></div>" +
        '<div class="stat-card card"><h4>Bạn bè</h4><p class="stat-number">' +
        pStats.friendsCount +
        "</p></div>" +
        '<div class="stat-card card"><h4>Lượt thích nhận được</h4><p class="stat-number">' +
        pStats.totalLikesReceived +
        "</p></div>";
    }

    if (typeof PostsModule !== "undefined" && document.getElementById("myPostsContainer")) {
      PostsModule.renderPostsFeed("myPostsContainer", { onlyAuthorId: currentUser.id });
    }

    if (typeof ResourcesModule !== "undefined") {
      if (document.getElementById("myResourcesContainer")) {
        ResourcesModule.renderResourcesList("myResourcesContainer", {
          onlyAuthorId: currentUser.id
        });
      }
      if (document.getElementById("savedResourcesContainer")) {
        ResourcesModule.renderResourcesList("savedResourcesContainer", {
          onlySavedByUserId: currentUser.id
        });
      }
    }
  }

  function refreshAdminViews() {
    renderModerationQueueTable();
    renderReportsTable();
    renderAdminDashboardStats();
  }

  // =========================================================================
  // 5. GẮN SỰ KIỆN KIỂM DUYỆT & ĐỒNG BỘ LIÊN TRANG
  // =========================================================================

  function bindAdminEvents() {
    const queueFilterSelect = document.getElementById("adminQueueTypeFilter");
    if (queueFilterSelect) {
      queueFilterSelect.addEventListener("change", function () {
        adminState.queueTypeFilter = queueFilterSelect.value;
        renderModerationQueueTable();
      });
    }

    const reportFilterSelect = document.getElementById("adminReportStatusFilter");
    if (reportFilterSelect) {
      reportFilterSelect.addEventListener("change", function () {
        adminState.reportStatusFilter = reportFilterSelect.value;
        renderReportsTable();
      });
    }

    document.addEventListener("click", function (e) {
      // 1. Duyệt nội dung trong hàng chờ
      const approveBtn = e.target.closest(".js-admin-approve");
      if (approveBtn) {
        const res = moderateItem(approveBtn.dataset.type, approveBtn.dataset.id, "approved", "");
        AuthModule.showToast(res.message, res.ok ? "success" : "error");
        if (res.ok) refreshAdminViews();
        return;
      }

      // 2. Yêu cầu chỉnh sửa trong hàng chờ
      const needsEditBtn = e.target.closest(".js-admin-needs-edit");
      if (needsEditBtn) {
        const note = prompt("Nhập nội dung yêu cầu tác giả chỉnh sửa:");
        if (note === null) return;
        const res = moderateItem(
          needsEditBtn.dataset.type,
          needsEditBtn.dataset.id,
          "needs_edit",
          note
        );
        AuthModule.showToast(res.message, res.ok ? "warning" : "error");
        if (res.ok) refreshAdminViews();
        return;
      }

      // 3. Loại bỏ nội dung trong hàng chờ
      const rejectBtn = e.target.closest(".js-admin-reject");
      if (rejectBtn) {
        if (!confirm("Bạn có chắc muốn loại bỏ nội dung này?")) return;
        const note = prompt("Nhập lý do loại bỏ (tùy chọn):", "Không đạt tiêu chuẩn cộng đồng.");
        if (note === null) return;
        const res = moderateItem(
          rejectBtn.dataset.type,
          rejectBtn.dataset.id,
          "rejected",
          note
        );
        AuthModule.showToast(res.message, res.ok ? "info" : "error");
        if (res.ok) refreshAdminViews();
        return;
      }

      // 4. Xử lý báo cáo: Giữ lại nội dung
      const repKeepBtn = e.target.closest(".js-report-keep");
      if (repKeepBtn) {
        const res = resolveReport(repKeepBtn.dataset.reportId, "keep", "");
        AuthModule.showToast(res.message, res.ok ? "success" : "error");
        if (res.ok) refreshAdminViews();
        return;
      }

      // 5. Xử lý báo cáo: Yêu cầu tác giả chỉnh sửa
      const repEditBtn = e.target.closest(".js-report-needs-edit");
      if (repEditBtn) {
        const note = prompt("Nhập yêu cầu chỉnh sửa gửi tới tác giả:");
        if (note === null) return;
        const res = resolveReport(repEditBtn.dataset.reportId, "needs_edit", note);
        AuthModule.showToast(res.message, res.ok ? "warning" : "error");
        if (res.ok) refreshAdminViews();
        return;
      }

      // 6. Xử lý báo cáo: Loại bỏ nội dung vi phạm
      const repRejectBtn = e.target.closest(".js-report-reject");
      if (repRejectBtn) {
        if (!confirm("Xác nhận loại bỏ nội dung vi phạm này?")) return;
        const res = resolveReport(
          repRejectBtn.dataset.reportId,
          "reject",
          "Nội dung vi phạm quy định cộng đồng."
        );
        AuthModule.showToast(res.message, res.ok ? "info" : "error");
        if (res.ok) refreshAdminViews();
      }
    });

    // Tự động làm mới thống kê & danh sách cá nhân khi dữ liệu thay đổi
    document.addEventListener("posts:changed", function () {
      renderAdminDashboardStats();
      renderProfilePageData();
    });
    document.addEventListener("resources:changed", function () {
      renderAdminDashboardStats();
      renderProfilePageData();
    });
    document.addEventListener("friends:changed", function () {
      renderProfilePageData();
    });
    document.addEventListener("profile:updated", function () {
      renderProfilePageData();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindAdminEvents();
    refreshAdminViews();
    renderProfilePageData();
  });

  return {
    adminState: adminState,
    getPendingModerationQueue: getPendingModerationQueue,
    moderateItem: moderateItem,
    resolveReport: resolveReport,
    getCommunityStats: getCommunityStats,
    getPersonalStats: getPersonalStats,
    renderModerationQueueTable: renderModerationQueueTable,
    renderReportsTable: renderReportsTable,
    renderAdminDashboardStats: renderAdminDashboardStats,
    renderProfilePageData: renderProfilePageData
  };
})();