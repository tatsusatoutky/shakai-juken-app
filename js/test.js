// テストモード：出題プールの選定（SPEC.md 6章を参照）
const TestMode = {
  WEAK_THRESHOLD: 0.6, // 正答率がこれ未満のカードを「苦手」とみなす

  // criteria: { mode: "history"|"geography"|"civics"|"weak"|"custom", entryTypes: [...], subjects: [...], level: "all"|"basic"|"advanced" }
  // allEntryRefs: [{id, entryType}, ...]  entryById: { id -> {entryType, data} }  cards: SRSCard群
  selectEntries(criteria, allEntryRefs, entryById, cards, count) {
    let pool;

    if (criteria.mode === "weak") {
      pool = allEntryRefs.filter((ref) => {
        const c = cards[ref.id];
        return c && c.totalCount > 0 && c.correctCount / c.totalCount < this.WEAK_THRESHOLD;
      });
      if (pool.length < count) {
        const usedIds = new Set(pool.map((r) => r.id));
        const rest = Quiz.shuffle(allEntryRefs.filter((r) => !usedIds.has(r.id)));
        pool = pool.concat(rest);
      }
    } else {
      const entryTypes = criteria.entryTypes || ["term", "question"];
      const subjects = criteria.subjects || ["history", "geography", "civics"];
      const level = criteria.level || "all";
      pool = allEntryRefs.filter((ref) => {
        if (!entryTypes.includes(ref.entryType)) return false;
        const data = entryById[ref.id].data;
        if (!subjects.includes(data.subject)) return false;
        if (level === "all") return true;
        return data.level === level;
      });
    }

    return Quiz.shuffle(pool).slice(0, count);
  },

  // TestResult（SPEC.md 3-4）の保存
  saveResult(result) {
    const results = Storage.getTestResults();
    results.unshift(result); // 新しい結果を先頭に
    Storage.saveTestResults(results);
  },
};
