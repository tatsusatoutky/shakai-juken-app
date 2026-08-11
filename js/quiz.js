// 出題パターンの生成（SPEC.md 5章を参照）
// entryType ごとに出題形式が異なる：
//   term     … meaning4(用語→意味4択) / term4(意味→用語4択) / fillBlank(例文の空所補充4択) / reading(読み方をひらがな入力)
//   question … データ側のquestionType（choice4／typing）に従う
const Quiz = {
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  escapeRe(s) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  },

  // pool内から正解以外をランダムに抜き出し、指定フィールドの値を返す（4択の不正解選択肢用）
  pickDistractors(pool, correctItem, field, count) {
    const candidates = pool.filter((item) => item.id !== correctItem.id);
    return this.shuffle(candidates).slice(0, count).map((item) => item[field]);
  },

  buildTermQuestion(term, termPool) {
    const candidates = ["meaning4", "term4", "fillBlank", "reading"];
    let type = candidates[Math.floor(Math.random() * candidates.length)];
    if (type === "fillBlank") {
      const re = new RegExp(this.escapeRe(term.term), "i");
      if (!re.test(term.exampleJa)) type = "meaning4"; // 例文中に用語そのままで見つからない場合の保険
    }
    if (type === "reading" && !term.reading) type = "meaning4"; // 読み方未設定の保険

    const base = { entryType: "term", entry: term };
    if (type === "meaning4") {
      const choices = this.shuffle([term.meaningJa, ...this.pickDistractors(termPool, term, "meaningJa", 3)]);
      return { ...base, type: "meaning4", promptMain: term.term, promptSub: term.category || "", choices, correct: term.meaningJa };
    }
    if (type === "term4") {
      const choices = this.shuffle([term.term, ...this.pickDistractors(termPool, term, "term", 3)]);
      return { ...base, type: "term4", promptMain: term.meaningJa, promptSub: "", choices, correct: term.term };
    }
    if (type === "fillBlank") {
      const re = new RegExp(this.escapeRe(term.term), "i");
      const blanked = term.exampleJa.replace(re, "＿＿＿");
      const choices = this.shuffle([term.term, ...this.pickDistractors(termPool, term, "term", 3)]);
      return { ...base, type: "fillBlank", promptMain: blanked, promptSub: "", choices, correct: term.term };
    }
    // reading（読み方のひらがな入力）
    return { ...base, type: "reading", promptMain: term.term, promptSub: term.meaningJa, correct: term.reading };
  },

  buildQuestionQuestion(q) {
    const base = { entryType: "question", entry: q, promptMain: q.questionText, promptSub: q.unit };
    if (q.questionType === "choice4") {
      return { ...base, type: "questionChoice4", choices: q.choices, correct: q.correctAnswer };
    }
    // typing（自由記述の穴埋め）
    return { ...base, type: "questionTyping", correct: q.correctAnswer };
  },

  // entryType, entry, pools({termPool}) を受けて出題を1件生成する
  build(entryType, entry, pools) {
    if (entryType === "term") return this.buildTermQuestion(entry, pools.termPool);
    if (entryType === "question") return this.buildQuestionQuestion(entry);
    throw new Error("unknown entryType: " + entryType);
  },

  // フィードバック画面表示用に、entryTypeごとに異なる項目形状を共通の見出し/説明に変換する
  describe(entryType, entry) {
    if (entryType === "term") {
      const meaning = entry.reading ? "（" + entry.reading + "）" + entry.meaningJa : entry.meaningJa;
      return { term: entry.term, meaning, exampleEn: entry.exampleJa, exampleJa: "" };
    }
    if (entryType === "question") {
      return { term: entry.correctAnswer, meaning: entry.unit, exampleEn: entry.questionText, exampleJa: entry.explanation };
    }
    return { term: "", meaning: "", exampleEn: "", exampleJa: "" };
  },
};
