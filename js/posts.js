/**
 * js/posts.js
 * Quản lý toàn bộ logic Bài thảo luận:
 * - CRUD bài thảo luận (Tạo, Sửa, Xóa, Đổi phạm vi hiển thị)
 * - Lọc theo quyền xem (visibility + status), từ khóa, chủ đề & Sắp xếp (Mới nhất, Hữu ích nhất, Quan tâm nhất)
 * - Tương tác Like / Dislike (không cho phép chọn đồng thời)
 * - Bình luận & Trả lời bình luận đa cấp hỗ trợ đính kèm ảnh/video (mediaUrl, mediaType)
 * - Báo cáo vi phạm (đẩy bài sang hàng chờ kiểm duyệt mức ưu tiên "high")
 */

const PostsModule = (function () {
  // Trạng thái bộ lọc hiện tại trên bảng tin
  const feedState = {
    keyword: "",
    topic: "all",
    visibility: "all",
    sortBy: "newest", // "newest" | "most_useful" | "most_interested"
    onlyAuthorId: null // Dùng khi hiển thị danh sách "Bài viết của tôi" ở profile.html
  };

  // =========================================================================
  // 1. CÁC HÀM XỬ LÝ DỮ LIỆU BÀI THẢO LUẬN (CRUD)
  // =========================================================================

  /**
   * Chuẩn hóa loại media (image / video / none)
   */
  function normalizeMedia(mediaUrlInput, mediaTypeInput) {
    const url = (mediaUrlInput || "").trim();
    if (!url) {
      return { mediaUrl: "", mediaType: "none" };
    }

    let type = (mediaTypeInput || "none").trim().toLowerCase();
    if (type !== "image" && type !== "video") {
      // Tự động nhận diện nếu người dùng dán link nhưng chưa chọn loại
      const lowerUrl = url.toLowerCase();
      if (
        lowerUrl.includes("youtube.com") ||
        lowerUrl.includes("youtu.be") ||
        lowerUrl.endsWith(".mp4") ||
        lowerUrl.endsWith(".webm")
      ) {
        type = "video";
      } else {
        type = "image";
      }
    }

    return { mediaUrl: url, mediaType: type };
  }

  /**
   * Tạo bài thảo luận mới -> Trạng thái mặc định "pending" chờ Admin duyệt
   */
  function createPost(payload) {
    const currentUser = AuthModule.requireAuth("đăng bài thảo luận");
    if (!currentUser) return { ok: false, message: "Chưa đăng nhập." };

    const title = (payload.title || "").trim();
    const content = (payload.content || "").trim();
    const rawTopic = (payload.newTopic || payload.topic || "").trim();
    const visibility = ["public", "friends", "onlyme"].includes(payload.visibility)
      ? payload.visibility
      : "public";

    if (!title || !content || !rawTopic) {
      return { ok: false, message: "Vui lòng nhập đầy đủ tiêu đề, chủ đề và nội dung bài thảo luận." };
    }

    // Lưu chủ đề mới nếu người dùng tự nhập
    const finalTopic = StorageDB.addTopic(rawTopic);
    const media = normalizeMedia(payload.mediaUrl, payload.mediaType);

    const newPost = {
      id: StorageDB.generateId("post"),
      authorId: currentUser.id,
      title: title,
      content: content,
      topic: finalTopic,
      mediaUrl: media.mediaUrl,
      mediaType: media.mediaType,
      visibility: visibility,
      status: "pending", // Gửi kiểm duyệt theo Luồng 2 Bước 3
      priority: "normal",
      moderatorNote: "",
      likes: [],
      dislikes: [],
      comments: [],
      createdAt: new Date().toISOString()
    };

    const posts = StorageDB.getPosts();
    posts.unshift(newPost);
    StorageDB.savePosts(posts);

    return {
      ok: true,
      message: "Đăng bài thành công! Bài viết của bạn đang chờ Quản trị viên kiểm duyệt.",
      post: newPost
    };
  }

  /**
   * Cập nhật bài thảo luận (Tác giả hoặc Admin)
   * Nếu bài đang ở trạng thái "needs_edit" hoặc "rejected", sau khi sửa sẽ chuyển về "pending" để duyệt lại.
   */
  function updatePost(postId, payload) {
    const currentUser = AuthModule.requireAuth("chỉnh sửa bài viết");
    if (!currentUser) return { ok: false, message: "Chưa đăng nhập." };

    const posts = StorageDB.getPosts();
    const index = posts.findIndex(function (p) {
      return p.id === postId;
    });

    if (index === -1) {
      return { ok: false, message: "Không tìm thấy bài thảo luận." };
    }

    const post = posts[index];
    if (!StorageDB.canModifyItem(post, currentUser)) {
      return { ok: false, message: "Bạn không có quyền chỉnh sửa bài viết này." };
    }

    const title = (payload.title !== undefined ? payload.title : post.title).trim();
    const content = (payload.content !== undefined ? payload.content : post.content).trim();
    const rawTopic = (payload.newTopic || payload.topic || post.topic).trim();
    const visibility = ["public", "friends", "onlyme"].includes(payload.visibility)
      ? payload.visibility
      : post.visibility;

    if (!title || !content || !rawTopic) {
      return { ok: false, message: "Tiêu đề, chủ đề và nội dung không được để trống." };
    }

    const finalTopic = StorageDB.addTopic(rawTopic);
    const media =
      payload.mediaUrl !== undefined
        ? normalizeMedia(payload.mediaUrl, payload.mediaType)
        : { mediaUrl: post.mediaUrl, mediaType: post.mediaType };

    // Nếu bài bị yêu cầu chỉnh sửa/từ chối và tác giả sửa lại -> gửi duyệt lại
    let nextStatus = post.status;
    let nextModeratorNote = post.moderatorNote;
    if ((post.status === "needs_edit" || post.status === "rejected") && currentUser.id === post.authorId) {
      nextStatus = "pending";
      nextModeratorNote = "";
    }

    posts[index] = Object.assign({}, post, {
      title: title,
      content: content,
      topic: finalTopic,
      mediaUrl: media.mediaUrl,
      mediaType: media.mediaType,
      visibility: visibility,
      status: nextStatus,
      moderatorNote: nextModeratorNote
    });

    StorageDB.savePosts(posts);
    return {
      ok: true,
      message:
        nextStatus === "pending" && post.status !== "pending"
          ? "Đã cập nhật và gửi lại bài viết để kiểm duyệt!"
          : "Đã cập nhật bài thảo luận!",
      post: posts[index]
    };
  }

  /**
   * Đổi nhanh phạm vi hiển thị (public / friends / onlyme)
   */
  function changePostVisibility(postId, newVisibility) {
    if (!["public", "friends", "onlyme"].includes(newVisibility)) {
      return { ok: false, message: "Phạm vi hiển thị không hợp lệ." };
    }
    return updatePost(postId, { visibility: newVisibility });
  }

  /**
   * Xóa bài thảo luận (Tác giả hoặc Admin)
   */
  function deletePost(postId) {
    const currentUser = AuthModule.requireAuth("xóa bài viết");
    if (!currentUser) return { ok: false, message: "Chưa đăng nhập." };

    const posts = StorageDB.getPosts();
    const targetPost = posts.find(function (p) {
      return p.id === postId;
    });

    if (!targetPost) {
      return { ok: false, message: "Bài viết không tồn tại." };
    }

    if (!StorageDB.canModifyItem(targetPost, currentUser)) {
      return { ok: false, message: "Bạn không có quyền xóa bài viết này." };
    }

    const updatedPosts = posts.filter(function (p) {
      return p.id !== postId;
    });
    StorageDB.savePosts(updatedPosts);

    // Đánh dấu đã xử lý các báo cáo liên quan đến bài đã bị xóa
    const reports = StorageDB.getReports().map(function (rep) {
      if (rep.targetType === "post" && rep.targetId === postId && rep.status === "pending") {
        return Object.assign({}, rep, { status: "resolved" });
      }
      return rep;
    });
    StorageDB.saveReports(reports);

    return { ok: true, message: "Đã xóa bài thảo luận." };
  }

  // =========================================================================
  // 2. TƯƠNG TÁC BÀI VIẾT: LIKE / DISLIKE, BÌNH LUẬN ĐA CẤP, BÁO CÁO VI PHẠM
  // =========================================================================

  /**
   * Toggle Like (Nếu đang Dislike thì tự động gỡ Dislike)
   */
  function toggleLike(postId) {
    const currentUser = AuthModule.requireAuth("thích bài viết");
    if (!currentUser) return { ok: false };

    const posts = StorageDB.getPosts();
    const index = posts.findIndex(function (p) {
      return p.id === postId;
    });
    if (index === -1) return { ok: false };

    const post = posts[index];
    if (!StorageDB.canViewItem(post, currentUser)) {
      AuthModule.showToast("Bạn không có quyền tương tác với bài viết này.", "error");
      return { ok: false };
    }

    post.likes = Array.isArray(post.likes) ? post.likes : [];
    post.dislikes = Array.isArray(post.dislikes) ? post.dislikes : [];

    const likeIdx = post.likes.indexOf(currentUser.id);
    if (likeIdx > -1) {
      post.likes.splice(likeIdx, 1);
    } else {
      post.likes.push(currentUser.id);
      const dislikeIdx = post.dislikes.indexOf(currentUser.id);
      if (dislikeIdx > -1) {
        post.dislikes.splice(dislikeIdx, 1);
      }
    }

    posts[index] = post;
    StorageDB.savePosts(posts);
    return { ok: true, post: post };
  }

  /**
   * Toggle Dislike (Nếu đang Like thì tự động gỡ Like)
   */
  function toggleDislike(postId) {
    const currentUser = AuthModule.requireAuth("bày tỏ không thích bài viết");
    if (!currentUser) return { ok: false };

    const posts = StorageDB.getPosts();
    const index = posts.findIndex(function (p) {
      return p.id === postId;
    });
    if (index === -1) return { ok: false };

    const post = posts[index];
    if (!StorageDB.canViewItem(post, currentUser)) {
      AuthModule.showToast("Bạn không có quyền tương tác với bài viết này.", "error");
      return { ok: false };
    }

    post.likes = Array.isArray(post.likes) ? post.likes : [];
    post.dislikes = Array.isArray(post.dislikes) ? post.dislikes : [];

    const dislikeIdx = post.dislikes.indexOf(currentUser.id);
    if (dislikeIdx > -1) {
      post.dislikes.splice(dislikeIdx, 1);
    } else {
      post.dislikes.push(currentUser.id);
      const likeIdx = post.likes.indexOf(currentUser.id);
      if (likeIdx > -1) {
        post.likes.splice(likeIdx, 1);
      }
    }

    posts[index] = post;
    StorageDB.savePosts(posts);
    return { ok: true, post: post };
  }

  /**
   * Thêm bình luận mới vào bài viết (hỗ trợ đính kèm mediaUrl & mediaType)
   */
  function addComment(postId, contentInput, mediaUrlInput, mediaTypeInput) {
    const currentUser = AuthModule.requireAuth("bình luận bài viết");
    if (!currentUser) return { ok: false };

    const content = (contentInput || "").trim();
    const media = normalizeMedia(mediaUrlInput, mediaTypeInput);

    if (!content && media.mediaType === "none") {
      AuthModule.showToast("Vui lòng nhập nội dung bình luận hoặc đính kèm hình ảnh/video.", "warning");
      return { ok: false };
    }

    const posts = StorageDB.getPosts();
    const index = posts.findIndex(function (p) {
      return p.id === postId;
    });
    if (index === -1) return { ok: false };

    const post = posts[index];
    if (!StorageDB.canViewItem(post, currentUser)) {
      AuthModule.showToast("Bạn không có quyền bình luận bài viết này.", "error");
      return { ok: false };
    }

    post.comments = Array.isArray(post.comments) ? post.comments : [];
    const newComment = {
      id: StorageDB.generateId("cmt"),
      authorId: currentUser.id,
      content: content,
      mediaUrl: media.mediaUrl,
      mediaType: media.mediaType,
      createdAt: new Date().toISOString(),
      replies: []
    };

    post.comments.push(newComment);
    posts[index] = post;
    StorageDB.savePosts(posts);

    return { ok: true, comment: newComment, post: post };
  }

  /**
   * Trả lời một bình luận có sẵn (đẩy vào mảng replies của bình luận đó)
   */
  function addReply(postId, commentId, contentInput, mediaUrlInput, mediaTypeInput) {
    const currentUser = AuthModule.requireAuth("trả lời bình luận");
    if (!currentUser) return { ok: false };

    const content = (contentInput || "").trim();
    const media = normalizeMedia(mediaUrlInput, mediaTypeInput);

    if (!content && media.mediaType === "none") {
      AuthModule.showToast("Vui lòng nhập nội dung trả lời hoặc đính kèm hình ảnh/video.", "warning");
      return { ok: false };
    }

    const posts = StorageDB.getPosts();
    const postIndex = posts.findIndex(function (p) {
      return p.id === postId;
    });
    if (postIndex === -1) return { ok: false };

    const post = posts[postIndex];
    if (!StorageDB.canViewItem(post, currentUser)) {
      AuthModule.showToast("Bạn không có quyền tương tác với bài viết này.", "error");
      return { ok: false };
    }

    const comment = (post.comments || []).find(function (c) {
      return c.id === commentId;
    });
    if (!comment) return { ok: false };

    comment.replies = Array.isArray(comment.replies) ? comment.replies : [];
    const newReply = {
      id: StorageDB.generateId("rep"),
      authorId: currentUser.id,
      content: content,
      mediaUrl: media.mediaUrl,
      mediaType: media.mediaType,
      createdAt: new Date().toISOString()
    };

    comment.replies.push(newReply);
    posts[postIndex] = post;
    StorageDB.savePosts(posts);

    return { ok: true, reply: newReply, post: post };
  }

  /**
   * Xóa bình luận hoặc phản hồi (Tác giả bình luận, tác giả bài viết hoặc Admin)
   */
  function deleteCommentOrReply(postId, commentId, replyId) {
    const currentUser = AuthModule.requireAuth("xóa bình luận");
    if (!currentUser) return { ok: false };

    const posts = StorageDB.getPosts();
    const postIndex = posts.findIndex(function (p) {
      return p.id === postId;
    });
    if (postIndex === -1) return { ok: false };

    const post = posts[postIndex];
    const commentIndex = (post.comments || []).findIndex(function (c) {
      return c.id === commentId;
    });
    if (commentIndex === -1) return { ok: false };

    if (replyId) {
      const comment = post.comments[commentIndex];
      const reply = (comment.replies || []).find(function (r) {
        return r.id === replyId;
      });
      if (!reply) return { ok: false };

      const canDelete =
        reply.authorId === currentUser.id ||
        post.authorId === currentUser.id ||
        currentUser.role === "admin";
      if (!canDelete) {
        AuthModule.showToast("Bạn không có quyền xóa phản hồi này.", "error");
        return { ok: false };
      }

      comment.replies = comment.replies.filter(function (r) {
        return r.id !== replyId;
      });
    } else {
      const comment = post.comments[commentIndex];
      const canDelete =
        comment.authorId === currentUser.id ||
        post.authorId === currentUser.id ||
        currentUser.role === "admin";
      if (!canDelete) {
        AuthModule.showToast("Bạn không có quyền xóa bình luận này.", "error");
        return { ok: false };
      }

      post.comments.splice(commentIndex, 1);
    }

    posts[postIndex] = post;
    StorageDB.savePosts(posts);
    return { ok: true };
  }

  /**
   * Báo cáo bài viết vi phạm -> Tạo bản ghi trong reports & nâng priority bài viết lên "high"
   */
  function reportPost(postId, reasonInput) {
    const currentUser = AuthModule.requireAuth("báo cáo nội dung vi phạm");
    if (!currentUser) return { ok: false, message: "Chưa đăng nhập." };

    const reason = (reasonInput || "").trim();
    if (!reason) {
      return { ok: false, message: "Vui lòng nhập lý do báo cáo vi phạm." };
    }

    const posts = StorageDB.getPosts();
    const postIndex = posts.findIndex(function (p) {
      return p.id === postId;
    });
    if (postIndex === -1) {
      return { ok: false, message: "Không tìm thấy bài viết cần báo cáo." };
    }

    // Lưu báo cáo mới
    const reports = StorageDB.getReports();
    const newReport = {
      id: StorageDB.generateId("rep"),
      reporterId: currentUser.id,
      targetType: "post",
      targetId: postId,
      reason: reason,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    reports.unshift(newReport);
    StorageDB.saveReports(reports);

    // Đẩy mức ưu tiên bài viết lên "high" để nổi bật trong hàng chờ Admin
    posts[postIndex].priority = "high";
    StorageDB.savePosts(posts);

    return {
      ok: true,
      message: "Đã gửi báo cáo vi phạm tới Quản trị viên. Cảm ơn bạn đã đóng góp!",
      report: newReport
    };
  }

  // =========================================================================
  // 3. TÍNH TOÁN CHỈ SỐ TƯƠNG TÁC, LỌC VÀ SẮP XẾP DANH SÁCH BÀI VIẾT
  // =========================================================================

  function getTotalCommentsCount(post) {
    if (!Array.isArray(post.comments)) return 0;
    return post.comments.reduce(function (sum, cmt) {
      const repliesCount = Array.isArray(cmt.replies) ? cmt.replies.length : 0;
      return sum + 1 + repliesCount;
    }, 0);
  }

  function getPostEngagementScore(post) {
    const likes = Array.isArray(post.likes) ? post.likes.length : 0;
    const dislikes = Array.isArray(post.dislikes) ? post.dislikes.length : 0;
    const comments = getTotalCommentsCount(post);
    return likes + dislikes + comments;
  }

  /**
   * Trả về danh sách bài viết đã qua bộ lọc quyền xem, bộ lọc tìm kiếm và sắp xếp
   */
  function getFilteredPosts(customFilters) {
    const criteria = Object.assign({}, feedState, customFilters || {});
    const currentUser = StorageDB.getCurrentUser();
    const allPosts = StorageDB.getPosts();

    // Bước 1: Lọc theo quyền xem (status === 'approved' || author) & visibility (public/friends/onlyme)
    let visiblePosts = StorageDB.filterVisibleItems(allPosts, currentUser);

    // Bước 2: Lọc theo tác giả cụ thể (dùng cho trang hồ sơ cá nhân)
    if (criteria.onlyAuthorId) {
      visiblePosts = visiblePosts.filter(function (p) {
        return p.authorId === criteria.onlyAuthorId;
      });
    }

    // Bước 3: Lọc theo chủ đề
    if (criteria.topic && criteria.topic !== "all") {
      visiblePosts = visiblePosts.filter(function (p) {
        return p.topic === criteria.topic;
      });
    }

    // Bước 4: Lọc theo phạm vi hiển thị
    if (criteria.visibility && criteria.visibility !== "all") {
      visiblePosts = visiblePosts.filter(function (p) {
        return p.visibility === criteria.visibility;
      });
    }

    // Bước 5: Tìm kiếm theo từ khóa (tiêu đề, nội dung, chủ đề hoặc tên tác giả)
    if (criteria.keyword && criteria.keyword.trim() !== "") {
      const kw = criteria.keyword.trim().toLowerCase();
      visiblePosts = visiblePosts.filter(function (p) {
        const author = StorageDB.getUserById(p.authorId);
        const authorName = author ? author.fullName.toLowerCase() : "";
        return (
          p.title.toLowerCase().includes(kw) ||
          p.content.toLowerCase().includes(kw) ||
          p.topic.toLowerCase().includes(kw) ||
          authorName.includes(kw)
        );
      });
    }

    // Bước 6: Sắp xếp danh sách
    const topicStatsMap = {};
    if (criteria.sortBy === "topic_interested") {
      StorageDB.getTopicsWithStats().forEach(function (t) {
        topicStatsMap[t.name] = t.interestScore;
      });
    }

    visiblePosts.sort(function (a, b) {
      if (criteria.sortBy === "most_useful") {
        // Bài hữu ích nhất (nhiều Like nhất)
        const diff = (b.likes ? b.likes.length : 0) - (a.likes ? a.likes.length : 0);
        if (diff !== 0) return diff;
      } else if (criteria.sortBy === "most_interested") {
        // Bài được quan tâm nhất (tổng Like + Dislike + Bình luận cao nhất)
        const diff = getPostEngagementScore(b) - getPostEngagementScore(a);
        if (diff !== 0) return diff;
      } else if (criteria.sortBy === "topic_interested") {
        // Ưu tiên bài thuộc chủ đề có tổng lượng quan tâm lớn nhất
        const diff = (topicStatsMap[b.topic] || 0) - (topicStatsMap[a.topic] || 0);
        if (diff !== 0) return diff;
      }

      // Mặc định sắp xếp bài mới nhất lên đầu
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return visiblePosts;
  }

  // =========================================================================
  // 4. RENDER GIAO DIỆN HTML CHO BÀI THẢO LUẬN & BÌNH LUẬN ĐA CẤP
  // =========================================================================

  function renderMediaHTML(mediaUrl, mediaType, altText) {
    if (!mediaUrl || mediaType === "none") return "";
    const safeUrl = StorageDB.escapeHTML(mediaUrl);
    const safeAlt = StorageDB.escapeHTML(altText || "Nội dung đính kèm");

    if (mediaType === "image") {
      return (
        '<div class="post-media">' +
        '<img src="' +
        safeUrl +
        '" alt="' +
        safeAlt +
        '" loading="lazy" onerror="this.style.display=\'none\'">' +
        "</div>"
      );
    }

    if (mediaType === "video") {
      // Hỗ trợ cả link nhúng YouTube (<iframe>) và file video trực tiếp (<video>)
      if (safeUrl.includes("youtube.com") || safeUrl.includes("youtu.be")) {
        let embedUrl = safeUrl;
        if (safeUrl.includes("watch?v=")) {
          embedUrl = safeUrl.replace("watch?v=", "embed/").split("&")[0];
        } else if (safeUrl.includes("youtu.be/")) {
          embedUrl = safeUrl.replace("youtu.be/", "www.youtube.com/embed/").split("?")[0];
        }
        return (
          '<div class="post-media post-media-video">' +
          '<iframe src="' +
          embedUrl +
          '" title="' +
          safeAlt +
          '" frameborder="0" allowfullscreen></iframe>' +
          "</div>"
        );
      }

      return (
        '<div class="post-media post-media-video">' +
        '<video src="' +
        safeUrl +
        '" controls preload="metadata"></video>' +
        "</div>"
      );
    }

    return "";
  }

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

  /**
   * Render danh sách bình luận & phản hồi lồng nhau bằng thẻ <ul> / <li> đúng chuẩn HTML5
   */
  function renderCommentsListHTML(post, currentUser) {
    const comments = Array.isArray(post.comments) ? post.comments : [];
    if (comments.length === 0) {
      return '<p class="empty-comment-text">Chưa có bình luận nào. Hãy là người đầu tiên thảo luận!</p>';
    }

    let html = '<ul class="comment-list">';
    comments.forEach(function (cmt) {
      const author = StorageDB.getUserById(cmt.authorId) || {
        fullName: "Người dùng ẩn danh",
        avatar: "assets/images/default-avatar.png"
      };
      const canDeleteCmt =
        currentUser &&
        (cmt.authorId === currentUser.id ||
          post.authorId === currentUser.id ||
          currentUser.role === "admin");

      html +=
        '<li class="comment-item" data-comment-id="' +
        cmt.id +
        '">' +
        '<div class="comment-header">' +
        '<img class="avatar-sm" src="' +
        StorageDB.escapeHTML(author.avatar) +
        '" alt="' +
        StorageDB.escapeHTML(author.fullName) +
        '">' +
        '<div class="comment-meta">' +
        "<strong>" +
        StorageDB.escapeHTML(author.fullName) +
        "</strong>" +
        '<span class="text-muted"> • ' +
        StorageDB.formatDate(cmt.createdAt) +
        "</span>" +
        "</div>" +
        "</div>" +
        '<div class="comment-body">' +
        (cmt.content ? "<p>" + StorageDB.escapeHTML(cmt.content) + "</p>" : "") +
        renderMediaHTML(cmt.mediaUrl, cmt.mediaType, "Đính kèm bình luận") +
        "</div>" +
        '<div class="comment-actions">' +
        '<button type="button" class="btn-link js-toggle-reply-form" data-post-id="' +
        post.id +
        '" data-comment-id="' +
        cmt.id +
        '">Trả lời</button>' +
        (canDeleteCmt
          ? ' <button type="button" class="btn-link text-danger js-delete-comment" data-post-id="' +
            post.id +
            '" data-comment-id="' +
            cmt.id +
            '">Xóa</button>'
          : "") +
        "</div>";

      // Form trả lời bình luận (ẩn mặc định, mở khi bấm "Trả lời")
      html +=
        '<form class="reply-form js-reply-form" data-post-id="' +
        post.id +
        '" data-comment-id="' +
        cmt.id +
        '" style="display:none;">' +
        '<input type="text" name="content" placeholder="Viết câu trả lời của bạn...">' +
        '<div class="media-inline-inputs">' +
        '<select name="mediaType">' +
        '<option value="none">Không đính kèm</option>' +
        '<option value="image">Ảnh (URL)</option>' +
        '<option value="video">Video (URL)</option>' +
        "</select>" +
        '<input type="url" name="mediaUrl" placeholder="Dán liên kết ảnh hoặc video (tùy chọn)">' +
        '<button type="submit" class="btn btn-sm btn-primary">Gửi</button>' +
        "</div>" +
        "</form>";

      // Danh sách phản hồi lồng nhau (replies)
      if (Array.isArray(cmt.replies) && cmt.replies.length > 0) {
        html += '<ul class="reply-list">';
        cmt.replies.forEach(function (rep) {
          const repAuthor = StorageDB.getUserById(rep.authorId) || {
            fullName: "Người dùng ẩn danh",
            avatar: "assets/images/default-avatar.png"
          };
          const canDeleteRep =
            currentUser &&
            (rep.authorId === currentUser.id ||
              post.authorId === currentUser.id ||
              currentUser.role === "admin");

          html +=
            '<li class="reply-item">' +
            '<div class="comment-header">' +
            '<img class="avatar-xs" src="' +
            StorageDB.escapeHTML(repAuthor.avatar) +
            '" alt="' +
            StorageDB.escapeHTML(repAuthor.fullName) +
            '">' +
            '<div class="comment-meta">' +
            "<strong>" +
            StorageDB.escapeHTML(repAuthor.fullName) +
            "</strong>" +
            '<span class="text-muted"> • ' +
            StorageDB.formatDate(rep.createdAt) +
            "</span>" +
            "</div>" +
            "</div>" +
            '<div class="comment-body">' +
            (rep.content ? "<p>" + StorageDB.escapeHTML(rep.content) + "</p>" : "") +
            renderMediaHTML(rep.mediaUrl, rep.mediaType, "Đính kèm phản hồi") +
            "</div>" +
            (canDeleteRep
              ? '<div class="comment-actions"><button type="button" class="btn-link text-danger js-delete-comment" data-post-id="' +
                post.id +
                '" data-comment-id="' +
                cmt.id +
                '" data-reply-id="' +
                rep.id +
                '">Xóa</button></div>'
              : "") +
            "</li>";
        });
        html += "</ul>";
      }

      html += "</li>";
    });
    html += "</ul>";
    return html;
  }

  /**
   * Render toàn bộ danh sách thẻ bài viết ra container chỉ định
   */
  function renderPostsFeed(containerId, customFilters) {
    const container = document.getElementById(containerId || "postsFeedContainer");
    if (!container) return;

    const currentUser = StorageDB.getCurrentUser();
    const posts = getFilteredPosts(customFilters);

    if (posts.length === 0) {
      container.innerHTML =
        '<div class="empty-state card">' +
        "<p>Không tìm thấy bài thảo luận nào phù hợp với bộ lọc hoặc quyền xem hiện tại.</p>" +
        "</div>";
      return;
    }

    container.innerHTML = posts
      .map(function (post) {
        const author = StorageDB.getUserById(post.authorId) || {
          fullName: "Thành viên",
          avatar: "assets/images/default-avatar.png"
        };
        const visInfo = getVisibilityLabel(post.visibility);
        const isAuthor = Boolean(currentUser && currentUser.id === post.authorId);
        const canModify = StorageDB.canModifyItem(post, currentUser);

        const likes = Array.isArray(post.likes) ? post.likes : [];
        const dislikes = Array.isArray(post.dislikes) ? post.dislikes : [];
        const isLiked = currentUser ? likes.includes(currentUser.id) : false;
        const isDisliked = currentUser ? dislikes.includes(currentUser.id) : false;
        const totalComments = getTotalCommentsCount(post);

        // Ghi chú yêu cầu chỉnh sửa từ Admin (nếu có)
        const modNoteHTML =
          post.moderatorNote && (isAuthor || (currentUser && currentUser.role === "admin"))
            ? '<div class="moderator-note-box"><strong>Ghi chú kiểm duyệt:</strong> ' +
              StorageDB.escapeHTML(post.moderatorNote) +
              "</div>"
            : "";

        // Bộ chọn đổi phạm vi nhanh cho chính tác giả
        const visibilitySelectHTML = isAuthor
          ? '<select class="visibility-quick-select js-change-visibility" data-post-id="' +
            post.id +
            '" title="Đổi phạm vi hiển thị">' +
            '<option value="public"' +
            (post.visibility === "public" ? " selected" : "") +
            ">Công khai</option>" +
            '<option value="friends"' +
            (post.visibility === "friends" ? " selected" : "") +
            ">Bạn bè</option>" +
            '<option value="onlyme"' +
            (post.visibility === "onlyme" ? " selected" : "") +
            ">Chỉ mình tôi</option>" +
            "</select>"
          : '<span class="badge ' + visInfo.cls + '">' + visInfo.text + "</span>";

        // Nút Sửa / Xóa / Báo cáo
        const manageButtonsHTML =
          '<div class="post-card-controls">' +
          (canModify
            ? '<button type="button" class="btn btn-sm btn-outline js-edit-post" data-post-id="' +
              post.id +
              '">Sửa</button>' +
              '<button type="button" class="btn btn-sm btn-danger-outline js-delete-post" data-post-id="' +
              post.id +
              '">Xóa</button>'
            : "") +
          (!isAuthor
            ? '<button type="button" class="btn btn-sm btn-warning-outline js-report-post" data-post-id="' +
              post.id +
              '">Báo cáo</button>'
            : "") +
          "</div>";

        return (
          '<article class="post-card card" data-post-id="' +
          post.id +
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
          '<span>' +
          StorageDB.formatDate(post.createdAt) +
          "</span>" +
          ' • <span class="badge badge-topic">' +
          StorageDB.escapeHTML(post.topic) +
          "</span>" +
          " • " +
          visibilitySelectHTML +
          " " +
          getStatusBadgeHTML(post.status) +
          "</div>" +
          "</div>" +
          "</div>" +
          manageButtonsHTML +
          "</header>" +
          modNoteHTML +
          '<div class="post-card-body">' +
          '<h3 class="post-title">' +
          StorageDB.escapeHTML(post.title) +
          "</h3>" +
          '<p class="post-content">' +
          StorageDB.escapeHTML(post.content).replace(/\n/g, "<br>") +
          "</p>" +
          renderMediaHTML(post.mediaUrl, post.mediaType, post.title) +
          "</div>" +
          '<footer class="post-card-footer">' +
          '<div class="post-reactions">' +
          '<button type="button" class="btn-reaction js-like-post ' +
          (isLiked ? "active" : "") +
          '" data-post-id="' +
          post.id +
          '">👍 Hữu ích (' +
          likes.length +
          ")</button>" +
          '<button type="button" class="btn-reaction js-dislike-post ' +
          (isDisliked ? "active" : "") +
          '" data-post-id="' +
          post.id +
          '">👎 Không hữu ích (' +
          dislikes.length +
          ")</button>" +
          '<span class="comment-count-label">💬 ' +
          totalComments +
          " bình luận</span>" +
          "</div>" +
          '<section class="comments-section">' +
          renderCommentsListHTML(post, currentUser) +
          '<form class="comment-form js-comment-form" data-post-id="' +
          post.id +
          '">' +
          '<input type="text" name="content" placeholder="Viết bình luận thảo luận...">' +
          '<div class="media-inline-inputs">' +
          '<select name="mediaType">' +
          '<option value="none">Không đính kèm</option>' +
          '<option value="image">Ảnh (URL)</option>' +
          '<option value="video">Video (URL)</option>' +
          "</select>" +
          '<input type="url" name="mediaUrl" placeholder="Dán liên kết ảnh hoặc video (tùy chọn)">' +
          '<button type="submit" class="btn btn-sm btn-primary">Bình luận</button>' +
          "</div>" +
          "</form>" +
          "</section>" +
          "</footer>" +
          "</article>"
        );
      })
      .join("");
  }

  // =========================================================================
  // 5. ĐỒNG BỘ BỘ CHỌN CHỦ ĐỀ & SỰ KIỆN GIAO DIỆN (EVENT DELEGATION)
  // =========================================================================

  function populateTopicElements() {
    const topicsWithStats = StorageDB.getTopicsWithStats();

    // Đổ dữ liệu vào các thẻ <select class="js-topic-select">
    document.querySelectorAll(".js-topic-select").forEach(function (selectEl) {
      const includeAll = selectEl.dataset.includeAll === "true";
      const currentVal = selectEl.value;
      let optionsHTML = includeAll ? '<option value="all">Tất cả chủ đề</option>' : "";

      topicsWithStats.forEach(function (t) {
        optionsHTML +=
          '<option value="' +
          StorageDB.escapeHTML(t.name) +
          '">' +
          StorageDB.escapeHTML(t.name) +
          "</option>";
      });

      selectEl.innerHTML = optionsHTML;
      if (currentVal) selectEl.value = currentVal;
    });

    // Render danh sách chủ đề nổi bật ở sidebar (nếu có)
    const sidebarTopicList = document.getElementById("sidebarTopicsList");
    if (sidebarTopicList) {
      const sortedTopics = topicsWithStats.slice().sort(function (a, b) {
        return b.interestScore - a.interestScore;
      });

      sidebarTopicList.innerHTML =
        '<li><button type="button" class="topic-filter-btn ' +
        (feedState.topic === "all" ? "active" : "") +
        '" data-topic="all">Tất cả chủ đề</button></li>' +
        sortedTopics
          .map(function (t) {
            return (
              '<li><button type="button" class="topic-filter-btn ' +
              (feedState.topic === t.name ? "active" : "") +
              '" data-topic="' +
              StorageDB.escapeHTML(t.name) +
              '">' +
              "<span>" +
              StorageDB.escapeHTML(t.name) +
              "</span>" +
              '<small class="topic-stat-pill" title="Lượt quan tâm / Lượt thích">' +
              t.interestScore +
              " tương tác • " +
              t.usefulnessScore +
              " thích</small>" +
              "</button></li>"
            );
          })
          .join("");
    }
  }

  function refreshAllViews(containerId) {
    populateTopicElements();
    renderPostsFeed(containerId || "postsFeedContainer");
    document.dispatchEvent(new CustomEvent("posts:changed"));
  }

  function openEditModalOrPrompt(postId) {
    const post = StorageDB.getPostById(postId);
    if (!post) return;

    // Nếu trang HTML có modal chỉnh sửa bài viết (#editPostModal)
    const editModal = document.getElementById("editPostModal");
    const editForm = document.getElementById("editPostForm");

    if (editModal && editForm) {
      editForm.dataset.postId = post.id;
      if (editForm.querySelector('[name="title"]')) {
        editForm.querySelector('[name="title"]').value = post.title;
      }
      if (editForm.querySelector('[name="content"]')) {
        editForm.querySelector('[name="content"]').value = post.content;
      }
      if (editForm.querySelector('[name="topic"]')) {
        editForm.querySelector('[name="topic"]').value = post.topic;
      }
      if (editForm.querySelector('[name="visibility"]')) {
        editForm.querySelector('[name="visibility"]').value = post.visibility;
      }
      if (editForm.querySelector('[name="mediaType"]')) {
        editForm.querySelector('[name="mediaType"]').value = post.mediaType || "none";
      }
      if (editForm.querySelector('[name="mediaUrl"]')) {
        editForm.querySelector('[name="mediaUrl"]').value = post.mediaUrl || "";
      }
      editModal.style.display = "flex";
      return;
    }

    // Fallback dùng prompt nếu trang chưa gắn modal
    const newTitle = prompt("Chỉnh sửa tiêu đề bài viết:", post.title);
    if (newTitle === null) return;
    const newContent = prompt("Chỉnh sửa nội dung bài viết:", post.content);
    if (newContent === null) return;

    const res = updatePost(postId, { title: newTitle, content: newContent });
    AuthModule.showToast(res.message, res.ok ? "success" : "error");
    if (res.ok) refreshAllViews();
  }

  function bindPostEvents() {
    populateTopicElements();

    // Form Tạo bài thảo luận mới (index.html)
    const createPostForm = document.getElementById("createPostForm");
    if (createPostForm) {
      createPostForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const title = (createPostForm.querySelector('[name="title"]') || {}).value;
        const content = (createPostForm.querySelector('[name="content"]') || {}).value;
        const topic = (createPostForm.querySelector('[name="topic"]') || {}).value;
        const newTopic = (createPostForm.querySelector('[name="newTopic"]') || {}).value;
        const visibility = (createPostForm.querySelector('[name="visibility"]') || {}).value;
        const mediaType = (createPostForm.querySelector('[name="mediaType"]') || {}).value;
        const mediaUrl = (createPostForm.querySelector('[name="mediaUrl"]') || {}).value;

        const res = createPost({
          title: title,
          content: content,
          topic: topic,
          newTopic: newTopic,
          visibility: visibility,
          mediaType: mediaType,
          mediaUrl: mediaUrl
        });

        AuthModule.showToast(res.message, res.ok ? "success" : "error");
        if (res.ok) {
          createPostForm.reset();
          refreshAllViews();
        }
      });
    }

    // Form Sửa bài thảo luận trong Modal (nếu có)
    const editPostForm = document.getElementById("editPostForm");
    if (editPostForm) {
      editPostForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const postId = editPostForm.dataset.postId;
        const res = updatePost(postId, {
          title: (editPostForm.querySelector('[name="title"]') || {}).value,
          content: (editPostForm.querySelector('[name="content"]') || {}).value,
          topic: (editPostForm.querySelector('[name="topic"]') || {}).value,
          newTopic: (editPostForm.querySelector('[name="newTopic"]') || {}).value,
          visibility: (editPostForm.querySelector('[name="visibility"]') || {}).value,
          mediaType: (editPostForm.querySelector('[name="mediaType"]') || {}).value,
          mediaUrl: (editPostForm.querySelector('[name="mediaUrl"]') || {}).value
        });

        AuthModule.showToast(res.message, res.ok ? "success" : "error");
        if (res.ok) {
          const editModal = document.getElementById("editPostModal");
          if (editModal) editModal.style.display = "none";
          refreshAllViews();
        }
      });
    }

    // Bộ lọc tìm kiếm, chủ đề, phạm vi, sắp xếp
    const searchInput = document.getElementById("postSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        feedState.keyword = searchInput.value;
        renderPostsFeed();
      });
    }

    const topicFilterSelect = document.getElementById("postTopicFilter");
    if (topicFilterSelect) {
      topicFilterSelect.addEventListener("change", function () {
        feedState.topic = topicFilterSelect.value;
        refreshAllViews();
      });
    }

    const visibilityFilterSelect = document.getElementById("postVisibilityFilter");
    if (visibilityFilterSelect) {
      visibilityFilterSelect.addEventListener("change", function () {
        feedState.visibility = visibilityFilterSelect.value;
        renderPostsFeed();
      });
    }

    const sortSelect = document.getElementById("postSortSelect");
    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        feedState.sortBy = sortSelect.value;
        renderPostsFeed();
      });
    }

    // Event Delegation cho tất cả nút tương tác bài viết, bình luận, lọc chủ đề sidebar
    document.addEventListener("click", function (e) {
      // 1. Lọc chủ đề từ sidebar
      const topicBtn = e.target.closest(".topic-filter-btn");
      if (topicBtn) {
        feedState.topic = topicBtn.dataset.topic || "all";
        const selectEl = document.getElementById("postTopicFilter");
        if (selectEl) selectEl.value = feedState.topic;
        refreshAllViews();
        return;
      }

      // 2. Like bài viết
      const likeBtn = e.target.closest(".js-like-post");
      if (likeBtn) {
        const res = toggleLike(likeBtn.dataset.postId);
        if (res.ok) refreshAllViews();
        return;
      }

      // 3. Dislike bài viết
      const dislikeBtn = e.target.closest(".js-dislike-post");
      if (dislikeBtn) {
        const res = toggleDislike(dislikeBtn.dataset.postId);
        if (res.ok) refreshAllViews();
        return;
      }

      // 4. Mở/đóng form trả lời bình luận
      const replyToggleBtn = e.target.closest(".js-toggle-reply-form");
      if (replyToggleBtn) {
        if (!AuthModule.requireAuth("trả lời bình luận")) return;
        const cmtItem = replyToggleBtn.closest(".comment-item");
        if (cmtItem) {
          const replyForm = cmtItem.querySelector(".js-reply-form");
          if (replyForm) {
            replyForm.style.display = replyForm.style.display === "none" ? "block" : "none";
          }
        }
        return;
      }

      // 5. Xóa bình luận hoặc phản hồi
      const deleteCmtBtn = e.target.closest(".js-delete-comment");
      if (deleteCmtBtn) {
        if (!confirm("Bạn có chắc muốn xóa bình luận này?")) return;
        const res = deleteCommentOrReply(
          deleteCmtBtn.dataset.postId,
          deleteCmtBtn.dataset.commentId,
          deleteCmtBtn.dataset.replyId
        );
        if (res.ok) {
          AuthModule.showToast("Đã xóa bình luận.", "info");
          refreshAllViews();
        }
        return;
      }

      // 6. Sửa bài viết
      const editBtn = e.target.closest(".js-edit-post");
      if (editBtn) {
        openEditModalOrPrompt(editBtn.dataset.postId);
        return;
      }

      // 7. Xóa bài viết
      const deleteBtn = e.target.closest(".js-delete-post");
      if (deleteBtn) {
        if (!confirm("Bạn có chắc chắn muốn xóa bài thảo luận này?")) return;
        const res = deletePost(deleteBtn.dataset.postId);
        AuthModule.showToast(res.message, res.ok ? "info" : "error");
        if (res.ok) refreshAllViews();
        return;
      }

      // 8. Báo cáo bài viết vi phạm
      const reportBtn = e.target.closest(".js-report-post");
      if (reportBtn) {
        if (!AuthModule.requireAuth("báo cáo nội dung vi phạm")) return;
        const reason = prompt("Nhập lý do báo cáo vi phạm cho bài thảo luận này:");
        if (reason === null) return;
        const res = reportPost(reportBtn.dataset.postId, reason);
        AuthModule.showToast(res.message, res.ok ? "success" : "error");
      }
    });

    // Event Delegation cho đổi phạm vi hiển thị nhanh
    document.addEventListener("change", function (e) {
      const visSelect = e.target.closest(".js-change-visibility");
      if (visSelect) {
        const res = changePostVisibility(visSelect.dataset.postId, visSelect.value);
        AuthModule.showToast(res.message, res.ok ? "success" : "error");
        if (res.ok) refreshAllViews();
      }
    });

    // Event Delegation cho gửi Bình luận & Trả lời bình luận
    document.addEventListener("submit", function (e) {
      const commentForm = e.target.closest(".js-comment-form");
      if (commentForm) {
        e.preventDefault();
        const postId = commentForm.dataset.postId;
        const content = (commentForm.querySelector('[name="content"]') || {}).value;
        const mediaType = (commentForm.querySelector('[name="mediaType"]') || {}).value;
        const mediaUrl = (commentForm.querySelector('[name="mediaUrl"]') || {}).value;

        const res = addComment(postId, content, mediaUrl, mediaType);
        if (res.ok) {
          refreshAllViews();
        }
        return;
      }

      const replyForm = e.target.closest(".js-reply-form");
      if (replyForm) {
        e.preventDefault();
        const postId = replyForm.dataset.postId;
        const commentId = replyForm.dataset.commentId;
        const content = (replyForm.querySelector('[name="content"]') || {}).value;
        const mediaType = (replyForm.querySelector('[name="mediaType"]') || {}).value;
        const mediaUrl = (replyForm.querySelector('[name="mediaUrl"]') || {}).value;

        const res = addReply(postId, commentId, content, mediaUrl, mediaType);
        if (res.ok) {
          refreshAllViews();
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindPostEvents();
    if (document.getElementById("postsFeedContainer")) {
      renderPostsFeed("postsFeedContainer");
    }
  });

  return {
    feedState: feedState,
    createPost: createPost,
    updatePost: updatePost,
    changePostVisibility: changePostVisibility,
    deletePost: deletePost,
    toggleLike: toggleLike,
    toggleDislike: toggleDislike,
    addComment: addComment,
    addReply: addReply,
    deleteCommentOrReply: deleteCommentOrReply,
    reportPost: reportPost,
    getFilteredPosts: getFilteredPosts,
    getTotalCommentsCount: getTotalCommentsCount,
    getPostEngagementScore: getPostEngagementScore,
    renderPostsFeed: renderPostsFeed,
    populateTopicElements: populateTopicElements
  };
})();