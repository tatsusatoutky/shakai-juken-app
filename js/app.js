// 画面制御・アプリ全体のロジック
(function () {
  const el = (id) => document.getElementById(id);

  const screens = {
    home: el("screen-home"),
    session: el("screen-session"),
    summary: el("screen-summary"),
    testSetup: el("screen-test-setup"),
    testResult: el("screen-test-result"),
    stats: el("screen-stats"),
    settings: el("screen-settings"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("is-active"));
    screens[name].classList.add("is-active");
  }

  const state = {
    entryById: {}, // id -> { entryType, data }
    allEntryRefs: [], // [{ id, entryType }, ...] 全コンテンツ（term+question）
    termPool: [], // 用語全件（4択の不正解選択肢の抽出元）
    questionList: [],
    cards: {},
    settings: {},

    mode: "srs", // "srs" | "test"
    queue: [],
    queueTotal: 0,
    current: null, // 現在の出題(Quiz.build の戻り値)
    lastWasWrong: false,
    sessionStudiedCount: 0,
    sessionCorrectCount: 0,

    testCriteria: { mode: null, entryTypes: ["term", "question"], subjects: ["history", "geography", "civics"], level: "all", count: null },
    testAnswers: [], // { entryType, entry, isCorrect }
    testStartedAt: 0,
  };

  async function fetchJson(url) {
    const res = await fetch(url);
    return res.json();
  }

  async function loadAllContent() {
    const [terms, questions] = await Promise.all([fetchJson(CONFIG.DATA_TERMS_URL), fetchJson(CONFIG.DATA_QUESTIONS_URL)]);

    state.termPool = terms;
    state.questionList = questions;

    const groups = [
      ["term", terms],
      ["question", questions],
    ];
    state.entryById = {};
    state.allEntryRefs = [];
    groups.forEach(([entryType, list]) => {
      list.forEach((data) => {
        state.entryById[data.id] = { entryType, data };
        state.allEntryRefs.push({ id: data.id, entryType });
      });
    });
  }

  // ---------- 本番日から逆算したペース調整（SPEC.md 4章） ----------

  const CRAM_WINDOW_DAYS = 30;

  function examDaysRemain() {
    if (!state.settings.examDate) return null;
    return SRS.daysBetween(SRS.todayStr(), state.settings.examDate);
  }

  function computeIntervalCap() {
    const remain = examDaysRemain();
    if (remain === null) return Infinity;
    if (remain <= 0) return 1;
    return Math.max(1, Math.floor(remain / 3));
  }

  // ---------- ホーム ----------

  function computeCounts() {
    const dueCount = Object.values(state.cards).filter((c) => SRS.isDue(c)).length;
    const newCount = state.allEntryRefs.filter((ref) => !state.cards[ref.id]).length;
    const masteredCount = Object.values(state.cards).filter((c) => c.state === "mastered").length;
    return { dueCount, newCount, masteredCount };
  }

  function renderHome() {
    const { dueCount, newCount, masteredCount } = computeCounts();
    el("dueCount").textContent = dueCount;
    el("newCount").textContent = newCount;
    el("totalWordsText").textContent = state.allEntryRefs.length + "件";
    el("masteredText").textContent = masteredCount + "件";

    const streak = state.settings.streak || 0;
    el("streakText").textContent = streak > 0 ? "連続学習 " + streak + "日" : "";

    const hasWork = dueCount > 0 || newCount > 0;
    el("startBtn").hidden = !hasWork;
    el("emptyMsg").hidden = hasWork;
    el("loadingMsg").hidden = true;
    el("statsMini").hidden = false;
    el("homeNav").hidden = false;

    const remain = examDaysRemain();
    if (remain === null) {
      el("countdownBox").hidden = true;
    } else {
      el("countdownBox").hidden = false;
      el("countdownText").textContent = remain > 0 ? "本番まであと " + remain + " 日" : "本番日を過ぎています";
      const isCram = remain <= CRAM_WINDOW_DAYS;
      el("cramBtn").hidden = !isCram;
    }
  }

  // ---------- 学習セッション（SRS）／テスト共通のキュー進行 ----------

  function buildSrsQueue() {
    const dueRefs = Object.values(state.cards)
      .filter((c) => SRS.isDue(c))
      .map((c) => ({ id: c.entryId, entryType: c.entryType }));
    const newRefs = state.allEntryRefs.filter((ref) => !state.cards[ref.id]);
    return Quiz.shuffle(dueRefs.concat(newRefs));
  }

  function startSrsSession() {
    state.mode = "srs";
    state.queue = buildSrsQueue();
    state.queueTotal = state.queue.length;
    state.sessionStudiedCount = 0;
    state.sessionCorrectCount = 0;
    if (state.queue.length === 0) return;
    showScreen("session");
    nextQuestion();
  }

  function updateProgress() {
    const done = state.queueTotal - state.queue.length;
    const pct = state.queueTotal === 0 ? 0 : Math.round((done / state.queueTotal) * 100);
    el("progressFill").style.width = pct + "%";
    el("queueCount").textContent = done + " / " + state.queueTotal;
  }

  function nextQuestion() {
    if (state.queue.length === 0) {
      if (state.mode === "test") endTest();
      else endSrsSession();
      return;
    }
    const ref = state.queue.shift();
    updateProgress();
    const record = state.entryById[ref.id];
    if (!record) {
      nextQuestion(); // データ不整合時はスキップ
      return;
    }
    state.current = Quiz.build(record.entryType, record.data, { termPool: state.termPool });
    state.lastWasWrong = false;
    renderQuestion(state.current);
  }

  const TYPE_LABELS = {
    meaning4: "用語：用語 → 意味",
    term4: "用語：意味 → 用語",
    fillBlank: "用語：文中の空所補充",
    reading: "用語：読み方入力",
    questionChoice4: "一問一答：4択",
    questionTyping: "一問一答：記述",
  };

  function renderQuestion(q) {
    const isTyped = !q.choices;

    el("quizFeedback").hidden = true;
    el("rateButtons").hidden = true;
    el("continueBtn").hidden = true;
    el("quizInputArea").hidden = !isTyped;
    el("quizChoices").hidden = isTyped;
    el("quizChoices").innerHTML = "";
    el("spellingInput").value = "";
    el("spellingInput").placeholder = q.type === "reading" ? "ひらがなで読み方を入力" : "答えを入力";

    el("quizTypeLabel").textContent = TYPE_LABELS[q.type] || "";
    el("quizPrompt").textContent = q.promptMain;
    el("quizPromptSub").textContent = q.promptSub || "";

    if (isTyped) {
      el("spellingInput").focus();
    } else {
      q.choices.forEach((choice) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn";
        btn.textContent = choice;
        btn.addEventListener("click", () => handleAnswer(choice === q.correct, btn));
        el("quizChoices").appendChild(btn);
      });
    }
  }

  function handleAnswer(isCorrect, chosenBtn) {
    const q = state.current;
    if (!q) return; // 出題前後の想定外タイミングでの操作を無視する
    if (q.choices) {
      const buttons = Array.from(el("quizChoices").children);
      buttons.forEach((b) => {
        b.classList.add("is-disabled");
        if (b.textContent === q.correct) b.classList.add("is-correct");
      });
      if (chosenBtn && !isCorrect) chosenBtn.classList.add("is-wrong");
    }
    showFeedback(isCorrect);
  }

  function handleSpellingSubmit() {
    const q = state.current;
    if (!q) return; // 出題前後の想定外タイミングでの操作を無視する
    const input = el("spellingInput").value.trim();
    if (!input) return;
    const isCorrect = normalizeAnswer(input) === normalizeAnswer(q.correct);
    handleAnswer(isCorrect, null);
  }

  // ひらがな/カタカナ・全角半角スペースの表記ゆれを吸収して比較する
  function normalizeAnswer(s) {
    return String(s)
      .trim()
      .replace(/\s+/g, "")
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)); // カタカナ→ひらがな
  }

  function showFeedback(isCorrect) {
    const q = state.current;
    const info = Quiz.describe(q.entryType, q.entry);
    const resultEl = el("feedbackResult");
    resultEl.textContent = isCorrect ? "正解！" : "不正解";
    resultEl.className = "feedback-result " + (isCorrect ? "correct" : "wrong");
    el("feedbackWord").textContent = info.term + (info.meaning ? "（" + info.meaning + "）" : "");
    el("feedbackExampleEn").textContent = info.exampleEn || "";
    el("feedbackExampleJa").textContent = info.exampleJa || "";
    el("quizFeedback").hidden = false;

    if (state.mode === "test") {
      state.testAnswers.push({ entryType: q.entryType, entry: q.entry, isCorrect, info });
      el("rateButtons").hidden = true;
      el("continueBtn").hidden = false;
      el("continueBtn").textContent = "次へ";
      return;
    }

    state.sessionStudiedCount += 1;
    if (isCorrect) state.sessionCorrectCount += 1;

    if (isCorrect) {
      el("rateButtons").hidden = false;
      el("continueBtn").hidden = true;
    } else {
      state.lastWasWrong = true;
      el("rateButtons").hidden = true;
      el("continueBtn").hidden = false;
      el("continueBtn").textContent = "次へ";
    }
  }

  function applyGrade(grade) {
    const q = state.current;
    if (!q) return; // 出題前後の想定外タイミングでの操作を無視する
    const entry = q.entry;
    const card = state.cards[entry.id] || SRS.newCard(entry.id, q.entryType);
    SRS.grade(card, grade, computeIntervalCap());
    state.cards[entry.id] = card;
    Storage.saveCards(state.cards);

    state.settings = SRS.recordStudyActivity(state.settings);
    Storage.saveSettings(state.settings);

    nextQuestion();
  }

  function handleContinueClick() {
    if (state.mode === "test") {
      nextQuestion();
      return;
    }
    applyGrade("again"); // srsモードの不正解時のみここに来る
  }

  function endSrsSession() {
    const total = state.sessionStudiedCount;
    const correct = state.sessionCorrectCount;
    el("summaryStat").textContent = total > 0 ? "今回 " + total + "問中 " + correct + "問正解" : "";
    showScreen("summary");
  }

  // ---------- テストモード ----------

  function modeLabel(mode) {
    return { all: "全範囲", history: "歴史", geography: "地理", civics: "公民", weak: "苦手単元", custom: "自由選択", cram: "直前対策" }[mode] || mode;
  }

  function startCramSession() {
    startTest({ mode: "cram", entryTypes: ["term", "question"], subjects: ["history", "geography", "civics"], level: "all", count: 30 });
  }

  function updateTestStartEnabled() {
    el("testStartBtn").disabled = !(state.testCriteria.mode && state.testCriteria.count);
  }

  function wireTestSetupScreen() {
    document.querySelectorAll("#testModeButtons .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#testModeButtons .chip-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.testCriteria.mode = btn.dataset.mode;
        el("customOptions").hidden = state.testCriteria.mode !== "custom";
        updateTestStartEnabled();
      });
    });

    document.querySelectorAll("#customLevelButtons .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#customLevelButtons .chip-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.testCriteria.level = btn.dataset.level;
      });
    });

    document.querySelectorAll("#countButtons .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#countButtons .chip-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.testCriteria.count = Number(btn.dataset.count);
        updateTestStartEnabled();
      });
    });
  }

  function openTestSetup() {
    state.testCriteria = { mode: null, entryTypes: ["term", "question"], subjects: ["history", "geography", "civics"], level: "all", count: null };
    document.querySelectorAll("#testModeButtons .chip-btn, #countButtons .chip-btn").forEach((b) => b.classList.remove("is-active"));
    document.querySelectorAll("#customLevelButtons .chip-btn").forEach((b) => b.classList.remove("is-active"));
    el("customLevelButtons").querySelector('[data-level="all"]').classList.add("is-active");
    el("customOptions").hidden = true;
    document.querySelectorAll(".subject-check").forEach((c) => (c.checked = true));
    document.querySelectorAll(".content-check").forEach((c) => (c.checked = true));
    updateTestStartEnabled();
    showScreen("testSetup");
  }

  function startTest(explicitCriteria) {
    let criteria;
    if (explicitCriteria) {
      criteria = explicitCriteria;
    } else {
      criteria = { ...state.testCriteria };
      if (criteria.mode === "custom") {
        criteria.entryTypes = Array.from(document.querySelectorAll(".content-check:checked")).map((c) => c.value);
        if (criteria.entryTypes.length === 0) criteria.entryTypes = ["term", "question"];
        criteria.subjects = Array.from(document.querySelectorAll(".subject-check:checked")).map((c) => c.value);
        if (criteria.subjects.length === 0) criteria.subjects = ["history", "geography", "civics"];
      } else if (criteria.mode === "history" || criteria.mode === "geography" || criteria.mode === "civics") {
        criteria.subjects = [criteria.mode];
        criteria.entryTypes = ["term", "question"];
        criteria.level = "all";
      }
    }

    const refs = TestMode.selectEntries(criteria, state.allEntryRefs, state.entryById, state.cards, criteria.count);
    if (refs.length === 0) {
      alert("この条件に合う問題がまだありません。「苦手単元」は一度も学習していないと対象がないので、先に少し学習してから試してください。");
      return;
    }

    state.mode = "test";
    state.testAnswers = [];
    state.testStartedAt = Date.now();
    state.testCriteria = criteria;
    state.queue = refs;
    state.queueTotal = refs.length;
    showScreen("session");
    nextQuestion();
  }

  function endTest() {
    const total = state.testAnswers.length;
    const correct = state.testAnswers.filter((a) => a.isCorrect).length;
    const durationSec = Math.round((Date.now() - state.testStartedAt) / 1000);
    const wrongIds = state.testAnswers.filter((a) => !a.isCorrect).map((a) => a.entry.id);

    // 間違えた問題は復習対象として優先的にSRSへ組み込む（SPEC.md 6章）
    state.testAnswers
      .filter((a) => !a.isCorrect)
      .forEach((a) => {
        const card = state.cards[a.entry.id] || SRS.newCard(a.entry.id, a.entryType);
        SRS.grade(card, "again", computeIntervalCap());
        state.cards[a.entry.id] = card;
      });
    Storage.saveCards(state.cards);

    const modeDesc = modeLabel(state.testCriteria.mode) + "・" + total + "問";
    TestMode.saveResult({
      date: new Date().toISOString(),
      mode: modeDesc,
      total,
      correct,
      durationSec,
      wrongIds,
    });

    el("resultScore").textContent = total > 0 ? correct + " / " + total + "問 正解（" + Math.round((correct / total) * 100) + "%）" : "";
    el("resultList").innerHTML = state.testAnswers
      .map((a) => {
        const cls = a.isCorrect ? "is-correct" : "is-wrong";
        const mark = a.isCorrect ? "◯" : "✕";
        return (
          '<div class="result-item ' +
          cls +
          '"><span class="result-mark">' +
          mark +
          "</span><div><p class=\"result-term\">" +
          escapeHtml(a.info.term) +
          (a.info.meaning ? "（" + escapeHtml(a.info.meaning) + "）" : "") +
          '</p><p class="result-explain">' +
          escapeHtml(a.info.exampleJa || a.info.exampleEn || "") +
          "</p></div></div>"
        );
      })
      .join("");

    showScreen("testResult");
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function abortTestOrSrs() {
    if (state.mode === "test") {
      renderHome();
      showScreen("home");
      return;
    }
    endSrsSession();
  }

  // ---------- 統計 ----------

  function renderBar(label, mastered, total) {
    const pct = total === 0 ? 0 : Math.round((mastered / total) * 100);
    return (
      '<div class="stat-bar-row"><span class="stat-bar-label">' +
      escapeHtml(label) +
      '</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:' +
      pct +
      '%"></div></div><span class="stat-bar-num">' +
      mastered +
      " / " +
      total +
      "</span></div>"
    );
  }

  function renderStatsScreen() {
    const byType = Stats.byType(state.allEntryRefs, state.cards);
    el("statsByType").innerHTML = Object.keys(Stats.TYPE_LABELS)
      .map((t) => renderBar(Stats.TYPE_LABELS[t], byType[t].mastered, byType[t].total))
      .join("");

    const bySubject = Stats.bySubject(state.entryById, state.cards);
    el("statsBySubject").innerHTML = Object.keys(Stats.SUBJECT_LABELS)
      .map((s) => renderBar(Stats.SUBJECT_LABELS[s], bySubject[s].mastered, bySubject[s].total))
      .join("");

    const byLevel = Stats.byLevel(state.entryById, state.cards);
    el("statsByLevel").innerHTML = renderBar("basic", byLevel.basic.mastered, byLevel.basic.total) + renderBar("advanced", byLevel.advanced.mastered, byLevel.advanced.total);

    const byUnit = Stats.questionUnitAccuracy(state.questionList, state.cards);
    const unitKeys = Object.keys(byUnit);
    el("statsQuestionUnits").innerHTML = unitKeys.length
      ? unitKeys.map((unit) => renderBar(unit, byUnit[unit].correct, byUnit[unit].total)).join("")
      : '<p class="empty-msg">まだ一問一答の学習履歴がありません。</p>';

    const results = Storage.getTestResults();
    el("testHistoryList").innerHTML = results.length
      ? results
          .slice(0, 20)
          .map((r) => {
            const d = new Date(r.date);
            const dateStr = d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
            const pct = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
            return '<div class="history-row"><span>' + escapeHtml(dateStr) + " ｜ " + escapeHtml(r.mode) + '</span><span class="history-score">' + r.correct + "/" + r.total + "（" + pct + "%）</span></div>";
          })
          .join("")
      : '<p class="empty-msg">まだテストの記録がありません。</p>';
  }

  // ---------- 設定 ----------

  function openSettings() {
    el("examDate").value = state.settings.examDate || "";
    el("backupMsg").textContent = "";
    showScreen("settings");
  }

  function wireSettingsScreen() {
    el("examDate").addEventListener("change", (e) => {
      state.settings.examDate = e.target.value || null;
      Storage.saveSettings(state.settings);
    });

    el("exportBtn").addEventListener("click", () => {
      Backup.exportData();
      el("backupMsg").textContent = "書き出しました。";
    });
    el("importBtn").addEventListener("click", () => el("importFile").click());
    el("importFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      Backup.importData(file)
        .then(() => {
          state.cards = Storage.getCards();
          state.settings = Storage.getSettings();
          el("examDate").value = state.settings.examDate || "";
          el("backupMsg").textContent = "読み込みました。";
        })
        .catch(() => {
          el("backupMsg").textContent = "読み込みに失敗しました。ファイルを確認してください。";
        })
        .finally(() => {
          el("importFile").value = "";
        });
    });

    el("deleteAllBtn").addEventListener("click", () => {
      if (!confirm("学習データ（進捗・設定・テスト履歴）を全て削除します。よろしいですか？")) return;
      state.cards = {};
      state.settings = {};
      Storage.saveCards(state.cards);
      Storage.saveSettings(state.settings);
      Storage.saveTestResults([]);
      el("examDate").value = "";
      el("backupMsg").textContent = "削除しました。";
    });
  }

  // ---------- イベント配線 ----------

  function wireEvents() {
    el("startBtn").addEventListener("click", startSrsSession);
    el("exitBtn").addEventListener("click", abortTestOrSrs);
    el("backHomeBtn").addEventListener("click", () => {
      renderHome();
      showScreen("home");
    });
    el("submitSpellingBtn").addEventListener("click", handleSpellingSubmit);
    el("spellingInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSpellingSubmit();
    });
    el("continueBtn").addEventListener("click", handleContinueClick);
    el("rateButtons").addEventListener("click", (e) => {
      const btn = e.target.closest(".rate-btn");
      if (!btn) return;
      applyGrade(btn.dataset.grade);
    });

    el("testModeBtn").addEventListener("click", openTestSetup);
    el("testCancelBtn").addEventListener("click", () => {
      renderHome();
      showScreen("home");
    });
    el("testStartBtn").addEventListener("click", () => startTest());
    el("resultHomeBtn").addEventListener("click", () => {
      renderHome();
      showScreen("home");
    });
    wireTestSetupScreen();

    el("statsBtn").addEventListener("click", () => {
      renderStatsScreen();
      showScreen("stats");
    });
    el("statsHomeBtn").addEventListener("click", () => {
      renderHome();
      showScreen("home");
    });

    el("settingsBtn").addEventListener("click", openSettings);
    el("settingsHomeBtn").addEventListener("click", () => {
      renderHome();
      showScreen("home");
    });
    wireSettingsScreen();

    el("cramBtn").addEventListener("click", startCramSession);
  }

  async function init() {
    wireEvents();
    state.cards = Storage.getCards();
    state.settings = Storage.getSettings();
    try {
      await loadAllContent();
    } catch (err) {
      el("loadingMsg").textContent = "データの読み込みに失敗しました。ページを再読み込みしてください。";
      return;
    }
    renderHome();
  }

  init();
})();
