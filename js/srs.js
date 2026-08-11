// SM-2簡易版のSRSスケジューリング（SPEC.md 4章を参照）
const SRS = {
  // ローカル日付（端末のタイムゾーン）基準の "YYYY-MM-DD" を返す。
  // toISOString()はUTC基準になるため使わない（JSTなどUTC+の地域では
  // 日付が1日ずれて復習予定が狂うバグになる）。
  _fmt(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },
  todayStr() {
    return this._fmt(new Date());
  },
  addDays(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return this._fmt(dt);
  },

  // fromStr, toStr は "YYYY-MM-DD"。toStrがfromStrより後なら正の日数を返す
  daysBetween(fromStr, toStr) {
    const [y1, m1, d1] = fromStr.split("-").map(Number);
    const [y2, m2, d2] = toStr.split("-").map(Number);
    const a = new Date(y1, m1 - 1, d1);
    const b = new Date(y2, m2 - 1, d2);
    return Math.round((b - a) / 86400000);
  },

  newCard(entryId, entryType) {
    return {
      entryId,
      entryType,
      state: "new",
      streak: 0,
      dueDate: this.todayStr(),
      intervalDays: 0,
      easeFactor: 2.5,
      correctCount: 0,
      totalCount: 0,
      lastReviewedAt: null,
    };
  },

  isDue(card) {
    return card.state !== "mastered" && card.dueDate <= this.todayStr();
  },

  // grade: "again" | "good" | "easy"
  // maxIntervalDays: 目標受験日が近いときに復習間隔を短く締めるための上限（4章「本番日から逆算した復習ペース調整」）。
  //                  指定なしなら無制限。
  grade(card, grade, maxIntervalDays) {
    const cap = maxIntervalDays || Infinity;
    const steps = CONFIG.INTERVAL_STEPS;
    let idx = steps.indexOf(card.intervalDays);
    card.totalCount += 1;

    if (grade === "again") {
      card.streak = 0;
      card.intervalDays = steps[0];
      card.state = "learning";
    } else {
      card.correctCount += 1;
      card.streak += 1;
      const bump = grade === "easy" ? 2 : 1;
      idx = idx === -1 ? bump - 1 : Math.min(idx + bump, steps.length - 1);
      card.intervalDays = Math.min(steps[idx], cap);
      const mastered = card.streak >= CONFIG.MASTER_STREAK && card.intervalDays >= CONFIG.MASTER_MIN_INTERVAL;
      card.state = mastered ? "mastered" : "review";
    }

    card.dueDate = this.addDays(this.todayStr(), card.intervalDays);
    card.lastReviewedAt = new Date().toISOString();
    return card;
  },

  // 学習ストリーク（連続学習日数）の更新。実際に1問以上学習した時に呼ぶ。
  recordStudyActivity(settings) {
    const today = this.todayStr();
    if (settings.lastStudyDate === today) return settings;
    const yesterday = this.addDays(today, -1);
    settings.streak = settings.lastStudyDate === yesterday ? (settings.streak || 0) + 1 : 1;
    settings.lastStudyDate = today;
    return settings;
  },
};
