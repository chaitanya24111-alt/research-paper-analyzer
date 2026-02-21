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
  const statCitations = document.getElementById("statCitations");

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

  // Header scroll handled by sticky Tailwind class (no shrink needed).

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
    typewriterEffect(heroTagline, "Analysis, completely offline", 45);
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
    progressStep.textContent = "Step 0/12";

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

  // ============================================================
  // Summary panel — structured renderer
  // ============================================================

  function renderSummaryPanel(summary, docInfo) {
    if (!summary || summary === "N/A") return "<p>No summary available.</p>";

    var html = "";

    // Meta chips row
    html += '<div class="panel-meta-row">';
    html += '<span class="panel-meta-chip panel-meta-chip--pipeline">LSA extractive &rarr; BART abstractive</span>';
    if (docInfo && docInfo.reading_time_min) {
      html += '<span class="panel-meta-chip">~' + docInfo.reading_time_min + ' min read</span>';
    }
    html += '</div>';

    // Split into individual sentences so we can style the lead
    var sentenceRe = /[^.!?]+[.!?]+/g;
    var sentences = summary.match(sentenceRe) || [summary];
    var lead = sentences.slice(0, 2).join(" ").trim();
    var rest = sentences.slice(2).join(" ").trim();

    // Lead paragraph — visually emphasised
    if (lead) {
      html += '<div class="summary-lead">' + escHtml(lead) + '</div>';
    }

    // Remaining sentences as regular prose
    if (rest) {
      html += '<p class="summary-body">' + escHtml(rest) + '</p>';
    }

    // Generation pipeline note
    html += '<div class="generation-note">';
    html += '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    html += '<span>Generated by <strong>facebook/bart-large-cnn</strong>. '
          + 'LSA first selected the top 15 representative sentences (compressing the paper to BART\'s 1,024-token limit), '
          + 'then BART rewrote them as fluent, abstractive prose. '
          + 'BART was fine-tuned on news, so domain-specific terms may occasionally be paraphrased.</span>';
    html += '</div>';

    return html;
  }

  // ============================================================
  // Methodology panel — structured renderer
  // ============================================================

  function renderMethodologyPanel(methodology, keywords) {
    if (!methodology) return "<p>No methodology available.</p>";

    // Not-found fallback
    if (methodology.indexOf("could not be identified") !== -1) {
      return '<div class="method-not-found">'
           + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
           + '<span>' + escHtml(methodology) + ' The paper may not have a clearly labelled Methods or Experimental section, or its structure differs from standard academic format.</span>'
           + '</div>';
    }

    var html = "";

    // What-is explanation box
    html += '<div class="method-explainer">';
    html += '<strong>What does this section cover?</strong> ';
    html += 'The methodology describes <em>how</em> the research was conducted — '
          + 'the experimental design, datasets or corpora used, model architectures and algorithms applied, '
          + 'hyperparameters, and the evaluation protocol (metrics, baselines, train/test splits).';
    html += '</div>';

    // Meta chips
    html += '<div class="panel-meta-row">';
    html += '<span class="panel-meta-chip panel-meta-chip--pipeline">BART abstractive summarization</span>';
    html += '<span class="panel-meta-chip">Section-header detection &rarr; keyword fallback</span>';
    html += '</div>';

    // Main methodology text — split on double newline if multi-paragraph
    var paragraphs = methodology.split(/\n\n+/);
    for (var i = 0; i < paragraphs.length; i++) {
      var p = paragraphs[i].trim();
      if (!p) continue;
      html += '<p class="method-para">' + escHtml(p) + '</p>';
    }

    // Related keyword terms extracted from the paper
    var methodTerms = (keywords || []).filter(function (kw) {
      var lc = kw.keyword.toLowerCase();
      return ["method", "algorithm", "framework", "model", "dataset",
              "approach", "technique", "experiment", "baseline", "network",
              "architecture", "training", "evaluation"].some(function (t) {
        return lc.indexOf(t) !== -1;
      });
    }).slice(0, 6);

    if (methodTerms.length > 0) {
      html += '<div class="method-terms-row">';
      html += '<span class="method-terms-label">Detected method terms</span>';
      for (var mi = 0; mi < methodTerms.length; mi++) {
        html += '<span class="method-term">' + escHtml(methodTerms[mi].keyword) + '</span>';
      }
      html += '</div>';
    }

    // Extraction process note
    html += '<div class="generation-note">';
    html += '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    html += '<span>Extraction order: (1) regex header match for <em>Methods / Experimental</em> sections, '
          + '(2) keyword-scored sentence fallback if no header found. '
          + 'The located text is then passed to <strong>BART</strong> for abstractive compression.</span>';
    html += '</div>';

    return html;
  }

  function renderResults(r) {
    // Stats
    var info = r.doc_info || {};
    statPages.textContent = (info.page_count || 0) + " pages";
    statWords.textContent = (info.word_count || 0).toLocaleString() + " words";
    statReadTime.textContent = "~" + (info.reading_time_min || 0) + " min";
    if (statCitations) statCitations.textContent = (r.citations || []).length + " refs";

    // Summary — enhanced structured renderer
    document.getElementById("summaryText").innerHTML = renderSummaryPanel(r.summary || "N/A", info);

    // Methodology — enhanced structured renderer
    document.getElementById("methodologyText").innerHTML = renderMethodologyPanel(r.methodology || "N/A", r.keywords || []);

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

    // Model Evaluation
    renderEvaluation(r.evaluation, r.embeddings);

    // Activate first section
    activateSection("summary");

    // Setup bottom sheet for mobile
    setupBottomSheet();

    // Update export preview
    updateExportPreview();
  }

  // ============================================================
  // Render Evaluation Panel
  // ============================================================

  function renderEvaluation(ev, emb) {
    var el = document.getElementById("evaluationText");
    if (!el) return;

    var html = "";

    // ── ROUGE Section ────────────────────────────────────────
    html += '<div class="eval-section">';
    html += '<p class="eval-section__title">ROUGE Score Comparison &mdash; LSA vs BART</p>';

    if (!ev || !ev.available) {
      var errMsg = (ev && ev.error) ? ev.error : "Evaluation data unavailable.";
      html += '<div class="eval-unavailable">' + escHtml(errMsg) + '</div>';
    } else {
      // Reference source chip
      var chipClass = ev.reference_source === "abstract" ? "" : " ref-source-chip--mutual";
      var chipLabel = ev.reference_source === "abstract"
        ? "Reference: paper abstract"
        : "Reference: mutual (no abstract detected)";
      html += '<span class="ref-source-chip' + chipClass + '">' + escHtml(chipLabel) + '</span>';

      // Winner badge
      var winner = ev.winner || "tie";
      var badgeClass = "eval-winner-badge--" + winner;
      var badgeLabel = winner === "bart"
        ? "&#x2605; BART wins on ROUGE-1 F1"
        : winner === "lsa"
          ? "&#x2605; LSA wins on ROUGE-1 F1"
          : "Tie — equal ROUGE-1 F1";
      html += '<div class="eval-winner-badge ' + badgeClass + '">' + badgeLabel + '</div>';

      // ROUGE table
      var metrics = ["rouge1", "rouge2", "rougeL"];
      var metricLabels = { rouge1: "ROUGE-1", rouge2: "ROUGE-2", rougeL: "ROUGE-L" };

      html += '<table class="rouge-table"><thead><tr>';
      html += '<th>Metric</th>';
      html += '<th>LSA F1</th><th class="rouge-bar-cell">LSA bar</th>';
      html += '<th>BART F1</th><th class="rouge-bar-cell">BART bar</th>';
      html += '</tr></thead><tbody>';

      for (var mi = 0; mi < metrics.length; mi++) {
        var mk = metrics[mi];
        var lsaF1  = ((ev.lsa_scores  || {})[mk] || {}).fmeasure || 0;
        var bartF1 = ((ev.bart_scores || {})[mk] || {}).fmeasure || 0;
        var lsaPct  = Math.round(lsaF1  * 100);
        var bartPct = Math.round(bartF1 * 100);

        html += '<tr>';
        html += '<td>' + metricLabels[mk] + '</td>';
        html += '<td><code>' + lsaF1.toFixed(3) + '</code></td>';
        html += '<td class="rouge-bar-cell"><div class="rouge-bar-track"><div class="rouge-bar-fill rouge-bar-fill--lsa" style="width:' + lsaPct + '%"></div></div></td>';
        html += '<td><code>' + bartF1.toFixed(3) + '</code></td>';
        html += '<td class="rouge-bar-cell"><div class="rouge-bar-track"><div class="rouge-bar-fill rouge-bar-fill--bart" style="width:' + bartPct + '%"></div></div></td>';
        html += '</tr>';
      }
      html += '</tbody></table>';

      if (ev.interpretation) {
        html += '<p class="eval-interpretation">' + escHtml(ev.interpretation) + '</p>';
      }
    }
    html += '</div>';

    // ── Keyword Comparison ──────────────────────────────────
    var kwe = ev && ev.keyword_eval;
    html += '<div class="eval-section">';
    html += '<p class="eval-section__title">Keyword Method Complementarity</p>';

    if (kwe && kwe.tfidf_count !== undefined) {
      html += '<div class="kw-comparison">';
      html += '<div class="kw-box kw-box--tfidf">';
      html += '<div class="kw-box__label">TF-IDF</div>';
      html += '<div class="kw-box__count">' + kwe.tfidf_count + '</div>';
      html += '</div>';
      html += '<div class="kw-box kw-box--ner">';
      html += '<div class="kw-box__label">NER Entities</div>';
      html += '<div class="kw-box__count">' + kwe.ner_count + '</div>';
      html += '</div>';
      html += '</div>';

      var compPct = Math.round((kwe.complementarity || 0) * 100);
      html += '<div class="kw-overlap-row">';
      html += '<span>Complementarity</span>';
      html += '<div class="kw-overlap-track"><div class="kw-overlap-bar" style="width:' + compPct + '%"></div></div>';
      html += '<span><strong>' + compPct + '%</strong></span>';
      html += '</div>';

      if (kwe.interpretation) {
        html += '<p class="eval-interpretation">' + escHtml(kwe.interpretation) + '</p>';
      }
    } else {
      html += '<div class="eval-unavailable">Keyword evaluation data unavailable.</div>';
    }
    html += '</div>';

    // ── Semantic Coherence ──────────────────────────────────
    html += '<div class="eval-section">';
    html += '<p class="eval-section__title">Semantic Coherence of Key Findings</p>';

    if (!emb || !emb.available) {
      var embErr = (emb && emb.error) ? emb.error : "Embedding data unavailable.";
      html += '<div class="eval-unavailable">' + escHtml(embErr) + '</div>';
    } else {
      var label = emb.coherence_label || "medium";
      var scoreClass = "coherence-score--" + label;
      var labelClass = "coherence-label--" + label;
      var labelText  = label.charAt(0).toUpperCase() + label.slice(1) + " coherence";

      html += '<div class="coherence-display">';
      html += '<div class="coherence-score ' + scoreClass + '">' + (emb.avg_coherence || 0).toFixed(3) + '</div>';
      html += '<div class="coherence-meta">';
      html += '<div class="coherence-label ' + labelClass + '">' + escHtml(labelText) + '</div>';
      if (emb.most_central_text) {
        html += '<div class="coherence-central">&ldquo;' + escHtml(emb.most_central_text.substring(0, 120)) + '&hellip;&rdquo;</div>';
      }
      html += '</div>';
      html += '</div>';

      if (emb.clusters && emb.clusters.length > 0) {
        html += '<p class="eval-interpretation">';
        html += escHtml(
          emb.clusters.length + ' topic cluster' + (emb.clusters.length !== 1 ? 's' : '') +
          ' detected among ' + (emb.centrality_scores ? emb.centrality_scores.length : '?') +
          ' findings at a 0.70 similarity threshold.'
        );
        html += '</p>';
      }

      if (emb.note) {
        html += '<p class="eval-interpretation">' + escHtml(emb.note) + '</p>';
      }
    }
    html += '</div>';

    // ── Methodology Note ────────────────────────────────────
    html += '<div class="methodology-note">';
    html += '<strong>Methodology note:</strong> ROUGE (Recall-Oriented Understudy for Gisting Evaluation) ';
    html += 'measures n-gram overlap between generated and reference text. ';
    html += 'Higher ROUGE does not necessarily mean a more <em>accurate</em> or <em>readable</em> summary — ';
    html += 'extractive methods can score well by copying verbatim sentences. ';
    html += 'Semantic coherence uses <strong>all-MiniLM-L6-v2</strong> sentence embeddings ';
    html += '(cosine similarity) to measure how topically consistent the key findings are with each other.';
    html += '</div>';

    el.innerHTML = html;
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
      typewriterEffect(heroTagline, "Analysis, completely offline", 45);
    }, 300);
  });

})();
