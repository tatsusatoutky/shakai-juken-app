// 統計画面向けの集計処理（SPEC.md 7章を参照）
const Stats = {
  TYPE_LABELS: { term: "用語", question: "一問一答" },
  SUBJECT_LABELS: { history: "歴史", geography: "地理", civics: "公民" },

  // entryType別の 習得済み/総数
  byType(allEntryRefs, cards) {
    const result = { term: { total: 0, mastered: 0 }, question: { total: 0, mastered: 0 } };
    allEntryRefs.forEach((ref) => {
      const bucket = result[ref.entryType];
      if (!bucket) return;
      bucket.total += 1;
      const c = cards[ref.id];
      if (c && c.state === "mastered") bucket.mastered += 1;
    });
    return result;
  },

  // 分野（history/geography/civics）別の 習得済み/総数
  bySubject(entryById, cards) {
    const result = { history: { total: 0, mastered: 0 }, geography: { total: 0, mastered: 0 }, civics: { total: 0, mastered: 0 } };
    Object.keys(entryById).forEach((id) => {
      const subject = entryById[id].data.subject;
      if (!result[subject]) return;
      result[subject].total += 1;
      const c = cards[id];
      if (c && c.state === "mastered") result[subject].mastered += 1;
    });
    return result;
  },

  // basic/advancedレベル別の 習得済み/総数
  byLevel(entryById, cards) {
    const result = { basic: { total: 0, mastered: 0 }, advanced: { total: 0, mastered: 0 } };
    Object.keys(entryById).forEach((id) => {
      const level = entryById[id].data.level;
      if (level !== "basic" && level !== "advanced") return;
      result[level].total += 1;
      const c = cards[id];
      if (c && c.state === "mastered") result[level].mastered += 1;
    });
    return result;
  },

  // 一問一答の単元別 正答数/出題数（一度も学習していない単元は含まない）
  questionUnitAccuracy(questionList, cards) {
    const byUnit = {};
    questionList.forEach((q) => {
      const c = cards[q.id];
      if (!c || c.totalCount === 0) return;
      const key = Stats.SUBJECT_LABELS[q.subject] + "：" + q.unit;
      if (!byUnit[key]) byUnit[key] = { correct: 0, total: 0 };
      byUnit[key].correct += c.correctCount;
      byUnit[key].total += c.totalCount;
    });
    return byUnit;
  },
};
