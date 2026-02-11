/* ==========================================================
   Research Paper Analyzer — Frontend Logic (Redesigned)
   ========================================================== */

(function () {
  "use strict";

  // ---- DOM refs ----
  const stateUpload = document.getElementById("stateUpload");
  const stateAnalyzing = document.getElementById("stateAnalyzing");
  const stateResults = document.getElementById("stateResults");

  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("fileInput");
  const fileInfo = document.getElementById("fileInfo");
  const fileName = document.getElementById("fileName");
  const fileSize = document.getElementById("fileSize");
  const uploadError = document.getElementById("uploadError");
  const analyzeBtn = document.getElementById("analyzeBtn");

  // New file preview
  const filePreview = document.getElementById("filePreview");
  const filePreviewName = document.getElementById("filePreviewName");
  const filePreviewSize = document.getElementById("filePreviewSize");
  const fileRemoveBtn = document.getElementById("fileRemoveBtn");

  // Progress
  const progressFill = document.getElementById("progressFill");
  const progressLabel = document.getElementById("progressLabel");
  const progressStep = document.getElementById("progressStep");
  const progressRing = document.getElementById("progressRing");
  const progressPct = document.getElementById("progressPct");
  const progressStepper = document.getElementById("progressStepper");

  // Drag overlay
  const dragOverlay = document.getElementById("dragOverlay");

  const sidebar = document.getElementById("sidebar");
  const contentArea = document.getElementById("contentArea");

  const statPages = document.getElementById("statPages");
  const statWords = document.getElementById("statWords");
  const statReadTime = document.getElementById("statReadTime");

  const exportBtn = document.getElementById("exportBtn");
  const newAnalysisBtn = document.getElementById("newAnalysisBtn");

  const exportModal = document.getElementById("exportModal");
  const modalClose = document.getElementById("modalClose");
  const modalCancel = document.getElementById("modalCancel");
  const modalExport = document.getElementById("modalExport");
  const exportPreviewContent = document.getElementById("exportPreviewContent");

  const toastContainer = document.getElementById("toastContainer");
  const themeToggle = document.getElementById("themeToggle");

  // Header
  const siteHeader = document.getElementById("siteHeader");
  const heroTagline = document.getElementById("heroTagline");

  // Bottom sheet
  const bottomSheet = document.getElementById("bottomSheet");
  const bottomSheetTabs = document.getElementById("bottomSheetTabs");

  const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
  const CIRCUMFERENCE = 2 * Math.PI * 78; // ~490.088
  let selectedFile = null;
  let analysisResults = null;
  let dragCounter = 0;

  // Section title mapping for export preview
  const SECTION_TITLES = {
    summary: "Summary",
    methodology: "Methodology",
    results_discussion: "Results & Discussion",
    key_findings: "Key Findings",
    keywords: "Keywords & Entities",
    strengths_weaknesses: "Strengths & Weaknesses",
    future_scope: "Future Research Directions",
    citations: "Citations"
  };

  // ============================================================
  // Theme
  // ============================================================

  function initTheme() {
    const saved = localStorage.getItem("rpa-theme");
    if (saved) {
      document.documentElement.setAttribute("data-theme", saved);
    }
  }

  function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute("data-theme");
    let next;
    if (current === "dark") {
      next = "light";
    } else if (current === "light") {
      next = "dark";
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      next = prefersDark ? "light" : "dark";
    }
    html.setAttribute("data-theme", next);
    localStorage.setItem("rpa-theme", next);

    // Momentary animation on the toggle button
    themeToggle.classList.add("theme-toggle--animating");
    setTimeout(function () {
      themeToggle.classList.remove("theme-toggle--animating");
    }, 300);
  }

  themeToggle.addEventListener("click", toggleTheme);
  initTheme();

  // ============================================================
  // Header scroll shrink
  // ============================================================

  function initHeaderScroll() {
    let ticking = false;
    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          if (window.scrollY > 40) {
            siteHeader.classList.remove("header--expanded");
            siteHeader.classList.add("header--compact");
          } else {
            siteHeader.classList.remove("header--compact");
            siteHeader.classList.add("header--expanded");
          }
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  initHeaderScroll();

  function initReadingProgress() {
    var bar = document.getElementById("readingProgressBar");
    if (!bar) return;

    function updateProgress() {
      if (stateResults.hidden) return;
      var scrollTop = window.scrollY || document.documentElement.scrollTop;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
      bar.style.transform = "scaleX(" + ratio + ")";
    }

    window.addEventListener("scroll", updateProgress, { passive: true });
  }

  initReadingProgress();

  // ============================================================
  // Typewriter effect
  // ============================================================

  function typewriterEffect(element, text, speed) {
    element.textContent = "";
    element.classList.remove("typewriter-done");
    let i = 0;
    function type() {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
        setTimeout(type, speed);
      } else {
        element.classList.add("typewriter-done");
      }
    }
    type();
  }

  // Run typewriter on page load
  setTimeout(function () {
    typewriterEffect(heroTagline, "AI-powered analysis, completely offline", 45);
  }, 500);

  // ============================================================
  // State switching
  // ============================================================

  function showState(state) {
    stateUpload.hidden = state !== "upload";
    stateAnalyzing.hidden = state !== "analyzing";
    stateResults.hidden = state !== "results";

    // Bottom sheet: only visible in results on mobile
    if (bottomSheet) {
      bottomSheet.style.display = (state === "results" && window.innerWidth <= 768) ? "block" : "none";
    }

    // Reading progress bar
    var progressBar = document.getElementById("readingProgressBar");
    if (progressBar) {
      if (state === "results") {
        progressBar.classList.add("reading-progress--active");
      } else {
        progressBar.classList.remove("reading-progress--active");
        progressBar.style.transform = "scaleX(0)";
      }
    }

    // Scroll to top on state change
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ============================================================
  // Full-page drag overlay
  // ============================================================

  document.body.addEventListener("dragenter", function (e) {
    e.preventDefault();
    if (stateUpload.hidden) return;
    dragCounter++;
    if (dragCounter === 1) {
      dragOverlay.hidden = false;
    }
  });

  document.body.addEventListener("dragover", function (e) {
    e.preventDefault();
  });

  document.body.addEventListener("dragleave", function (e) {
    e.preventDefault();
    if (stateUpload.hidden) return;
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dragOverlay.hidden = true;
    }
  });

  document.body.addEventListener("drop", function (e) {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.hidden = true;
    if (stateUpload.hidden) return;
    var files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });

  // ============================================================
  // Drag-and-drop + file selection (upload zone)
  // ============================================================

  uploadZone.addEventListener("click", function () { fileInput.click(); });

  uploadZone.addEventListener("dragenter", function (e) {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });

  uploadZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });

  uploadZone.addEventListener("dragleave", function (e) {
    e.preventDefault();
    uploadZone.classList.remove("drag-over");
  });

  uploadZone.addEventListener("drop", function (e) {
    e.preventDefault();
    uploadZone.classList.remove("drag-over");
    var files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });

  fileInput.addEventListener("change", function () {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
  });

  function createUploadParticles() {
    for (var i = 0; i < 7; i++) {
      var p = document.createElement("div");
      p.className = "upload-particle";
      p.style.setProperty("--duration", (2.5 + Math.random() * 2) + "s");
      p.style.setProperty("--delay", (Math.random() * 2.5) + "s");
      p.style.left = (15 + Math.random() * 70) + "%";
      p.style.bottom = (5 + Math.random() * 30) + "%";
      uploadZone.appendChild(p);
    }
  }

  function destroyUploadParticles() {
    uploadZone.querySelectorAll(".upload-particle").forEach(function (p) {
      p.remove();
    });
  }

  createUploadParticles();

  function handleFile(file) {
    uploadError.hidden = true;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showError("Only PDF files are accepted.");
      return;
    }

    if (file.size > MAX_SIZE) {
      showError("File exceeds the 25 MB size limit.");
      return;
    }

    destroyUploadParticles();

    selectedFile = file;

    // Old file info (backward compat)
    fileName.textContent = file.name;
    fileSize.textContent = formatSize(file.size);
    fileInfo.hidden = false;

    // New file preview
    filePreviewName.textContent = file.name;
    filePreviewSize.textContent = formatSize(file.size);
    filePreview.hidden = false;

    analyzeBtn.disabled = false;
  }

  // File remove button
  fileRemoveBtn.addEventListener("click", function () {
    selectedFile = null;
    fileInput.value = "";
    fileInfo.hidden = true;
    filePreview.hidden = true;
    analyzeBtn.disabled = true;
    uploadError.hidden = true;
  });

  function showError(msg) {
    uploadError.textContent = msg;
    uploadError.hidden = false;
    selectedFile = null;
    fileInfo.hidden = true;
    filePreview.hidden = true;
    analyzeBtn.disabled = true;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  // ============================================================
  // Ripple effect (delegated)
  // ============================================================

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn--ripple");
    if (!btn || btn.disabled) return;

    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var x = e.clientX - rect.left - size / 2;
    var y = e.clientY - rect.top - size / 2;

    var ripple = document.createElement("span");
    ripple.className = "ripple-circle";
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = x + "px";
    ripple.style.top = y + "px";
    btn.appendChild(ripple);

    setTimeout(function () { ripple.remove(); }, 600);
  });

  // ============================================================
  // Progress Ring + Stepper
  // ============================================================

  function resetProgress() {
    // Reset ring
    if (progressRing) {
      progressRing.style.strokeDashoffset = CIRCUMFERENCE;
    }
    if (progressPct) {
      progressPct.textContent = "0";
    }
    progressFill.style.width = "0%";
    progressLabel.textContent = "Starting analysis...";
    progressStep.textContent = "Step 0/10";

    // Clear stepper
    if (progressStepper) {
      progressStepper.innerHTML = "";
    }
  }

  function initStepper(total) {
    if (!progressStepper) return;
    progressStepper.innerHTML = "";
    for (var i = 0; i < total; i++) {
      var step = document.createElement("div");
      step.className = "stepper__step";
      step.innerHTML =
        '<div class="stepper__icon">' + (i + 1) + '</div>' +
        '<div class="stepper__text">Waiting...</div>';
      progressStepper.appendChild(step);
    }
  }

  function updateStepper(currentStep, total, label) {
    if (!progressStepper) return;
    var steps = progressStepper.querySelectorAll(".stepper__step");
    if (steps.length === 0 && total > 0) {
      initStepper(total);
      steps = progressStepper.querySelectorAll(".stepper__step");
    }

    for (var i = 0; i < steps.length; i++) {
      var stepEl = steps[i];
      var icon = stepEl.querySelector(".stepper__icon");
      var text = stepEl.querySelector(".stepper__text");

      if (i < currentStep - 1) {
        // Completed
        stepEl.className = "stepper__step stepper__step--completed";
        icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      } else if (i === currentStep - 1) {
        // Active
        stepEl.className = "stepper__step stepper__step--active";
        icon.textContent = i + 1;
        text.textContent = label || "Processing...";
      } else {
        // Pending
        stepEl.className = "stepper__step";
        icon.textContent = i + 1;
        text.textContent = "Waiting...";
      }
    }
  }

  function updateProgress(payload) {
    var pct = Math.round((payload.step / payload.total) * 100);

    // Update ring
    if (progressRing) {
      var offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
      progressRing.style.strokeDashoffset = offset;
    }
    if (progressPct) {
      progressPct.textContent = pct;
    }

    // Old bar (backward compat)
    progressFill.style.width = pct + "%";
    progressLabel.textContent = payload.label;
    progressStep.textContent = "Step " + payload.step + "/" + payload.total;

    // Update stepper
    updateStepper(payload.step, payload.total, payload.label);
  }

  // ============================================================
  // Upload & Analyze
  // ============================================================

  analyzeBtn.addEventListener("click", async function () {
    if (!selectedFile) return;

    // Upload the file
    var formData = new FormData();
    formData.append("file", selectedFile);

    analyzeBtn.disabled = true;

    try {
      var uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      var uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        showError(uploadData.error || "Upload failed.");
        analyzeBtn.disabled = false;
        return;
      }
    } catch (err) {
      showError("Upload failed. Please try again.");
      analyzeBtn.disabled = false;
      return;
    }

    // Switch to analyzing state
    showState("analyzing");
    resetProgress();

    // Start analysis with SSE
    try {
      var response = await fetch("/api/analyze", { method: "POST" });
      var reader = response.body.getReader();
      var decoder = new TextDecoder();

      var buffer = "";

      while (true) {
        var result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });

        // Parse SSE events from buffer
        var lines = buffer.split("\n\n");
        buffer = lines.pop(); // keep incomplete chunk

        for (var idx = 0; idx < lines.length; idx++) {
          var line = lines[idx];
          if (!line.startsWith("data: ")) continue;
          try {
            var payload = JSON.parse(line.substring(6));
            updateProgress(payload);

            if (payload.results) {
              analysisResults = payload.results;
              renderResults(payload.results);
              // 500ms delay so user sees 100% ring
              await new Promise(function (resolve) { setTimeout(resolve, 500); });
              showState("results");
            } else if (payload.data && payload.data.error) {
              showError(payload.data.error);
              showState("upload");
              analyzeBtn.disabled = false;
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      showError("Analysis failed. Please try again.");
      showState("upload");
      analyzeBtn.disabled = false;
    }
  });

  // ============================================================
  // Render results
  // ============================================================

  function escHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatParagraphRich(text) {
    if (!text || text === "N/A") return "<p>N/A</p>";
    var paragraphs = text.split(/\n\n+/);
    var html = "";
    for (var i = 0; i < paragraphs.length; i++) {
      var p = paragraphs[i].trim();
      if (!p) continue;
      if (i === 0 && p.length > 100) {
        html += "<blockquote>" + escHtml(p) + "</blockquote>";
      } else {
        html += "<p>" + escHtml(p) + "</p>";
      }
    }
    return html || "<p>N/A</p>";
  }

  function renderResults(r) {
    // Stats
    var info = r.doc_info || {};
    statPages.textContent = (info.page_count || 0) + " pages";
    statWords.textContent = (info.word_count || 0).toLocaleString() + " words";
    statReadTime.textContent = "~" + (info.reading_time_min || 0) + " min read";

    // Summary — rich formatted
    document.getElementById("summaryText").innerHTML = formatParagraphRich(r.summary || "N/A");

    // Methodology — rich formatted
    document.getElementById("methodologyText").innerHTML = formatParagraphRich(r.methodology || "N/A");

    // Results & Discussion — rich formatted
    document.getElementById("resultsText").innerHTML = formatParagraphRich(r.results_discussion || "N/A");

    // Key Findings — finding cards
    var findings = r.key_findings || [];
    var findingsHtml = "";
    for (var fi = 0; fi < findings.length; fi++) {
      findingsHtml += '<div class="finding-card">' +
        '<div class="finding-card__number">' + (fi + 1) + '</div>' +
        '<div class="finding-card__text">' + escHtml(findings[fi]) + '</div>' +
        '</div>';
    }
    document.getElementById("findingsText").innerHTML = findingsHtml || "<p>No key findings available.</p>";

    // Keywords
    var kws = r.keywords || [];
    var kwHtml = "";
    for (var ki = 0; ki < kws.length; ki++) {
      var kw = kws[ki];
      var cls = kw.type === "entity" ? "keyword-tag entity" : "keyword-tag";
      kwHtml += '<span class="' + cls + '">' + escHtml(kw.keyword) + '</span>';
    }
    document.getElementById("keywordsText").innerHTML = kwHtml || "<p>No keywords found.</p>";

    // Strengths & Weaknesses — rich formatted
    var sw = r.strengths_weaknesses || {};
    var swHtml = formatParagraphRich(sw.analysis || "N/A");
    if (sw.disclaimer) swHtml += '<div class="disclaimer">' + escHtml(sw.disclaimer) + '</div>';
    document.getElementById("swText").innerHTML = swHtml;

    // Future Scope — rich formatted
    var fs = r.future_scope || {};
    var fsHtml = formatParagraphRich(fs.analysis || "N/A");
    if (fs.disclaimer) fsHtml += '<div class="disclaimer">' + escHtml(fs.disclaimer) + '</div>';
    document.getElementById("futureText").innerHTML = fsHtml;

    // Citations — citation cards
    var cites = r.citations || [];
    if (cites.length > 0) {
      var cHtml = "";
      for (var ci = 0; ci < cites.length; ci++) {
        var c = cites[ci];
        cHtml += '<div class="citation-card">' +
          '<div class="citation-card__number">' + (ci + 1) + '</div>' +
          '<div class="citation-card__content">' +
            '<div class="citation-card__title">' + escHtml(c.title || "\u2014") + '</div>' +
            '<div class="citation-card__meta">' +
              '<span>' + escHtml(c.author || "\u2014") + '</span>' +
              '<span>' + escHtml(c.year || "\u2014") + '</span>' +
              '<span>' + escHtml(c.style || "") + '</span>' +
            '</div>' +
          '</div>' +
          '</div>';
      }
      document.getElementById("citationsText").innerHTML = cHtml;
    } else {
      document.getElementById("citationsText").innerHTML = "<p>No citations detected.</p>";
    }

    // Activate first section
    activateSection("summary");

    // Setup bottom sheet for mobile
    setupBottomSheet();

    // Update export preview
    updateExportPreview();
  }

  // ============================================================
  // Sidebar navigation
  // ============================================================

  sidebar.addEventListener("click", function (e) {
    var btn = e.target.closest(".sidebar-btn");
    if (!btn) return;
    activateSection(btn.dataset.section);
  });

  function activateSection(section) {
    // Sidebar buttons
    sidebar.querySelectorAll(".sidebar-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.section === section);
    });
    // Content panels
    contentArea.querySelectorAll(".content-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.dataset.panel === section);
    });
    // Sync bottom sheet tabs
    if (bottomSheetTabs) {
      bottomSheetTabs.querySelectorAll(".bottom-sheet__tab").forEach(function (tab) {
        tab.classList.toggle("active", tab.dataset.section === section);
      });
    }
  }

  // ============================================================
  // Bottom Sheet (mobile)
  // ============================================================

  function setupBottomSheet() {
    if (!bottomSheetTabs) return;
    bottomSheetTabs.innerHTML = "";

    var sidebarBtns = sidebar.querySelectorAll(".sidebar-btn");
    sidebarBtns.forEach(function (btn) {
      var tab = document.createElement("button");
      tab.className = "bottom-sheet__tab";
      if (btn.classList.contains("active")) tab.classList.add("active");
      tab.dataset.section = btn.dataset.section;

      // Clone the SVG icon
      var svg = btn.querySelector("svg");
      if (svg) tab.appendChild(svg.cloneNode(true));

      // Add label
      var label = document.createElement("span");
      label.textContent = btn.dataset.tooltip || btn.textContent.trim();
      tab.appendChild(label);

      tab.addEventListener("click", function () {
        activateSection(tab.dataset.section);
      });

      bottomSheetTabs.appendChild(tab);
    });
  }

  // Re-setup bottom sheet on resize
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (bottomSheet) {
        bottomSheet.style.display = (!stateResults.hidden && window.innerWidth <= 768) ? "block" : "none";
      }
      if (!stateResults.hidden) {
        setupBottomSheet();
      }
    }, 200);
  });

  // ============================================================
  // Copy to clipboard
  // ============================================================

  document.querySelectorAll(".btn-copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var targetId = btn.dataset.copyTarget;
      var el = document.getElementById(targetId);
      if (!el) return;

      var text = el.innerText || el.textContent;
      navigator.clipboard.writeText(text).then(function () {
        var iconCopy = btn.querySelector(".icon-copy");
        var iconCheck = btn.querySelector(".icon-check");
        iconCopy.hidden = true;
        iconCheck.hidden = false;
        setTimeout(function () {
          iconCopy.hidden = false;
          iconCheck.hidden = true;
        }, 2000);

        showToast("Copied to clipboard!");
      });
    });
  });

  // ============================================================
  // Toast
  // ============================================================

  function showToast(message) {
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ' + escHtml(message);
    toastContainer.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3000);
  }

  // ============================================================
  // Export PDF
  // ============================================================

  exportBtn.addEventListener("click", function () {
    exportModal.hidden = false;
    updateExportPreview();
  });

  modalClose.addEventListener("click", function () { exportModal.hidden = true; });
  modalCancel.addEventListener("click", function () { exportModal.hidden = true; });

  exportModal.addEventListener("click", function (e) {
    if (e.target === exportModal) exportModal.hidden = true;
  });

  // Listen for toggle switch changes to update preview
  exportModal.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
    cb.addEventListener("change", updateExportPreview);
  });

  function updateExportPreview() {
    if (!exportPreviewContent) return;
    var checkboxes = exportModal.querySelectorAll('input[type="checkbox"]');
    var html = "";
    checkboxes.forEach(function (cb) {
      if (!cb.checked) return;
      var key = cb.value;
      var title = SECTION_TITLES[key] || key;
      var snippet = getContentSnippet(key);
      html += '<div class="export-preview__section">' +
        '<div class="export-preview__section-title">' + escHtml(title) + '</div>' +
        '<div class="export-preview__section-snippet">' + escHtml(snippet) + '</div>' +
        '</div>';
    });
    exportPreviewContent.innerHTML = html || '<p style="color:var(--text-muted);font-size:0.85rem;">No sections selected</p>';
  }

  function getContentSnippet(key) {
    if (!analysisResults) return "Content will appear here...";
    var text = "";
    switch (key) {
      case "summary": text = analysisResults.summary || ""; break;
      case "methodology": text = analysisResults.methodology || ""; break;
      case "results_discussion": text = analysisResults.results_discussion || ""; break;
      case "key_findings":
        var kf = analysisResults.key_findings || [];
        text = kf.length > 0 ? kf[0] : "";
        break;
      case "keywords":
        var kws = analysisResults.keywords || [];
        text = kws.map(function (k) { return k.keyword; }).join(", ");
        break;
      case "strengths_weaknesses":
        text = (analysisResults.strengths_weaknesses || {}).analysis || "";
        break;
      case "future_scope":
        text = (analysisResults.future_scope || {}).analysis || "";
        break;
      case "citations":
        var cites = analysisResults.citations || [];
        text = cites.length > 0 ? (cites[0].title || "") : "";
        break;
    }
    // Truncate to 80 chars
    if (text.length > 80) text = text.substring(0, 80) + "...";
    return text || "No content";
  }

  modalExport.addEventListener("click", async function () {
    var checkboxes = exportModal.querySelectorAll('input[type="checkbox"]');
    var sections = [];
    checkboxes.forEach(function (cb) { if (cb.checked) sections.push(cb.value); });

    if (sections.length === 0) {
      showToast("Select at least one section.");
      return;
    }

    modalExport.disabled = true;
    modalExport.textContent = "Generating...";

    try {
      var res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: sections }),
      });
      var data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Export failed.");
        return;
      }

      // Trigger download
      window.location.href = "/api/export/download/" + data.export_id;
      showToast("PDF report downloaded!");
      exportModal.hidden = true;
    } catch (err) {
      showToast("Export failed. Please try again.");
    } finally {
      modalExport.disabled = false;
      modalExport.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download PDF';
    }
  });

  // ============================================================
  // New Analysis
  // ============================================================

  newAnalysisBtn.addEventListener("click", function () {
    selectedFile = null;
    analysisResults = null;
    fileInput.value = "";
    fileInfo.hidden = true;
    filePreview.hidden = true;
    uploadError.hidden = true;
    analyzeBtn.disabled = true;

    // Reset progress
    resetProgress();

    showState("upload");

    // Recreate upload particles
    destroyUploadParticles();
    createUploadParticles();

    // Re-trigger typewriter
    setTimeout(function () {
      typewriterEffect(heroTagline, "AI-powered analysis, completely offline", 45);
    }, 300);
  });

})();
